<script lang="ts">
	import { api } from '$lib/backend/convex/_generated/api';
	import type { Id } from '$lib/backend/convex/_generated/dataModel';
	import { isPinned } from '$lib/backend/convex/user_enabled_models';
	import { useCachedQuery } from '$lib/cache/cached-query.svelte';
	import Cohere from '$lib/components/icons/cohere.svelte';
	import Deepseek from '$lib/components/icons/deepseek.svelte';
	import * as Popover from '$lib/components/ui/popover';
	import Tooltip from '$lib/components/ui/tooltip.svelte';
	import { isFirefox } from '$lib/hooks/is-firefox.svelte';
	import { IsMobile } from '$lib/hooks/is-mobile.svelte';
	import { models as modelsState } from '$lib/state/models.svelte';
	import { session } from '$lib/state/session.svelte';
	import { settings } from '$lib/state/settings.svelte';
	import { Provider } from '$lib/types';
	import { fuzzysearch } from '$lib/utils/fuzzy-search';
	import { supportsImages, supportsReasoning } from '$lib/utils/model-capabilities';
	import { capitalize } from '$lib/utils/strings';
	import { cn } from '$lib/utils/utils';
	import { useConvexClient } from 'convex-svelte';
	import { ResultAsync } from 'neverthrow';
	import { type Component } from 'svelte';
	import LogosClaudeIcon from '~icons/logos/claude-icon';
	import LogosMistralAiIcon from '~icons/logos/mistral-ai-icon';
	import BrainIcon from '~icons/lucide/brain';
	import ChevronDownIcon from '~icons/lucide/chevron-down';
	import CpuIcon from '~icons/lucide/cpu';
	import EyeIcon from '~icons/lucide/eye';
	import SearchIcon from '~icons/lucide/search';
	import StarIcon from '~icons/lucide/star';
	import ZapIcon from '~icons/lucide/zap';
	import MaterialIconThemeGeminiAi from '~icons/material-icon-theme/gemini-ai';
	import GoogleIcon from '~icons/simple-icons/google';
	import MetaIcon from '~icons/simple-icons/meta';
	import MicrosoftIcon from '~icons/simple-icons/microsoft';
	import OpenaiIcon from '~icons/simple-icons/openai';
	import XIcon from '~icons/simple-icons/x';

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

	const enabledArr = $derived(Object.values(enabledModelsQuery.data ?? {}));

	modelsState.init();

	const companyIcons: Record<string, Component> = {
		openai: OpenaiIcon,
		anthropic: LogosClaudeIcon,
		google: GoogleIcon,
		meta: MetaIcon,
		mistral: ZapIcon,
		'x-ai': XIcon,
		microsoft: MicrosoftIcon,
		qwen: CpuIcon,
		deepseek: Deepseek,
		cohere: Cohere,
	};

	function getCompanyFromModelId(modelId: string): string {
		const id = modelId.toLowerCase();
		if (id.includes('gpt') || id.includes('o1') || id.includes('openai')) return 'openai';
		if (id.includes('claude') || id.includes('anthropic')) return 'anthropic';
		if (id.includes('gemini') || id.includes('gemma') || id.includes('google')) return 'google';
		if (id.includes('llama') || id.includes('meta')) return 'meta';
		if (id.includes('mistral') || id.includes('mixtral') || id.includes('minimax')) return 'mistral';
		if (id.includes('grok') || id.includes('x-ai')) return 'x-ai';
		if (id.includes('phi') || id.includes('microsoft') || id.includes('mimo')) return 'microsoft';
		if (id.includes('qwen') || id.includes('alibaba')) return 'qwen';
		if (id.includes('deepseek')) return 'deepseek';
		if (id.includes('command') || id.includes('cohere')) return 'cohere';
		const provider = modelId.split('/')[0]?.toLowerCase();
		if (provider && companyIcons[provider]) return provider;
		return 'other';
	}

	function getModelIcon(modelId: string): Component | null {
		const id = modelId.toLowerCase();
		if (id.includes('claude') || id.includes('anthropic')) return LogosClaudeIcon;
		if (id.includes('gemini') || id.includes('gemma')) return MaterialIconThemeGeminiAi;
		if (id.includes('mistral') || id.includes('mixtral')) return LogosMistralAiIcon;
		return companyIcons[getCompanyFromModelId(modelId)] || null;
	}

	function formatModelName(modelId: string) {
		const cleanId = modelId.replace(/^[^/]+\//, '');
		return cleanId
			.split(/[-_,:]/)
			.map((part) => capitalize(part))
			.join(' ');
	}

	const catalog = $derived(modelsState.from(Provider.OpenRouter));
	const catalogById = $derived(new Map(catalog.map((m) => [m.id, m])));

	function displayName(modelId: string): string {
		return catalogById.get(modelId)?.name ?? formatModelName(modelId);
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
				{#if currentModel && getModelIcon(currentModel.model_id)}
					{@const IconComponent = getModelIcon(currentModel.model_id)}
					<IconComponent class="size-3" />
				{/if}
				<span class="truncate">
					{currentModel ? displayName(currentModel.model_id) : 'Select model'}
				</span>
			</div>
			<ChevronDownIcon class="size-4 opacity-50" />
		</Popover.Trigger>

		<Popover.Content
			portalProps={{ disabled: isFirefox }}
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

			<div class="max-h-[min(50vh,360px)] overflow-y-auto p-1">
				{#if sortedModels.length === 0}
					<p class="text-muted-foreground px-3 py-6 text-center text-sm">No models found</p>
				{:else}
					{#each sortedModels as model (model._id)}
						{@const meta = catalogById.get(model.model_id)}
						{@const hasImages = meta ? supportsImages(meta) : false}
						{@const hasReasoning = meta ? supportsReasoning(meta) : false}
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
								{#if getModelIcon(model.model_id)}
									{@const ModelIcon = getModelIcon(model.model_id)}
									<ModelIcon class="size-4 shrink-0" />
								{/if}
								<span class="truncate">{displayName(model.model_id)}</span>
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
								{#if hasReasoning}
									<Tooltip>
										{#snippet trigger(tooltip)}
											<span {...tooltip.trigger} class="text-green-400">
												<BrainIcon class="size-3.5" />
											</span>
										{/snippet}
										Supports reasoning
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
					{/each}
				{/if}
			</div>
		</Popover.Content>
	{/if}
</Popover.Root>
