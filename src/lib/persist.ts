/**
 * Persistencia en localStorage con degradación silenciosa: si el
 * storage no está disponible (modo privado, cuota, JSON corrupto), se
 * avisa por consola y se sigue con el fallback — nunca se rompe la app
 * por una preferencia.
 */

export function loadJson<T>(key: string, fallback: T, warnTag: string): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch (e) {
		console.warn(warnTag, e);
		return fallback;
	}
}

export function saveJson(key: string, value: unknown, warnTag: string): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch (e) {
		console.warn(warnTag, e);
	}
}

export function loadFlag(key: string, warnTag: string): boolean {
	try {
		return localStorage.getItem(key) === '1';
	} catch (e) {
		console.warn(warnTag, e);
		return false;
	}
}

export function saveFlag(key: string, value: boolean, warnTag: string): void {
	try {
		localStorage.setItem(key, value ? '1' : '0');
	} catch (e) {
		console.warn(warnTag, e);
	}
}
