<script lang="ts">
	import { onMount } from 'svelte';
	import BusMap, { type MapBusSelection } from '$lib/components/BusMap.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import LineEtaCard from '$lib/components/LineEtaCard.svelte';
	import BusDetailCard from '$lib/components/BusDetailCard.svelte';
	import EmptyStateCard from '$lib/components/EmptyStateCard.svelte';
	import { etaToMinutes, type BusStopDetail, type UpcomingBus } from '$lib/types/stm';

	const POLL_INTERVAL_MS = 20_000;
	const SEARCH_DEBOUNCE_MS = 300;
	const RECENT_KEY = 'app_stm_recents';
	const FAVORITES_KEY = 'app_stm_favorites';

	interface RecentItem {
		id: string;
		type: 'stop' | 'line';
		title: string;
		busstopId?: number;
		line?: string;
	}

	type FavoriteItem = RecentItem;

	let query = $state('');
	let sheetOpen = $state(false);
	let sidebarCollapsed = $state(false);
	let selectedStop = $state<BusStopDetail | null>(null);
	let selectedBus = $state<MapBusSelection | null>(null);
	let selectedBusEtaMinutes = $state<number | null>(null);
	let upcoming = $state<UpcomingBus[]>([]);
	let loading = $state(false);
	let loadError = $state('');
	let isStaleData = $state(false);
	let lastUpdatedAt = $state<number | null>(null);
	let nowTick = $state(Date.now());
	let focusLocation = $state<[number, number] | null>(null);
	let selectedLine = $state<string | null>(null);
	let recentItems = $state<RecentItem[]>([]);
	let favoriteItems = $state<FavoriteItem[]>([]);
	// true cuando la parada/línea visible se cargó sola al entrar (fallback
	// al primer favorito, ver onMount) y no porque el usuario la haya
	// tocado. Solo controla el "kicker" visual que explica por qué hay
	// datos sin que el usuario haya hecho nada todavía.
	let isDefaultFavorite = $state(false);

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

	function updateUrl(params: { stop?: number | string | null; line?: string | null }) {
	if (typeof window === 'undefined') return;
	const url = new URL(window.location.href);
	if (params.stop) {
		url.searchParams.set('stop', String(params.stop));
		url.searchParams.delete('line');
	} else if (params.line) {
		url.searchParams.set('line', params.line);
		url.searchParams.delete('stop');
	} else {
		url.searchParams.delete('stop');
		url.searchParams.delete('line');
	}
	// Nativo a propósito, no replaceState de $app/navigation: ese exige
	// que el router de SvelteKit ya esté inicializado, y acá se puede
	// llamar muy temprano (desde el fallback de favoritos en onMount),
	// lo que tiraba "Cannot call replaceState(...) before router is
	// initialized" y dejaba el panel colgado en "Cargando...". El único
	// costo es un warning cosmético de SvelteKit en consola, inofensivo.
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

	async function fetchUpcoming(busstopId: number, lines: string): Promise<UpcomingBus[]> {
		const res = await fetch(`/api/busstops/${busstopId}/upcomingbuses?lines=${encodeURIComponent(lines)}`);
		isStaleData = res.headers.get('X-Data-Stale') === '1';
		if (!res.ok) {
			const errorData = await res.json().catch(() => ({}));
			throw new Error(errorData.message || 'No se pudieron cargar los próximos buses');
		}
		return res.json();
	}

	/**
	 * @param isDefault true solo cuando esta parada se carga sola al entrar
	 * (fallback a favoritos en onMount), no cuando el usuario la elige a
	 * mano — controla el "kicker" visual, ver isDefaultFavorite arriba.
	 */
	async function selectStop(busstopId: number, isDefault = false) {
		selectedLine = null;
		selectedBus = null;
		selectedBusEtaMinutes = null;
		isDefaultFavorite = isDefault;
		loading = true;
		loadError = '';
		sheetOpen = true;
		updateUrl({ stop: busstopId });

		try {
			const stopRes = await fetch(`/api/busstops/${busstopId}`);
			if (stopRes.headers.get('X-Data-Stale') === '1') isStaleData = true;
			if (!stopRes.ok) throw new Error('No se pudo cargar la parada');

			selectedStop = await stopRes.json();
			if (selectedStop) {
				focusLocation = selectedStop.location.coordinates;
				saveRecent({
					id: `stop-${busstopId}`,
					type: 'stop',
					title: `${selectedStop.calle1} y ${selectedStop.calle2}`,
					busstopId
				});
			}

			const lines = (selectedStop?.lineas ?? []).join(',');
			upcoming = await fetchUpcoming(busstopId, lines);
			lastUpdatedAt = Date.now();
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Error desconocido';
		} finally {
			loading = false;
		}
	}

	async function refreshUpcoming(busstopId: number, lines: string) {
		if (document.visibilityState === 'hidden') return;
		try {
			upcoming = await fetchUpcoming(busstopId, lines);
			lastUpdatedAt = Date.now();
		} catch (err) {
			console.warn('[polling] no se pudo refrescar upcomingbuses', err);
		}
	}

	function pickStopResult(stop: SearchStopResult) {
		searchOpen = false;
		query = `${stop.street1} y ${stop.street2}`;
		focusLocation = stop.location.coordinates;
		selectStop(stop.busstopId);
	}

	/**
	 * @param isDefault ver comentario de selectStop() arriba.
	 */
	function pickLineResult(line: string, isDefault = false) {
		searchOpen = false;
		query = line;
		clearSelection();
		selectedLine = line;
		isDefaultFavorite = isDefault;
		updateUrl({ line });
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
		updateUrl({});
	}

	function selectBusFromMap(bus: MapBusSelection) {
		selectedBus = bus;
		isDefaultFavorite = false;
		const fromUpcoming = upcoming.find((b) => b.busId === bus.busId);
		selectedBusEtaMinutes = fromUpcoming ? etaToMinutes(fromUpcoming.eta) : null;
		sheetOpen = true;
		focusLocation = bus.location.coordinates;
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

	function clearBusSelection() {
		selectedBus = null;
		selectedBusEtaMinutes = null;
		if (!selectedStop) sheetOpen = false;
	}

	function clearSelection() {
		selectedStop = null;
		selectedBus = null;
		selectedBusEtaMinutes = null;
		upcoming = [];
		sheetOpen = false;
		loadError = '';
		isDefaultFavorite = false;
		updateUrl({});
	}

	// Deep links al montar la página, y si no hay ninguno, fallback al
	// primer favorito guardado — antes, sin deep link ni favoritos, el
	// panel quedaba totalmente vacío en la primera visita. isDefault=true
	// solo prende el "kicker" visual (ver isDefaultFavorite arriba), no
	// cambia el resto del comportamiento de selectStop/pickLineResult.
	onMount(() => {
		loadRecents();
		loadFavorites();
		const params = new URLSearchParams(window.location.search);
		const stopParam = params.get('stop') || params.get('parada');
		const lineParam = params.get('line') || params.get('linea');

		if (stopParam) {
			const id = Number(stopParam);
			if (!Number.isNaN(id)) selectStop(id);
		} else if (lineParam) {
			pickLineResult(lineParam);
		} else if (favoriteItems.length > 0) {
			const first = favoriteItems[0];
			if (first.type === 'stop' && first.busstopId) {
				selectStop(first.busstopId, true);
			} else if (first.type === 'line' && first.line) {
				pickLineResult(first.line, true);
			}
		}
	});

	$effect(() => {
		const bus = selectedBus;
		if (!bus || !selectedStop) return;
		const match = upcoming.find((b) => b.busId === bus.busId);
		selectedBusEtaMinutes = match ? etaToMinutes(match.eta) : null;
	});

	// Polling unificado (20s) con pausado en background
	$effect(() => {
		if (!selectedStop) return;
		const busstopId = selectedStop.paradaId;
		const lines = selectedStop.lineas.join(',');

		const interval = setInterval(() => {
			refreshUpcoming(busstopId, lines);
		}, POLL_INTERVAL_MS);

		const handleVisibility = () => {
			if (document.visibilityState === 'visible') {
				refreshUpcoming(busstopId, lines);
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
			searchOpen = false;
			return;
		}

		searchOpen = true;
		const timeout = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
				if (res.ok) searchResults = await res.json();
			} catch (err) {
				console.warn('[search] falló la búsqueda', err);
			}
		}, SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timeout);
	});

	const secondsSinceUpdate = $derived(
		lastUpdatedAt ? Math.max(0, Math.round((nowTick - lastUpdatedAt) / 1000)) : null
	);

	const selectedStopNameStr = $derived(
		selectedStop ? `${selectedStop.calle1} y ${selectedStop.calle2}` : null
	);
</script>

<svelte:head>
	<title>Buses Montevideo</title>
</svelte:head>

<main>
	<BusMap
		buses={upcoming}
		{focusLocation}
		selectedStopId={selectedStop?.paradaId ?? null}
		selectedStopName={selectedStopNameStr}
		selectedBusId={selectedBus?.busId ?? null}
		filterLine={selectedLine}
		onSelectStop={selectStop}
		onSelectBus={selectBusFromMap}
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

			{#if searchOpen && (searchResults.stops.length > 0 || searchResults.lines.length > 0)}
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
							<button class="search-result" onclick={() => pickStopResult(stop)}>
								{stop.street1} y {stop.street2}
							</button>
						{/each}
					{/if}
				</div>
			{:else if searchOpen}
				<div class="search-dropdown">
					<p class="search-empty">Sin resultados para "{query}"</p>
				</div>
			{/if}
		</div>
	</div>

	<BottomSheet open={sheetOpen} bind:collapsed={sidebarCollapsed}>
		{#if loading}
			<p class="status">Cargando...</p>
		{:else if loadError}
			<p class="status error">{loadError}</p>
		{:else if selectedBus}
			<div class="panel-header">
				<div class="panel-header-left">
					<button
						class="fav-star-btn"
						class:active={isFavorite(`line-${selectedBus.line}`)}
						onclick={() =>
							toggleFavorite({
								id: `line-${selectedBus!.line}`,
								type: 'line',
								title: `Línea ${selectedBus!.line}`,
								line: selectedBus!.line
							})}
						aria-label={isFavorite(`line-${selectedBus.line}`) ? 'Quitar línea de favoritos' : 'Guardar línea en favoritos'}
						title={isFavorite(`line-${selectedBus.line}`) ? 'Quitar línea de favoritos' : 'Guardar línea en favoritos'}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite(`line-${selectedBus.line}`) ? 'var(--color-accent)' : 'none'} stroke={isFavorite(`line-${selectedBus.line}`) ? 'var(--color-accent)' : 'currentColor'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
						</svg>
					</button>
					<h2 class="panel-title">Ómnibus en vivo</h2>
				</div>
				<button class="close-btn" onclick={clearBusSelection} aria-label="Cerrar ómnibus">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>
			<BusDetailCard
				line={selectedBus.line}
				destination={selectedBus.destination}
				origin={selectedBus.origin}
				company={selectedBus.company}
				speed={selectedBus.speed}
				access={selectedBus.access}
				thermalConfort={selectedBus.thermalConfort}
				emissions={selectedBus.emissions}
				etaMinutes={selectedBusEtaMinutes}
				busId={selectedBus.busId}
			/>
			{#if selectedStop}
				<div class="panel-divider">
					<span>Parada {selectedStop.calle1} y {selectedStop.calle2}</span>
				</div>
				{#if upcoming.length === 0}
					<p class="status compact">No hay más buses acercándose.</p>
				{:else}
					{#each upcoming as bus (bus.busId)}
						<LineEtaCard
							line={bus.line}
							destination={bus.destination}
							etaMinutes={etaToMinutes(bus.eta)}
							highlight={bus.busId === selectedBus.busId}
							onSelect={() => selectBusFromMap(upcomingToMapBus(bus))}
						/>
					{/each}
				{/if}
			{/if}
		{:else if selectedStop}
			<div class="stop-header">
				<div class="stop-header-title">
					<button
						class="fav-star-btn"
						class:active={isFavorite(`stop-${selectedStop.paradaId}`)}
						onclick={() =>
							toggleFavorite({
								id: `stop-${selectedStop!.paradaId}`,
								type: 'stop',
								title: `${selectedStop!.calle1} y ${selectedStop!.calle2}`,
								busstopId: selectedStop!.paradaId
							})}
						aria-label={isFavorite(`stop-${selectedStop.paradaId}`) ? 'Quitar parada de favoritos' : 'Guardar parada en favoritos'}
						title={isFavorite(`stop-${selectedStop.paradaId}`) ? 'Quitar de favoritos' : 'Guardar en favoritos'}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite(`stop-${selectedStop.paradaId}`) ? 'var(--color-accent)' : 'none'} stroke={isFavorite(`stop-${selectedStop.paradaId}`) ? 'var(--color-accent)' : 'currentColor'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
						</svg>
					</button>
					<div class="stop-title-col">
						{#if isDefaultFavorite}
							<span class="favorite-kicker">Tu parada favorita</span>
						{/if}
						<h2 class="stop-name">{selectedStop.calle1} y {selectedStop.calle2}</h2>
					</div>
				</div>
				<div class="stop-header-right">
					{#if secondsSinceUpdate !== null}
						<span class="updated tabular-nums">
							{isStaleData ? 'Datos demorados · ' : ''}hace {secondsSinceUpdate}s
						</span>
					{/if}
					<button class="close-btn" onclick={clearSelection} aria-label="Cerrar parada">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
			</div>
			{#if upcoming.length === 0}
				<p class="status">No hay buses acercándose ahora mismo.</p>
			{:else}
				{#each upcoming as bus (bus.busId)}
					<LineEtaCard
						line={bus.line}
						destination={bus.destination}
						etaMinutes={etaToMinutes(bus.eta)}
						onSelect={() => selectBusFromMap(upcomingToMapBus(bus))}
					/>
				{/each}
			{/if}
		{:else if selectedLine}
			<!-- Favorito de línea cargado sin parada asociada, o filtro de
			     línea activo desde la búsqueda: antes el panel quedaba
			     totalmente vacío en este caso (BottomSheet solo mostraba su
			     placeholder cuando no se le pasaba contenido, pero +page.svelte
			     siempre le pasa el bloque {#if}, aunque no matchee nada). -->
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
					if (item.type === 'stop' && item.busstopId) selectStop(item.busstopId);
					else if (item.type === 'line' && item.line) pickLineResult(item.line);
				}}
			/>
		{/if}
	</BottomSheet>
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

	.status.compact {
		margin: var(--space-2) 0;
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

	.panel-divider {
		margin: var(--space-5) 0 var(--space-3);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-border);
		font-size: 12px;
		font-weight: 600;
		color: var(--color-text-secondary);
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