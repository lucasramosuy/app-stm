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
	import { buildDarkStyle } from '$lib/map/darkStyle';

	setWorkerUrl(workerUrl);

	interface NearbyStop {
		busstopId: number;
		street1: string;
		street2: string;
		location: { coordinates: [number, number] };
	}

	let {
		buses = [],
		focusLocation = null,
		selectedStopId = null,
		onSelectStop
	}: {
		buses?: UpcomingBus[];
		focusLocation?: [number, number] | null;
		selectedStopId?: number | null;
		onSelectStop?: (busstopId: number) => void;
	} = $props();

	// Por debajo de este zoom no mostramos paradas: a nivel ciudad serían
	// miles de puntos amontonados sin valor y con costo de red innecesario.
	const MIN_ZOOM_FOR_STOPS = 15;

	// Centro de Montevideo (Plaza Independencia, aprox.)
	const MONTEVIDEO_CENTER: [number, number] = [-56.1937, -34.9058];

	// Estilo base gratuito de OpenFreeMap (sin API key), reescrito a nuestra
	// paleta oscura en tiempo real por buildDarkStyle() — ver darkStyle.ts.
	const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

	let mapContainer: HTMLDivElement;
	let map: MapLibreMap | undefined;
	let mapReady = $state(false);

	const busMarkers = new Map<number, Marker>();
	const stopMarkers = new Map<number, { marker: Marker; el: HTMLDivElement }>();

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
			const existing = busMarkers.get(bus.busId);

			if (existing) {
				existing.setLngLat([lon, lat]);
			} else {
				const marker = new Marker({ element: busMarkerElement(bus) })
					.setLngLat([lon, lat])
					.addTo(map);
				busMarkers.set(bus.busId, marker);
			}
		}

		for (const [busId, marker] of busMarkers) {
			if (!seenIds.has(busId)) {
				marker.remove();
				busMarkers.delete(busId);
			}
		}
	}

	function stopMarkerElement(stop: NearbyStop): HTMLDivElement {
		const el = document.createElement('div');
		el.className = 'stop-marker';
		el.title = `${stop.street1} y ${stop.street2}`;
		el.setAttribute('role', 'button');
		el.setAttribute('aria-label', `Parada: ${stop.street1} y ${stop.street2}`);
		el.addEventListener('click', (e) => {
			e.stopPropagation();
			onSelectStop?.(stop.busstopId);
		});
		return el;
	}

	function syncStopMarkers(list: NearbyStop[]) {
		if (!map) return;

		const seenIds = new Set<number>();

		for (const stop of list) {
			seenIds.add(stop.busstopId);
			const [lon, lat] = stop.location.coordinates;
			const existing = stopMarkers.get(stop.busstopId);

			if (existing) {
				existing.marker.setLngLat([lon, lat]);
			} else {
				const el = stopMarkerElement(stop);
				const marker = new Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
				stopMarkers.set(stop.busstopId, { marker, el });
			}
		}

		for (const [busstopId, { marker }] of stopMarkers) {
			if (!seenIds.has(busstopId)) {
				marker.remove();
				stopMarkers.delete(busstopId);
			}
		}
	}

	function clearStopMarkers() {
		for (const { marker } of stopMarkers.values()) marker.remove();
		stopMarkers.clear();
	}

	async function fetchAndSyncNearbyStops() {
		if (!map) return;
		if (map.getZoom() < MIN_ZOOM_FOR_STOPS) {
			clearStopMarkers();
			return;
		}

		const bounds = map.getBounds();
		const params = new URLSearchParams({
			minLat: String(bounds.getSouth()),
			minLng: String(bounds.getWest()),
			maxLat: String(bounds.getNorth()),
			maxLng: String(bounds.getEast())
		});

		try {
			const res = await fetch(`/api/busstops/nearby?${params}`);
			if (res.ok) {
				const stops: NearbyStop[] = await res.json();
				syncStopMarkers(stops);
			}
		} catch (err) {
			console.warn('[BusMap] no se pudieron cargar paradas cercanas', err);
		}
	}

	// Marca visualmente cuál parada está seleccionada (sin refetch: solo
	// toca el className de los elementos ya en pantalla).
	$effect(() => {
		for (const [busstopId, { el }] of stopMarkers) {
			el.classList.toggle('selected', busstopId === selectedStopId);
		}
	});

	$effect(() => {
		if (mapReady) {
			syncBusMarkers(buses);
		}
	});

	$effect(() => {
		if (mapReady && map && focusLocation) {
			map.flyTo({ center: focusLocation, zoom: 16, duration: 900 });
		}
	});

	onMount(() => {
		(async () => {
			let style: string | Awaited<ReturnType<typeof buildDarkStyle>> = STYLE_URL;
			try {
				const res = await fetch(STYLE_URL);
				const baseStyle = await res.json();
				style = buildDarkStyle(baseStyle);
			} catch (err) {
				// Si falla el fetch/transformación, seguimos con la URL original
				// (queda con los colores default de Liberty) en vez de romper el mapa.
				console.warn('[BusMap] no se pudo generar el estilo oscuro, uso el default', err);
			}

			map = new MapLibreMap({
				container: mapContainer,
				style,
				center: MONTEVIDEO_CENTER,
				zoom: 13,
				maxZoom: 17,
				attributionControl: { compact: true }
			});

			map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

			map.on('load', () => {
				mapReady = true;
				fetchAndSyncNearbyStops();
			});

			let moveendTimeout: ReturnType<typeof setTimeout> | undefined;
			map.on('moveend', () => {
				clearTimeout(moveendTimeout);
				moveendTimeout = setTimeout(fetchAndSyncNearbyStops, 250);
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
		})();
	});

	onDestroy(() => {
		for (const marker of busMarkers.values()) marker.remove();
		busMarkers.clear();
		clearStopMarkers();
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
		z-index: 0;
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
		z-index: 2;
	}

	.map-container :global(.stop-marker) {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--color-text-secondary);
		border: 2px solid var(--color-bg);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
		cursor: pointer;
		z-index: 1;
		transition:
			background 0.15s ease,
			transform 0.15s ease;
	}

	.map-container :global(.stop-marker:hover) {
		background: var(--color-text);
		transform: scale(1.3);
	}

	.map-container :global(.stop-marker.selected) {
		background: var(--color-accent);
		width: 16px;
		height: 16px;
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