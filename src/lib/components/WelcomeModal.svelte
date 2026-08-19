<script lang="ts">
	let { onClose }: { onClose?: () => void } = $props();

	let dialogEl: HTMLDivElement | undefined = $state();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose?.();
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose?.();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="backdrop" onclick={handleBackdropClick}>
	<div
		class="dialog"
		bind:this={dialogEl}
		role="dialog"
		aria-modal="true"
		aria-labelledby="welcome-title"
	>
		<button class="close-btn" onclick={() => onClose?.()} aria-label="Cerrar">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>

		<svg class="dialog-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
			<rect x="3" y="8" width="18" height="10" rx="2.5" />
			<circle cx="7.5" cy="18" r="1.8" fill="var(--color-accent)" stroke="none" />
			<circle cx="16.5" cy="18" r="1.8" fill="var(--color-accent)" stroke="none" />
			<path d="M5 8V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" />
			<line x1="7" y1="12" x2="17" y2="12" />
		</svg>

		<h2 id="welcome-title" class="dialog-title">Buses Montevideo</h2>
		<p class="dialog-subtitle">Ómnibus en tiempo real, sin vueltas.</p>

		<ul class="tip-list">
			<li>
				<span class="tip-dot"></span>
				Tocá una parada o un ómnibus en el mapa para ver sus ETAs en vivo.
			</li>
			<li>
				<span class="tip-dot"></span>
				Buscá por línea o dirección con la barra de arriba.
			</li>
			<li>
				<span class="tip-dot"></span>
				Guardá tus paradas y líneas frecuentes tocando la estrella.
			</li>
		</ul>

		<button class="start-btn" onclick={() => onClose?.()}>Entendido</button>

		<p class="privacy-note">
			Usamos datos de uso para mejorar la app.
			<a href="/privacidad">Más información</a>
		</p>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(11, 18, 32, 0.72);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		padding: var(--space-5);
		animation: fade-in 0.18s ease;
	}

	.dialog {
		position: relative;
		width: 100%;
		max-width: 360px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
		padding: var(--space-6) var(--space-5) var(--space-5);
		text-align: center;
		animation: pop-in 0.22s cubic-bezier(0.32, 0.72, 0, 1);
	}

	.close-btn {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
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

	.dialog-icon {
		margin-bottom: var(--space-3);
	}

	.dialog-title {
		font-size: 19px;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 4px;
	}

	.dialog-subtitle {
		font-size: 13px;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-5);
	}

	.tip-list {
		list-style: none;
		margin: 0 0 var(--space-6);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		text-align: left;
	}

	.tip-list li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		font-size: 13px;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.tip-dot {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		margin-top: 6px;
		border-radius: 50%;
		background: var(--color-accent);
	}

	.start-btn {
		width: 100%;
		background: var(--color-accent);
		color: var(--color-bg);
		font-weight: 700;
		font-size: 14px;
		padding: var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.start-btn:hover {
		transform: translateY(-1px);
	}

	.start-btn:focus-visible {
		outline: 2px solid var(--color-live);
		outline-offset: 2px;
	}

	.privacy-note {
		margin: var(--space-3) 0 0;
		font-size: 11px;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.privacy-note a {
		color: var(--color-live);
		text-decoration: underline;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes pop-in {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(6px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}
</style>