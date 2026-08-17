<script lang="ts">
	import { onMount } from 'svelte';
	import BusMap, { type MapBusSelection } from '$lib/components/BusMap.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import LineEtaCard from '$lib/components/LineEtaCard.svelte';
	import BusDetailCard from '$lib/components/BusDetailCard.svelte';
	import EmptyStateCard from '$lib/components/EmptyStateCard.svelte';
	import WelcomeModal from '$lib/components/WelcomeModal.svelte';
	import TripPlannerBar from '$lib/components/TripPlannerBar.svelte';
	import TripResultsCard from '$lib/components/TripResultsCard.svelte';
	import { etaToMinutes, type BusStopDetail, type UpcomingBus } from '$lib/types/stm';
	import type { TripOption } from '$lib/types/trip';

	const POLL_INTERVAL_MS = 20_000;
	const SEARCH_DEBOUNCE_MS = 300;
	const RECENT_KEY = 'app_stm_recents';
	const FAVORITES_KEY = 'app_stm_favorites';
	const WELCOME_SEEN_KEY = 'app_stm_welcome_seen';

	interface RecentItem {
		id: string;
		type: 'stop' | 'line';
		title: string;
		busstopId?: number;
		line?: string;
	}

	type FavoriteItem = RecentItem;

	interface StopSelectionState {
		busstopId: number;
		detail: BusStopDetail | null;
		upcoming: UpcomingBus[];
		loading: boolean;
		error: string;
		stale: boolean;
		lastUpdatedAt: number | null;
		isDefault: boolean;
		retryNotBefore: number | null;
	}

	interface TripPoint {
		label: string;
		coordinates: [number, number];
		type: 'gps' | 'point';
	}

	let query = $state('');
	let sheetOpen = $state(false);
	let sidebarCollapsed = $state(false);

	let selectedStops = $state<StopSelectionState[]>([]);
	let selectedBuses = $state<MapBusSelection[]>([]);

	let focusLocation = $state<[number, number] | null>(null);
	let selectedLine = $state<string | null>(null);
	let recentItems = $state<RecentItem[]>([]);
	let favoriteItems = $state<FavoriteItem[]>([]);
	let isDefaultFavorite = $state(false);
	let nowTick = $state(Date.now());
	let showWelcome = $state(false);

	// "Cómo llegar" — independiente de la pila de selección múltiple.
	let tripDestination = $state<TripPoint | null>(null);
	let tripOrigin = $state<TripPoint | null>(null);
	let locatingOrigin = $state(false);
	let originError = $state<string | null>(null);
	let tripOptions = $state<TripOption[] | null>(null);
	let tripLoading = $state(false);
	let tripSearchError = $state<string | null>(null);
	// true mientras el usuario está en modo "elegir origen tocando el
	// mapa/buscador" — mientras está activo, addStop/addBus/onSelectPoi/
	// pickStopResult se redirigen a fijar origen en vez de hacer su
	// selección normal (sumar a la pila, marcar destino, etc.).
	let pickingOrigin = $state(false);

	interface SearchStopResult {
		busstopId: number;
		street1: string;
		street2: string;
		location: { coordinates: [number, number] };
	}
	interface SearchLineResult {
		line: string;
		origin: string;
		destination: string;
	}

	let searchResults = $state<{ stops: SearchStopResult[]; lines: SearchLineResult[] }>({
		stops: [],
		lines: []
	});
	let searchOpen = $state(false);
	interface GeocodeResult {
		label: string;
		coordinates: [number, number];
		approximate: boolean;
	}
	let geocodeResults = $state<GeocodeResult[]>([]);
	let geocodeLoading = $state(false);

	function updateUrl(line: string | null) {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (line) {
			url.searchParams.set('line', line);
		} else {
			url.searchParams.delete('line');
		}
		url.searchParams.delete('stop');
		window.history.replaceState({}, '', url.toString());
	}

	function saveRecent(item: RecentItem) {
		const filtered = recentItems.filter((r) => r.id !== item.id);
		const updated = [item, ...filtered].slice(0, 5);
		recentItems = updated;
		try {
			localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
		} catch (e) {
			console.warn('[LocalStorage] no se pudo guardar recientes', e);
		}
	}

	function loadRecents() {
		try {
			const raw = localStorage.getItem(RECENT_KEY);
			if (raw) recentItems = JSON.parse(raw);
		} catch (e) {
			console.warn('[LocalStorage] no se pudo leer recientes', e);
		}
	}

	function loadFavorites() {
		try {
			const raw = localStorage.getItem(FAVORITES_KEY);
			if (raw) favoriteItems = JSON.parse(raw);
		} catch (e) {
			console.warn('[LocalStorage] no se pudo leer favoritos', e);
		}
	}

	function isFavorite(id: string): boolean {
		return favoriteItems.some((f) => f.id === id);
	}

	function toggleFavorite(item: FavoriteItem) {
		let updated: FavoriteItem[];
		if (isFavorite(item.id)) {
			updated = favoriteItems.filter((f) => f.id !== item.id);
		} else {
			updated = [item, ...favoriteItems];
		}
		favoriteItems = updated;
		try {
			localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
		} catch (e) {
			console.warn('[LocalStorage] no se pudo guardar favoritos', e);
		}
	}

	async function fetchUpcoming(
		busstopId: number,
		lines: string
	): Promise<{ data: UpcomingBus[]; stale: boolean }> {
		const res = await fetch(
			`/api/busstops/${busstopId}/upcomingbuses?lines=${encodeURIComponent(lines)}`
		);
		const stale = res.headers.get('X-Data-Stale') === '1';
		if (!res.ok) {
			const errorData = await res.json().catch(() => ({}));
			const err = new Error(errorData.message || 'No se pudieron cargar los próximos buses');
			if (typeof errorData.retryAfterMs === 'number') {
				(err as Error & { retryAfterMs?: number }).retryAfterMs = errorData.retryAfterMs;
			}
			throw err;
		}
		const data: UpcomingBus[] = await res.json();
		return { data, stale };
	}

	function patchStop(busstopId: number, patch: Partial<StopSelectionState>) {
		const stop = selectedStops.find((s) => s.busstopId === busstopId);
		if (!stop) return;
		Object.assign(stop, patch);
	}

	async function addStop(busstopId: number, isDefault = false) {
		if (pickingOrigin) {
			await pickOriginFromStop(busstopId);
			return;
		}
		if (selectedStops.some((s) => s.busstopId === busstopId)) return;

		selectedLine = null;
		isDefaultFavorite = false;

		const entry: StopSelectionState = {
			busstopId,
			detail: null,
			upcoming: [],
			loading: true,
			error: '',
			stale: false,
			lastUpdatedAt: null,
			isDefault,
			retryNotBefore: null
		};
		selectedStops = [entry, ...selectedStops];
		sheetOpen = true;

		try {
			const stopRes = await fetch(`/api/busstops/${busstopId}`);
			const detailStale = stopRes.headers.get('X-Data-Stale') === '1';
			if (!stopRes.ok) throw new Error('No se pudo cargar la parada');
			const detail: BusStopDetail = await stopRes.json();

			focusLocation = detail.location.coordinates;
			saveRecent({
				id: `stop-${busstopId}`,
				type: 'stop',
				title: `${detail.calle1} y ${detail.calle2}`,
				busstopId
			});

			const lines = detail.lineas.join(',');

			if (!lines) {
				// La API de STM exige "lines" para upcomingbuses. Si
				// llegamos acá sin ninguna, es porque el detalle vino del
				// fallback (STM falló al traer el detalle real, se
				// reconstruyó desde el listado general, que no trae
				// líneas) — no tiene sentido pedirle a ese endpoint algo
				// que ya sabemos que va a rechazar con 400.
				patchStop(busstopId, {
					detail,
					upcoming: [],
					stale: true,
					loading: false,
					error: 'No pudimos determinar qué líneas pasan por esta parada ahora mismo. Probá de nuevo en un momento.',
					lastUpdatedAt: Date.now()
				});
				return;
			}

			const { data, stale } = await fetchUpcoming(busstopId, lines);

			patchStop(busstopId, {
				detail,
				upcoming: data,
				stale: detailStale || stale,
				loading: false,
				lastUpdatedAt: Date.now()
			});

		} catch (err) {
			patchStop(busstopId, {
				loading: false,
				error: err instanceof Error ? err.message : 'Error desconocido'
			});
		}
	}

	async function refreshStop(stop: StopSelectionState) {
		if (!stop.detail) return;
		if (document.visibilityState === 'hidden') return;
		if (stop.retryNotBefore && Date.now() < stop.retryNotBefore) return;
		const lines = stop.detail.lineas.join(',');
		if (!lines) return; // sin líneas conocidas todavía; se reintenta si el usuario vuelve a seleccionar la parada
		try {
			const { data, stale } = await fetchUpcoming(stop.busstopId, lines);
			patchStop(stop.busstopId, { upcoming: data, stale, lastUpdatedAt: Date.now(), retryNotBefore: null });
		} catch (err) {
			console.warn('[polling] no se pudo refrescar upcomingbuses', stop.busstopId, err);
			const retryAfterMs = (err as Error & { retryAfterMs?: number }).retryAfterMs;
			if (typeof retryAfterMs === 'number') {
				patchStop(stop.busstopId, { retryNotBefore: Date.now() + retryAfterMs });
			}
		}
	}

	function removeStop(busstopId: number) {
		selectedStops = selectedStops.filter((s) => s.busstopId !== busstopId);
		if (selectedStops.length === 0 && selectedBuses.length === 0) sheetOpen = false;
	}

	function addBus(bus: MapBusSelection) {
		if (pickingOrigin) {
			setTripOrigin(`Línea ${bus.line} — ${bus.destination}`, bus.location.coordinates);
			return;
		}
		if (selectedBuses.some((b) => b.busId === bus.busId)) return;
		selectedBuses = [bus, ...selectedBuses];
		sheetOpen = true;
		focusLocation = bus.location.coordinates;
	}

	function removeBus(busId: number) {
		selectedBuses = selectedBuses.filter((b) => b.busId !== busId);
		if (selectedStops.length === 0 && selectedBuses.length === 0) sheetOpen = false;
	}

	function upcomingToMapBus(bus: UpcomingBus): MapBusSelection {
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

	function findBusEta(busId: number): number | null {
		for (const stop of selectedStops) {
			const match = stop.upcoming.find((b) => b.busId === busId);
			if (match) return etaToMinutes(match.eta);
		}
		return null;
	}

	function clearAllSelections() {
		selectedStops = [];
		selectedBuses = [];
		sheetOpen = false;
	}

	function pickStopResult(stop: SearchStopResult) {
		searchOpen = false;
		query = '';
		if (pickingOrigin) {
			setTripOrigin(`${stop.street1} y ${stop.street2}`, stop.location.coordinates);
			return;
		}
		addStop(stop.busstopId);
	}

	function pickGeocodeResult(result: GeocodeResult) {
		searchOpen = false;
		query = '';
		if (pickingOrigin) {
			setTripOrigin(result.label, result.coordinates);
			return;
		}
		setTripDestination(result.label, result.coordinates);
	}

	function pickLineResult(line: string, isDefault = false) {
		searchOpen = false;
		query = line;
		selectedLine = line;
		isDefaultFavorite = isDefault;
		updateUrl(line);
		saveRecent({
			id: `line-${line}`,
			type: 'line',
			title: `Línea ${line}`,
			line
		});
	}

	function clearLineFilter() {
		selectedLine = null;
		isDefaultFavorite = false;
		updateUrl(null);
	}

	// --- "Cómo llegar" ---

	function setTripDestination(label: string, coordinates: [number, number]) {
		tripDestination = { label, coordinates, type: 'point' };
		pickingOrigin = false;
		tripOptions = null;
		tripSearchError = null;
	}

	function clearTripDestination() {
		tripDestination = null;
		tripOrigin = null;
		pickingOrigin = false;
		originError = null;
		tripOptions = null;
		tripSearchError = null;
	}

	function clearTripOrigin() {
		tripOrigin = null;
		pickingOrigin = false;
		originError = null;
		tripOptions = null;
		tripSearchError = null;
	}

	function swapTrip() {
		if (!tripOrigin || !tripDestination) return;
		const newDestination = { ...tripOrigin, type: 'point' as const };
		const newOrigin = { ...tripDestination, type: 'point' as const };
		tripDestination = newDestination;
		tripOrigin = newOrigin;
		tripOptions = null;
		tripSearchError = null;
	}

	/** Única función que efectivamente fija tripOrigin — la usan tanto
	 * el GPS como cualquier punto elegido a mano (parada, bus, POI,
	 * resultado de búsqueda), para que el reset de pickingOrigin y de
	 * los resultados viejos de ruta pase siempre por el mismo lugar. */
	function setTripOrigin(label: string, coordinates: [number, number], type: 'gps' | 'point' = 'point') {
		tripOrigin = { label, coordinates, type };
		pickingOrigin = false;
		originError = null;
		tripOptions = null;
		tripSearchError = null;
	}

	function startPickOrigin() {
		pickingOrigin = true;
		originError = null;
	}

	function cancelPickOrigin() {
		pickingOrigin = false;
	}

	/** Tocar una parada en el mapa mientras pickingOrigin está activo:
	 * necesita el mismo fetch de detalle que addStop() para tener label
	 * y coordenadas reales, pero SIN sumarla a la pila de selección. */
	async function pickOriginFromStop(busstopId: number) {
		try {
			const res = await fetch(`/api/busstops/${busstopId}`);
			if (!res.ok) throw new Error('No se pudo cargar la parada');
			const detail: BusStopDetail = await res.json();
			setTripOrigin(`${detail.calle1} y ${detail.calle2}`, detail.location.coordinates);
		} catch (err) {
			originError = err instanceof Error ? err.message : 'No se pudo usar esta parada como origen';
			pickingOrigin = false;
		}
	}

	function useMyLocationAsOrigin() {
		if (!('geolocation' in navigator)) {
			originError = 'Este navegador no soporta geolocalización.';
			return;
		}
		locatingOrigin = true;
		originError = null;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				setTripOrigin('Mi ubicación', [pos.coords.longitude, pos.coords.latitude], 'gps');
				locatingOrigin = false;
			},
			() => {
				locatingOrigin = false;
				originError = 'No se pudo obtener tu ubicación.';
			},
			{ enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 }
		);
	}

	/** Tap directo sobre un ícono del mapa base: marca ese punto como
	 * destino y usa el GPS como origen automáticamente — acción rápida
	 * "ir hasta acá". El origen se puede editar después con los
	 * controles normales del panel. */
	function selectPoiAsDestination(poi: { label: string; coordinates: [number, number] }) {
		if (pickingOrigin) {
			setTripOrigin(poi.label, poi.coordinates);
			return;
		}
		setTripDestination(poi.label, poi.coordinates);
		useMyLocationAsOrigin();
	}

	async function searchRoute() {
		if (!tripOrigin || !tripDestination) return;
		tripLoading = true;
		tripSearchError = null;
		tripOptions = null;
		sheetOpen = true;

		const params = new URLSearchParams({
			originLat: String(tripOrigin.coordinates[1]),
			originLng: String(tripOrigin.coordinates[0]),
			destLat: String(tripDestination.coordinates[1]),
			destLng: String(tripDestination.coordinates[0])
		});

		try {
			const res = await fetch(`/api/trip-plan?${params}`);
			if (!res.ok) throw new Error('No se pudo calcular la ruta');
			const data: { options: TripOption[] } = await res.json();
			tripOptions = data.options;
		} catch (err) {
			tripSearchError = err instanceof Error ? err.message : 'Error desconocido';
		} finally {
			tripLoading = false;
		}
	}

	function closeTripResults() {
		tripOptions = null;
		tripSearchError = null;
		if (selectedStops.length === 0 && selectedBuses.length === 0) sheetOpen = false;
	}

	onMount(() => {
		loadRecents();
		loadFavorites();
		const params = new URLSearchParams(window.location.search);
		const stopParam = params.get('stop') || params.get('parada');
		const lineParam = params.get('line') || params.get('linea');

		if (!stopParam && !lineParam) {
			try {
				if (!localStorage.getItem(WELCOME_SEEN_KEY)) {
					showWelcome = true;
				}
			} catch (e) {
				console.warn('[LocalStorage] no se pudo leer welcome_seen', e);
			}
		}

		if (stopParam) {
			const id = Number(stopParam);
			if (!Number.isNaN(id)) addStop(id);
		} else if (lineParam) {
			pickLineResult(lineParam);
		} else if (favoriteItems.length > 0) {
			const first = favoriteItems[0];
			if (first.type === 'stop' && first.busstopId) {
				addStop(first.busstopId, true);
			} else if (first.type === 'line' && first.line) {
				pickLineResult(first.line, true);
			}
		}
	});

	function dismissWelcome() {
		showWelcome = false;
		try {
			localStorage.setItem(WELCOME_SEEN_KEY, '1');
		} catch (e) {
			console.warn('[LocalStorage] no se pudo guardar welcome_seen', e);
		}
	}

	$effect(() => {
		const count = selectedStops.length;
		if (count === 0) return;

		const interval = setInterval(() => {
			for (const stop of selectedStops) refreshStop(stop);
		}, POLL_INTERVAL_MS);

		const handleVisibility = () => {
			if (document.visibilityState === 'visible') {
				for (const stop of selectedStops) refreshStop(stop);
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);

		return () => {
			clearInterval(interval);
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	});

	$effect(() => {
		const tick = setInterval(() => {
			nowTick = Date.now();
		}, 1000);
		return () => clearInterval(tick);
	});

	$effect(() => {
		const q = query.trim();

		if (q.length < 2) {
			searchResults = { stops: [], lines: [] };
			geocodeResults = [];
			searchOpen = false;
			return;
		}

		searchOpen = true;
		const timeout = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
				if (res.ok) searchResults = await res.json();

				const hasLocalResults =
					searchResults.stops.length > 0 || searchResults.lines.length > 0;
				if (!hasLocalResults && q.length >= 4) {
					geocodeLoading = true;
					try {
						const geoRes = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
						if (geoRes.ok) geocodeResults = await geoRes.json();
					} finally {
						geocodeLoading = false;
					}
				} else {
					geocodeResults = [];
				}
			} catch (err) {
				console.warn('[search] falló la búsqueda', err);
			}
		}, SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timeout);
	});

	const selectedStopIds = $derived(selectedStops.map((s) => s.busstopId));
	const selectedBusIds = $derived(selectedBuses.map((b) => b.busId));
	const totalSelectedCount = $derived(selectedStops.length + selectedBuses.length);

	const selectedStopNameStr = $derived(
		selectedStops[0]?.detail
			? `${selectedStops[0].detail.calle1} y ${selectedStops[0].detail.calle2}`
			: null
	);
</script>

<svelte:head>
	<title>Buses Montevideo</title>
</svelte:head>

<main>
	<BusMap
		buses={selectedStops.flatMap((s) => s.upcoming)}
		{focusLocation}
		{selectedStopIds}
		selectedStopName={selectedStopNameStr}
		{selectedBusIds}
		filterLine={selectedLine}
		onSelectStop={addStop}
		onSelectBus={addBus}
		onSelectPoi={selectPoiAsDestination}
		{tripOrigin}
		{tripDestination}
		tripOption={tripOptions?.[0] ?? null}
	/>

	<div
		class="top-row"
		style:--sidebar-offset={sidebarCollapsed ? '16px' : '396px'}
	>
		<button
			class="collapse-btn"
			class:collapsed={sidebarCollapsed}
			onclick={() => (sidebarCollapsed = !sidebarCollapsed)}
			aria-label={sidebarCollapsed ? 'Mostrar panel' : 'Ocultar panel'}
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				{#if sidebarCollapsed}
					<polyline points="9 6 15 12 9 18" />
				{:else}
					<polyline points="15 6 9 12 15 18" />
				{/if}
			</svg>
		</button>

		<div class="search-col">
			<SearchBar bind:value={query} />

			{#if tripDestination}
				<TripPlannerBar
					destination={tripDestination}
					origin={tripOrigin}
					{locatingOrigin}
					{originError}
					{pickingOrigin}
					onUseMyLocation={useMyLocationAsOrigin}
					onPickOnMap={startPickOrigin}
					onCancelPickOrigin={cancelPickOrigin}
					onClearOrigin={clearTripOrigin}
					onClearDestination={clearTripDestination}
					onSwap={swapTrip}
					onSearchRoute={searchRoute}
				/>
			{/if}

			{#if selectedLine}
				<div class="active-filter">
					<span class="line-chip small">{selectedLine}</span>
					<span class="active-filter-text">
						{isDefaultFavorite ? 'Tu línea favorita' : 'Mostrando solo esta línea'}
					</span>
					<button
						class="fav-star-btn"
						class:active={isFavorite(`line-${selectedLine}`)}
						onclick={() =>
							toggleFavorite({
								id: `line-${selectedLine}`,
								type: 'line',
								title: `Línea ${selectedLine}`,
								line: selectedLine!
							})}
						aria-label={isFavorite(`line-${selectedLine}`) ? 'Quitar de favoritos' : 'Guardar en favoritos'}
						title={isFavorite(`line-${selectedLine}`) ? 'Quitar de favoritos' : 'Guardar en favoritos'}
					>
						<svg width="15" height="15" viewBox="0 0 24 24" fill={isFavorite(`line-${selectedLine}`) ? 'var(--color-accent)' : 'none'} stroke={isFavorite(`line-${selectedLine}`) ? 'var(--color-accent)' : 'currentColor'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
						</svg>
					</button>
					<button class="close-btn" onclick={clearLineFilter} aria-label="Quitar filtro de línea">
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
			{/if}

			{#if searchOpen && (searchResults.stops.length > 0 || searchResults.lines.length > 0 || geocodeResults.length > 0 || geocodeLoading)}
				<div class="search-dropdown">
					{#if searchResults.lines.length > 0}
						<div class="search-section-label">Líneas</div>
						<div class="search-lines">
							{#each searchResults.lines as l (l.line)}
								<button class="line-chip line-chip-btn" onclick={() => pickLineResult(l.line)}>
									{l.line}
								</button>
							{/each}
						</div>
					{/if}
					{#if searchResults.stops.length > 0}
						<div class="search-section-label">Paradas</div>
						{#each searchResults.stops as stop (stop.busstopId)}
							<div class="search-result-row">
								<button class="search-result" onclick={() => pickStopResult(stop)}>
									{stop.street1} y {stop.street2}
								</button>
								<button
									class="directions-btn"
									onclick={() => {
										setTripDestination(`${stop.street1} y ${stop.street2}`, stop.location.coordinates);
										searchOpen = false;
									}}
									aria-label="Cómo llegar hasta acá"
									title="Cómo llegar hasta acá"
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polygon points="3 11 22 2 13 21 11 13 3 11" />
									</svg>
								</button>
							</div>
						{/each}
					{/if}
				</div>
			{:else if searchOpen}
				<div class="search-dropdown">
					<p class="search-empty">Sin resultados para "{query}"</p>
				</div>
			{/if}

			{#if geocodeLoading}
						<div class="search-section-label">Direcciones</div>
						<p class="search-empty small">Buscando...</p>
					{:else if geocodeResults.length > 0}
						<div class="search-section-label">Direcciones</div>
						{#each geocodeResults as result, i (i)}
							<button class="search-result geocode-result" onclick={() => pickGeocodeResult(result)}>
								<span>{result.label}</span>
								{#if result.approximate}
									<span class="approx-badge" title="Este punto agrupa varias numeraciones del mismo edificio en OpenStreetMap; puede no ser exacto para el número buscado.">
										aprox.
									</span>
								{/if}
							</button>
						{/each}
						<p class="geocode-attribution">Direcciones © colaboradores de OpenStreetMap</p>
					{/if}
		</div>
	</div>

	<BottomSheet open={sheetOpen} bind:collapsed={sidebarCollapsed}>
		{#if tripLoading || tripSearchError || tripOptions !== null}
			<TripResultsCard
				loading={tripLoading}
				error={tripSearchError}
				options={tripOptions ?? []}
				onClose={closeTripResults}
			/>
		{:else if totalSelectedCount > 0}
			<div class="selection-stack">
				{#if totalSelectedCount > 1}
					<div class="stack-toolbar">
						<span class="stack-count tabular-nums">{totalSelectedCount} seleccionados</span>
						<button class="clear-all-btn" onclick={clearAllSelections}>Limpiar todo</button>
					</div>
				{/if}

				{#each selectedBuses as bus (bus.busId)}
					<div class="stack-card">
						<div class="panel-header">
							<div class="panel-header-left">
								<button
									class="fav-star-btn"
									class:active={isFavorite(`line-${bus.line}`)}
									onclick={() =>
										toggleFavorite({
											id: `line-${bus.line}`,
											type: 'line',
											title: `Línea ${bus.line}`,
											line: bus.line
										})}
									aria-label={isFavorite(`line-${bus.line}`) ? 'Quitar línea de favoritos' : 'Guardar línea en favoritos'}
									title={isFavorite(`line-${bus.line}`) ? 'Quitar línea de favoritos' : 'Guardar línea en favoritos'}
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite(`line-${bus.line}`) ? 'var(--color-accent)' : 'none'} stroke={isFavorite(`line-${bus.line}`) ? 'var(--color-accent)' : 'currentColor'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
									</svg>
								</button>
								<h2 class="panel-title">Ómnibus en vivo</h2>
							</div>
							<button
								class="directions-btn"
								onclick={() => setTripDestination(`Línea ${bus.line} — ${bus.destination}`, bus.location.coordinates)}
								aria-label="Cómo llegar hasta este ómnibus"
								title="Cómo llegar hasta acá"
							>
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<polygon points="3 11 22 2 13 21 11 13 3 11" />
								</svg>
							</button>
							<button class="close-btn" onclick={() => removeBus(bus.busId)} aria-label="Cerrar ómnibus">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						</div>
						<BusDetailCard
							line={bus.line}
							destination={bus.destination}
							origin={bus.origin}
							company={bus.company}
							speed={bus.speed}
							access={bus.access}
							thermalConfort={bus.thermalConfort}
							emissions={bus.emissions}
							etaMinutes={findBusEta(bus.busId)}
							busId={bus.busId}
						/>
					</div>
				{/each}

				{#each selectedStops as stop (stop.busstopId)}
					<div class="stack-card">
						{#if stop.loading}
							<p class="status">Cargando...</p>
							{:else if stop.detail}
							<div class="stop-header">
								<div class="stop-header-title">
									<button
										class="fav-star-btn"
										class:active={isFavorite(`stop-${stop.detail.paradaId}`)}
										onclick={() =>
											toggleFavorite({
												id: `stop-${stop.detail!.paradaId}`,
												type: 'stop',
												title: `${stop.detail!.calle1} y ${stop.detail!.calle2}`,
												busstopId: stop.detail!.paradaId
											})}
										aria-label={isFavorite(`stop-${stop.detail.paradaId}`) ? 'Quitar parada de favoritos' : 'Guardar parada en favoritos'}
										title={isFavorite(`stop-${stop.detail.paradaId}`) ? 'Quitar de favoritos' : 'Guardar en favoritos'}
									>
										<svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite(`stop-${stop.detail.paradaId}`) ? 'var(--color-accent)' : 'none'} stroke={isFavorite(`stop-${stop.detail.paradaId}`) ? 'var(--color-accent)' : 'currentColor'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
										</svg>
									</button>
									<div class="stop-title-col">
										{#if stop.isDefault}
											<span class="favorite-kicker">Tu parada favorita</span>
										{/if}
										<h2 class="stop-name">{stop.detail.calle1} y {stop.detail.calle2}</h2>
									</div>
								</div>
								<div class="stop-header-right">
									{#if stop.lastUpdatedAt !== null}
										<span class="updated tabular-nums">
											{stop.stale ? 'Datos demorados · ' : ''}hace {Math.max(0, Math.round((nowTick - stop.lastUpdatedAt) / 1000))}s
										</span>
									{/if}
									<button
										class="directions-btn"
										onclick={() => setTripDestination(`${stop.detail!.calle1} y ${stop.detail!.calle2}`, stop.detail!.location.coordinates)}
										aria-label="Cómo llegar hasta esta parada"
										title="Cómo llegar hasta acá"
									>
										<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<polygon points="3 11 22 2 13 21 11 13 3 11" />
										</svg>
									</button>
									<button class="close-btn" onclick={() => removeStop(stop.busstopId)} aria-label="Cerrar parada">
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
											<line x1="18" y1="6" x2="6" y2="18" />
											<line x1="6" y1="6" x2="18" y2="18" />
										</svg>
									</button>
								</div>
							</div>
							{#if stop.error}
								<p class="status error">{stop.error}</p>
							{:else if stop.upcoming.length === 0}
								<p class="status">No hay buses acercándose ahora mismo.</p>
							{:else}
								{#each stop.upcoming as bus (bus.busId)}
									<LineEtaCard
										line={bus.line}
										destination={bus.destination}
										etaMinutes={etaToMinutes(bus.eta)}
										highlight={selectedBuses.some((b) => b.busId === bus.busId)}
										onSelect={() => addBus(upcomingToMapBus(bus))}
									/>
								{/each}
							{/if}
							{:else if stop.error}
+							<p class="status error">{stop.error}</p>
						{/if}
					</div>
				{/each}
			</div>
		{:else if selectedLine}
			<div class="line-only-panel">
				<div class="line-only-badge">{selectedLine}</div>
				<div class="line-only-text">
					{#if isDefaultFavorite}
						<span class="favorite-kicker">Tu línea favorita</span>
					{/if}
					<p class="line-only-message">
						Mostrando la línea {selectedLine} en el mapa. Tocá un ómnibus para ver el detalle, o elegí una parada.
					</p>
				</div>
			</div>
		{:else}
			<EmptyStateCard
				favorites={favoriteItems}
				recents={recentItems}
				onPick={(item) => {
					if (item.type === 'stop' && item.busstopId) addStop(item.busstopId);
					else if (item.type === 'line' && item.line) pickLineResult(item.line);
				}}
			/>
		{/if}
	</BottomSheet>

	{#if showWelcome}
		<WelcomeModal onClose={dismissWelcome} />
	{/if}
</main>

<style>
	main {
		position: relative;
		width: 100%;
		height: 100dvh;
		overflow: hidden;
	}

	.top-row {
		position: absolute;
		top: env(safe-area-inset-top, 0);
		left: 0;
		right: 0;
		padding: var(--space-4);
		z-index: 10;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.collapse-btn {
		display: none;
	}

	.search-col {
		flex: 1;
		min-width: 0;
	}

	@media (min-width: 900px) {
		.top-row {
			left: var(--sidebar-offset, 396px);
			right: auto;
			transition: left 0.22s ease;
		}

		.collapse-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			flex-shrink: 0;
			background: var(--color-surface);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-sm);
			color: var(--color-text);
			cursor: pointer;
		}

		.search-col {
			width: 420px;
		}
	}

	.search-dropdown {
		margin-top: var(--space-2);
		background: rgba(19, 27, 46, 0.95);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		max-height: 340px;
		overflow-y: auto;
		padding: var(--space-2);
	}

	.search-section-label {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-secondary);
		padding: var(--space-2) var(--space-2) var(--space-1);
	}

	.search-lines {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding: 0 var(--space-2) var(--space-2);
	}

	.line-chip {
		background: var(--color-accent);
		color: var(--color-bg);
		font-weight: 700;
		font-size: 13px;
		padding: 4px var(--space-2);
		border-radius: var(--radius-sm);
	}

	.line-chip-btn {
		border: none;
		cursor: pointer;
		font-family: var(--font-sans);
		transition: transform 0.1s ease;
	}

	.line-chip-btn:hover {
		transform: scale(1.08);
	}

	.line-chip.small {
		font-size: 12px;
		padding: 3px 6px;
	}

	.active-filter {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
		background: rgba(19, 27, 46, 0.95);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
	}

	.active-filter-text {
		flex: 1;
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.fav-star-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 4px;
		border-radius: var(--radius-sm);
		transition: transform 0.15s ease, color 0.15s ease;
	}

	.fav-star-btn:hover {
		color: var(--color-accent);
		transform: scale(1.15);
	}

	.fav-star-btn.active {
		color: var(--color-accent);
	}

	.directions-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: color 0.15s ease;
	}

	.directions-btn:hover {
		color: var(--color-live);
		background: rgba(94, 234, 212, 0.1);
	}

	.search-result-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.search-result-row .search-result {
		flex: 1;
		min-width: 0;
	}

	.stop-header-title,
	.panel-header-left {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.stop-title-col {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.favorite-kicker {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-accent);
	}

	.line-only-panel {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.line-only-badge {
		flex-shrink: 0;
		min-width: 48px;
		height: 40px;
		padding: 0 var(--space-2);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-accent);
		color: var(--color-bg);
		font-weight: 800;
		font-size: 15px;
		border-radius: var(--radius-sm);
	}

	.line-only-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.line-only-message {
		margin: 0;
		font-size: 13px;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.search-result {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		color: var(--color-text);
		font-size: 14px;
		font-weight: 500;
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.search-result:hover,
	.search-result:focus-visible {
		background: rgba(245, 246, 248, 0.06);
	}

	.search-empty {
		color: var(--color-text-secondary);
		font-size: 13px;
		text-align: center;
		padding: var(--space-3);
		margin: 0;
	}

	.search-empty.small {
		padding: var(--space-2);
		font-size: 12px;
	}

	.geocode-attribution {
		font-size: 10px;
		color: var(--color-text-secondary);
		opacity: 0.6;
		text-align: center;
		margin: var(--space-2) 0 0;
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border);
	}

	.geocode-result {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.approx-badge {
		flex-shrink: 0;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--color-accent);
		background: rgba(255, 201, 60, 0.12);
		padding: 2px 6px;
		border-radius: 999px;
		cursor: help;
	}

	.selection-stack {
		display: flex;
		flex-direction: column;
	}

	.stack-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}

	.stack-count {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
	}

	.clear-all-btn {
		background: none;
		border: none;
		color: var(--color-accent);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		padding: 4px 6px;
		border-radius: var(--radius-sm);
	}

	.clear-all-btn:hover {
		background: rgba(255, 201, 60, 0.1);
	}

	.stack-card:not(:first-child) {
		margin-top: var(--space-5);
		padding-top: var(--space-5);
		border-top: 1px solid var(--color-border);
	}

	.stop-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}

	.panel-title {
		font-size: 13px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.stop-name {
		font-size: 17px;
		font-weight: 700;
		margin: 0;
	}

	.stop-header-right {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		border-radius: var(--radius-sm);
	}

	.close-btn:hover {
		background: rgba(245, 246, 248, 0.08);
		color: var(--color-text);
	}

	.updated {
		font-size: 11px;
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.status {
		color: var(--color-text-secondary);
		font-size: 14px;
		text-align: center;
		margin: var(--space-4) 0;
	}

	.status.error {
		color: #f87171;
	}
</style>