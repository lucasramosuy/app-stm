<script lang="ts">
	import type { TripOption } from '$lib/types/trip';

	let {
		loading = false,
		error = null,
		options = [],
		onClose
	}: {
		loading?: boolean;
		error?: string | null;
		options?: TripOption[];
		onClose?: () => void;
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
</style>