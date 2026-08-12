<script lang="ts">
	interface QuickItem {
		id: string;
		type: 'stop' | 'line';
		title: string;
		busstopId?: number;
		line?: string;
	}

	let {
		favorites = [],
		recents = [],
		onPick
	}: {
		favorites?: QuickItem[];
		recents?: QuickItem[];
		onPick?: (item: QuickItem) => void;
	} = $props();

	const hasAnyQuickItems = $derived(favorites.length > 0 || recents.length > 0);
	// Recientes que no están ya listados como favoritos, para no repetir fila.
	const recentsOnly = $derived(recents.filter((r) => !favorites.some((f) => f.id === r.id)));
</script>

<div class="empty-state">
	<svg
		class="empty-icon"
		width="40"
		height="40"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M12 21s-7-6.5-7-11.5A7 7 0 0 1 19 9.5C19 14.5 12 21 12 21Z" />
		<circle cx="12" cy="9.5" r="2.5" />
	</svg>

	<h2 class="empty-title">Elegí una parada o línea</h2>
	<p class="empty-subtitle">Tocá el mapa, buscá una dirección, o elegí un ómnibus en vivo.</p>

	{#if hasAnyQuickItems}
		<div class="quick-list">
			{#if favorites.length > 0}
				<div class="quick-section-label favorites">
					<svg width="11" height="11" viewBox="0 0 24 24" fill="var(--color-accent)" stroke="var(--color-accent)" stroke-width="2">
						<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
					</svg>
					Favoritos
				</div>
				{#each favorites as item (item.id)}
					<button class="quick-row" onclick={() => onPick?.(item)}>
						{#if item.type === 'line'}
							<span class="quick-row-badge">{item.line}</span>
						{:else}
							<svg class="quick-row-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="8" />
							</svg>
						{/if}
						<span class="quick-row-title">{item.title}</span>
					</button>
				{/each}
			{/if}

			{#if recentsOnly.length > 0}
				<div class="quick-section-label">Recientes</div>
				{#each recentsOnly as item (item.id)}
					<button class="quick-row" onclick={() => onPick?.(item)}>
						{#if item.type === 'line'}
							<span class="quick-row-badge muted">{item.line}</span>
						{:else}
							<svg class="quick-row-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="8" />
							</svg>
						{/if}
						<span class="quick-row-title">{item.title}</span>
					</button>
				{/each}
			{/if}
		</div>
	{:else}
		<div class="empty-tip">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
			</svg>
			Guardá tus paradas y líneas frecuentes tocando la estrella para verlas acá.
		</div>
	{/if}
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: var(--space-5) 0 var(--space-2);
	}

	.empty-icon {
		color: var(--color-muted);
		margin-bottom: var(--space-3);
	}

	.empty-title {
		font-size: 15px;
		font-weight: 700;
		margin: 0 0 4px;
		color: var(--color-text);
	}

	.empty-subtitle {
		font-size: 13px;
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.5;
		max-width: 280px;
	}

	.empty-tip {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-5);
		padding: var(--space-3);
		background: var(--color-surface-raised, rgba(255, 255, 255, 0.03));
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
		font-size: 12px;
		line-height: 1.5;
		text-align: left;
	}

	.empty-tip svg {
		flex-shrink: 0;
		color: var(--color-accent);
	}

	.quick-list {
		width: 100%;
		margin-top: var(--space-5);
		text-align: left;
	}

	.quick-section-label {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		padding: var(--space-3) var(--space-1) var(--space-1);
	}

	.quick-section-label.favorites {
		color: var(--color-accent);
	}

	.quick-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		background: none;
		border: none;
		padding: var(--space-2) var(--space-1);
		border-radius: var(--radius-sm);
		color: var(--color-text);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
	}

	.quick-row:hover,
	.quick-row:focus-visible {
		background: rgba(245, 246, 248, 0.06);
	}

	.quick-row-icon {
		flex-shrink: 0;
		color: var(--color-text-secondary);
	}

	.quick-row-badge {
		flex-shrink: 0;
		min-width: 30px;
		height: 22px;
		padding: 0 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-accent);
		color: var(--color-bg);
		font-weight: 700;
		font-size: 12px;
		border-radius: 6px;
	}

	.quick-row-badge.muted {
		background: rgba(255, 201, 60, 0.15);
		color: var(--color-accent);
	}

	.quick-row-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>