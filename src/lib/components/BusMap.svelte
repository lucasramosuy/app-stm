<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl';
	import type { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import { buildDarkStyle } from '$lib/map/darkStyle';
	import type { UpcomingBus } from '$lib/types/stm';
	import type { TripOption } from '$lib/types/trip';

	interface NearbyStop {
		busstopId: number;
		street1: string;
		street2: string;
		location: { coordinates: [number, number] };
	}

	interface LiveBus {
		busId: number;
		line: string;
		origin: string;
		destination: string;
		subline: string;
		special: boolean;
		company: string;
		speed: number;
		access: string;
		thermalConfort: string;
		emissions: string;
		location: { coordinates: [number, number] };
	}

	export interface MapBusSelection {
		busId: number;
		line: string;
		origin: string;
		destination: string;
		subline: string;
		special: boolean;
		company: string;
		speed: number;
		access: string;
		thermalConfort: string;
		emissions: string;
		location: { coordinates: [number, number] };
	}

	setWorkerUrl(workerUrl);

	let {
		buses = [],
		focusLocation = null,
		selectedStopIds = [],
		selectedStopName = null,
		selectedBusIds = [],
		filterLine = null,
		tripOrigin = null,
		tripDestination = null,
		tripOption = null,
		onSelectStop,
		onSelectBus,
		onSelectPoi
	}: {
		buses?: UpcomingBus[];
		focusLocation?: [number, number] | null;
		selectedStopIds?: number[];
		selectedStopName?: string | null;
		selectedBusIds?: number[];
		filterLine?: string | null;
		tripOrigin?: { coordinates: [number, number] } | null;
		tripDestination?: { coordinates: [number, number] } | null;
		tripOption?: TripOption | null;
		onSelectStop?: (busstopId: number) => void;
		onSelectBus?: (bus: MapBusSelection) => void;
		onSelectPoi?: (poi: { label: string; coordinates: [number, number] }) => void;
	} = $props();

	const busMode = $derived(filterLine ? 'line' : selectedStopIds.length > 0 ? 'stop' : 'viewport');

	const MIN_ZOOM_FOR_STOPS = 15;
	const BUSES_POLL_MS = 8_000;

	const MONTEVIDEO_CENTER: [number, number] = [-56.1937, -34.9058];
	const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

	const STOPS_SOURCE_ID = 'stops';
	const STOPS_LAYER_ID = 'stops-layer';
	const BUSES_SOURCE_ID = 'live-buses';
	const BUSES_CIRCLE_LAYER_ID = 'live-buses-circle';
	const BUSES_LABEL_LAYER_ID = 'live-buses-label';
	const USER_LOCATION_SOURCE_ID = 'user-location';
	const USER_LOCATION_ACCURACY_LAYER_ID = 'user-location-accuracy';
	const USER_LOCATION_DOT_LAYER_ID = 'user-location-dot';
	const SHAPE_SOURCE_ID = 'route-shape';
	const SHAPE_GLOW_LAYER_ID = 'route-shape-glow';
	const SHAPE_LINE_LAYER_ID = 'route-shape-line';

	// Violeta para el trazado de "filtro de línea" (toda la ciudad).
	const ROUTE_SHAPE_COLOR = '#a78bfa';

	// Capas del viaje planificado ("Cómo llegar") — color distinto
	// (celeste) para no confundirse con el violeta del filtro de línea,
	// que puede coexistir en el mismo mapa en teoría.
	const TRIP_WALK_SOURCE_ID = 'trip-walk';
	const TRIP_WALK_LAYER_ID = 'trip-walk-line';
	const TRIP_ROUTE_SOURCE_ID = 'trip-route';
	const TRIP_ROUTE_LAYER_ID = 'trip-route-line';
	const TRIP_POINTS_SOURCE_ID = 'trip-points';
	const TRIP_POINTS_LAYER_ID = 'trip-points-circle';
	const TRIP_ROUTE_COLOR = '#38bdf8';
	const TRIP_WALK_COLOR = '#9aa3b2';

	// Capas de POI del estilo base Liberty (OpenFreeMap) — no son
	// nuestras, ya vienen en el JSON del estilo. poi_r1/r7/r20 son
	// comercios y amenities genéricos (por rango de importancia),
	// poi_transit cubre íconos de aeropuerto/bus/tren, airport es el
	// ícono+label de aeródromos.
	const BASE_POI_LAYER_IDS = ['poi_r1', 'poi_r7', 'poi_r20', 'poi_transit', 'airport'];

	let mapContainer: HTMLDivElement;
	let map: MapLibreMap | undefined;
	let mapReady = $state(false);

	let highlightedStopIds = new Set<number>();
	let highlightedBusIds = new Set<number>();
	let lastFitLine: string | null = null;
	let lastShapeLine: string | null = null;
	let lastTripKey: string | null = null;

	let debugMessage = $state<string | null>(null);
	let tilesLoaded = $state(false);

	let stopAnnouncement = $state('');
	$effect(() => {
		stopAnnouncement = selectedStopName ? `Parada seleccionada: ${selectedStopName}` : '';
	});

	let locateStatus = $state<'idle' | 'locating' | 'active'>('idle');
	let geoError = $state<string | null>(null);
	let watchId: number | null = null;
	let hasCenteredOnUser = false;
	let lastUserCoords: [number, number] | null = null;
	let lastUserAccuracy = 0;

	function applySelectedHighlight() {
		if (!map || !map.getSource(STOPS_SOURCE_ID)) return;

		const nextIds = new Set(selectedStopIds);
		for (const id of highlightedStopIds) {
			if (!nextIds.has(id)) {
				map.setFeatureState({ source: STOPS_SOURCE_ID, id }, { selected: false });
			}
		}
		for (const id of nextIds) {
			map.setFeatureState({ source: STOPS_SOURCE_ID, id }, { selected: true });
		}
		highlightedStopIds = nextIds;
	}

	function applySelectedBusHighlight() {
		if (!map || !map.getSource(BUSES_SOURCE_ID)) return;

		const nextIds = new Set(selectedBusIds);
		for (const id of highlightedBusIds) {
			if (!nextIds.has(id)) {
				map.setFeatureState({ source: BUSES_SOURCE_ID, id }, { selected: false });
			}
		}
		for (const id of nextIds) {
			map.setFeatureState({ source: BUSES_SOURCE_ID, id }, { selected: true });
		}
		highlightedBusIds = nextIds;
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

	function syncBuses(list: LiveBus[]) {
		if (!map) return;
		const source = map.getSource(BUSES_SOURCE_ID) as GeoJSONSource | undefined;
		if (!source) return;

		source.setData({
			type: 'FeatureCollection',
			features: list.map((bus) => ({
				type: 'Feature',
				id: bus.busId,
				properties: {
					busId: bus.busId,
					line: bus.line,
					origin: bus.origin,
					destination: bus.destination,
					subline: bus.subline,
					special: bus.special,
					company: bus.company,
					speed: bus.speed,
					access: bus.access,
					thermalConfort: bus.thermalConfort,
					emissions: bus.emissions
				},
				geometry: { type: 'Point', coordinates: bus.location.coordinates }
			}))
		});

		applySelectedBusHighlight();
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

	async function fetchAndSyncBusesByLine(line: string) {
		try {
			const res = await fetch(`/api/buses/by-line?line=${encodeURIComponent(line)}`);
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

	async function fetchAndSyncShape(line: string) {
		try {
			const res = await fetch(`/api/lines/${encodeURIComponent(line)}/shape`);
			if (!map) return;
			const source = map.getSource(SHAPE_SOURCE_ID) as GeoJSONSource | undefined;
			if (!source) return;

			if (res.ok) {
				const geojson = await res.json();
				source.setData(geojson);
			} else {
				source.setData({ type: 'FeatureCollection', features: [] });
			}
		} catch (err) {
			console.warn('[BusMap] no se pudo cargar el trazado de la línea', err);
		}
	}

	function clearShape() {
		const source = map?.getSource(SHAPE_SOURCE_ID) as GeoJSONSource | undefined;
		source?.setData({ type: 'FeatureCollection', features: [] });
	}

	// --- Trazado del viaje planificado ("Cómo llegar") ---

	/** Distancia al cuadrado en grados — solo sirve para COMPARAR y
	 * elegir el punto/variante más cercano, no es una distancia real en
	 * metros. Alcanza para esto porque es puramente visual. */
	function degDistSq(a: [number, number], b: [number, number]): number {
		const dx = a[0] - b[0];
		const dy = a[1] - b[1];
		return dx * dx + dy * dy;
	}

	function nearestIndex(point: [number, number], coords: number[][]): { index: number; distSq: number } {
		let bestIndex = 0;
		let bestDist = Infinity;
		coords.forEach((c, i) => {
			const d = degDistSq(point, c as [number, number]);
			if (d < bestDist) {
				bestDist = d;
				bestIndex = i;
			}
		});
		return { index: bestIndex, distSq: bestDist };
	}

	/** Una línea puede tener varias variantes de recorrido (ida/vuelta,
	 * ramales). Elige la que pasa más cerca de ambas paradas del tramo, y
	 * devuelve SOLO el segmento entre esas dos paradas — no el recorrido
	 * completo de la línea, que sería ruidoso para un viaje puntual. */
	function clipShapeToLeg(
		boardCoord: [number, number],
		alightCoord: [number, number],
		features: { geometry: { coordinates: number[][] } }[]
	): number[][] | null {
		let best: number[][] | null = null;
		let bestScore = Infinity;

		for (const f of features) {
			const coords = f.geometry.coordinates;
			if (coords.length < 2) continue;
			const nb = nearestIndex(boardCoord, coords);
			const na = nearestIndex(alightCoord, coords);
			const score = nb.distSq + na.distSq;
			if (score < bestScore) {
				bestScore = score;
				const [start, end] = nb.index <= na.index ? [nb.index, na.index] : [na.index, nb.index];
				best = coords.slice(start, end + 1);
			}
		}

		return best;
	}

	async function fetchAndSyncTripRoute(
		option: TripOption,
		origin: [number, number],
		destination: [number, number]
	) {
		if (!map) return;
		const routeSource = map.getSource(TRIP_ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
		const walkSource = map.getSource(TRIP_WALK_SOURCE_ID) as GeoJSONSource | undefined;
		const pointsSource = map.getSource(TRIP_POINTS_SOURCE_ID) as GeoJSONSource | undefined;
		if (!routeSource || !walkSource || !pointsSource) return;

		pointsSource.setData({
			type: 'FeatureCollection',
			features: [
				{ type: 'Feature', properties: { kind: 'origin' }, geometry: { type: 'Point', coordinates: origin } },
				{
					type: 'Feature',
					properties: { kind: 'destination' },
					geometry: { type: 'Point', coordinates: destination }
				}
			]
		});

		const firstBoard = option.legs[0].boardStop.coordinates;
		const lastAlight = option.legs[option.legs.length - 1].alightStop.coordinates;

		// Caminatas como línea recta punteada — no hay ruteo peatonal
		// real disponible, es solo una referencia de "hacia dónde
		// caminar", no calles exactas.
		walkSource.setData({
			type: 'FeatureCollection',
			features: [
				{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [origin, firstBoard] } },
				{
					type: 'Feature',
					properties: {},
					geometry: { type: 'LineString', coordinates: [lastAlight, destination] }
				}
			]
		});

		try {
			const shapeResults = await Promise.all(
				option.legs.map(async (leg) => {
					const res = await fetch(`/api/lines/${encodeURIComponent(leg.line)}/shape`);
					if (!res.ok) return null;
					const geojson = await res.json();
					return clipShapeToLeg(leg.boardStop.coordinates, leg.alightStop.coordinates, geojson.features ?? []);
				})
			);

			routeSource.setData({
				type: 'FeatureCollection',
				features: shapeResults
					.filter((coords): coords is number[][] => coords !== null && coords.length >= 2)
					.map((coords) => ({
						type: 'Feature' as const,
						properties: {},
						geometry: { type: 'LineString' as const, coordinates: coords }
					}))
			});
		} catch (err) {
			console.warn('[BusMap] no se pudo dibujar el trazado del viaje', err);
			routeSource.setData({ type: 'FeatureCollection', features: [] });
		}

		const allPoints = [
			origin,
			destination,
			...option.legs.flatMap((l) => [l.boardStop.coordinates, l.alightStop.coordinates])
		];
		let minLng = Infinity;
		let minLat = Infinity;
		let maxLng = -Infinity;
		let maxLat = -Infinity;
		for (const [lng, lat] of allPoints) {
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
			{ padding: 80, maxZoom: 16, duration: 900 }
		);
	}

	function clearTripRoute() {
		const routeSource = map?.getSource(TRIP_ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
		const walkSource = map?.getSource(TRIP_WALK_SOURCE_ID) as GeoJSONSource | undefined;
		const pointsSource = map?.getSource(TRIP_POINTS_SOURCE_ID) as GeoJSONSource | undefined;
		routeSource?.setData({ type: 'FeatureCollection', features: [] });
		walkSource?.setData({ type: 'FeatureCollection', features: [] });
		pointsSource?.setData({ type: 'FeatureCollection', features: [] });
	}

	function metersToPixels(meters: number, latitude: number, zoom: number): number {
		const metersPerPixel = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
		return meters / metersPerPixel;
	}

	function updateUserLocationLayer() {
		if (!map || !lastUserCoords) return;
		const source = map.getSource(USER_LOCATION_SOURCE_ID) as GeoJSONSource | undefined;
		if (!source) return;

		source.setData({
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: {},
					geometry: { type: 'Point', coordinates: lastUserCoords }
				}
			]
		});

		const radiusPx = metersToPixels(lastUserAccuracy, lastUserCoords[1], map.getZoom());
		map.setPaintProperty(USER_LOCATION_ACCURACY_LAYER_ID, 'circle-radius', Math.max(radiusPx, 12));
	}

	function clearUserLocationLayer() {
		const source = map?.getSource(USER_LOCATION_SOURCE_ID) as GeoJSONSource | undefined;
		source?.setData({ type: 'FeatureCollection', features: [] });
	}

	function handlePositionSuccess(position: GeolocationPosition) {
		geoError = null;
		locateStatus = 'active';
		lastUserCoords = [position.coords.longitude, position.coords.latitude];
		lastUserAccuracy = position.coords.accuracy;

		if (mapReady) updateUserLocationLayer();

		if (!hasCenteredOnUser && map) {
			hasCenteredOnUser = true;
			map.flyTo({ center: lastUserCoords, zoom: 16, duration: 900 });
		}
	}

	function handlePositionError(err: GeolocationPositionError) {
		locateStatus = 'idle';
		switch (err.code) {
			case err.PERMISSION_DENIED:
				geoError = 'Permiso de ubicación denegado. Habilitalo en la configuración del navegador.';
				break;
			case err.POSITION_UNAVAILABLE:
				geoError = 'No se pudo determinar tu ubicación ahora mismo.';
				break;
			case err.TIMEOUT:
				geoError = 'La búsqueda de ubicación tardó demasiado. Probá de nuevo.';
				break;
			default:
				geoError = 'No se pudo obtener tu ubicación.';
		}
		stopLocating();
	}

	function startLocating() {
		if (!('geolocation' in navigator)) {
			geoError = 'Este navegador no soporta geolocalización.';
			return;
		}

		geoError = null;
		locateStatus = 'locating';
		hasCenteredOnUser = false;

		watchId = navigator.geolocation.watchPosition(handlePositionSuccess, handlePositionError, {
			enableHighAccuracy: true,
			maximumAge: 5_000,
			timeout: 12_000
		});
	}

	function stopLocating() {
		if (watchId !== null) {
			navigator.geolocation.clearWatch(watchId);
			watchId = null;
		}
		locateStatus = 'idle';
		lastUserCoords = null;
		clearUserLocationLayer();
	}

	function toggleLocate() {
		if (locateStatus === 'idle') {
			startLocating();
		} else {
			stopLocating();
		}
	}

	function getPoiName(props: Record<string, unknown>): string {
		return String(props.name_en ?? props.name ?? props['name:latin'] ?? 'Punto en el mapa');
	}

	$effect(() => {
		if (!mapReady) return;

		if (busMode === 'stop') {
			syncBuses(
				buses.map((b) => ({
					busId: b.busId,
					line: b.line,
					origin: b.origin,
					destination: b.destination,
					subline: b.subline,
					special: b.special,
					company: b.companyName,
					speed: 0,
					access: b.access,
					thermalConfort: b.thermalConfort,
					emissions: b.emissions,
					location: b.location
				}))
			);
		} else if (busMode === 'line' && filterLine) {
			fetchAndSyncBusesByLine(filterLine);
		} else {
			lastFitLine = null;
			fetchAndSyncBuses();
		}
	});

	$effect(() => {
		if (!mapReady) return;

		if (busMode === 'line' && filterLine) {
			if (lastShapeLine !== filterLine) {
				fetchAndSyncShape(filterLine);
				lastShapeLine = filterLine;
			}
		} else if (lastShapeLine !== null) {
			clearShape();
			lastShapeLine = null;
		}
	});

	$effect(() => {
		if (!mapReady) return;

		if (tripOption && tripOrigin && tripDestination) {
			const key = JSON.stringify({
				o: tripOrigin.coordinates,
				d: tripDestination.coordinates,
				legs: tripOption.legs.map((l) => `${l.line}:${l.boardStop.busstopId}:${l.alightStop.busstopId}`)
			});
			if (lastTripKey !== key) {
				lastTripKey = key;
				fetchAndSyncTripRoute(tripOption, tripOrigin.coordinates, tripDestination.coordinates);
			}
		} else if (lastTripKey !== null) {
			lastTripKey = null;
			clearTripRoute();
		}
	});

	$effect(() => {
		selectedStopIds;
		applySelectedHighlight();
	});

	$effect(() => {
		selectedBusIds;
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

				map.addSource(SHAPE_SOURCE_ID, {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] }
				});
				map.addLayer({
					id: SHAPE_GLOW_LAYER_ID,
					type: 'line',
					source: SHAPE_SOURCE_ID,
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: {
						'line-color': ROUTE_SHAPE_COLOR,
						'line-width': 10,
						'line-opacity': 0.18,
						'line-blur': 4
					}
				});
				map.addLayer({
					id: SHAPE_LINE_LAYER_ID,
					type: 'line',
					source: SHAPE_SOURCE_ID,
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: {
						'line-color': ROUTE_SHAPE_COLOR,
						'line-width': 3.5,
						'line-opacity': 0.95
					}
				});

				// Viaje planificado: caminatas punteadas por debajo del
				// trazado de línea, para que la línea sólida quede como
				// elemento principal.
				map.addSource(TRIP_WALK_SOURCE_ID, {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] }
				});
				map.addLayer({
					id: TRIP_WALK_LAYER_ID,
					type: 'line',
					source: TRIP_WALK_SOURCE_ID,
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: {
						'line-color': TRIP_WALK_COLOR,
						'line-width': 2,
						'line-dasharray': [1, 2],
						'line-opacity': 0.85
					}
				});

				map.addSource(TRIP_ROUTE_SOURCE_ID, {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] }
				});
				map.addLayer({
					id: TRIP_ROUTE_LAYER_ID,
					type: 'line',
					source: TRIP_ROUTE_SOURCE_ID,
					layout: { 'line-join': 'round', 'line-cap': 'round' },
					paint: {
						'line-color': TRIP_ROUTE_COLOR,
						'line-width': 5,
						'line-opacity': 0.95
					}
				});

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
						'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 13, 10],
						'circle-color': '#FFC93C',
						'circle-stroke-color': [
							'case',
							['boolean', ['feature-state', 'selected'], false],
							'#5eead4',
							'#0B1220'
						],
						'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2]
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

				map.addSource(USER_LOCATION_SOURCE_ID, {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] }
				});
				map.addLayer({
					id: USER_LOCATION_ACCURACY_LAYER_ID,
					type: 'circle',
					source: USER_LOCATION_SOURCE_ID,
					paint: {
						'circle-radius': 12,
						'circle-color': '#5eead4',
						'circle-opacity': 0.15,
						'circle-stroke-color': '#5eead4',
						'circle-stroke-width': 1,
						'circle-stroke-opacity': 0.4
					}
				});
				map.addLayer({
					id: USER_LOCATION_DOT_LAYER_ID,
					type: 'circle',
					source: USER_LOCATION_SOURCE_ID,
					paint: {
						'circle-radius': 7,
						'circle-color': '#5eead4',
						'circle-stroke-color': '#0B1220',
						'circle-stroke-width': 2
					}
				});

				// Puntos de origen/destino del viaje: por encima de todo lo
				// demás, para que siempre sean el elemento más visible.
				map.addSource(TRIP_POINTS_SOURCE_ID, {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] }
				});
				map.addLayer({
					id: TRIP_POINTS_LAYER_ID,
					type: 'circle',
					source: TRIP_POINTS_SOURCE_ID,
					paint: {
						'circle-radius': 9,
						'circle-color': ['match', ['get', 'kind'], 'origin', '#5eead4', 'destination', '#ffc93c', '#ffffff'],
						'circle-stroke-color': '#0B1220',
						'circle-stroke-width': 3
					}
				});

				map.on('click', STOPS_LAYER_ID, (e) => {
					const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
					const busstopId = feature?.properties?.busstopId;
					if (typeof busstopId === 'number') {
						onSelectStop?.(busstopId);
					}
				});
				map.on('mouseenter', STOPS_LAYER_ID, () => {
					if (map) map.getCanvas().style.cursor = 'pointer';
				});
				map.on('mouseleave', STOPS_LAYER_ID, () => {
					if (map) map.getCanvas().style.cursor = '';
				});

				map.on('click', BUSES_CIRCLE_LAYER_ID, (e) => {
					const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
					if (!feature) return;
					const p = feature.properties as Record<string, unknown>;
					const geometry = feature.geometry as { coordinates: [number, number] };
					if (typeof p.busId !== 'number') return;

					onSelectBus?.({
						busId: p.busId,
						line: String(p.line ?? ''),
						origin: String(p.origin ?? ''),
						destination: String(p.destination ?? ''),
						subline: String(p.subline ?? ''),
						special: Boolean(p.special),
						company: String(p.company ?? ''),
						speed: Number(p.speed ?? 0),
						access: String(p.access ?? ''),
						thermalConfort: String(p.thermalConfort ?? ''),
						emissions: String(p.emissions ?? ''),
						location: { coordinates: geometry.coordinates }
					});
				});
				map.on('mouseenter', BUSES_CIRCLE_LAYER_ID, () => {
					if (map) map.getCanvas().style.cursor = 'pointer';
				});
				map.on('mouseleave', BUSES_CIRCLE_LAYER_ID, () => {
					if (map) map.getCanvas().style.cursor = '';
				});

				for (const layerId of BASE_POI_LAYER_IDS) {
					map.on('click', layerId, (e) => {
						const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
						if (!feature || feature.geometry.type !== 'Point') return;
						const coordinates = (feature.geometry as { coordinates: [number, number] }).coordinates;
						const label = getPoiName(feature.properties as Record<string, unknown>);
						onSelectPoi?.({ label, coordinates });
					});
					map.on('mouseenter', layerId, () => {
						if (map) map.getCanvas().style.cursor = 'pointer';
					});
					map.on('mouseleave', layerId, () => {
						if (map) map.getCanvas().style.cursor = '';
					});
				}

				map.on('zoom', () => {
					if (lastUserCoords) updateUserLocationLayer();
				});

				mapReady = true;
				fetchAndSyncNearbyStops();
				if (lastUserCoords) updateUserLocationLayer();

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
			if (watchId !== null) navigator.geolocation.clearWatch(watchId);
		};
	});

	onDestroy(() => {
		if (watchId !== null) navigator.geolocation.clearWatch(watchId);
		map?.remove();
	});
</script>

<div class="map-container" bind:this={mapContainer}></div>

<span class="sr-only" aria-live="polite">{stopAnnouncement}</span>

<button
	class="locate-btn"
	class:active={locateStatus === 'active'}
	class:locating={locateStatus === 'locating'}
	onclick={toggleLocate}
	aria-label={locateStatus === 'idle' ? 'Mostrar mi ubicación' : 'Dejar de mostrar mi ubicación'}
	aria-pressed={locateStatus !== 'idle'}
>
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="12" cy="12" r="3" />
		<line x1="12" y1="2" x2="12" y2="5" />
		<line x1="12" y1="19" x2="12" y2="22" />
		<line x1="2" y1="12" x2="5" y2="12" />
		<line x1="19" y1="12" x2="22" y2="12" />
	</svg>
</button>

{#if geoError}
	<div class="geo-error-banner">
		{geoError}
		<button class="geo-error-dismiss" onclick={() => (geoError = null)} aria-label="Cerrar aviso">×</button>
	</div>
{/if}

{#if debugMessage}
	<div class="debug-banner">{debugMessage}</div>
{/if}

<style>
	.map-container {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.locate-btn {
		position: absolute;
		right: var(--space-4);
		bottom: calc(var(--space-4) + 90px);
		z-index: 15;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
		cursor: pointer;
		transition:
			color 0.15s ease,
			border-color 0.15s ease;
	}

	.locate-btn:hover {
		color: var(--color-text);
	}

	.locate-btn.locating {
		color: var(--color-live);
		animation: locate-pulse 1.1s ease-in-out infinite;
	}

	.locate-btn.active {
		color: var(--color-live);
		border-color: var(--color-live);
	}

	@keyframes locate-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}

	@media (min-width: 900px) {
		.locate-btn {
			bottom: calc(var(--space-4) + 40px);
		}
	}

	.geo-error-banner {
		position: absolute;
		right: var(--space-4);
		bottom: calc(var(--space-4) + 138px);
		z-index: 20;
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		max-width: 260px;
		background: #7f1d1d;
		color: white;
		font-size: 12px;
		padding: var(--space-3);
		border-radius: var(--radius-sm);
	}

	@media (min-width: 900px) {
		.geo-error-banner {
			bottom: calc(var(--space-4) + 88px);
		}
	}

	.geo-error-dismiss {
		flex-shrink: 0;
		background: none;
		border: none;
		color: white;
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		padding: 0;
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