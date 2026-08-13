<script lang="ts">
	interface TripPoint {
		label: string;
		coordinates: [number, number];
		type: 'gps' | 'point';
	}

	let {
		destination,
		origin = null,
		locatingOrigin = false,
		originError = null,
		pickingOrigin = false,
		onUseMyLocation,
		onPickOnMap,
		onCancelPickOrigin,
		onClearOrigin,
		onClearDestination,
		onSwap,
		onSearchRoute
	}: {
		destination: TripPoint;
		origin?: TripPoint | null;
		locatingOrigin?: boolean;
		originError?: string | null;
		pickingOrigin?: boolean;
		onUseMyLocation?: () => void;
		onPickOnMap?: () => void;
		onCancelPickOrigin?: () => void;
		onClearOrigin?: () => void;
		onClearDestination?: () => void;
		onSwap?: () => void;
		onSearchRoute?: () => void;
	} = $props();
</script>

<div class="trip-bar">
	<div class="trip-rows">
		<div class="trip-row">
			<span class="trip-dot origin"></span>
			{#if pickingOrigin}
				<span class="trip-picking-hint">Tocá una parada, ómnibus o punto del mapa para usarlo como origen</span>
				<button class="trip-cancel-pick" onclick={onCancelPickOrigin}>Cancelar</button>
			{:else if origin}
				<span class="trip-label">{origin.label}</span>
				<button class="trip-edit" onclick={onPickOnMap} aria-label="Cambiar origen" title="Cambiar origen">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 20h9" />
						<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
					</svg>
				</button>
				<button class="trip-clear" onclick={onClearOrigin} aria-label="Quitar origen">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			{:else}
				<div class="trip-origin-options">
					<button class="trip-set-origin" onclick={onUseMyLocation} disabled={locatingOrigin}>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="3" />
							<line x1="12" y1="2" x2="12" y2="5" />
							<line x1="12" y1="19" x2="12" y2="22" />
							<line x1="2" y1="12" x2="5" y2="12" />
							<line x1="19" y1="12" x2="22" y2="12" />
						</svg>
						{locatingOrigin ? 'Buscando...' : 'Mi ubicación'}
					</button>
					<span class="trip-origin-sep">·</span>
					<button class="trip-set-origin" onclick={onPickOnMap}>Elegir en el mapa</button>
				</div>
			{/if}
		</div>

		<div class="trip-row">
			<span class="trip-dot destination"></span>
			<span class="trip-label">{destination.label}</span>
			<button class="trip-clear" onclick={onClearDestination} aria-label="Quitar destino">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	</div>

	{#if origin && !pickingOrigin}
		<button class="trip-swap" onclick={onSwap} aria-label="Intercambiar origen y destino">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="17 1 21 5 17 9" />
				<path d="M3 11V9a4 4 0 0 1 4-4h14" />
				<polyline points="7 23 3 19 7 15" />
				<path d="M21 13v2a4 4 0 0 1-4 4H3" />
			</svg>
		</button>
	{/if}

	{#if originError}
		<p class="trip-error">{originError}</p>
	{/if}

	<button class="trip-search-btn" onclick={onSearchRoute} disabled={!origin || pickingOrigin}>
		Buscar ruta
	</button>
</div>

<style>
	.trip-bar {
		margin-top: var(--space-2);
		background: rgba(19, 27, 46, 0.95);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-3);
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.trip-rows {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.trip-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.trip-dot {
		flex-shrink: 0;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.trip-dot.origin {
		background: var(--color-live);
	}

	.trip-dot.destination {
		background: var(--color-accent);
	}

	.trip-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text);
	}

	.trip-origin-options {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.trip-origin-sep {
		color: var(--color-muted);
		font-size: 12px;
	}

	.trip-set-origin {
		display: flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		padding: 0;
		color: var(--color-text-secondary);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.trip-set-origin:hover {
		color: var(--color-live);
	}

	.trip-set-origin:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.trip-picking-hint {
		flex: 1;
		min-width: 0;
		font-size: 12px;
		font-weight: 500;
		color: var(--color-live);
		line-height: 1.4;
	}

	.trip-cancel-pick {
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: 11px;
		font-weight: 600;
		padding: 4px 8px;
		cursor: pointer;
	}

	.trip-cancel-pick:hover {
		color: var(--color-text);
	}

	.trip-edit {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		cursor: pointer;
		border-radius: var(--radius-sm);
	}

	.trip-edit:hover {
		background: rgba(245, 246, 248, 0.08);
		color: var(--color-text);
	}

	.trip-clear {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		cursor: pointer;
		border-radius: var(--radius-sm);
	}

	.trip-clear:hover {
		background: rgba(245, 246, 248, 0.08);
		color: var(--color-text);
	}

	.trip-swap {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.trip-swap:hover {
		color: var(--color-text);
	}

	.trip-error {
		flex-basis: 100%;
		font-size: 11px;
		color: #f87171;
		margin: 0;
	}

	.trip-search-btn {
		flex-shrink: 0;
		background: var(--color-accent);
		color: var(--color-bg);
		font-weight: 700;
		font-size: 12px;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		white-space: nowrap;
	}

	.trip-search-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>