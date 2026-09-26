/**
 * Movimiento de marcadores de buses — lógica pura de decisión,
 * extraída de BusMap.svelte para poder testearla sin mapa.
 *
 * Contexto: los buses no "saltan" de una posición a otra en cada
 * update: se interpola cuadro a cuadro con requestAnimationFrame. La
 * duración de cada tramo es el tiempo real transcurrido desde el
 * update anterior de ESE bus puntual (no un valor fijo) y la
 * interpolación es LINEAL: el bus se mueve a la velocidad promedio
 * real del tramo, pareja de punta a punta. (Antes se aplicaba un
 * easing ease-out: cada tramo arrancaba rápido y terminaba
 * arrastrándose, y eso se percibía como buses que "a veces van
 * rápido, a veces lento".)
 */
export const MIN_ANIM_MS = 1_500;
export const MAX_ANIM_MS = 20_000;

// Si el bus real está más lejos que esto del trazado GTFS conocido
// (desvío, depósito, error de GPS), no lo "enganchamos" al trazado
// para ese tramo — mejor una línea recta puntual que una interpolación
// que lo arrastre por un camino que no está siguiendo. Valor en
// distancia-en-grados al cuadrado, igual que degDistSq: no es una
// distancia real en metros, solo sirve para comparar (~300m aprox).
export const MAX_SNAP_DIST_SQ = 0.0027 * 0.0027;

// Anti "buses voladores": la posición que reporta STM a veces salta
// (GPS viejo que se actualiza de golpe, ruido, unidad que cambia de
// recorrido). Sin un límite, un salto de kilómetros se animaba durante
// hasta MAX_ANIM_MS y el bus se veía cruzar la ciudad volando. Reglas:
// - Saltos más largos que MAX_ANIM_DIST_M no se animan: el bus aparece
//   directo en la posición nueva.
// - Si la velocidad implícita del tramo supera lo plausible para un
//   ómnibus urbano, tampoco se anima (cubre saltos medianos con poco
//   tiempo transcurrido).
// - Si el camino por el trazado GTFS es un rodeo desproporcionado
//   respecto de la línea recta, se descarta el trazado para ese tramo
//   (evita que un mal snap a una variante en bucle lo mande a dar la
//   vuelta por toda la línea en segundos).
export const MAX_ANIM_DIST_M = 1_000;
export const MAX_PLAUSIBLE_SPEED_KMH = 80;
export const MAX_PATH_DETOUR_FACTOR = 2.5;

/** Duración del tramo animado: el tiempo real desde el update anterior
 * de ese bus, acotado; si no hay elapsed (primer dato), el período de
 * poll como estimación. */
export function animDurationMs(elapsedMs: number, pollMs: number): number {
	return Math.min(MAX_ANIM_MS, Math.max(MIN_ANIM_MS, elapsedMs || pollMs));
}

/** Velocidad que implicaría cubrir distM en durationMs. */
export function impliedSpeedKmh(distM: number, durationMs: number): number {
	return (distM / (durationMs / 1000)) * 3.6;
}

/** true = no animar: salto imposible para un ómnibus real (GPS viejo,
 * ruido, cambio de recorrido) — se muestra directo en la posición
 * nueva. Animarlo era lo que hacía "volar" los buses por el mapa. */
export function shouldSnap(jumpMeters: number, kmh: number): boolean {
	return jumpMeters > MAX_ANIM_DIST_M || kmh > MAX_PLAUSIBLE_SPEED_KMH;
}

/** true = el camino por el trazado GTFS es un rodeo desproporcionado
 * respecto de la línea recta (mal snap a una variante en bucle) — se
 * descarta el trazado para ese tramo puntual. */
export function shouldDropPath(straightDeg: number, pathDist: number): boolean {
	return straightDeg > 0 && pathDist / straightDeg > MAX_PATH_DETOUR_FACTOR;
}

/** Distancia en grados al cuadrado (no es metros: solo comparaciones). */
export function degDistSq(a: [number, number], b: [number, number]): number {
	const dLng = b[0] - a[0];
	const dLat = b[1] - a[1];
	return dLng * dLng + dLat * dLat;
}

/** Distancia haversine en metros entre dos puntos [lng, lat]. */
export function distMeters(a: [number, number], b: [number, number]): number {
	const R = 6_371_000;
	const toRad = Math.PI / 180;
	const dLat = (b[1] - a[1]) * toRad;
	const dLng = (b[0] - a[0]) * toRad;
	const lat1 = a[1] * toRad;
	const lat2 = b[1] * toRad;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}
