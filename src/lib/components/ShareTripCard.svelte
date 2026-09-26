<script lang="ts">
	let {
		url,
		onClose
	}: {
		url: string;
		onClose?: () => void;
	} = $props();

	let copied = $state(false);

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 2_500);
		} catch (e) {
			console.warn('[compartir] no se pudo copiar el link', e);
		}
	}

	async function share() {
		if (typeof navigator !== 'undefined' && navigator.share) {
			try {
				await navigator.share({ title: 'Mi viaje en ómnibus', url });
				return;
			} catch (e) {
				// cancelado por el usuario o no disponible: cae a copiar
				if ((e as Error).name === 'AbortError') return;
			}
		}
		copyLink();
	}
</script>

<div class="share-card">
	<div class="share-title">Compartir llegada en vivo</div>
	<p class="share-sub">Quien abra el link ve la posición y el ETA en tiempo real durante 1 hora.</p>

	<div class="link-row">
		<span class="link-pill">{url.replace(/^https?:\/\//, '')}</span>
		<button class="copy-btn" onclick={copyLink} aria-label="Copiar link">
			{#if copied}
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-live)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="20 6 9 17 4 12" />
				</svg>
			{:else}
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect width="14" height="14" x="8" y="8" rx="2" />
					<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
				</svg>
			{/if}
		</button>
	</div>

	<div class="share-actions">
		<button class="btn ghost" onclick={() => onClose?.()}>Cerrar</button>
		<button class="btn primary" onclick={share}>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
				<polyline points="16 6 12 2 8 6" />
				<line x1="12" x2="12" y1="2" y2="15" />
			</svg>
			{copied ? 'Link copiado' : 'Compartir viaje'}
		</button>
	</div>
</div>

<style>
	.share-card {
		background: var(--color-surface-raised);
		border: 1px solid rgba(94, 234, 212, 0.35);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		margin-top: var(--space-3);
	}

	.share-title {
		font-size: 15px;
		font-weight: 700;
	}

	.share-sub {
		font-size: 12.5px;
		color: var(--color-text-secondary);
		margin: 4px 0 var(--space-3);
	}

	.link-row {
		display: flex;
		gap: var(--space-2);
		align-items: center;
	}

	.link-pill {
		flex: 1;
		min-width: 0;
		height: 42px;
		display: flex;
		align-items: center;
		padding: 0 var(--space-3);
		border-radius: var(--radius-sm);
		background: rgba(245, 246, 248, 0.05);
		border: 1px solid var(--color-border);
		font-size: 12.5px;
		color: var(--color-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.copy-btn {
		flex-shrink: 0;
		width: 42px;
		height: 42px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border-strong);
		background: rgba(245, 246, 248, 0.05);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.share-actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}

	.btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 44px;
		border-radius: var(--radius-md);
		font-family: inherit;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
		border: none;
	}

	.btn.primary {
		background: var(--color-accent);
		color: #0b1220;
	}

	.btn.ghost {
		background: rgba(245, 246, 248, 0.05);
		border: 1px solid var(--color-border-strong);
		color: var(--color-text);
	}
</style>
