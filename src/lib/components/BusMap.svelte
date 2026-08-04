<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
	import type { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	// Fix conocido para MapLibre GL v6 + Vite: el dependency optimizer de Vite
	// pierde el archivo del worker si no se registra explícitamente así.
	// ?worker&url (no ?url solo) es necesario: el worker importa un archivo
	// hermano (maplibre-gl-shared.mjs) que ?url no arrastra.
	// Ver: https://maplibre.org/maplibre-gl-js/docs/
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { buildDarkStyle } from '$lib/map/darkStyle';
	import type { Bus, UpcomingBus } from '$lib/types/stm';

	/** Datos mínimos que viajan en el GeoJSON y vuelven al hacer click. */
	export type MapBusSelection = Pick<
		Bus,
		| 'busId'
		| 'line'
		| 'origin'
		| 'destination'
		| 'subline'
		| 'special'
		| 'company'
		| 'speed'
		| 'access'
		| 'thermalConfort'
		| 'emissions'
		| 'location'
	>;

	interface NearbyStop {
		busstopId: number;
		street1: string;
		street2: string;
		location: { coordinates: [number, number] };
	}

	type LiveBus = MapBusSelection;

	setWorkerUrl(workerUrl);

	let {
		buses = [],
		focusLocation = null,
		selectedStopId = null,
		selectedBusId = null,
		filterLine = null,
		onSelectStop,
		onSelectBus
	}: {
		buses?: UpcomingBus[];
		focusLocation?: [number, number] | null;
		selectedStopId?: number | null;
		selectedBusId?: number | null;
		filterLine?: string | null;
		onSelectStop?: (busstopId: number) => void;
		onSelectBus?: (bus: MapBusSelection) => void;
	} = $props();

	// Modo de qué buses mostrar en el mapa:
	// - "line": se filtró una línea en el buscador → solo esos buses, en
	//   toda la ciudad (no limitado al viewport).
	// - "stop": hay una parada seleccionada → solo los buses que la sirven
	//   (mismos datos que ya vienen en el sidebar, sin fetch propio).
	// - "viewport": caso default → todos los buses visibles en el área
	//   actual del mapa.
	const busMode = $derived(filterLine ? 'line' : selectedStopId !== null ? 'stop' : 'viewport');

	// Por debajo de este zoom no mostramos paradas: a nivel ciudad serían
	// miles de puntos amontonados sin valor y con costo de red innecesario.
	const MIN_ZOOM_FOR_STOPS = 15;
	const BUSES_POLL_MS = 8_000;

	// Centro de Montevideo (Plaza Independencia, aprox.)
	const MONTEVIDEO_CENTER: [number, number] = [-56.1937, -34.9058];

	// Estilo base gratuito de OpenFreeMap (sin API key), reescrito a nuestra
	// paleta oscura en tiempo real por buildDarkStyle() — ver darkStyle.ts.
	const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

	const STOPS_SOURCE_ID = 'stops';
	const STOPS_LAYER_ID = 'stops-layer';
	const BUSES_SOURCE_ID = 'live-buses';
	const BUSES_CIRCLE_LAYER_ID = 'live-buses-circle';
	const BUSES_LABEL_LAYER_ID = 'live-buses-label';

	let mapContainer: HTMLDivElement;
	let map: MapLibreMap | undefined;
	let mapReady = $state(false);

	let highlightedStopId: number | null = null;
	let highlightedBusId: number | null = null;
	let lastFitLine: string | null = null;

	let debugMessage = $state<string | null>(null);
	let tilesLoaded = $state(false);

	function applySelectedHighlight() {
		if (!map || !map.getSource(STOPS_SOURCE_ID)) return;

		if (highlightedStopId !== null) {
			map.setFeatureState({ source: STOPS_SOURCE_ID, id: highlightedStopId }, { selected: false });
		}
		if (selectedStopId !== null) {
			map.setFeatureState({ source: STOPS_SOURCE_ID, id: selectedStopId }, { selected: true });
		}
		highlightedStopId = selectedStopId;
	}

	function syncStopMarkers(list: NearbyStop[]) {
		if (!map) return;
		const source = map.getSource(STOPS_SOURCE_ID) as GeoJSONSource | undefined;
		if (!source) return;

		source.setData({
			type: 'FeatureCollection',
			features: list.map((stop) => ({
				type: 'Feature',
				id: stop.busstopId,
				properties: {
					busstopId: stop.busstopId,
					street1: stop.street1,
					street2: stop.street2
				},
				geometry: { type: 'Point', coordinates: stop.location.coordinates }
			}))
		});

		applySelectedHighlight();
	}

	function clearStopMarkers() {
		const source = map?.getSource(STOPS_SOURCE_ID) as GeoJSONSource | undefined;
		source?.setData({ type: 'FeatureCollection', features: [] });
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

	function busToProperties(bus: LiveBus) {
		return {
			busId: bus.busId,
			line: bus.line,
			origin: bus.origin ?? '',
			destination: bus.destination ?? '',
			subline: bus.subline ?? '',
			special: bus.special ?? false,
			company: bus.company ?? '',
			speed: bus.speed ?? 0,
			access: bus.access ?? '',
			thermalConfort: bus.thermalConfort ?? '',
			emissions: bus.emissions ?? ''
		};
	}

	function propertiesToBus(
		props: Record<string, unknown>,
		coordinates: [number, number]
	): MapBusSelection {
		return {
			busId: Number(props.busId),
			line: String(props.line ?? ''),
			origin: String(props.origin ?? ''),
			destination: String(props.destination ?? ''),
			subline: String(props.subline ?? ''),
			special: Boolean(props.special),
			company: String(props.company ?? ''),
			speed: Number(props.speed ?? 0),
			access: String(props.access ?? ''),
			thermalConfort: String(props.thermalConfort ?? ''),
			emissions: String(props.emissions ?? ''),
			location: { type: 'Point', coordinates }
		};
	}

	function applySelectedBusHighlight() {
		if (!map || !map.getSource(BUSES_SOURCE_ID)) return;

		if (highlightedBusId !== null) {
			map.setFeatureState({ source: BUSES_SOURCE_ID, id: highlightedBusId }, { selected: false });
		}
		if (selectedBusId !== null) {
			map.setFeatureState({ source: BUSES_SOURCE_ID, id: selectedBusId }, { selected: true });
		}
		highlightedBusId = selectedBusId;
	}

	function syncBuses(list: LiveBus[]) {
		if (!map) return;
		const source = map.getSource(BUSES_SOURCE_ID) as GeoJSONSource | undefined;
		if (!source) return;

		source.setData({
			type: 'FeatureCollection',
			features: list.map((bus) => ({
				type: 'Feature',
				id: bus.busId,
				properties: busToProperties(bus),
				geometry: { type: 'Point', coordinates: bus.location.coordinates }
			}))
		});

		applySelectedBusHighlight();
	}

	function upcomingToLiveBus(bus: UpcomingBus): LiveBus {
		return {
			busId: bus.busId,
			line: bus.line,
			origin: bus.origin,
			destination: bus.destination,
			subline: bus.subline,
			special: bus.special,
			company: bus.companyName,
			speed: 0,
			access: bus.access,
			thermalConfort: bus.thermalConfort,
			emissions: bus.emissions,
			location: bus.location
		};
	}

	function handleBusFeatureClick(feature: MapGeoJSONFeature | undefined) {
		if (!feature?.geometry || feature.geometry.type !== 'Point') return;
		const bus = propertiesToBus(feature.properties, feature.geometry.coordinates as [number, number]);
		if (!Number.isFinite(bus.busId)) return;
		onSelectBus?.(bus);
	}

	function fitToBuses(list: LiveBus[]) {
		if (!map || list.length === 0) return;
		let minLng = Infinity;
		let minLat = Infinity;
		let maxLng = -Infinity;
		let maxLat = -Infinity;
		for (const bus of list) {
			const [lng, lat] = bus.location.coordinates;
			minLng = Math.min(minLng, lng);
			maxLng = Math.max(maxLng, lng);
			minLat = Math.min(minLat, lat);
			maxLat = Math.max(maxLat, lat);
		}
		map.fitBounds(
			[
				[minLng, minLat],
				[maxLng, maxLat]
			],
			{ padding: 80, maxZoom: 15, duration: 900 }
		);
	}

	/** Modo "viewport": todos los buses en el área visible del mapa. */
	async function fetchAndSyncBuses() {
		if (!map) return;

		const bounds = map.getBounds();
		const params = new URLSearchParams({
			minLat: String(bounds.getSouth()),
			minLng: String(bounds.getWest()),
			maxLat: String(bounds.getNorth()),
			maxLng: String(bounds.getEast())
		});

		try {
			const res = await fetch(`/api/buses/nearby?${params}`);
			if (res.ok) {
				const list: LiveBus[] = await res.json();
				syncBuses(list);
			}
		} catch (err) {
			console.warn('[BusMap] no se pudieron cargar buses cercanos', err);
		}
	}

	/** Modo "line": solo los buses de una línea, en toda la ciudad. */
	async function fetchAndSyncBusesByLine(line: string) {
		try {
			const res = await fetch(`/api/buses/by-line?line=${encodeURIComponent(line)}`);
			if (res.ok) {
				const list: LiveBus[] = await res.json();
				syncBuses(list);
				// Solo encuadra el mapa la primera vez que se activa el filtro,
				// no en cada refresco periódico (si no, "salta" cada 8s).
				if (lastFitLine !== line) {
					fitToBuses(list);
					lastFitLine = line;
				}
			}
		} catch (err) {
			console.warn('[BusMap] no se pudieron cargar buses de la línea', err);
		}
	}

	// Decide qué mostrar según el modo activo. Se dispara al montar, y cada
	// vez que cambian selectedStopId, filterLine, o los datos de `buses`
	// (el sidebar los refresca cada 12s con polling propio).
	$effect(() => {
		if (!mapReady) return;

		if (busMode === 'stop') {
			syncBuses(buses.map(upcomingToLiveBus));
		} else if (busMode === 'line' && filterLine) {
			fetchAndSyncBusesByLine(filterLine);
		} else {
			lastFitLine = null;
			fetchAndSyncBuses();
		}
	});

	$effect(() => {
		selectedStopId;
		applySelectedHighlight();
	});

	$effect(() => {
		selectedBusId;
		applySelectedBusHighlight();
	});

	$effect(() => {
		if (mapReady && map && focusLocation) {
			map.flyTo({ center: focusLocation, zoom: 16, duration: 900 });
		}
	});

	onMount(() => {
		let moveendTimeout: ReturnType<typeof setTimeout> | undefined;
		let busesPollInterval: ReturnType<typeof setInterval> | undefined;

		(async () => {
			let style: string | Awaited<ReturnType<typeof buildDarkStyle>> = STYLE_URL;
			try {
				const res = await fetch(STYLE_URL);
				const baseStyle = await res.json();
				style = buildDarkStyle(baseStyle);
			} catch (err) {
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
				if (!map) return;

				map.addSource(STOPS_SOURCE_ID, {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] }
				});
				map.addLayer({
					id: STOPS_LAYER_ID,
					type: 'circle',
					source: STOPS_SOURCE_ID,
					paint: {
						'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 8, 6],
						'circle-color': [
							'case',
							['boolean', ['feature-state', 'selected'], false],
							'#FFC93C',
							'#9aa3b2'
						],
						'circle-stroke-color': '#0B1220',
						'circle-stroke-width': 2
					}
				});

				map.addSource(BUSES_SOURCE_ID, {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] }
				});
				map.addLayer({
					id: BUSES_CIRCLE_LAYER_ID,
					type: 'circle',
					source: BUSES_SOURCE_ID,
					paint: {
						'circle-radius': [
							'case',
							['boolean', ['feature-state', 'selected'], false],
							14,
							10
						],
						'circle-color': [
							'case',
							['boolean', ['feature-state', 'selected'], false],
							'#5eead4',
							'#FFC93C'
						],
						'circle-stroke-color': '#0B1220',
						'circle-stroke-width': 2
					}
				});
				map.addLayer({
					id: BUSES_LABEL_LAYER_ID,
					type: 'symbol',
					source: BUSES_SOURCE_ID,
					layout: {
						'text-field': ['get', 'line'],
						'text-font': ['Noto Sans Bold'],
						'text-size': 10,
						'text-allow-overlap': true,
						'text-ignore-placement': true
					},
					paint: { 'text-color': '#0B1220' }
				});

				const busLayerIds = [BUSES_CIRCLE_LAYER_ID, BUSES_LABEL_LAYER_ID];

				map.on('click', STOPS_LAYER_ID, (e) => {
					const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
					const busstopId = feature?.properties?.busstopId;
					if (typeof busstopId === 'number') {
						onSelectStop?.(busstopId);
					}
				});
				for (const layerId of busLayerIds) {
					map.on('click', layerId, (e) => {
						handleBusFeatureClick(e.features?.[0] as MapGeoJSONFeature | undefined);
					});
					map.on('mouseenter', layerId, () => {
						if (map) map.getCanvas().style.cursor = 'pointer';
					});
					map.on('mouseleave', layerId, () => {
						if (map) map.getCanvas().style.cursor = '';
					});
				}
				map.on('mouseenter', STOPS_LAYER_ID, () => {
					if (map) map.getCanvas().style.cursor = 'pointer';
				});
				map.on('mouseleave', STOPS_LAYER_ID, () => {
					if (map) map.getCanvas().style.cursor = '';
				});

				mapReady = true;
				fetchAndSyncNearbyStops();

				// Refresco periódico: los buses se mueven aunque el mapa esté
				// quieto. En modo "stop" no hace falta (el prop `buses` ya se
				// refresca solo desde afuera cada 12s).
				busesPollInterval = setInterval(() => {
					if (busMode === 'line' && filterLine) {
						fetchAndSyncBusesByLine(filterLine);
					} else if (busMode === 'viewport') {
						fetchAndSyncBuses();
					}
				}, BUSES_POLL_MS);
			});

			map.on('moveend', () => {
				clearTimeout(moveendTimeout);
				moveendTimeout = setTimeout(() => {
					fetchAndSyncNearbyStops();
					if (busMode === 'viewport') fetchAndSyncBuses();
				}, 250);
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

		return () => {
			clearTimeout(moveendTimeout);
			clearInterval(busesPollInterval);
		};
	});

	onDestroy(() => {
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