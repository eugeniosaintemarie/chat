import { betterAuth } from 'better-auth';
import { convexAdapter } from '@better-auth-kit/convex';
import { ConvexHttpClient } from 'convex/browser';
import 'dotenv/config';
import { api } from './backend/convex/_generated/api';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';

const client = new ConvexHttpClient(env.PUBLIC_CONVEX_URL!.replace(/\/+$/, ''));

export const auth = betterAuth({
	baseURL: {
		allowedHosts: ['*.vercel.app', 'localhost', '127.0.0.1'],
		fallback: privateEnv.BETTER_AUTH_URL ?? 'http://localhost:5173',
	},
	secret: privateEnv.BETTER_AUTH_SECRET!,
	database: convexAdapter(client),
	socialProviders: {
		github: {
			clientId: privateEnv.GITHUB_CLIENT_ID!,
			clientSecret: privateEnv.GITHUB_CLIENT_SECRET!,
		},
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					// create user settings
					await client.mutation(api.user_settings.create, {
						user_id: user.id,
					});
				},
			},
		},
	},
	plugins: [],
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 5 * 60, // Cache duration in seconds
		},
	},
});
