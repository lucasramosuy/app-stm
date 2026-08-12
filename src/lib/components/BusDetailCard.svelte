<script lang="ts">
	let {
		line,
		destination,
		origin,
		company,
		speed,
		access,
		thermalConfort,
		emissions,
		etaMinutes = null,
		busId
	}: {
		line: string;
		destination: string;
		origin?: string;
		company?: string;
		speed?: number;
		access?: string;
		thermalConfort?: string;
		emissions?: string;
		etaMinutes?: number | null;
		busId: number;
	} = $props();
</script>

<article class="bus-detail">
	<div class="hero">
		<div class="line-badge">{line}</div>
		<div class="hero-text">
			<p class="route">
				{#if origin}
					<span class="origin">{origin}</span>
					<span class="arrow" aria-hidden="true">→</span>
				{/if}
				<span class="destination">{destination}</span>
			</p>
			<p class="meta">Ómnibus #{busId}{#if company} · {company}{/if}</p>
		</div>
		{#if etaMinutes !== null}
			<div class="eta-block">
				<span class="live-dot" aria-hidden="true"></span>
				<span class="eta tabular-nums">{etaMinutes} min</span>
			</div>
		{/if}
	</div>

	<ul class="facts">
		{#if speed !== undefined && speed > 0}
			<li><span class="label">Velocidad</span><span class="value tabular-nums">{Math.round(speed)} km/h</span></li>
		{/if}
		{#if access}
			<li><span class="label">Acceso</span><span class="value">{access}</span></li>
		{/if}
		{#if thermalConfort}
			<li><span class="label">Confort</span><span class="value">{thermalConfort}</span></li>
		{/if}
		{#if emissions}
			<li><span class="label">Emisiones</span><span class="value">{emissions}</span></li>
		{/if}
	</ul>
</article>

<style>
	.bus-detail {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.hero {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.line-badge {
		flex-shrink: 0;
		min-width: 52px;
		height: 44px;
		padding: 0 var(--space-2);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-accent);
		color: var(--color-bg);
		font-weight: 800;
		font-size: 17px;
		border-radius: var(--radius-sm);
		box-shadow: 0 2px 12px rgba(255, 201, 60, 0.25);
	}
	.hero-text {
		flex: 1;
		min-width: 0;
	}
	.route {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		line-height: 1.35;
	}
	.origin {
		color: var(--color-text-secondary);
		font-weight: 500;
	}
	.arrow {
		margin: 0 0.35em;
		color: var(--color-muted);
	}
	.destination {
		color: var(--color-text);
	}
	.meta {
		margin: var(--space-1) 0 0;
		font-size: 12px;
		color: var(--color-text-secondary);
	}
	.eta-block {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-1);
		flex-shrink: 0;
	}
	.eta {
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.live-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-live);
		box-shadow: 0 0 0 0 rgba(94, 234, 212, 0.45);
		animation: pulse 2s infinite;
	}
	@keyframes pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(94, 234, 212, 0.45);
		}
		70% {
			box-shadow: 0 0 0 8px rgba(94, 234, 212, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(94, 234, 212, 0);
		}
	}
	.facts {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	.facts li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: rgba(245, 246, 248, 0.03);
		border-radius: var(--radius-sm);
		font-size: 13px;
	}
	.label {
		color: var(--color-text-secondary);
	}
	.value {
		color: var(--color-text);
		font-weight: 600;
		text-align: right;
	}
</style>