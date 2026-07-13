import { getOpenCodeGoModels } from '$lib/backend/models/opencode-go';
import { type OpenRouterModel } from '$lib/backend/models/open-router';
import { Provider } from '$lib/types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const [session, openCodeGoModels] = await Promise.all([locals.auth(), getOpenCodeGoModels()]);

	return {
		session,
		models: {
			[Provider.OpenRouter]: openCodeGoModels.unwrapOr([] as OpenRouterModel[]),
		},
	};
};

// Makes caching easier, and tbf, we don't need SSR anyways here
export const ssr = true;
