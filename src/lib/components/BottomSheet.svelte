<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = false,
		collapsed = $bindable(false),
		children
	}: { open?: boolean; collapsed?: boolean; children?: Snippet } = $props();
</script>

<div class="sheet" class:open class:collapsed>
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
		z-index: 15;
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

	/* Pantallas anchas (desktop/tablet apaisada): panel fijo a la
	   izquierda en vez de bandeja deslizable desde abajo. El botón que lo
	   colapsa vive en +page.svelte, alineado con el buscador. */
	@media (min-width: 900px) {
		.sheet {
			position: fixed;
			top: 0;
			left: 0;
			right: auto;
			bottom: 0;
			width: 380px;
			height: 100dvh;
			max-height: none;
			border-radius: 0;
			border-top: none;
			border-right: 1px solid var(--color-border);
			box-shadow: 4px 0 32px rgba(0, 0, 0, 0.35);
			padding: var(--space-6) var(--space-5);
			transform: translateX(0);
			transition: transform 0.22s ease;
		}

		.sheet.collapsed {
			transform: translateX(-100%);
		}

		.handle {
			display: none;
		}
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