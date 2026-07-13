<script lang="ts">
	import { PUBLIC_CONVEX_URL } from '$env/static/public';
	import GlobalModal from '$lib/components/ui/modal/global-modal.svelte';
	import { models } from '$lib/state/models.svelte';
	import { setupConvex } from 'convex-svelte';
	import { ModeWatcher } from 'mode-watcher';
	import '../app.css';
	import { browser } from '$app/environment';
	import { MetaTags } from 'svelte-meta-tags';
	import { page } from '$app/state';
	import { setupLastChat } from '$lib/state/last-chat.svelte';

	let { children } = $props();

	setupConvex(PUBLIC_CONVEX_URL);
	const lastChat = setupLastChat();
	models.init();

	$effect(() => {
		if (page.url.pathname.startsWith('/chat')) {
			lastChat.current = page.params?.id ?? null;
		}
	});
</script>

<MetaTags
	title="chat"
	description="The OpenSource T3Chat alternative."
	keywords={['svelte', 't3', 'chat', 'ai']}
	twitter={{
		cardType: 'summary_large_image',
		title: 'chat',
		description: 'The OpenSource T3Chat alternative.',
		image: 'https://chat/og.png',
		creator: '@thomasglopes',
	}}
	openGraph={{
		url: page.url.toString(),
		type: 'website',
		title: 'chat',
		description: 'The OpenSource T3Chat alternative.',
		siteName: 'chat',
		images: [
			{
				url: 'https://chat/og.png',
				width: 2014,
				height: 1143,
				alt: 'chat',
			},
		],
	}}
/>

<ModeWatcher />
{#if browser}
	{@render children()}
{/if}

<GlobalModal />
