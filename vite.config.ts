import adapter from '@sveltejs/adapter-netlify';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Deploy target: Netlify. Ver /home/claude/mvd-bus README para el porqué
			// (necesitamos runtime Node persistente para el cache del token OAuth,
			// no edge/Workers).
			adapter: adapter()
		})
	]
});
