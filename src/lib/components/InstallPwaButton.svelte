<!-- src/lib/components/InstallPwaButton.svelte -->
<script lang="ts">
	interface BeforeInstallPromptEvent extends Event {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let installed = $state(false);

	$effect(() => {
		if (typeof window === 'undefined') return;

		// Chrome/Edge/Android disparan este evento cuando el navegador
		// decide que la app CALIFICA para instalación (manifest válido +
		// service worker registrado + criterios de engagement). Safari
		// no lo implementa — ahí el botón simplemente nunca aparece, no
		// hay forma estándar de ofrecer instalación programática en iOS.
		const handleBeforeInstall = (e: Event) => {
			e.preventDefault();
			deferredPrompt = e as BeforeInstallPromptEvent;
		};
		const handleInstalled = () => {
			installed = true;
			deferredPrompt = null;
		};

		window.addEventListener('beforeinstallprompt', handleBeforeInstall);
		window.addEventListener('appinstalled', handleInstalled);
		return () => {
			window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
			window.removeEventListener('appinstalled', handleInstalled);
		};
	});

	async function handleInstall() {
		if (!deferredPrompt) return;
		await deferredPrompt.prompt();
		await deferredPrompt.userChoice;
		deferredPrompt = null;
	}
</script>

{#if deferredPrompt && !installed}
	<button class="install-btn" onclick={handleInstall}>
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
			<polyline points="7 10 12 15 17 10" />
			<line x1="12" y1="15" x2="12" y2="3" />
		</svg>
		Instalar app
	</button>
{/if}

<style>
	.install-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: var(--color-accent);
		color: var(--color-bg);
		font-weight: 700;
		font-size: 12px;
		padding: var(--space-2) var(--space-3);
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.install-btn:hover {
		transform: translateY(-1px);
	}
</style>