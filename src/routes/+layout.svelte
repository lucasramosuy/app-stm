<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';

	let { children } = $props();

	onMount(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js', { type: 'module' }).catch((err) => {
				console.warn('[PWA] no se pudo registrar el service worker', err);
			});
		}
	});
</script>

{@render children()}