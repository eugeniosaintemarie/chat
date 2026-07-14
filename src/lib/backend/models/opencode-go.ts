import { env } from '$env/dynamic/private';
import { ResultAsync } from 'neverthrow';
import type { OpenRouterModel } from './open-router';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const GO_PROVIDER_ID = 'opencode-go';
const CACHE_TTL_MS = 60 * 60 * 1000;

export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1';
export const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';

export function isFreeModel(modelId: string): boolean {
	return modelId.endsWith('-free');
}

export function resolveOpenCodeBaseUrl(modelId: string): string {
	return isFreeModel(modelId) ? OPENCODE_ZEN_BASE_URL : OPENCODE_GO_BASE_URL;
}

// Per-model API format. Most OpenCode Go models are OpenAI-compatible; a subset
// (Qwen, MiniMax) are served via the Anthropic Messages API and must be queried
// at `${baseURL}/messages` instead of `${baseURL}/chat/completions`.
let endpointTypeById: Record<string, 'openai' | 'anthropic'> = {};

export async function getGoEndpointType(modelId: string): Promise<'openai' | 'anthropic'> {
	if (Object.keys(endpointTypeById).length === 0) {
		await getOpenCodeGoModels();
	}
	return endpointTypeById[modelId] ?? 'openai';
}

interface ModelsDevModel {
	id: string;
	name?: string;
	description?: string;
	reasoning?: boolean;
	modalities?: {
		input?: string[];
		output?: string[];
	};
	limit?: {
		context?: number;
		output?: number;
	};
	cost?: {
		input?: number;
		output?: number;
		cache_read?: number;
	};
}

let cache: { at: number; models: OpenRouterModel[] } | null = null;

function goApiKey(): string {
	return env.OPENCODE_API_KEY || env.OPENROUTER_FREE_KEY || '';
}

/**
 * Fetches the model ids the current API key is actually entitled to from the
 * OpenCode Go `/v1/models` endpoint. Returns `null` when the key is missing or
 * the request fails, in which case the caller falls back to the full static
 * catalog.
 */
async function getAvailableGoModelIds(): Promise<Set<string> | null> {
	const key = goApiKey();
	if (!key) return null;

	try {
		const res = await fetch(`${OPENCODE_GO_BASE_URL}/models`, {
			headers: { Authorization: `Bearer ${key}` },
		});

		if (!res.ok) return null;

		const json = (await res.json()) as { data?: Array<{ id: string }> };
		const ids = (json.data ?? []).map((m) => m.id);

		if (ids.length === 0) return null;

		return new Set(ids);
	} catch {
		return null;
	}
}

function mapModel(m: ModelsDevModel): OpenRouterModel {
	return {
		id: m.id,
		name: m.name ?? m.id,
		created: 0,
		description: m.description ?? '',
		architecture: {
			input_modalities: m.modalities?.input ?? ['text'],
			output_modalities: m.modalities?.output ?? ['text'],
			tokenizer: '',
		},
		top_provider: { is_moderated: false },
		pricing: {
			prompt: String(m.cost?.input ?? 0),
			completion: String(m.cost?.output ?? 0),
			image: '0',
			request: '0',
			input_cache_read: String(m.cost?.cache_read ?? 0),
			input_cache_write: '0',
			web_search: '0',
			internal_reasoning: '0',
		},
		context_length: m.limit?.context ?? 0,
		hugging_face_id: '',
		per_request_limits: {},
		supported_parameters: m.reasoning ? ['reasoning'] : [],
	};
}

export function getOpenCodeGoModels() {
	return ResultAsync.fromPromise(
		(async () => {
			if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
				return cache.models;
			}

			const res = await fetch(MODELS_DEV_URL);
			const data = (await res.json()) as Record<string, { models?: Record<string, ModelsDevModel> }>;

			const goProviderModels = data[GO_PROVIDER_ID]?.models ?? {};
			const metaById = new Map(
				Object.values(goProviderModels).map((m) => [m.id, mapModel(m)])
			);

			for (const [id, m] of Object.entries(goProviderModels)) {
				endpointTypeById[id] =
					m.provider?.npm?.includes('anthropic') ? 'anthropic' : 'openai';
			}

			// Only surface the curated Go models the current API key is entitled to.
			// We intersect with the API's available ids so models that aren't part of
			// the Go catalog (e.g. hy3-preview) never show up.
			const availableIds = await getAvailableGoModelIds();

			const goModels: OpenRouterModel[] = [...metaById.values()]
				.filter((m) => availableIds === null || availableIds.has(m.id))
				.sort((a, b) => a.id.localeCompare(b.id));

			const models = goModels;

			cache = { at: Date.now(), models };

			return models;
		})(),
		() => '[opencode-go] Failed to fetch models'
	);
}

interface AnthropicSSEEvent {
	type: string;
	message?: { id?: string };
	delta?: { type?: string; text?: string; thinking?: string };
}

async function fetchImageAsBase64(
	url: string
): Promise<{ data: string; mediaType: string } | null> {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const buf = Buffer.from(await res.arrayBuffer());
		const mediaType = res.headers.get('content-type') || 'image/png';
		return { data: buf.toString('base64'), mediaType };
	} catch {
		return null;
	}
}

/**
 * Streams a completion from the OpenCode Go Anthropic Messages endpoint
 * (`${baseURL}/messages`). Used for models served via the Anthropic API
 * (Qwen, MiniMax). Accumulates text + thinking deltas and forwards them to
 * `onChunk`.
 */
export async function streamOpenCodeGoAnthropic(opts: {
	baseURL: string;
	apiKey: string;
	modelId: string;
	messages: Array<{
		role: 'user' | 'assistant' | 'system';
		content:
			| string
			| Array<{ type: string; text?: string; image_url?: { url: string } }>;
	}>;
	signal?: AbortSignal;
	onChunk: (data: {
		content: string;
		reasoning: string;
		generationId: string | null;
	}) => void | Promise<void>;
}): Promise<{ content: string; reasoning: string }> {
	const systemParts: string[] = [];
	const anthropicMessages: Array<{
		role: 'user' | 'assistant';
		content: string | Array<Record<string, unknown>>;
	}> = [];

	for (const m of opts.messages) {
		if (m.role === 'system') {
			const text =
				typeof m.content === 'string'
					? m.content
					: m.content.map((c) => c.text ?? '').join('');
			systemParts.push(text);
			continue;
		}

		const role = m.role === 'user' ? 'user' : 'assistant';

		if (typeof m.content === 'string') {
			anthropicMessages.push({ role, content: m.content });
			continue;
		}

		const blocks: Array<Record<string, unknown>> = [];
		for (const part of m.content) {
			if (part.type === 'text') {
				blocks.push({ type: 'text', text: part.text ?? '' });
			} else if (part.type === 'image_url' && part.image_url) {
				const img = await fetchImageAsBase64(part.image_url.url);
				if (img) {
					blocks.push({
						type: 'image',
						source: { type: 'base64', media_type: img.mediaType, data: img.data },
					});
				}
			}
		}
		anthropicMessages.push({ role, content: blocks });
	}

	const body: Record<string, unknown> = {
		model: opts.modelId,
		messages: anthropicMessages,
		max_tokens: 8192,
		stream: true,
	};
	if (systemParts.length > 0) body.system = systemParts.join('\n\n');

	const res = await fetch(`${opts.baseURL}/messages`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${opts.apiKey}`,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify(body),
		signal: opts.signal,
	});

	if (!res.ok || !res.body) {
		const text = await res.text().catch(() => '');
		throw new Error(`OpenCode Go (Anthropic) request failed: ${res.status} ${text}`);
	}

	let content = '';
	let reasoning = '';
	let generationId: string | null = null;
	const decoder = new TextDecoder();
	let buffer = '';

	for await (const chunk of res.body) {
		buffer += decoder.decode(chunk as Uint8Array, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) continue;
			const json = trimmed.slice(5).trim();
			if (!json || json === '[DONE]') continue;

			let evt: AnthropicSSEEvent;
			try {
				evt = JSON.parse(json) as AnthropicSSEEvent;
			} catch {
				continue;
			}

			if (evt.type === 'message_start') {
				generationId = evt.message?.id ?? generationId;
			} else if (evt.type === 'content_block_delta' && evt.delta) {
				if (evt.delta.type === 'text_delta') {
					content += evt.delta.text ?? '';
				} else if (evt.delta.type === 'thinking_delta') {
					reasoning += evt.delta.thinking ?? '';
				}

				if (content || reasoning) {
					await opts.onChunk({ content, reasoning, generationId });
				}
			}
		}
	}

	return { content, reasoning };
}
