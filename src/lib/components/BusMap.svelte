<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
	import type { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { buildDarkStyle } from '$lib/map/darkStyle';
	import type { Bus, UpcomingBus } from '$lib/types/stm';

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
		selectedStopName = null,
		selectedBusId = null,
		filterLine = null,
		onSelectStop,
		onSelectBus
	}: {
		buses?: UpcomingBus[];
		focusLocation?: [number, number] | null;
		selectedStopId?: number | null;
		selectedStopName?: string | null;
		selectedBusId?: number | null;
		filterLine?: string | null;
		onSelectStop?: (busstopId: number) => void;
		onSelectBus?: (bus: MapBusSelection) => void;
	} = $props();

	const busMode = $derived(filterLine ? 'line' : selectedStopId !== null ? 'stop' : 'viewport');
	const MIN_ZOOM_FOR_STOPS = 15;
	const BUSES_POLL_MS = 15_000;
	const MONTEVIDEO_CENTER: [number, number] = [-56.1937, -34.9058];
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
	let activeBusesCount = $state(0);
	let isStaleData = $state(false);

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
		if (document.visibilityState === 'hidden') return;
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
		activeBusesCount = list.length;
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

	async function fetchAndSyncBuses() {
		if (!map) return;
		if (document.visibilityState === 'hidden') return;

		const bounds = map.getBounds();
		const params = new URLSearchParams({
			minLat: String(bounds.getSouth()),
			minLng: String(bounds.getWest()),
			maxLat: String(bounds.getNorth()),
			maxLng: String(bounds.getEast())
		});

		try {
			const res = await fetch(`/api/buses/nearby?${params}`);
			isStaleData = res.headers.get('X-Data-Stale') === '1';
			if (res.ok) {
				const list: LiveBus[] = await res.json();
				syncBuses(list);
			}
		} catch (err) {
			console.warn('[BusMap] no se pudieron cargar buses cercanos', err);
		}
	}

	async function fetchAndSyncBusesByLine(line: string) {
		if (document.visibilityState === 'hidden') return;
		try {
			const res = await fetch(`/api/buses/by-line?line=${encodeURIComponent(line)}`);
			isStaleData = res.headers.get('X-Data-Stale') === '1';
			if (res.ok) {
				const list: LiveBus[] = await res.json();
				syncBuses(list);
				if (lastFitLine !== line) {
					fitToBuses(list);
					lastFitLine = line;
				}
			}
		} catch (err) {
			console.warn('[BusMap] no se pudieron cargar buses de la línea', err);
		}
	}

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

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible' && mapReady) {
				if (busMode === 'line' && filterLine) {
					fetchAndSyncBusesByLine(filterLine);
				} else if (busMode === 'viewport') {
					fetchAndSyncBuses();
				}
				fetchAndSyncNearbyStops();
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

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

				busesPollInterval = setInterval(() => {
					if (document.visibilityState === 'hidden') return;
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
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	onDestroy(() => {
		map?.remove();
	});
</script>

<div class="map-container" bind:this={mapContainer}></div>

<!-- Chip de Leyenda / Modo de Mapa (Prioridad 4) -->
<div class="mode-chip">
	{#if busMode === 'stop'}
		<span class="dot stop-dot"></span>
		<span class="mode-text">
			Parada {selectedStopName ?? `#${selectedStopId}`} · <strong>{activeBusesCount}</strong> {activeBusesCount === 1 ? 'bus' : 'buses'} aproximándose
		</span>
	{:else if busMode === 'line'}
		<span class="dot line-dot"></span>
		<span class="mode-text">
			Línea <strong>{filterLine}</strong> · <strong>{activeBusesCount}</strong> {activeBusesCount === 1 ? 'bus' : 'buses'} en la ciudad
		</span>
	{:else}
		<span class="dot view-dot"></span>
		<span class="mode-text">
			Zona visible · <strong>{activeBusesCount}</strong> {activeBusesCount === 1 ? 'bus' : 'buses'} en pantalla
		</span>
	{/if}
	{#if isStaleData}
		<span class="stale-badge" title="Respondiendo datos cacheados por demora de STM">Demorado</span>
	{/if}
</div>

{#if debugMessage}
	<div class="debug-banner">{debugMessage}</div>
{/if}

<style>
	.map-container {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.mode-chip {
		position: absolute;
		bottom: var(--space-4);
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: rgba(19, 27, 46, 0.88);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--color-border);
		border-radius: 9999px;
		padding: 6px 14px;
		color: var(--color-text);
		font-size: 12px;
		white-space: nowrap;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
		pointer-events: none;
	}

	@media (min-width: 900px) {
		.mode-chip {
			bottom: var(--space-5);
			left: calc(380px + (100% - 380px) / 2);
		}
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.stop-dot {
		background: #FFC93C;
		box-shadow: 0 0 6px #FFC93C;
	}

	.line-dot {
		background: #5eead4;
		box-shadow: 0 0 6px #5eead4;
	}

	.view-dot {
		background: #60a5fa;
		box-shadow: 0 0 6px #60a5fa;
	}

	.stale-badge {
		background: #f59e0b;
		color: #0b1220;
		font-weight: 700;
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 4px;
		text-transform: uppercase;
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