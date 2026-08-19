<script lang="ts">
	import { onMount } from 'svelte';
	import * as Sentry from '@sentry/sveltekit';

	let buttonEl: HTMLButtonElement | undefined = $state();

	onMount(() => {
		if (!buttonEl) return;
		const feedback = Sentry.getFeedback();
		if (!feedback) return;

		// attachTo conecta el click de ESTE botón con el formulario de
		// Sentry, sin mostrar el widget flotante default (ver autoInject:
		// false en hooks.client.ts). Devuelve una función de limpieza.
		return feedback.attachTo(buttonEl, {
			formTitle: 'Reportar un problema o sugerencia'
		});
	});
</script>

<button bind:this={buttonEl} class="feedback-btn" type="button">
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
	</svg>
	Reportar un problema
</button>

<style>
	.feedback-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		width: 100%;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		font-size: 12px;
		font-weight: 600;
		padding: var(--space-2) var(--space-3);
		cursor: pointer;
		transition:
			color 0.15s ease,
			border-color 0.15s ease;
	}

	.feedback-btn:hover {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}
</style>