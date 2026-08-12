<script lang="ts">
	import { page } from '$app/state';

	const status = $derived(page.status);
	const isNotFound = $derived(status === 404);

	const title = $derived(isNotFound ? 'Esta parada no existe' : 'Algo se descarriló');
	const message = $derived(
		isNotFound
			? 'La ruta que buscás no está en este recorrido. Revisá la dirección o volvé al mapa.'
			: page.error?.message || 'Ocurrió un error inesperado. Probá de nuevo en un momento.'
	);
</script>

<svelte:head>
	<title>{isNotFound ? 'Página no encontrada' : 'Error'} · Buses Montevideo</title>
</svelte:head>

<main class="error-page">
	<div class="error-content">
		<svg
			class="error-icon"
			width="56"
			height="56"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M12 21s-7-6.5-7-11.5A7 7 0 0 1 19 9.5C19 14.5 12 21 12 21Z" />
			<line x1="9.5" y1="7.5" x2="14.5" y2="11.5" />
			<line x1="14.5" y1="7.5" x2="9.5" y2="11.5" />
		</svg>

		<span class="error-code tabular-nums">{status}</span>
		<h1 class="error-title">{title}</h1>
		<p class="error-message">{message}</p>

		<a href="/" class="error-cta">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M3 11l9-8 9 8" />
				<path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
			</svg>
			Volver al mapa
		</a>
	</div>
</main>

<style>
	.error-page {
		width: 100%;
		height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
		padding: var(--space-5);
	}

	.error-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		max-width: 360px;
	}

	.error-icon {
		color: var(--color-muted);
		margin-bottom: var(--space-4);
	}

	.error-code {
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: var(--color-accent);
		margin-bottom: var(--space-2);
	}

	.error-title {
		font-size: 22px;
		font-weight: 700;
		color: var(--color-text);
		margin: 0 0 var(--space-2);
	}

	.error-message {
		font-size: 14px;
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0 0 var(--space-6);
	}

	.error-cta {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		background: var(--color-accent);
		color: var(--color-bg);
		font-weight: 700;
		font-size: 14px;
		padding: var(--space-3) var(--space-5);
		border-radius: var(--radius-md);
		text-decoration: none;
		transition: transform 0.15s ease;
	}

	.error-cta:hover {
		transform: translateY(-1px);
	}

	.error-cta:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 3px;
	}
</style>