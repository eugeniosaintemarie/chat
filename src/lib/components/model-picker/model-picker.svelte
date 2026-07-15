<script lang="ts">
	import { api } from '$lib/backend/convex/_generated/api';
	import type { Id } from '$lib/backend/convex/_generated/dataModel';
	import { isPinned } from '$lib/backend/convex/user_enabled_models';
	import { useCachedQuery } from '$lib/cache/cached-query.svelte';
	import * as Popover from '$lib/components/ui/popover';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { isFirefox } from '$lib/hooks/is-firefox.svelte';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import { models as modelsState } from '$lib/state/models.svelte';
	import { session } from '$lib/state/session.svelte';
	import { settings } from '$lib/state/settings.svelte';
	import type { OpenRouterModel } from '$lib/backend/models/open-router';
	import { Provider } from '$lib/types';
	import { fuzzysearch } from '$lib/utils/fuzzy-search';
	import { supportsImages } from '$lib/utils/model-capabilities';
	import { capitalize } from '$lib/utils/strings';
	import { cn } from '$lib/utils/utils';
	import { useConvexClient } from 'convex-svelte';
	import { ResultAsync } from 'neverthrow';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import EyeIcon from '~icons/lucide/eye';
	import SearchIcon from '~icons/lucide/search';
	import StarIcon from '~icons/lucide/star';

	type Props = {
		class?: string;
		/* When images are attached, we should not select models that don't support images */
		onlyImageModels?: boolean;
	};

	let { class: className, onlyImageModels }: Props = $props();

	const client = useConvexClient();
	const isMobile = new IsMobile();

	const enabledModelsQuery = useCachedQuery(api.user_enabled_models.get_enabled, {
		session_token: session.current?.session.token ?? '',
	});

	modelsState.init();

	const catalog = $derived(modelsState.from(Provider.OpenRouter));
	const catalogById = $derived(new Map(catalog.map((m) => [m.id, m])));

	// Only show models that are present in the catalog (which is already filtered
	// to the models the current API key is entitled to).
	const enabledArr = $derived(
		Object.values(enabledModelsQuery.data ?? {}).filter((m) => catalogById.has(m.model_id))
	);

	function getModelDomain(modelId: string): string | null {
		const id = modelId.toLowerCase();
		if (id.includes('gpt') || id.includes('o1') || id.includes('o3') || id.includes('openai'))
			return 'openai.com';
		if (id.includes('claude') || id.includes('anthropic')) return 'anthropic.com';
		if (id.includes('gemini') || id.includes('gemma') || id.includes('palm'))
			return 'gemini.google.com';
		if (id.includes('grok') || id.includes('x-ai')) return 'x.ai';
		if (id.includes('llama') || id.includes('meta')) return 'meta.com';
		if (id.includes('mistral') || id.includes('mixtral') || id.includes('codestral'))
			return 'mistral.ai';
		if (id.includes('minimax')) return 'minimax.io';
		if (id.includes('deepseek')) return 'deepseek.com';
		if (id.includes('qwen') || id.includes('qwq') || id.includes('alibaba')) return 'qwen.ai';
		if (id.includes('glm') || id.includes('zhipu')) return 'z.ai';
		if (id.includes('kimi') || id.includes('moonshot')) return 'moonshot.ai';
		if (id.includes('mimo') || id.includes('xiaomi')) return 'mi.com';
		if (id.includes('nemotron') || id.includes('nvidia')) return 'nvidia.com';
		if (id.includes('north') || id.includes('command') || id.includes('cohere')) return 'cohere.com';
		if (id.includes('hy3') || id.includes('hunyuan')) return 'tencent.com';
		if (id.includes('phi') || id.includes('microsoft')) return 'microsoft.com';
		if (id.includes('gemma')) return 'google.com';
		const provider = modelId.split('/')[0]?.toLowerCase();
		if (provider && provider.includes('.')) return provider;
		return null;
	}

	function faviconUrl(modelId: string): string | null {
		const domain = getModelDomain(modelId);
		if (!domain) return null;
		return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
	}

	function formatModelName(modelId: string) {
		const cleanId = modelId.replace(/^[^/]+\//, '');
		return cleanId
			.split(/[-_,:]/)
			.map((part) => capitalize(part))
			.join(' ');
	}

	function displayName(modelId: string): string {
		return catalogById.get(modelId)?.name ?? formatModelName(modelId);
	}

	/**
	 * Average USD cost per 1M tokens (input + output), sourced from the OpenRouter /
	 * models.dev `pricing` field already present in the catalog. `null` when unknown.
	 */
	function avgCostPerMTok(model: OpenRouterModel | undefined): number | null {
		if (!model) return null;
		const p = Number(model.pricing.prompt);
		const c = Number(model.pricing.completion);
		if (Number.isNaN(p) && Number.isNaN(c)) return null;
		if (p <= 0 && c <= 0) return 0;
		return (p + c) / 2;
	}

	/** Cost tier as a number of dollar signs: 1 = $, 2 = $$, 3 = $$$. 0 = unknown. */
	function costTier(model: OpenRouterModel | undefined): 0 | 1 | 2 | 3 {
		const cost = avgCostPerMTok(model);
		if (cost === null) return 0;
		if (cost <= 2) return 1;
		if (cost <= 8) return 2;
		return 3;
	}

	let open = $state(false);
	let search = $state('');

	const filteredModels = $derived(
		fuzzysearch({
			haystack: enabledArr,
			needle: search,
			property: 'model_id',
		})
	);

	const sortedModels = $derived(
		[...filteredModels].sort((a, b) => {
			const pinDiff = (isPinned(a) ? 0 : 1) - (isPinned(b) ? 0 : 1);
			if (pinDiff !== 0) return pinDiff;
			return displayName(a.model_id).localeCompare(displayName(b.model_id));
		})
	);

	const currentModel = $derived(enabledArr.find((m) => m.model_id === settings.modelId));

	$effect(() => {
		if (!enabledArr.find((m) => m.model_id === settings.modelId) && enabledArr.length > 0) {
			settings.modelId = enabledArr[0]!.model_id;
		}
	});

	function modelSelected(modelId: string) {
		settings.modelId = modelId;
		open = false;
	}

	async function togglePin(modelId: Id<'user_enabled_models'>) {
		await ResultAsync.fromPromise(
			client.mutation(api.user_enabled_models.toggle_pinned, {
				session_token: session.current?.session.token ?? '',
				enabled_model_id: modelId,
			}),
			(e) => e
		);
	}
</script>

<Popover.Root bind:open>
	{#if enabledArr.length}
		<Popover.Trigger
			class={cn(
				'ring-offset-background focus:ring-ring hover:text-foreground flex items-center justify-between rounded-lg px-2 py-1 text-xs transition focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
				className
			)}
		>
			<div class="flex items-center gap-2 pr-2">
				{#if currentModel && faviconUrl(currentModel.model_id)}
					<img
						src={faviconUrl(currentModel.model_id)}
						alt=""
						class="size-3.5 shrink-0 rounded-sm"
						loading="lazy"
					/>
				{/if}
				<span class="truncate">
					{currentModel ? displayName(currentModel.model_id) : 'Select model'}
				</span>
			</div>
			<ChevronDownIcon class="size-4 opacity-50" />
		</Popover.Trigger>

		<Popover.Content
			portalProps={{ disabled: isFirefox }}
			side="top"
			align="start"
			sideOffset={5}
			class={cn('w-[320px] max-w-[calc(100vw-2rem)] p-0')}
		>
			<label
				class="border-border text-muted-foreground flex items-center gap-2 border-b px-3 py-2.5 text-sm"
			>
				<SearchIcon class="size-4 shrink-0" />
				<input
					bind:value={search}
					class="text-foreground placeholder:text-muted-foreground w-full bg-transparent outline-none"
					placeholder="Search models..."
					autocomplete="off"
				/>
			</label>

			<div class="max-h-[min(35vh,320px)] overflow-y-auto p-1">
				{#if sortedModels.length === 0}
					<p class="text-muted-foreground px-3 py-6 text-center text-sm">No models found</p>
				{:else}
					{#each sortedModels as model (model._id)}
						{@render modelRow(model)}
					{/each}
				{/if}
			</div>
		</Popover.Content>
	{/if}
</Popover.Root>

{#snippet modelRow(model: (typeof enabledArr)[number])}
	{@const meta = catalogById.get(model.model_id)}
	{@const hasImages = meta ? supportsImages(meta) : false}
	{@const tier = costTier(meta)}
	{@const disabled = onlyImageModels && !hasImages}
	{@const selected = model.model_id === settings.modelId}
	{@const pinned = isPinned(model)}

	<div
		class={cn(
			'group flex h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors',
			'hover:bg-accent/50',
			selected && 'bg-accent/60',
			disabled && 'pointer-events-none opacity-40'
		)}
	>
		<button
			type="button"
			class="flex min-w-0 flex-1 items-center gap-2 text-left"
			onclick={() => modelSelected(model.model_id)}
			{disabled}
		>
			{#if faviconUrl(model.model_id)}
				<img
					src={faviconUrl(model.model_id)}
					alt=""
					class="size-4 shrink-0 rounded-sm"
					loading="lazy"
				/>
			{/if}
			<span class="truncate">{displayName(model.model_id)}</span>
			{#if tier > 0}
				<span
					class="text-emerald-400 text-[11px] font-semibold leading-none tabular-nums"
					title={avgCostPerMTok(meta) === 0
						? 'Free to use'
						: `≈ $${avgCostPerMTok(meta)!.toFixed(2)} / 1M tokens (in+out avg)`}
				>
					{'$'.repeat(tier)}
				</span>
			{/if}
		</button>

		<div class="flex shrink-0 items-center gap-1.5">
			{#if hasImages}
				<Tooltip>
					{#snippet trigger(tooltip)}
						<span {...tooltip.trigger} class="text-violet-400">
							<EyeIcon class="size-3.5" />
						</span>
					{/snippet}
					Supports image analysis
				</Tooltip>
			{/if}

			<button
				type="button"
				class={cn(
					'text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors',
					pinned ? 'text-yellow-400 hover:text-yellow-400' : 'opacity-0 group-hover:opacity-100'
				)}
				onclick={(e) => {
					e.stopPropagation();
					togglePin(model._id);
				}}
				aria-label={pinned ? 'Remove from favorites' : 'Add to favorites'}
			>
				<StarIcon class={cn('size-3.5', pinned && 'fill-current')} />
			</button>
		</div>
	</div>
{/snippet}
