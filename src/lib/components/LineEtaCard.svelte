<script lang="ts">
	let {
		line,
		destination,
		etaMinutes,
		live = true
	}: {
		line: string;
		destination: string;
		etaMinutes: number;
		live?: boolean;
	} = $props();
</script>

<div class="card">
	<div class="line-badge">{line}</div>
	<div class="info">
		<span class="destination">→ {destination}</span>
		<span class="eta">
			{#if live}
				<span class="live-dot"></span>
			{/if}
			<span class="tabular-nums">{etaMinutes} min</span>
		</span>
	</div>
</div>

<style>
	.card {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.card:last-child {
		border-bottom: none;
	}

	.line-badge {
		flex-shrink: 0;
		min-width: 48px;
		height: 40px;
		padding: 0 var(--space-2);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-accent);
		color: var(--color-bg);
		font-weight: 700;
		font-size: 16px;
		border-radius: var(--radius-sm);
	}

	.info {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-width: 0;
	}

	.destination {
		color: var(--color-text-secondary);
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.eta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 700;
		font-size: 15px;
		flex-shrink: 0;
		margin-left: var(--space-3);
	}

	.live-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--color-live);
		box-shadow: 0 0 0 0 rgba(94, 234, 212, 0.5);
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0% {
			box-shadow: 0 0 0 0 rgba(94, 234, 212, 0.5);
		}
		70% {
			box-shadow: 0 0 0 6px rgba(94, 234, 212, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(94, 234, 212, 0);
		}
	}
</style>
