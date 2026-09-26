<script lang="ts">
	import type { TripOption } from '$lib/types/trip';

	let {
		loading = false,
		error = null,
		options = [],
		onClose,
		onSaveRoutine,
		onShareTrip,
		onStartTrip
	}: {
		loading?: boolean;
		error?: string | null;
		options?: TripOption[];
		onClose?: () => void;
		onSaveRoutine?: () => void;
		onShareTrip?: () => void;
		onStartTrip?: () => void;
	} = $props();

	function fmtWalk(m: number): string {
		return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
	}
</script>

<div class="trip-results">
	<div class="trip-results-header">
		<h2 class="panel-title">Cómo llegar</h2>
		<button class="close-btn" onclick={() => onClose?.()} aria-label="Cerrar resultados">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	</div>

	{#if loading}
		<p class="status">Buscando la mejor forma de llegar...</p>
	{:else if error}
		<p class="status error">{error}</p>
	{:else if options.length === 0}
		<p class="status">No encontramos una combinación de líneas para este viaje.</p>
	{:else}
		{#each options as option, i (i)}
			<div class="trip-option">
				<span class="transfer-badge">
					{option.transfers === 0 ? 'Directo' : `${option.transfers} transbordo${option.transfers > 1 ? 's' : ''}`}
				</span>

				<div class="trip-step">
					<span class="trip-step-icon">🚶</span>
					Caminá {fmtWalk(option.walkToFirstStopM)} hasta {option.legs[0].boardStop.label}
				</div>

				{#each option.legs as leg, li (li)}
					<div class="trip-step">
						<span class="line-chip small">{leg.line}</span>
						Bajate en {leg.alightStop.label}
					</div>
					{#if li < option.legs.length - 1}
						<div class="trip-step">
							<span class="trip-step-icon">🚶</span>
							Transbordá a la línea {option.legs[li + 1].line}
						</div>
					{/if}
				{/each}

				<div class="trip-step">
					<span class="trip-step-icon">🚶</span>
					Caminá {fmtWalk(option.walkFromLastStopM)} hasta destino
				</div>
			</div>
		{/each}
	{/if}

		{#if options.length > 0 && (onStartTrip || onSaveRoutine || onShareTrip)}
			<div class="trip-actions">
				{#if onStartTrip}
					<button class="trip-action-btn primary" onclick={() => onStartTrip?.()}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
							<polygon points="6 3 20 12 6 21 6 3" />
						</svg>
						Iniciar viaje
					</button>
				{/if}
				{#if onSaveRoutine}
					<button class="trip-action-btn ghost" onclick={() => onSaveRoutine?.()}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
							<rect x="3" y="4" width="18" height="18" rx="3" />
							<line x1="16" y1="2" x2="16" y2="6" />
							<line x1="8" y1="2" x2="8" y2="6" />
							<line x1="3" y1="10" x2="21" y2="10" />
							<path d="M12 14v4M10 16h4" />
						</svg>
						Guardar como rutina
					</button>
				{/if}
				{#if onShareTrip}
					<button class="trip-action-btn ghost" onclick={() => onShareTrip?.()}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
							<polyline points="16 6 12 2 8 6" />
							<line x1="12" x2="12" y1="2" y2="15" />
						</svg>
						Compartir viaje
					</button>
				{/if}
			</div>
	{/if}
</div>

<style>
	.trip-results-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
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

	.status {
		color: var(--color-text-secondary);
		font-size: 14px;
		text-align: center;
		margin: var(--space-4) 0;
	}

	.status.error {
		color: #f87171;
	}

	.trip-option {
		background: var(--color-surface-raised, rgba(255, 255, 255, 0.03));
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-3);
	}

	.trip-option + .trip-option {
		margin-top: var(--space-3);
	}

	.transfer-badge {
		display: inline-block;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-live);
		background: rgba(94, 234, 212, 0.1);
		padding: 3px 8px;
		border-radius: 999px;
		margin-bottom: var(--space-2);
	}

	.trip-step {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 13px;
		color: var(--color-text);
		padding: 4px 0;
	}

	.trip-step-icon {
		flex-shrink: 0;
		font-size: 12px;
		opacity: 0.7;
	}

	.line-chip {
		background: var(--color-accent);
		color: var(--color-bg);
		font-weight: 700;
		border-radius: var(--radius-sm);
	}

	.line-chip.small {
		font-size: 11px;
		padding: 2px 6px;
	}
	.trip-actions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.trip-action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 46px;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 15px;
		font-weight: 700;
		cursor: pointer;
		border: none;
	}

	.trip-action-btn.primary {
		background: var(--color-accent);
		color: #0b1220;
	}

	.trip-action-btn.ghost {
		background: rgba(245, 246, 248, 0.05);
		border: 1px solid var(--color-border-strong);
		color: var(--color-text);
	}
</style>
