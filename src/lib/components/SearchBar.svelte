<script lang="ts">
	let { value = $bindable(''), onSearch }: { value?: string; onSearch?: (q: string) => void } =
		$props();

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		onSearch?.(value);
	}
</script>

<form class="search-bar" onsubmit={handleSubmit}>
	<svg
		class="icon"
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
	>
		<circle cx="11" cy="11" r="7" />
		<line x1="21" y1="21" x2="16.65" y2="16.65" />
	</svg>
	<input
		type="text"
		placeholder="Buscar línea o dirección"
		bind:value
		aria-label="Buscar línea o dirección"
	/>
</form>

<style>
	.search-bar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		background: rgba(19, 27, 46, 0.8);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--space-3) var(--space-4);
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
	}

	.icon {
		flex-shrink: 0;
		color: var(--color-text-secondary);
	}

	input {
		flex: 1;
		background: transparent;
		border: none;
		color: var(--color-text);
		font-size: 15px;
		font-weight: 500;
	}

	input::placeholder {
		color: var(--color-text-secondary);
	}

	input:focus {
		outline: none;
	}
</style>
