// Rutinas de viaje: origen/destino/días/hora guardados en el dispositivo
// (localStorage, igual que recientes y favoritas). Sin backend, sin
// costo. La pantalla principal las usa para mostrar "Tu próxima
// salida" y el planner para guardar un viaje como rutina.

export interface Routine {
	id: string;
	name: string; // ej "Casa → CFE"
	originLabel: string;
	origin: [number, number]; // [lng, lat]
	destLabel: string;
	dest: [number, number];
	days: number[]; // 0=domingo ... 6=sábado
	time: string; // "HH:MM" — hora a la que sale
	line?: string | null; // línea principal, si se conoce al guardar
	createdAt: number;
}

const ROUTINES_KEY = 'app_stm_routines';

export function loadRoutines(): Routine[] {
	try {
		const raw = localStorage.getItem(ROUTINES_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(r): r is Routine =>
				r &&
				typeof r.id === 'string' &&
				typeof r.name === 'string' &&
				Array.isArray(r.origin) &&
				Array.isArray(r.dest) &&
				Array.isArray(r.days) &&
				typeof r.time === 'string'
		);
	} catch (e) {
		console.warn('[rutinas] no se pudieron leer', e);
		return [];
	}
}

export function saveRoutines(list: Routine[]) {
	try {
		localStorage.setItem(ROUTINES_KEY, JSON.stringify(list));
	} catch (e) {
		console.warn('[rutinas] no se pudieron guardar', e);
	}
}

export function makeRoutineId(): string {
	return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Próxima ocurrencia de la rutina a partir de `now`: hoy si todavía
 * no pasó la hora (con un margen de gracia), si no el próximo día
 * habilitado dentro de los siguientes 7 días. null si no tiene días. */
export function nextOccurrence(r: Routine, now: Date = new Date()): Date | null {
	if (r.days.length === 0) return null;
	const [hh, mm] = r.time.split(':').map(Number);
	if (Number.isNaN(hh) || Number.isNaN(mm)) return null;

	for (let offset = 0; offset < 8; offset++) {
		const candidate = new Date(now);
		candidate.setDate(now.getDate() + offset);
		candidate.setHours(hh, mm, 0, 0);
		if (!r.days.includes(candidate.getDay())) continue;
		// El día de hoy cuenta hasta 15 min después de la hora: si se
		// le pasó por un rato, el countdown sigue teniendo sentido.
		if (offset === 0 && candidate.getTime() < now.getTime() - 15 * 60_000) continue;
		return candidate;
	}
	return null;
}

/** La rutina con la ocurrencia más próxima, para el hero del home. */
export function nextRoutine(routines: Routine[], now: Date = new Date()): Routine | null {
	let best: Routine | null = null;
	let bestTime = Infinity;
	for (const r of routines) {
		const occ = nextOccurrence(r, now);
		if (!occ) continue;
		if (occ.getTime() < bestTime) {
			bestTime = occ.getTime();
			best = r;
		}
	}
	return best;
}

export const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
