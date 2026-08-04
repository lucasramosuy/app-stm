<script lang="ts">
	import type { Snippet } from 'svelte';

	const DESKTOP_MQ = '(min-width: 900px)';
	const PEEK_HEIGHT = 56;

	let {
		open = false,
		collapsed = $bindable(false),
		children
	}: { open?: boolean; collapsed?: boolean; children?: Snippet } = $props();

	let sheetEl: HTMLDivElement | undefined = $state();
	let isDesktop = $state(false);
	let dragOffset = $state(0);
	let dragging = $state(false);
	let sheetHeight = $state(0);

	let pointerId: number | null = null;
	let dragStartY = 0;
	let dragStartOffset = 0;

	/** En móvil: expandido (0) o peek (solo asa). */
	let mobileExpanded = $state(true);

	$effect(() => {
		if (open) mobileExpanded = true;
	});

	$effect(() => {
		open;
		queueMicrotask(measureSheet);
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia(DESKTOP_MQ);
		const sync = () => {
			isDesktop = mq.matches;
		};
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	function measureSheet() {
		if (sheetEl) sheetHeight = sheetEl.offsetHeight;
	}

	function peekOffset() {
		return Math.max(0, sheetHeight - PEEK_HEIGHT);
	}

	function clampOffset(y: number) {
		return Math.max(0, Math.min(peekOffset(), y));
	}

	function onPointerDown(e: PointerEvent) {
		if (isDesktop) return;
		const target = e.target as HTMLElement;
		if (!target.closest('.drag-zone')) return;

		pointerId = e.pointerId;
		dragging = true;
		dragStartY = e.clientY;
		dragStartOffset = mobileExpanded ? 0 : peekOffset();
		dragOffset = dragStartOffset;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		window.addEventListener('pointermove', onWindowPointerMove);
		window.addEventListener('pointerup', onWindowPointerUp);
		window.addEventListener('pointercancel', onWindowPointerUp);
		e.preventDefault();
	}

	function onWindowPointerMove(e: PointerEvent) {
		onPointerMove(e);
	}

	function onWindowPointerUp(e: PointerEvent) {
		onPointerUp(e);
		window.removeEventListener('pointermove', onWindowPointerMove);
		window.removeEventListener('pointerup', onWindowPointerUp);
		window.removeEventListener('pointercancel', onWindowPointerUp);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		const dy = e.clientY - dragStartY;
		dragOffset = clampOffset(dragStartOffset + dy);
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		dragging = false;
		pointerId = null;
		const threshold = peekOffset() * 0.45;
		mobileExpanded = dragOffset < threshold;
		dragOffset = 0;
	}

	function toggleMobileExpand() {
		if (isDesktop) return;
		mobileExpanded = !mobileExpanded;
	}

	const mobileTransform = $derived.by(() => {
		if (isDesktop) return '';
		if (dragging) return `translateY(${dragOffset}px)`;
		if (!open) return `translateY(calc(100% - ${PEEK_HEIGHT}px))`;
		return mobileExpanded ? 'translateY(0)' : `translateY(calc(100% - ${PEEK_HEIGHT}px))`;
	});
</script>

<svelte:window onresize={measureSheet} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="sheet"
	class:open
	class:collapsed
	class:dragging
	bind:this={sheetEl}
	style:transform={!isDesktop ? mobileTransform : undefined}
>
	<button
		type="button"
		class="drag-zone handle-btn"
		aria-label={mobileExpanded ? 'Contraer panel' : 'Expandir panel'}
		onpointerdown={onPointerDown}
		onclick={(e) => {
			if (dragging) return;
			toggleMobileExpand();
			e.stopPropagation();
		}}
	>
		<span class="handle"></span>
	</button>
	<div class="content">
		{#if children}
			{@render children()}
		{:else}
			<p class="empty">Tocá una parada u ómnibus en el mapa para ver el detalle acá.</p>
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
		border-top: 1px solid var(--color-border-strong);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: var(--shadow-sheet);
		padding: 0 var(--space-5) var(--space-6);
		padding-bottom: calc(var(--space-6) + env(safe-area-inset-bottom, 0));
		transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
		max-height: min(72vh, 640px);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.sheet.dragging {
		transition: none;
	}

	.sheet.dragging .content {
		pointer-events: none;
	}

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
			border-right: 1px solid var(--color-border-strong);
			box-shadow: var(--shadow-sidebar);
			padding: var(--space-6) var(--space-5);
			transform: translateX(0) !important;
			transition: transform 0.24s cubic-bezier(0.32, 0.72, 0, 1);
			touch-action: auto;
			overflow-y: auto;
		}

		.sheet.collapsed {
			transform: translateX(-100%) !important;
		}

		.handle-btn {
			display: none;
		}
	}

	.drag-zone {
		flex-shrink: 0;
		width: 100%;
		padding: var(--space-3) 0 var(--space-2);
		margin: 0;
		border: none;
		background: transparent;
		cursor: grab;
		touch-action: none;
	}

	.drag-zone:active {
		cursor: grabbing;
	}

	.handle {
		display: block;
		width: 40px;
		height: 5px;
		border-radius: 3px;
		background: var(--color-muted);
		margin: 0 auto;
		opacity: 0.85;
	}

	.content {
		flex: 1;
		min-height: 32px;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		padding-top: var(--space-1);
	}

	.empty {
		color: var(--color-text-secondary);
		font-size: 14px;
		text-align: center;
		margin: var(--space-4) 0;
		line-height: 1.5;
	}
</style>
