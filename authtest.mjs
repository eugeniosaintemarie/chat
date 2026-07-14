import { betterAuth } from 'better-auth';
import { convexAdapter } from '@better-auth-kit/convex';

const client = { mutation: async () => {}, query: async () => {} };
try {
	const auth = betterAuth({
		baseURL: 'http://localhost:5173',
		secret: 'test-secret-at-least-32-chars-long-1234567890',
		database: convexAdapter(client),
		socialProviders: { github: { clientId: 'x', clientSecret: 'y' } },
		session: { cookieCache: { enabled: true, maxAge: 300 } }
	});
	console.log('INIT OK -> handler:', typeof auth.handler, 'getSession:', typeof auth.api.getSession);
} catch (e) {
	console.log('INIT THREW:', e && e.message);
	console.log((e && e.stack ? e.stack : '').split('\n').slice(0, 8).join('\n'));
}
