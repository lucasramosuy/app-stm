const lastReported = new Map<string, number>();
const COOLDOWN_MS = 60_000; // como mucho 1 reporte por fuente por minuto

export function shouldReport(source: string): boolean {
	const now = Date.now();
	const last = lastReported.get(source) ?? 0;
	if (now - last < COOLDOWN_MS) return false;
	lastReported.set(source, now);
	return true;
}