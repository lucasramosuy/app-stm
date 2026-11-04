import { sentrySvelteKit } from '@sentry/sveltekit';
import adapter from '@sveltejs/adapter-netlify';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sentrySvelteKit({
			// Solo sube sourcemaps si hay auth token (dev local sin token
			// no rompe el build, solo se salta este paso).
			autoUploadSourceMaps: !!process.env.SENTRY_AUTH_TOKEN,
			sourceMapsUploadOptions: {
				org: process.env.SENTRY_ORG,
				project: process.env.SENTRY_PROJECT,
				authToken: process.env.SENTRY_AUTH_TOKEN
			}
		}),
		sveltekit({
			// Escape hatch de kit 3 para seguir usando imports `$lib/...`
			// (68 imports en ~35 archivos). Deja un warning de deprecado;
			// la migración real a `#lib` con extensión explícita queda como deuda.
			alias: { $lib: 'src/lib' },
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	]
});