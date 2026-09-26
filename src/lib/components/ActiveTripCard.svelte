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
		onToggleAlerts,
		onDismissAlert,
		onShare,
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
		onToggleAlerts?: () => void;
		onDismissAlert?: (id: string) => void;
		onShare?: () => void;
		onEnd?: () => void;
	} = $props();

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
</style>
