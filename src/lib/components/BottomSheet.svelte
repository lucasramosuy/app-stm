<script lang="ts">
	import type { Snippet } from 'svelte';

	const DESKTOP_MQ = '(min-width: 900px)';
	const PEEK_HEIGHT = 56;
	// Umbral en px para distinguir un drag real de un tap/click. Sin esto,
	// el evento "click" del navegador (que se dispara DESPUÉS de pointerup,
	// cuando dragging ya volvió a false) revertía el estado que el drag
	// recién había fijado.
	const DRAG_THRESHOLD_PX = 6;

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
	// Se marca en pointerup si hubo desplazamiento real por encima del
	// umbral. El onclick posterior lo consulta y se auto-descarta una vez
	// usado, para no interferir con un tap genuino inmediatamente después.
	let wasDragged = false;
	/** En móvil: expandido (0) o peek (solo asa). Arranca en peek: sin
	 * selección todavía no hay motivo para ocupar la pantalla. Se
	 * expande solo automáticamente cuando llega una selección nueva (ver
	 * el $effect de abajo), o manualmente si el usuario arrastra. */
	let mobileExpanded = $state(false);
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

	// mobileExpanded es la ÚNICA fuente de verdad de la posición en
	// reposo. `open` NO debe forzar el offset acá — si lo hace, cualquier
	// drag manual del usuario queda pisado apenas suelta el dedo, porque
	// open sigue en false mientras no haya selección (ver bug: el sheet
	// "volvía abajo solo" al soltar, sin importar cuánto se hubiera
	// arrastrado). El único lugar donde `open` debe influir es el
	// $effect de abajo, que dispara la expansión automática al aparecer
	// una selección nueva.
	function visualOffset(): number {
		return mobileExpanded ? 0 : peekOffset();
	}

	// Única fuente deverdad para lo que se pinta en pantalla en mobile:
	// se calcula acá (no en un `style:transform={...}` declarativo) porque
	// necesitamos poder escribirlo de forma síncrona en pointerdown, ANTES
	// de que llegue el primer pointermove — si no, hay un instante sin
	// transform aplicado donde el sheet "salta" a su posición natural
	// (totalmente expandida, por el position:absolute + bottom:0).
	function currentMobileTransform(): string {
		if (dragging) return `translateY(${dragOffset}px)`;
		return `translateY(${visualOffset()}px)`;
	}

	function applyMobileTransform() {
		if (!sheetEl || isDesktop) return;
		sheetEl.style.transform = currentMobileTransform();
	}

	// Reescribe el transform imperativamente cada vez que cambia algo que
	// lo afecta en reposo (abrir/cerrar, expandir/colapsar, pasar a
	// desktop). Durante el drag, quien escribe es onPointerMove
	// directamente — este effect solo corre por los cambios de estado
	// "de reposo", no en cada frame de arrastre.
	$effect(() => {
		open;
		mobileExpanded;
		isDesktop;
		applyMobileTransform();
	});

	function onPointerDown(e: PointerEvent) {
		if (isDesktop) return;
		const target = e.target as HTMLElement;
		if (!target.closest('.drag-zone')) return;
		pointerId = e.pointerId;
		dragStartY = e.clientY;
		dragStartOffset = visualOffset();
		dragOffset = dragStartOffset;
		dragging = true;
		// Escribe el transform ACÁ, de forma síncrona, antes de que pase
		// nada más — así nunca hay un frame sin transform aplicado entre
		// tocar la pantalla y el primer pointermove real.
		applyMobileTransform();
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
		// Escritura directa al DOM: evita el paso de scheduling de Svelte
		// en el camino caliente del drag (mismo criterio que las capas
		// nativas de MapLibre vs. Marker HTML en BusMap.svelte).
		if (sheetEl) sheetEl.style.transform = `translateY(${dragOffset}px)`;
	}
	function onPointerUp(e: PointerEvent) {
		if (!dragging || e.pointerId !== pointerId) return;
		dragging = false;
		pointerId = null;
		wasDragged = Math.abs(dragOffset - dragStartOffset) > DRAG_THRESHOLD_PX;
		const threshold = peekOffset() * 0.45;
		mobileExpanded = dragOffset < threshold;
		dragOffset = 0;
		// El $effect de arriba también va a correr por el cambio de
		// mobileExpanded, pero lo llamamos ya acá para que la transición
		// CSS (restaurada al sacar la clase .dragging) arranque en el
		// mismo frame del release, sin esperar el flush de Svelte.
		applyMobileTransform();
	}
	function toggleMobileExpand() {
		if (isDesktop) return;
		mobileExpanded = !mobileExpanded;
	}
</script>

<svelte:window onresize={measureSheet} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="sheet"
	class:open
	class:collapsed
	class:dragging
	bind:this={sheetEl}
>
	<button
		type="button"
		class="drag-zone handle-btn"
		aria-label={mobileExpanded ? 'Contraer panel' : 'Expandir panel'}
		onpointerdown={onPointerDown}
		onclick={(e) => {
			// Si el pointerup previo vino de un drag real, este click es
			// un artefacto del navegador (se dispara después de pointerup) y
			// no debe volver a togglear el estado. Se consume una sola vez.
			if (wasDragged) {
				wasDragged = false;
				e.stopPropagation();
				return;
			}
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
		will-change: transform;
	}
	.sheet.dragging .content {
		pointer-events: none;
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
			border-right: 1px solid var(--color-border-strong);
			box-shadow: var(--shadow-sidebar);
			padding: var(--space-2) var(--space-5) var(--space-6);
			transform: translateX(0) !important;
			transition: transform 0.24s cubic-bezier(0.32, 0.72, 0, 1);
			touch-action: auto;
			overflow-y: auto;
		}

		.sheet.collapsed {
			transform: translateX(-100%) !important;
		}

		/* Dos clases (más específico que .drag-zone solo) para que esta
		   regla gane siempre, sin depender de en qué orden aparezcan en
		   el archivo — así no se repite el bug de la vez pasada, donde
		   el botón quedaba visible en desktop por un empate de
		   especificidad resuelto por orden de aparición. */
		.drag-zone.handle-btn {
			display: none;
		}
	}

	/* Reset del <button> nativo: sin esto, en mobile (fuera de la media
	   query de desktop) el navegador le aplicaba su estilo por default
	   (fondo gris, borde), que es lo que se veía en el bottom sheet. */
	.drag-zone {
		display: flex;
		flex-shrink: 0;
		justify-content: center;
		width: 100%;
		padding: var(--space-3) 0 var(--space-2);
		margin: 0;
		border: none;
		background: transparent;
		cursor: grab;
		touch-action: none;
		-webkit-tap-highlight-color: transparent;
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