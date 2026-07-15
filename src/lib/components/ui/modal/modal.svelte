<script lang="ts">
	import { clickOutside } from '$lib/attachments/click-outside.svelte.js';
	import { cn } from '$lib/utils/utils';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		open: boolean;
		class?: string;
		boxClass?: string;
	}

	let {
		children,
		open = $bindable(false),
		class: className,
		boxClass,
	}: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (open) {
			dialog?.showModal();
		} else {
			dialog?.close();
		}
	});
</script>

<dialog
	class={cn('modal', className)}
	bind:this={dialog}
	onclose={() => (open = false)}
>
	<div
		class={cn('modal-box', boxClass)}
		{@attach clickOutside(() => {
			if (open) open = false;
		})}
	>
		{@render children()}
	</div>
</dialog>
