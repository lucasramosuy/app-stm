<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import BusMap from '$lib/components/BusMap.svelte';
	import { decodeSharedTrip, type SharedTrip } from '$lib/shareTrip';
	import { etaToMinutes, type UpcomingBus } from '$lib/types/stm';
	import type { TripOption } from '$lib/types/trip';

	const POLL_MS = 20_000;

	const trip: SharedTrip | null = $derived(decodeSharedTrip($page.params.data ?? ''));
	const expired = $derived(trip !== null && Date.now() > trip.exp);

	// OpciÃ³n de viaje sintÃ©tica (un solo tramo) para que el mapa dibuje
	// el recorrido, las caminatas y los puntos de origen/destino.
	const tripOption: TripOption | null = $derived(
		trip && trip.bs && trip.as
			? {
					transfers: 0,
					legs: [
						{
							line: trip.line,
							boardStop: {
								busstopId: trip.boardStopId ?? 0,
								label: trip.boardLabel ?? '',
								coordinates: trip.bs
							},
							alightStop: {
								busstopId: trip.alightStopId ?? 0,
								label: trip.alightLabel ?? '',
								coordinates: trip.as
							}
						}
					],
					walkToFirstStopM: 0,
					walkFromLastStopM: 0
				}
			: null
	);

	let upcoming = $state<UpcomingBus[]>([]);
	let nowTick = $state(Date.now());

	// Primer bus de la lÃ­nea acercÃ¡ndose a la parada de bajada â es el
	// que define el ETA que ve quien recibe el link.
	const nextBus = $derived(
		trip?.alightStopId
			? (upcoming.find((b) => b.line === trip.line) ?? null)
			: null
	);
	const arrivalTime = $derived(nextBus ? new Date(nowTick + nextBus.eta * 1000) : null);
	const arrivalLabel = $derived(
		arrivalTime
			? arrivalTime.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
			: null
	);

	function haversineM(a: [number, number], b: [number, number]): number {
		const R = 6_371_000;
		const toRad = Math.PI / 180;
		const dLat = (b[1] - a[1]) * toRad;
		const dLng = (b[0] - a[0]) * toRad;
		const h =
			Math.sin(dLat / 2) ** 2 +
			Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2;
		return 2 * R * Math.asin(Math.sqrt(h));
	}

	const totalM = $derived(trip ? haversineM(trip.o, trip.d) : 0);
	const progress = $derived(
		nextBus && totalM > 0
			? Math.min(0.98, Math.max(0.02, 1 - nextBus.distance / totalM))
			: 0.02
	);
	const distanceLabel = $derived(
		nextBus
			? nextBus.distance < 1000
				? `a ${Math.round(nextBus.distance)} m de la parada`
				: `a ${(nextBus.distance / 1000).toFixed(1)} km de la parada`
			: null
	);
	const expLabel = $derived(
		trip ? new Date(trip.exp).toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }) : ''
	);

	async function refreshEta() {
		if (!trip?.alightStopId) return;
		try {
			const res = await fetch(
				`/api/busstops/${trip.alightStopId}/upcomingbuses?lines=${encodeURIComponent(trip.line)}`
			);
			if (res.ok) upcoming = await res.json();
		} catch (e) {
			console.warn('[viaje-compartido] no se pudo refrescar el ETA', e);
		}
	}

	onMount(() => {
		refreshEta();
		const poll = setInterval(refreshEta, POLL_MS);
		const tick = setInterval(() => (nowTick = Date.now()), 1_000);
		return () => {
			clearInterval(poll);
			clearInterval(tick);
		};
	});
</script>

<svelte:head>
	<title>Viaje compartido Â· Buses Montevideo</title>
</svelte:head>

<main>
	{#if !trip}
		<div class="notice-card">
			<div class="brand-mini">
				<span class="brand-mark">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0b1220" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4 15.5V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.5" /><path d="M4 15.5h16" /><path d="M8 6v6M16 6v6" /><circle cx="8" cy="18.5" r="1.8" /><circle cx="16" cy="18.5" r="1.8" />
					</svg>
				</span>
				<span class="brand-name">Buses Montevideo</span>
			</div>
			<p class="notice-text">Este link no es vÃ¡lido.</p>
			<a class="notice-btn" href="/">Abrir Buses Montevideo</a>
		</div>
	{:else if expired}
		<div class="notice-card">
			<div class="brand-mini">
				<span class="brand-mark">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0b1220" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4 15.5V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.5" /><path d="M4 15.5h16" /><path d="M8 6v6M16 6v6" /><circle cx="8" cy="18.5" r="1.8" /><circle cx="16" cy="18.5" r="1.8" />
					</svg>
				</span>
				<span class="brand-name">Buses Montevideo</span>
			</div>
			<p class="notice-text">Este viaje compartido expirÃ³. Pedile a la persona que te lo vuelva a mandar.</p>
			<a class="notice-btn" href="/">Abrir Buses Montevideo</a>
		</div>
	{:else}
		<BusMap
			buses={[]}
			filterLine={trip.line}
			tripOption={tripOption}
			tripOrigin={{ coordinates: trip.o }}
			tripDestination={{ coordinates: trip.d }}
		/>

		<div class="topfade"></div>
		<header class="brandbar">
			<span class="brand-mark">
				<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#0b1220" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M4 15.5V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.5" /><path d="M4 15.5h16" /><path d="M8 6v6M16 6v6" /><circle cx="8" cy="18.5" r="1.8" /><circle cx="16" cy="18.5" r="1.8" />
				</svg>
			</span>
			<span class="brand-name-lg">Buses Montevideo</span>
		</header>
		<div class="banner-row">
			<span class="banner-pill">Te compartieron un viaje en vivo</span>
		</div>

		<section class="sheet">
			<div class="handle"></div>
			<div class="eta-header">
				<span class="eta-label">Llegada estimada a {trip.to}</span>
				<span class="live-chip"><span class="livedot"></span>en vivo</span>
			</div>
			{#if arrivalLabel}
				<div class="eta-time tabular-nums">{arrivalLabel}</div>
			{:else}
				<div class="eta-none">Sin Ã³mnibus de la lÃ­nea {trip.line} acercÃ¡ndose ahora.</div>
			{/if}

			<div class="prog">
				<div class="fill" style:width="{progress * 100}%"></div>
				<div class="busmark" style:left="{progress * 100}%">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-live)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4 15.5V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.5" /><path d="M4 15.5h16" /><path d="M8 6v6M16 6v6" /><circle cx="8" cy="18.5" r="1.8" /><circle cx="16" cy="18.5" r="1.8" />
					</svg>
				</div>
			</div>
			<div class="prog-labels">
				<span>{trip.from}</span>
				<span>{trip.to}</span>
			</div>

			<div class="meta-row">
				<span class="line-badge">{trip.line}</span>
				<span class="meta-text">
					LÃ­nea {trip.line}{#if distanceLabel} Â· {distanceLabel}{/if}
				</span>
			</div>

			<a class="open-btn" href="/">Abrir en la app</a>
			<p class="exp-note">Link temporal Â· deja de actualizarse a las {expLabel}</p>
		</section>
	{/if}
</main>

<style>
	main {
		position: relative;
		width: 100%;
		height: 100dvh;
		overflow: hidden;
		background: var(--color-bg);
	}

	.topfade {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 110px;
		z-index: 20;
		background: linear-gradient(180deg, rgba(11, 18, 32, 0.85), rgba(11, 18, 32, 0));
		pointer-events: none;
	}

	.brandbar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 14px 16px 0;
	}

	.brand-mark {
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: var(--color-accent);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-float);
		flex-shrink: 0;
	}

	.brand-name-lg {
		font-size: 16px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}

	.banner-row {
		position: absolute;
		top: 60px;
		left: 0;
		right: 0;
		z-index: 30;
		display: flex;
		justify-content: center;
	}

	.banner-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		border-radius: 99px;
		background: rgba(19, 27, 46, 0.9);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--color-border);
		font-size: 12px;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.sheet {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 30;
		background: var(--color-surface);
		border-top: 1px solid var(--color-border-strong);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: var(--shadow-sheet);
		padding: 10px 16px calc(var(--space-5) + env(safe-area-inset-bottom, 0px));
	}

	.handle {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--color-muted);
		margin: 0 auto 14px;
		opacity: 0.7;
	}

	.eta-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.eta-label {
		font-size: 13px;
		color: var(--color-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.live-chip {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border-radius: 99px;
		background: rgba(94, 234, 212, 0.1);
		border: 1px solid rgba(94, 234, 212, 0.4);
		color: var(--color-live);
		font-size: 11.5px;
		font-weight: 700;
	}

	.livedot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--color-live);
		box-shadow: 0 0 0 3px rgba(94, 234, 212, 0.18);
	}

	.eta-time {
		font-size: 38px;
		font-weight: 800;
		letter-spacing: -0.02em;
		margin-top: 2px;
	}

	.eta-none {
		font-size: 14px;
		color: var(--color-text-secondary);
		margin-top: 6px;
	}

	.prog {
		position: relative;
		height: 6px;
		border-radius: 3px;
		background: rgba(245, 246, 248, 0.08);
		margin: 14px 0 6px;
	}

	.prog .fill {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		border-radius: 3px;
		background: var(--color-live);
		transition: width 1s linear;
	}

	.busmark {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--color-surface);
		border: 2px solid var(--color-live);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: left 1s linear;
	}

	.prog-labels {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: 11.5px;
		color: var(--color-text-secondary);
	}

	.prog-labels span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 14px 0 16px;
		font-size: 13px;
		color: var(--color-text-secondary);
	}

	.line-badge {
		min-width: 38px;
		height: 28px;
		padding: 0 8px;
		border-radius: 7px;
		background: var(--color-accent);
		color: #0b1220;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12.5px;
		font-weight: 800;
	}

	.open-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 46px;
		border-radius: var(--radius-md);
		background: rgba(245, 246, 248, 0.05);
		border: 1px solid var(--color-border-strong);
		color: var(--color-text);
		font-size: 15px;
		font-weight: 700;
		text-decoration: none;
	}

	.exp-note {
		text-align: center;
		font-size: 11px;
		color: var(--color-muted);
		margin-top: 12px;
	}

	.notice-card {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-5);
		text-align: center;
	}

	.brand-mini {
		display: flex;
		align-items: center;
		gap: 9px;
	}

	.brand-name {
		font-size: 15px;
		font-weight: 800;
	}

	.notice-text {
		font-size: 15px;
		color: var(--color-text-secondary);
		max-width: 320px;
	}

	.notice-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 46px;
		padding: 0 var(--space-5);
		border-radius: var(--radius-md);
		background: var(--color-accent);
		color: #0b1220;
		font-size: 15px;
		font-weight: 700;
		text-decoration: none;
	}
</style>
