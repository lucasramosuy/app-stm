<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	// Centro de Montevideo (Plaza Independencia, aprox.)
	const MONTEVIDEO_CENTER: [number, number] = [-56.1937, -34.9058];

	// TODO: reemplazar por un estilo custom oscuro (ver frontend-design):
	// por ahora usamos el estilo gratuito de OpenFreeMap como base de trabajo,
	// sin necesidad de API key. Se puede tunear color por color más adelante.
	const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

	let mapContainer: HTMLDivElement;
	let map: MapLibreMap | undefined;

	onMount(() => {
		map = new MapLibreMap({
			container: mapContainer,
			style: STYLE_URL,
			center: MONTEVIDEO_CENTER,
			zoom: 13,
			attributionControl: { compact: true }
		});

		map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
	});

	onDestroy(() => {
		map?.remove();
	});
</script>

<div class="map-container" bind:this={mapContainer}></div>

<style>
	.map-container {
		position: absolute;
		inset: 0;
	}

	/* Oscurece el mapa base mientras no tenemos un estilo custom propio */
	.map-container :global(.maplibregl-canvas) {
		filter: brightness(0.85) saturate(0.9);
	}
</style>
