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
	import type { UpcomingBus } from '$lib/types/stm';

	interface NearbyStop {
		busstopId: number;
		street1: string;
		street2: string;
		location: { coordinates: [number, number] };
	}

	/** Forma completa que necesitamos para pintar Y para poder construir un
	 * MapBusSelection al tocar un bus en el mapa (viewport/line/stop). */
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

	/** Forma que recibe +page.svelte al seleccionar un bus, ya sea desde
	 * el mapa (click directo) o desde la lista de ETAs del sidebar. */
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
		onSelectStop,
		onSelectBus
	}: {
		buses?: UpcomingBus[];
		focusLocation?: [number, number] | null;
		selectedStopIds?: number[];
		selectedStopName?: string | null;
		selectedBusIds?: number[];
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
	const busMode = $derived(filterLine ? 'line' : selectedStopIds.length > 0 ? 'stop' : 'viewport');

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
	const USER_LOCATION_SOURCE_ID = 'user-location';
	const USER_LOCATION_ACCURACY_LAYER_ID = 'user-location-accuracy';
	const USER_LOCATION_DOT_LAYER_ID = 'user-location-dot';
	const SHAPE_SOURCE_ID = 'route-shape';
	const SHAPE_GLOW_LAYER_ID = 'route-shape-glow';
	const SHAPE_LINE_LAYER_ID = 'route-shape-line';

	// Violeta a propósito: las calles del estilo oscuro van de ocre
	// (#e0a458, avenidas) a gris azulado (#3d4863/#8f97a8, calles menores).
	// Ningún tono de esa familia sirve para el trazado sin confundirse con
	// el mapa base — el violeta es el hueco cromático más cercano a los
	// otros acentos (amarillo de buses/paradas, teal de "en vivo") sin
	// pisar ninguno de los dos.
	const ROUTE_SHAPE_COLOR = '#a78bfa';

	let mapContainer: HTMLDivElement;
	let map: MapLibreMap | undefined;
	let mapReady = $state(false);

	// Sets, no un solo id: con selección múltiple hay que poder prender y
	// apagar el feature-state de varias paradas/buses a la vez, y apagar
	// los que quedaron marcados antes pero ya no forman parte de la
	// selección actual.
	let highlightedStopIds = new Set<number>();
	let highlightedBusIds = new Set<number>();
	let lastFitLine: string | null = null;
	let lastShapeLine: string | null = null;

	let debugMessage = $state<string | null>(null);
	let tilesLoaded = $state(false);

	// Anuncio para lectores de pantalla al seleccionar una parada. No hay
	// ningún requisito visual conocido para selectedStopName todavía —
	// si en realidad se buscaba un label flotante sobre el pin, avisar y
	// se cambia por eso.
	let stopAnnouncement = $state('');
	$effect(() => {
		stopAnnouncement = selectedStopName ? `Parada seleccionada: ${selectedStopName}` : '';
	});

	// --- Geolocalización ("dónde estoy") ---
	// Estado del botón: 'idle' (nunca se activó o se detuvo a mano),
	// 'locating' (esperando el primer fix del GPS), 'active' (siguiendo).
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

	// --- Trazado de línea (GTFS shapes) ---

	/** Fetchea la geometría de una línea UNA vez al activar el filtro (no
	 * en cada poll de 8s) — mismo criterio que lastFitLine para no
	 * "saltar" ni volver a pedir de más. */
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

	// --- Punto "dónde estoy" ---

	/**
	 * Convierte metros a píxeles de pantalla en la latitud y zoom dados.
	 * Fórmula estándar de proyección Web Mercator (256px de tile a zoom 0).
	 * Se usa para que el círculo de precisión del GPS tenga un tamaño
	 * geográficamente correcto en vez de un radio fijo arbitrario.
	 */
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
		// Radio mínimo para que el círculo no desaparezca con muy buena
		// precisión (GPS urbano real rara vez baja de ~5-10m).
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

	// Decide qué mostrar según el modo activo. Se dispara al montar, y cada
	// vez que cambian selectedStopId, filterLine, o los datos de `buses`
	// (el sidebar los refresca cada 12s con polling propio).
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
					speed: 0, // upcomingbuses no trae velocidad instantánea
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

	// Trazado de línea: se pide solo al entrar en modo "line" (no en cada
	// poll de buses), y se limpia al salir de ese modo.
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

				// Trazado de línea: se agrega ANTES que paradas y buses para
				// que quede visualmente por debajo de esos puntos (orden de
				// addLayer = orden de pintado, últimas capas quedan arriba).
				map.addSource(SHAPE_SOURCE_ID, {
					type: 'geojson',
					data: { type: 'FeatureCollection', features: [] }
				});
				// Glow debajo de la línea nítida: línea ancha, semitransparente
				// y difuminada, para que el trazado se lea bien contra calles
				// oscuras sin depender solo del color.
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

				// Capas del punto "dónde estoy", por encima de paradas y buses:
				// círculo de precisión (radio en metros→px, ver
				// metersToPixels) + punto sólido encima.
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

				// Registrado solo en la capa circle, no en la de label (mismo
				// motivo que el bug ya resuelto con las paradas: registrar en
				// ambas capas duplica el evento si un punto cae bajo las dos).
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

				// El círculo de precisión es en metros reales: si cambia el
				// zoom hay que recalcular su radio en píxeles.
				map.on('zoom', () => {
					if (lastUserCoords) updateUserLocationLayer();
				});

				mapReady = true;
				fetchAndSyncNearbyStops();
				if (lastUserCoords) updateUserLocationLayer();

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