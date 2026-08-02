<script lang="ts">
	import BusMap from '$lib/components/BusMap.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import LineEtaCard from '$lib/components/LineEtaCard.svelte';
	import { etaToMinutes, type BusStopDetail, type UpcomingBus } from '$lib/types/stm';

	let query = $state('');
	let sheetOpen = $state(false);
	let selectedStop = $state<BusStopDetail | null>(null);
	let upcoming = $state<UpcomingBus[]>([]);
	let loading = $state(false);
	let loadError = $state('');

	async function selectStop(busstopId: number) {
		loading = true;
		loadError = '';
		sheetOpen = true;
		try {
			const stopRes = await fetch(`/api/busstops/${busstopId}`);
			if (!stopRes.ok) throw new Error('No se pudo cargar la parada');
			selectedStop = await stopRes.json();

			const lines = (selectedStop?.lineas ?? []).join(',');
			const busesRes = await fetch(
				`/api/busstops/${busstopId}/upcomingbuses?lines=${encodeURIComponent(lines)}`
			);
			if (!busesRes.ok) throw new Error('No se pudieron cargar los próximos buses');
			upcoming = await busesRes.json();
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Error desconocido';
		} finally {
			loading = false;
		}
	}

	// TEMP: hasta que el mapa dispare selectStop() al tocar una parada real,
	// usamos la 3914 (18 de Julio y Andes) que ya confirmamos que tiene datos.
	$effect(() => {
		selectStop(3914);
	});
</script>

<svelte:head>
	<title>Buses Montevideo</title>
</svelte:head>

<main>
	<BusMap />

	<div class="top-bar">
		<SearchBar bind:value={query} />
	</div>

	<BottomSheet open={sheetOpen}>
		{#if loading}
			<p class="status">Cargando...</p>
		{:else if loadError}
			<p class="status error">{loadError}</p>
		{:else if selectedStop}
			<h2 class="stop-name">{selectedStop.calle1} y {selectedStop.calle2}</h2>
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

	.stop-name {
		font-size: 17px;
		font-weight: 700;
		margin: 0 0 var(--space-2);
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
