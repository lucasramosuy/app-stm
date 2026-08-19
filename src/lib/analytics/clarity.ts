// Inyecta el script de Microsoft Clarity de forma perezosa. No se carga
// hasta que el usuario haya visto el aviso de privacidad (ver
// +page.svelte) — no queremos grabar sesión antes de informar qué se
// recolecta.
let injected = false;

export function initClarity(projectId: string | undefined) {
	if (injected) return;
	if (typeof window === 'undefined') return;
	if (!projectId) {
		console.warn('[clarity] falta PUBLIC_CLARITY_ID, no se inicializa');
		return;
	}
	injected = true;

	(function (c: typeof window, l: Document, a: string, r: string, i: string) {
		type ClarityFn = { (...args: unknown[]): void; q?: unknown[] };
		const w = c as unknown as Record<string, ClarityFn>;
		w[a] =
			w[a] ||
			function (...args: unknown[]) {
				(w[a].q = w[a].q || []).push(args);
			};
		const t = l.createElement(r) as HTMLScriptElement;
		t.async = true;
		t.src = 'https://www.clarity.ms/tag/' + i;
		const y = l.getElementsByTagName(r)[0];
		y.parentNode?.insertBefore(t, y);
	})(window, document, 'clarity', 'script', projectId);
}