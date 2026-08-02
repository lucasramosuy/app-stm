<script lang="ts">
	import type { Snippet } from 'svelte';

	let { open = false, children }: { open?: boolean; children?: Snippet } = $props();
</script>

<div class="sheet" class:open>
	<div class="handle"></div>
	<div class="content">
		{#if children}
			{@render children()}
		{:else}
			<p class="empty">Tocá una parada o una línea en el mapa para ver el detalle acá.</p>
		{/if}
	</div>
</div>

<style>
	.sheet {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		background: var(--color-surface);
		border-top: 1px solid var(--color-border);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.35);
		padding: var(--space-2) var(--space-5) var(--space-6);
		transform: translateY(calc(100% - 56px));
		transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
		max-height: 70vh;
		overflow-y: auto;
	}

	.sheet.open {
		transform: translateY(0);
	}

	.handle {
		width: 36px;
		height: 4px;
		border-radius: 2px;
		background: var(--color-muted);
		margin: var(--space-2) auto var(--space-4);
	}

	.content {
		min-height: 32px;
	}

	.empty {
		color: var(--color-text-secondary);
		font-size: 14px;
		text-align: center;
		margin: var(--space-4) 0;
	}
</style>
