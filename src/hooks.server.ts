import { auth } from '$lib/auth';
import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const handle: Handle = async ({ event, resolve }) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	event.locals.auth = async () => {
		try {
			return await auth.api.getSession({ headers: event.request.headers });
		} catch (e) {
			console.error('[auth] getSession failed:', e);
			return null;
		}
	};

	return svelteKitHandler({ event, resolve, auth, building });
};
