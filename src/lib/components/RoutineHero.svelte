<script lang="ts">
	import { nextOccurrence, type Routine } from '$lib/routines';

	let {
		routine,
		nowTick = Date.now(),
		onPlan
	}: {
		routine: Routine;
		nowTick?: number;
		onPlan?: (routine: Routine) => void;
	} = $props();

	const occurrence = $derived(nextOccurrence(routine, new Date(nowTick)));
	const minutesLeft = $derived(occurrence ? Math.round((occurrence.getTime() - nowTick) / 60_000) : null);
	// "Salí en X min" solo cuando falta poco (1h30 antes → 15 min
	// después); si no, se muestra la hora de la próxima ocurrencia.
	const isSoon = $derived(minutesLeft !== null && minutesLeft <= 90 && minutesLeft >= -15);
	const occasionLabel = $derived.by(() => {
		if (!occurrence) return '';
		const now = new Date(nowTick);
		const isToday = occurrence.toDateString() === now.toDateString();
		const tomorrow = new Date(now);
		tomorrow.setDate(now.getDate() + 1);
		const isTomorrow = occurrence.toDateString() === tomorrow.toDateString();
		const day = isToday
			? 'hoy'
			: isTomorrow
				? 'mañana'
				: occurrence.toLocaleDateString('es-UY', { weekday: 'long' });
		return `${day} ${routine.time}`;
	});
</script>

<button class="hero-card" onclick={() => onPlan?.(routine)}>
	<div class="hero-main">
		<div class="hero-text">
			<span class="hero-name">{routine.name}</span>
			<span class="hero-sub">
				{#if routine.line}{routine.line} · {/if}{routine.originLabel} → {routine.destLabel}
			</span>
		</div>
		<div class="hero-countdown">
			{#if isSoon && minutesLeft !== null}
				<span class="hero-kicker">{minutesLeft <= 0 ? 'Es hora' : 'Salí en'}</span>
				{#if minutesLeft > 0}
					<span class="hero-minutes tabular-nums">{minutesLeft}<span class="hero-unit"> min</span></span>
				{/if}
			{:else}
				<span class="hero-kicker">Próxima</span>
				<span class="hero-when">{occasionLabel}</span>
			{/if}
		</div>
	</div>
</button>

<style>
	.hero-card {
		display: block;
		width: 100%;
		text-align: left;
		font-family: inherit;
		color: inherit;
		cursor: pointer;
		background:
			linear-gradient(180deg, rgba(255, 201, 60, 0.07), rgba(255, 201, 60, 0.02)),
			var(--color-surface-raised);
		border: 1px solid rgba(255, 201, 60, 0.3);
		border-radius: var(--radius-md);
		padding: var(--space-3) var(--space-4);
		margin-bottom: var(--space-3);
		transition: border-color 0.15s ease;
	}

	.hero-card:hover,
	.hero-card:focus-visible {
		border-color: rgba(255, 201, 60, 0.55);
	}

	.hero-main {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.hero-text {
		min-width: 0;
	}

	.hero-name {
		display: block;
		font-size: 16px;
		font-weight: 700;
	}

	.hero-sub {
		display: block;
		font-size: 12.5px;
		color: var(--color-text-secondary);
		margin-top: 3px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.hero-countdown {
		flex-shrink: 0;
		text-align: right;
	}

	.hero-kicker {
		display: block;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-secondary);
	}

	.hero-minutes {
		display: block;
		font-size: 30px;
		font-weight: 800;
		line-height: 1.05;
		color: var(--color-accent);
	}

	.hero-unit {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-secondary);
	}

	.hero-when {
		display: block;
		font-size: 14px;
		font-weight: 700;
		color: var(--color-accent);
		margin-top: 2px;
	}
</style>
