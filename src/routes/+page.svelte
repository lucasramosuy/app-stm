<script lang="ts">
	import BusMap from '$lib/components/BusMap.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import LineEtaCard from '$lib/components/LineEtaCard.svelte';
	import { etaToMinutes, type BusStopDetail, type UpcomingBus } from '$lib/types/stm';

	const POLL_INTERVAL_MS = 12_000;
	const SEARCH_DEBOUNCE_MS = 300;

	let query = $state('');
	let sheetOpen = $state(false);
	let sidebarCollapsed = $state(false);
	let selectedStop = $state<BusStopDetail | null>(null);
	let upcoming = $state<UpcomingBus[]>([]);
	let loading = $state(false);
	let loadError = $state('');
	let lastUpdatedAt = $state<number | null>(null);
	let nowTick = $state(Date.now());
	let focusLocation = $state<[number, number] | null>(null);

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

	async function fetchUpcoming(busstopId: number, lines: string): Promise<UpcomingBus[]> {
		const res = await fetch(`/api/busstops/${busstopId}/upcomingbuses?lines=${encodeURIComponent(lines)}`);
		if (!res.ok) throw new Error('No se pudieron cargar los próximos buses');
		return res.json();
	}

	async function selectStop(busstopId: number) {
		loading = true;
		loadError = '';
		sheetOpen = true;
		try {
			const stopRes = await fetch(`/api/busstops/${busstopId}`);
			if (!stopRes.ok) throw new Error('No se pudo cargar la parada');
			selectedStop = await stopRes.json();

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

	// TEMP: hasta que el mapa dispare selectStop() al tocar una parada real,
	// usamos la 3914 (18 de Julio y Andes) que ya confirmamos que tiene datos.
	$effect(() => {
		selectStop(3914);
	});

	$effect(() => {
		if (!selectedStop) return;
		const busstopId = selectedStop.paradaId;
		const lines = selectedStop.lineas.join(',');

		const interval = setInterval(() => {
			refreshUpcoming(busstopId, lines);
		}, POLL_INTERVAL_MS);

		return () => clearInterval(interval);
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
</script>

<svelte:head>
	<title>Buses Montevideo</title>
</svelte:head>

<main>
	<BusMap
		buses={upcoming}
		{focusLocation}
		selectedStopId={selectedStop?.paradaId ?? null}
		onSelectStop={selectStop}
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

			{#if searchOpen && (searchResults.stops.length > 0 || searchResults.lines.length > 0)}
				<div class="search-dropdown">
					{#if searchResults.lines.length > 0}
						<div class="search-section-label">Líneas</div>
						<div class="search-lines">
							{#each searchResults.lines as l (l.line)}
								<span class="line-chip">{l.line}</span>
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
		{:else if selectedStop}
			<div class="stop-header">
				<h2 class="stop-name">{selectedStop.calle1} y {selectedStop.calle2}</h2>
				{#if secondsSinceUpdate !== null}
					<span class="updated tabular-nums">Actualizado hace {secondsSinceUpdate}s</span>
				{/if}
			</div>
			{#if upcoming.length === 0}
				<p class="status">No hay buses acercándose ahora mismo.</p>
			{:else}
				{#each upcoming as bus (bus.busId)}
					<LineEtaCard
						line={bus.line}
						destination={bus.destination}
						etaMinutes={etaToMinutes(bus.eta)}
					/>
				{/each}
			{/if}
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

	.stop-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	.stop-name {
		font-size: 17px;
		font-weight: 700;
		margin: 0;
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