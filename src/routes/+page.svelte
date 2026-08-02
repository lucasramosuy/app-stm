<script lang="ts">
	import BusMap from '$lib/components/BusMap.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import LineEtaCard from '$lib/components/LineEtaCard.svelte';
	import { etaToMinutes, type BusStopDetail, type UpcomingBus } from '$lib/types/stm';

	const POLL_INTERVAL_MS = 12_000;

	let query = $state('');
	let sheetOpen = $state(false);
	let sidebarCollapsed = $state(false);
	let selectedStop = $state<BusStopDetail | null>(null);
	let upcoming = $state<UpcomingBus[]>([]);
	let loading = $state(false);
	let loadError = $state('');
	let lastUpdatedAt = $state<number | null>(null);
	let nowTick = $state(Date.now());

	async function fetchUpcoming(busstopId: number, lines: string): Promise<UpcomingBus[]> {
		const res = await fetch(`/api/busstops/${busstopId}/upcomingbuses?lines=${encodeURIComponent(lines)}`);
		if (!res.ok) throw new Error('No se pudieron cargar los próximos buses');
		return res.json();
	}

	/** Carga inicial de una parada: trae su detalle + primeros ETAs, con
	 * estados de loading/error visibles (el usuario está esperando esto). */
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

	/** Refresco periódico: silencioso, no toca loading/loadError. Si falla
	 * (ej. un timeout puntual), simplemente se deja la última lista buena
	 * en pantalla y se reintenta en el próximo ciclo. */
	async function refreshUpcoming(busstopId: number, lines: string) {
		try {
			upcoming = await fetchUpcoming(busstopId, lines);
			lastUpdatedAt = Date.now();
		} catch (err) {
			console.warn('[polling] no se pudo refrescar upcomingbuses', err);
		}
	}

	// TEMP: hasta que el mapa dispare selectStop() al tocar una parada real,
	// usamos la 3914 (18 de Julio y Andes) que ya confirmamos que tiene datos.
	$effect(() => {
		selectStop(3914);
	});

	// Polling: mientras haya una parada seleccionada, refresca upcomingbuses
	// cada POLL_INTERVAL_MS. Se reinicia solo si cambia la parada (paradaId),
	// y se limpia al desmontar o cambiar de parada.
	$effect(() => {
		if (!selectedStop) return;
		const busstopId = selectedStop.paradaId;
		const lines = selectedStop.lineas.join(',');

		const interval = setInterval(() => {
			refreshUpcoming(busstopId, lines);
		}, POLL_INTERVAL_MS);

		return () => clearInterval(interval);
	});

	// Tick de 1s solo para que "hace Xs" se actualice en pantalla sin
	// depender de que llegue un fetch nuevo.
	$effect(() => {
		const tick = setInterval(() => {
			nowTick = Date.now();
		}, 1000);
		return () => clearInterval(tick);
	});

	const secondsSinceUpdate = $derived(
		lastUpdatedAt ? Math.max(0, Math.round((nowTick - lastUpdatedAt) / 1000)) : null
	);
</script>

<svelte:head>
	<title>Buses Montevideo</title>
</svelte:head>

<main>
	<BusMap buses={upcoming} />

	<div
		class="top-bar"
		style:--sidebar-offset={sidebarCollapsed ? '68px' : '448px'}
	>
		<SearchBar bind:value={query} />
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

	.top-bar {
		position: absolute;
		top: env(safe-area-inset-top, 0);
		left: 0;
		right: 0;
		padding: var(--space-4);
		z-index: 10;
	}

	@media (min-width: 900px) {
		.top-bar {
			left: var(--sidebar-offset, 448px);
			max-width: 480px;
		}
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