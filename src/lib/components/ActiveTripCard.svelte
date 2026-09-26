<script lang="ts">
	import type { TripLeg } from '$lib/types/trip';
	import type { TripAlert } from '$lib/tripAlerts';
	import { formatClock, formatDistance } from '$lib/tripAlerts';

	let {
		destLabel,
		legs,
		currentLeg,
		alerts,
		alertsEnabled,
		gpsDenied,
		etaMin,
		boardLabel,
		walkFinalM,
		nowTick,
		liveShare = null,
		liveBusy = false,
		liveError = null,
		onToggleAlerts,
		onDismissAlert,
		onShare,
		onShareLive,
		onStopLive,
		onEnd
	}: {
		destLabel: string;
		legs: TripLeg[];
		currentLeg: number;
		alerts: TripAlert[];
		alertsEnabled: boolean;
		gpsDenied: boolean;
		etaMin: number | null;
		boardLabel: string;
		walkFinalM: number;
		nowTick: number;
		liveShare?: { url: string; expiresAt: number } | null;
		liveBusy?: boolean;
		liveError?: string | null;
		onToggleAlerts?: () => void;
		onDismissAlert?: (id: string) => void;
		onShare?: () => void;
		onShareLive?: () => void;
		onStopLive?: () => void;
		onEnd?: () => void;
	} = $props();

	let copiedLive = $state(false);

	const liveRemainMin = $derived(
		liveShare ? Math.max(0, Math.ceil((liveShare.expiresAt - nowTick) / 60_000)) : 0
	);
	const liveEndClock = $derived(liveShare ? formatClock(liveShare.expiresAt) : '');

	async function copyLiveLink() {
		if (!liveShare) return;
		try {
			await navigator.clipboard.writeText(liveShare.url);
			copiedLive = true;
			setTimeout(() => (copiedLive = false), 2_500);
		} catch (e) {
			console.warn('[compartir-en-vivo] no se pudo copiar el link', e);
		}
	}

	async function shareLive() {
		if (!liveShare) return;
		if (typeof navigator !== 'undefined' && navigator.share) {
			try {
				await navigator.share({ title: 'Mi ubicación en vivo', url: liveShare.url });
				return;
			} catch (e) {
				if ((e as Error).name === 'AbortError') return;
			}
		}
		copyLiveLink();
	}

	const leg = $derived(legs[currentLeg] ?? legs[legs.length - 1]);
	const etaClock = $derived(etaMin !== null ? formatClock(nowTick + etaMin * 60_000) : null);

	function fmtWalk(m: number): string {
		return formatDistance(m);
	}
</script>

<div class="active-trip">
	<div class="trip-head">
		<h2 class="trip-title">Tu viaje a {destLabel}</h2>
		<span class="live-chip"><span class="live-dot"></span>en vivo</span>
	</div>

	{#each alerts as alert (alert.id)}
		<div class="trip-alert" class:prominent={alert.kind !== 'eta'}>
			<span class="trip-alert-icon" class:accent={alert.kind === 'eta'}>
				{#if alert.kind === 'eta'}
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<circle cx="12" cy="12" r="9" />
						<path d="M12 7v5l3 2" />
					</svg>
				{:else}
					<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
						<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
					</svg>
				{/if}
			</span>
			<div class="trip-alert-text">
				<strong>{alert.title}</strong>
				<span>{alert.body}</span>
			</div>
			<button class="trip-alert-close" onclick={() => onDismissAlert?.(alert.id)} aria-label="Cerrar aviso">
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	{/each}

	<div class="trip-segs">
		{#each legs as l, i (i)}
			{#if i > 0}
				<span class="seg-arrow">→</span>
			{/if}
			<span class="line-chip small" class:done={i < currentLeg} class:next={i > currentLeg}>{l.line}</span>
		{/each}
		<span class="seg-arrow">→</span>
		<span class="seg-walk">🚶 {fmtWalk(walkFinalM)}</span>
	</div>

	{#if etaMin !== null && leg}
		<p class="trip-eta tabular-nums">
			Próximo {leg.line} en <strong>{etaMin <= 0 ? 'menos de 1' : etaMin} min</strong> ({etaClock}) · {boardLabel}
		</p>
	{/if}

	<div class="trip-divider"></div>

	<div class="alerts-toggle-row">
		<span class="alerts-toggle-icon" class:on={alertsEnabled}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
				<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
			</svg>
		</span>
		<div class="alerts-toggle-text">
			<strong>Avisos del viaje</strong>
			<span>Cambio de ETA · transbordo · bajada por GPS</span>
		</div>
		<button
			class="switch"
			class:on={alertsEnabled}
			role="switch"
			aria-checked={alertsEnabled}
			aria-label={alertsEnabled ? 'Desactivar avisos del viaje' : 'Activar avisos del viaje'}
			onclick={() => onToggleAlerts?.()}
		>
			<span class="switch-knob"></span>
		</button>
	</div>
	{#if alertsEnabled && gpsDenied}
		<p class="gps-hint">
			No pudimos acceder a tu ubicación: los avisos de transbordo y bajada necesitan el GPS activado. Los de ETA siguen funcionando.
		</p>
	{/if}

	{#if onShareLive}
		<div class="trip-divider"></div>
		<div class="live-section-label">Compartir en vivo</div>
		{#if liveShare}
			<div class="live-box sharing">
				<div class="live-tile">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="2" />
						<path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
						<path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
						<path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
						<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
					</svg>
				</div>
				<div class="live-box-text">
					<div class="live-box-title-row">
						<span class="live-box-title">Compartiendo tu ubicación</span>
						<span class="live-chip small"><span class="live-dot"></span>en vivo</span>
					</div>
					<span class="live-box-sub">Quien tenga el link te ve moverte en el mapa en tiempo real.</span>
				</div>
			</div>
			<div class="live-link-row">
				<button class="live-link-pill" onclick={shareLive} title="Compartir link">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
					</svg>
					{liveShare.url.replace(/^https?:\/\//, '')}
				</button>
				<button class="live-copy-btn" onclick={copyLiveLink} aria-label="Copiar link">
					{#if copiedLive}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-live)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="20 6 9 17 4 12" />
						</svg>
					{:else}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect width="14" height="14" x="8" y="8" rx="2" />
							<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
						</svg>
					{/if}
				</button>
			</div>
			<div class="live-countdown tabular-nums">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
					<circle cx="12" cy="12" r="9" />
					<path d="M12 7v5l3 2" />
				</svg>
				Quedan {liveRemainMin} min · se corta solo a las {liveEndClock} o al terminar el viaje
			</div>
			<button class="trip-action-btn ghost full" onclick={() => onStopLive?.()}>Dejar de compartir</button>
		{:else}
			<div class="live-box">
				<div class="live-tile">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="2" />
						<path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
						<path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
						<path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
						<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
					</svg>
				</div>
				<div class="live-box-text">
					<span class="live-box-title">Compartí tu ubicación en vivo</span>
					<span class="live-box-sub">Quien tenga el link te ve moverte en el mapa. Se corta solo a la hora o al terminar el viaje.</span>
				</div>
			</div>
			{#if liveError}
				<p class="live-error">{liveError}</p>
			{/if}
			<button class="trip-action-btn ghost full" disabled={liveBusy} onclick={() => onShareLive?.()}>
				{liveBusy ? 'Creando sesión…' : 'Compartir en vivo'}
			</button>
		{/if}
	{/if}

	<div class="trip-actions">
		{#if onShare}
			<button class="trip-action-btn ghost" onclick={() => onShare?.()}>Compartir</button>
		{/if}
		<button class="trip-action-btn primary" onclick={() => onEnd?.()}>Terminar viaje</button>
	</div>
</div>

<style>
	.active-trip {
		display: flex;
		flex-direction: column;
	}

	.trip-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.trip-title {
		font-size: 16px;
		font-weight: 700;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.live-chip {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 600;
		color: var(--color-live);
		background: rgba(94, 234, 212, 0.1);
		border: 1px solid rgba(94, 234, 212, 0.4);
	}

	.live-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--color-live);
		box-shadow: 0 0 0 3px rgba(94, 234, 212, 0.18);
	}

	.trip-alert {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin-top: var(--space-2);
		padding: 10px 12px;
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
	}

	.trip-alert.prominent {
		background: rgba(94, 234, 212, 0.08);
		border-color: rgba(94, 234, 212, 0.35);
	}

	.trip-alert-icon {
		flex: 0 0 28px;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-live);
		background: rgba(94, 234, 212, 0.14);
	}

	.trip-alert-icon.accent {
		color: var(--color-accent);
		background: rgba(255, 201, 60, 0.12);
	}

	.trip-alert-text {
		flex: 1;
		min-width: 0;
		font-size: 13px;
		color: var(--color-text-secondary);
		line-height: 1.35;
	}

	.trip-alert-text strong {
		display: block;
		font-size: 14px;
		color: var(--color-text);
		margin-bottom: 2px;
	}

	.trip-alert-close {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		border-radius: var(--radius-sm);
	}

	.trip-alert-close:hover {
		background: rgba(245, 246, 248, 0.08);
		color: var(--color-text);
	}

	.trip-segs {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		margin-top: var(--space-3);
	}

	.line-chip {
		background: var(--color-accent);
		color: var(--color-bg);
		font-weight: 700;
		border-radius: var(--radius-sm);
	}

	.line-chip.small {
		font-size: 12px;
		padding: 3px 8px;
	}

	.line-chip.done {
		opacity: 0.45;
	}

	.line-chip.next {
		background: var(--color-surface-raised);
		color: var(--color-text);
		border: 1px solid var(--color-border-strong);
	}

	.seg-arrow {
		color: var(--color-muted);
		font-size: 12px;
	}

	.seg-walk {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--color-text-secondary);
	}

	.trip-eta {
		margin: var(--space-2) 0 0;
		font-size: 13px;
		color: var(--color-text-secondary);
	}

	.trip-eta strong {
		color: var(--color-text);
	}

	.trip-divider {
		height: 1px;
		background: var(--color-border);
		margin: var(--space-3) 0;
	}

	.alerts-toggle-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.alerts-toggle-icon {
		flex: 0 0 34px;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-text-secondary);
		background: rgba(245, 246, 248, 0.05);
	}

	.alerts-toggle-icon.on {
		color: var(--color-accent);
		background: rgba(255, 201, 60, 0.1);
	}

	.alerts-toggle-text {
		flex: 1;
		min-width: 0;
	}

	.alerts-toggle-text strong {
		display: block;
		font-size: 13.5px;
		font-weight: 600;
	}

	.alerts-toggle-text span {
		display: block;
		font-size: 11.5px;
		color: var(--color-text-secondary);
		margin-top: 1px;
	}

	.switch {
		flex: 0 0 44px;
		width: 44px;
		height: 26px;
		border-radius: 13px;
		border: none;
		background: rgba(245, 246, 248, 0.12);
		position: relative;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.switch.on {
		background: var(--color-live);
	}

	.switch-knob {
		position: absolute;
		left: 3px;
		top: 3px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--color-text);
		transition: transform 0.15s ease;
	}

	.switch.on .switch-knob {
		transform: translateX(18px);
		background: var(--color-bg);
	}

	.gps-hint {
		margin: var(--space-2) 0 0;
		font-size: 12px;
		color: var(--color-accent);
		line-height: 1.4;
	}

	.trip-actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.trip-action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 46px;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 15px;
		font-weight: 700;
		cursor: pointer;
		border: none;
		flex: 1;
	}

	.trip-action-btn.primary {
		flex: 1.4;
		background: var(--color-accent);
		color: #0b1220;
	}

	.trip-action-btn.ghost {
		background: rgba(245, 246, 248, 0.05);
		border: 1px solid var(--color-border-strong);
		color: var(--color-text);
	}

	.trip-action-btn.full {
		width: 100%;
		flex: none;
		margin-top: var(--space-2);
	}

	.trip-action-btn:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.live-section-label {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		margin-bottom: var(--space-2);
	}

	.live-box {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 12px;
	}

	.live-box.sharing {
		background: rgba(94, 234, 212, 0.08);
		border-color: rgba(94, 234, 212, 0.35);
	}

	.live-tile {
		flex: 0 0 34px;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: rgba(94, 234, 212, 0.14);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-live);
	}

	.live-box-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.live-box-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.live-box-title {
		font-size: 15px;
		font-weight: 700;
	}

	.live-box-sub {
		font-size: 12.5px;
		color: var(--color-text-secondary);
		line-height: 1.35;
	}

	.live-link-row {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}

	.live-link-pill {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 7px;
		height: 42px;
		padding: 0 12px;
		border-radius: 12px;
		border: 1px solid var(--color-border-strong);
		background: rgba(245, 246, 248, 0.05);
		color: var(--color-text);
		font-family: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.live-copy-btn {
		flex: 0 0 42px;
		width: 42px;
		height: 42px;
		border-radius: 12px;
		border: 1px solid var(--color-border-strong);
		background: rgba(245, 246, 248, 0.05);
		color: var(--color-text);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.live-countdown {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 12px 2px 0;
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	.live-error {
		margin: 8px 2px 0;
		font-size: 12.5px;
		color: var(--color-accent);
	}

	.live-chip.small {
		padding: 3px 8px;
		font-size: 10.5px;
	}
</style>
