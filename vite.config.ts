import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		Icons({
			compiler: 'svelte',
		}),
		...SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: false,
			injectRegister: 'auto',
			devOptions: { enabled: false },
			workbox: {
				skipWaiting: true,
				clientsClaim: true,
				globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}'],
				globIgnores: ['**/og.png'],
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
				navigateFallback: '/',
				cleanupOutdatedCaches: true,
				runtimeCaching: [
					{
						urlPattern: ({ url }) =>
							url.hostname.endsWith('google.com') &&
							url.pathname.startsWith('/s2/favicons'),
						handler: 'CacheFirst',
						options: {
							cacheName: 'model-favicons',
							expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
							cacheableResponse: { statuses: [0, 200] },
						},
					},
					{
						urlPattern: ({ request }) => request.mode === 'navigate',
						handler: 'NetworkFirst',
						options: {
							cacheName: 'pages-cache',
							networkTimeoutSeconds: 3,
							expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
							cacheableResponse: { statuses: [0, 200] },
						},
					},
					{
						urlPattern: ({ url }) =>
							url.hostname.includes('convex') || url.hostname.includes('convex.cloud'),
						handler: 'NetworkFirst',
						options: {
							cacheName: 'convex-api',
							networkTimeoutSeconds: 3,
							expiration: { maxEntries: 200, maxAgeSeconds: 60 * 5 },
							cacheableResponse: { statuses: [0, 200] },
						},
					},
				],
			},
		}),
	],
	server: {
		allowedHosts: isDev ? true : undefined,
	},
	test: {
		projects: [
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts'],
				},
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
				},
			},
		],
	},
});
