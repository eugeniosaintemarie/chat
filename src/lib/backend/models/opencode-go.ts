import { ResultAsync } from 'neverthrow';
import type { OpenRouterModel } from './open-router';

const MODELS_DEV_URL = 'https://models.dev/api.json';
const PROVIDER_ID = 'opencode-go';
const CACHE_TTL_MS = 60 * 60 * 1000;

export const OPENCODE_GO_BASE_URL = 'https://opencode.ai/zen/go/v1';

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

			const provider = data[PROVIDER_ID];
			const models = Object.values(provider?.models ?? {}).map(mapModel);

			cache = { at: Date.now(), models };

			return models;
		})(),
		() => '[opencode-go] Failed to fetch models'
	);
}
