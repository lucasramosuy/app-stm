<script lang="ts">
	import { untrack } from 'svelte';
	import { DAY_LETTERS } from '$lib/routines';

	let {
		originLabel,
		destLabel,
		onSave,
		onCancel
	}: {
		originLabel: string;
		destLabel: string;
		onSave?: (payload: { name: string; days: number[]; time: string }) => void;
		onCancel?: () => void;
	} = $props();

	function shortLabel(label: string): string {
		return label.length > 18 ? `${label.slice(0, 17)}…` : label;
	}

	// Captura intencional del valor inicial: es el nombre por defecto
	// que el usuario puede editar antes de guardar.
	let name = $state(untrack(() => `${shortLabel(originLabel)} → ${shortLabel(destLabel)}`));
	let days = $state<number[]>([1, 2, 3, 4, 5]);
	let time = $state('08:00');
	let error = $state<string | null>(null);

	function toggleDay(day: number) {
		days = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
	}

	function save() {
		if (days.length === 0) {
			error = 'Elegí al menos un día.';
			return;
		}
		if (!/^\d{2}:\d{2}$/.test(time)) {
			error = 'La hora no es válida.';
			return;
		}
		error = null;
		onSave?.({ name: name.trim() || `${shortLabel(originLabel)} → ${shortLabel(destLabel)}`, days, time });
	}
</script>

<div class="save-routine">
	<div class="save-title">Guardar como rutina</div>
	<p class="save-sub">Te avisa en el inicio cuánto falta para salir, los días que elijas.</p>

	<label class="field-label" for="routine-name">Nombre</label>
	<input id="routine-name" class="text-input" type="text" bind:value={name} maxlength={60} />

	<span class="field-label">Días</span>
	<div class="days-row">
		{#each DAY_LETTERS as letter, day (day)}
			<button
				class="day"
				class:on={days.includes(day)}
				onclick={() => toggleDay(day)}
				aria-pressed={days.includes(day)}
			>
				{letter}
			</button>
		{/each}
	</div>

	<label class="field-label" for="routine-time">Hora de salida</label>
	<input id="routine-time" class="text-input time-input" type="time" bind:value={time} />

	{#if error}
		<p class="save-error">{error}</p>
	{/if}

	<div class="save-actions">
		<button class="btn ghost" onclick={() => onCancel?.()}>Cancelar</button>
		<button class="btn primary" onclick={save}>Guardar rutina</button>
	</div>
</div>

<style>
	.save-routine {
		background: var(--color-surface-raised);
		border: 1px solid rgba(255, 201, 60, 0.3);
		border-radius: var(--radius-md);
		padding: var(--space-4);
		margin-top: var(--space-3);
	}

	.save-title {
		font-size: 15px;
		font-weight: 700;
	}

	.save-sub {
		font-size: 12.5px;
		color: var(--color-text-secondary);
		margin: 4px 0 var(--space-3);
	}

	.field-label {
		display: block;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-secondary);
		margin: var(--space-3) 0 6px;
	}

	.text-input {
		width: 100%;
		height: 42px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--color-border-strong);
		background: rgba(245, 246, 248, 0.05);
		color: var(--color-text);
		font-family: inherit;
		font-size: 14px;
		padding: 0 var(--space-3);
	}

	.text-input:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 1px;
	}

	.time-input {
		width: 130px;
		font-variant-numeric: tabular-nums;
	}

	.days-row {
		display: flex;
		gap: 6px;
	}

	.day {
		width: 34px;
		height: 34px;
		border-radius: 9px;
		border: 1px solid var(--color-border);
		background: rgba(245, 246, 248, 0.05);
		color: var(--color-muted);
		font-family: inherit;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
	}

	.day.on {
		background: rgba(255, 201, 60, 0.14);
		border-color: rgba(255, 201, 60, 0.4);
		color: var(--color-accent);
	}

	.save-error {
		font-size: 12.5px;
		color: #f87171;
		margin: var(--space-2) 0 0;
	}

	.save-actions {
		display: flex;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}

	.btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
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
