// Links de "compartir viaje": la información del viaje viaja codificada
// en la propia URL (sin backend ni base de datos — costo cero). La
// página pública /v/[data] la decodifica y calcula el ETA en vivo
// pegándole a las mismas APIs de STM que ya usa la app.
//
// No es un mecanismo de seguridad: el link es público por diseño y
// expira a la hora (campo `exp`, validado en la página pública).

export interface SharedTrip {
	v: 1;
	line: string; // línea principal del viaje (primer tramo)
	from: string; // etiqueta del origen (ej "Mi ubicación")
	to: string; // etiqueta del destino
	o: [number, number]; // origen [lng, lat]
	d: [number, number]; // destino [lng, lat]
	boardStopId?: number; // parada donde sube (primer tramo)
	alightStopId?: number; // parada donde baja — base del ETA
	boardLabel?: string;
	alightLabel?: string;
	bs?: [number, number]; // coordenadas de la parada de subida
	as?: [number, number]; // coordenadas de la parada de bajada
	busId?: number; // si se comparte un ómnibus puntual en vivo
	liveId?: string; // sesión de ubicación en vivo (POST /api/live-share) — si está,
	// la página pública además muestra la posición de quien comparte,
	// actualizada cada pocos segundos hasta que la sesión termina o expira
	exp: number; // epoch ms — el link deja de actualizarse ahí
}

export const SHARE_TTL_MS = 60 * 60 * 1000; // 1 hora

function toBase64Url(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code: string): string {
	const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64);
	const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

export function encodeSharedTrip(trip: SharedTrip): string {
	return toBase64Url(JSON.stringify(trip));
}

export function decodeSharedTrip(code: string): SharedTrip | null {
	try {
		const parsed = JSON.parse(fromBase64Url(code));
		if (
			!parsed ||
			parsed.v !== 1 ||
			typeof parsed.line !== 'string' ||
			typeof parsed.to !== 'string' ||
			!Array.isArray(parsed.d) ||
			typeof parsed.exp !== 'number'
		) {
			return null;
		}
		return parsed as SharedTrip;
	} catch {
		return null;
	}
}
