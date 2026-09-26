<script lang="ts">
	import { DAY_LETTERS, type Routine } from '$lib/routines';

	let {
		routines = [],
		onPlan,
		onDelete
	}: {
		routines?: Routine[];
		onPlan?: (routine: Routine) => void;
		onDelete?: (routine: Routine) => void;
	} = $props();
</script>

{#if routines.length > 0}
	<div class="routines">
		<div class="section-label">Tus rutinas</div>
		{#each routines as routine (routine.id)}
			<div class="routine-card">
				<button class="routine-main" onclick={() => onPlan?.(routine)}>
					<span class="routine-name">{routine.name}</span>
					<span class="routine-meta">
						<span class="routine-days">
							{#each DAY_LETTERS as letter, day (day)}
								<span class="day" class:on={routine.days.includes(day)}>{letter}</span>
							{/each}
						</span>
						<span class="routine-time tabular-nums">{routine.time}</span>
						{#if routine.line}
							<span class="routine-line">{routine.line}</span>
						{/if}
					</span>
				</button>
				<button
					class="routine-delete"
					onclick={() => onDelete?.(routine)}
					aria-label="Eliminar rutina {routine.name}"
					title="Eliminar rutina"
				>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.routines {
		margin-bottom: var(--space-4);
	}

	.section-label {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		margin: 0 2px var(--space-2);
	}

	.routine-card {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-2) var(--space-3);
		margin-bottom: var(--space-2);
	}

	.routine-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: none;
		border: none;
		padding: var(--space-1) 0;
		font-family: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.routine-name {
		font-size: 15px;
		font-weight: 700;
	}

	.routine-meta {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.routine-days {
		display: flex;
		gap: 4px;
	}

	.day {
		width: 22px;
		height: 22px;
		border-radius: 7px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 700;
		color: var(--color-muted);
		background: rgba(245, 246, 248, 0.05);
	}

	.day.on {
		background: rgba(255, 201, 60, 0.14);
		color: var(--color-accent);
	}

	.routine-time {
		font-size: 13px;
		font-weight: 700;
	}

	.routine-line {
		font-size: 12px;
		font-weight: 700;
		color: var(--color-text-secondary);
	}

	.routine-delete {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.routine-delete:hover {
		background: rgba(245, 246, 248, 0.08);
		color: var(--color-text);
	}
</style>
