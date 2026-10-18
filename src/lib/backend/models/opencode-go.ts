import { env } from '$env/dynamic/private';
import { ResultAsync } from 'neverthrow';
import type { OpenRouterModel } from './open-router';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const GO_PROVIDER_ID = 'opencode-go';
const CACHE_TTL_MS = 60 * 60 * 1000;

export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1';
export const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';

/**
 * Client identifier sent as `User-Agent` on every OpenCode Go request.
 * OpenCode asks clients to identify with their own user agent instead of a
 * generic SDK name (see https://opencode.ai/docs/go/#where-can-i-use-it).
 */
export const OPENCODE_CLIENT_USER_AGENT = 'chat/0.0.1';

/**
 * Builds the extra headers OpenCode Go requires on chat-completion requests.
 * `x-opencode-session` must be a stable id per conversation so OpenCode can
 * route efficiently and optimize prompt caching — without it the gateway
 * rejects the request with:
 * `400 Request is missing x-opencode-session and cannot be routed efficiently`.
 */
export function openCodeGoHeaders(sessionId: string): Record<string, string> {
	return {
		'x-opencode-session': sessionId,
		'User-Agent': OPENCODE_CLIENT_USER_AGENT
	};
}

export function isFreeModel(modelId: string): boolean {
	return modelId.endsWith('-free');
}

export function resolveOpenCodeBaseUrl(_modelId: string): string {
	return OPENCODE_GO_BASE_URL;
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
