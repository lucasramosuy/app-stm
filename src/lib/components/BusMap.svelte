<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	// Fix conocido para MapLibre GL v6 + Vite: el dependency optimizer de Vite
	// pierde el archivo del worker si no se registra explícitamente así.
	// ?worker&url (no ?url solo) es necesario: el worker importa un archivo
	// hermano (maplibre-gl-shared.mjs) que ?url no arrastra.
	// Ver: https://maplibre.org/maplibre-gl-js/docs/
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import type { UpcomingBus } from '$lib/types/stm';

	setWorkerUrl(workerUrl);

	let { buses = [] }: { buses?: UpcomingBus[] } = $props();

	// Centro de Montevideo (Plaza Independencia, aprox.)
	const MONTEVIDEO_CENTER: [number, number] = [-56.1937, -34.9058];

	// TODO: reemplazar por un estilo custom oscuro (ver frontend-design):
	// por ahora usamos el estilo gratuito de OpenFreeMap como base de trabajo,
	// sin necesidad de API key. Se puede tunear color por color más adelante.
	const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

	let mapContainer: HTMLDivElement;
	let map: MapLibreMap | undefined;
	let mapReady = $state(false);

	// Un marcador de MapLibre por busId, para poder actualizar posición o
	// destruir el marcador puntual en vez de recrear todo el set cada vez.
	const markers = new Map<number, Marker>();

	// Estado de diagnóstico visible en pantalla — temporal, mientras
	// confirmamos que el mapa carga bien en distintos dispositivos/redes.
	let debugMessage = $state<string | null>(null);
	let tilesLoaded = $state(false);

	function busMarkerElement(bus: UpcomingBus): HTMLDivElement {
		const el = document.createElement('div');
		el.className = 'bus-marker';
		el.textContent = bus.line;
		return el;
	}

	function syncBusMarkers(list: UpcomingBus[]) {
		if (!map) return;

		const seenIds = new Set<number>();

		for (const bus of list) {
			seenIds.add(bus.busId);
			const [lon, lat] = bus.location.coordinates;
			const existing = markers.get(bus.busId);

			if (existing) {
				existing.setLngLat([lon, lat]);
			} else {
				const marker = new Marker({ element: busMarkerElement(bus) })
					.setLngLat([lon, lat])
					.addTo(map);
				markers.set(bus.busId, marker);
			}
		}

		// Saca del mapa los buses que ya no vienen en la respuesta
		// (terminaron el recorrido, se apagaron, etc.)
		for (const [busId, marker] of markers) {
			if (!seenIds.has(busId)) {
				marker.remove();
				markers.delete(busId);
			}
		}
	}

	// Reactivo: cada vez que cambian los buses (o el mapa recién termina de
	// inicializar), sincroniza los marcadores.
	$effect(() => {
		if (mapReady) {
			syncBusMarkers(buses);
		}
	});

	onMount(() => {
		map = new MapLibreMap({
			container: mapContainer,
			style: STYLE_URL,
			center: MONTEVIDEO_CENTER,
			zoom: 13,
			attributionControl: { compact: true }
		});

		map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

		map.on('load', () => {
			mapReady = true;
		});

		map.on('error', (e) => {
			debugMessage = `Error de mapa: ${e.error?.message ?? 'desconocido'}`;
			console.error('[BusMap] maplibre error', e);
		});

		map.on('sourcedata', (e) => {
			if (e.isSourceLoaded && !tilesLoaded) {
				tilesLoaded = true;
			}
		});

		setTimeout(() => {
			if (!tilesLoaded && !debugMessage) {
				debugMessage =
					'El mapa no recibió datos de tiles.openfreemap.org en 6s. Probablemente la red actual está bloqueando ese dominio.';
			}
		}, 6000);
	});

	onDestroy(() => {
		for (const marker of markers.values()) marker.remove();
		markers.clear();
		map?.remove();
	});
</script>

<div class="map-container" bind:this={mapContainer}></div>

{#if debugMessage}
	<div class="debug-banner">{debugMessage}</div>
{/if}

<style>
	.map-container {
		position: absolute;
		inset: 0;
	}

	/* Oscurece el mapa base mientras no tenemos un estilo custom propio */
	.map-container :global(.maplibregl-canvas) {
		filter: brightness(0.85) saturate(0.9);
	}

	.map-container :global(.bus-marker) {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 34px;
		height: 26px;
		padding: 0 var(--space-2);
		background: var(--color-accent);
		color: var(--color-bg);
		font-family: var(--font-sans);
		font-weight: 700;
		font-size: 12px;
		border-radius: 999px;
		border: 2px solid var(--color-bg);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
		cursor: pointer;
	}

	.debug-banner {
		position: absolute;
		bottom: var(--space-4);
		left: var(--space-4);
		right: var(--space-4);
		z-index: 20;
		background: #7f1d1d;
		color: white;
		font-size: 12px;
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		max-width: 480px;
	}
</style>