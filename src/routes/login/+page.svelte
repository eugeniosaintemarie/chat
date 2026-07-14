<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Icons from '$lib/components/icons';
	import { authClient } from '$lib/backend/auth/client.js';

	async function signInGitHub() {
		try {
			const { data, error } = await authClient.signIn.social({
				provider: 'github',
				callbackURL: '/chat'
			});
			if (data?.url) {
				window.location.href = data.url;
			} else if (error) {
				console.error('GitHub sign-in error:', error);
			}
		} catch (e) {
			console.error('GitHub sign-in failed:', e);
		}
	}
</script>

<div class="flex h-svh flex-col place-items-center justify-center gap-4">
	<h1 class="text-2xl font-bold">Sign in to chat</h1>
	<Button variant="outline" onClickPromise={signInGitHub}>
		<Icons.GitHub /> Continue with GitHub
	</Button>
</div>
