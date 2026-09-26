import type { TripOption } from '$lib/types/trip';

/**
 * Alertas del viaje activo (feature "avisos del viaje"):
 *  - cambio de ETA: sale del polling de upcomingbuses de la parada de
 *    subida del tramo actual (sin GPS);
 *  - transbordo: GPS a ~400 m de la parada de bajada del tramo actual;
 *  - bajada: GPS a ~300 m de la parada de bajada final.
 * Todo se calcula en el cliente con las APIs que ya existen: no hay
 * push, Service Worker ni backend propio (costo cero).
 */

export const TRIP_ALERTS_ENABLED_KEY = 'app_stm_trip_alerts_enabled';

/** Radio en metros para el aviso de transbordo (~2 cuadras antes). */
export const TRANSFER_ALERT_RADIUS_M = 400;
/** Radio en metros para el aviso de bajada final. */
export const ALIGHT_ALERT_RADIUS_M = 300;
/** Distancia a la parada de subida del tramo siguiente a partir de la
 * cual damos por hecho que el usuario ya transbordó. */
export const NEXT_LEG_REBASE_RADIUS_M = 120;
/** Cambio mínimo de ETA (en minutos) que dispara un aviso. */
export const ETA_CHANGE_THRESHOLD_MIN = 2;
/** Si el usuario está más lejos que esto de la parada de subida, ya no
 * avisamos cambios de ETA de ese tramo (asumimos que va arriba). */
export const ETA_ALERT_MAX_DIST_TO_BOARD_M = 250;

export type TripAlertKind = 'eta' | 'transfer' | 'alight';

export interface TripAlert {
	id: string;
	kind: TripAlertKind;
	title: string;
	body: string;
}

export interface ActiveTrip {
	option: TripOption;
	originLabel: string;
	destLabel: string;
	startedAt: number;
}

/** Distancia haversine en metros entre dos puntos [lng, lat]. */
export function distanceMeters(a: [number, number], b: [number, number]): number {
	const R = 6_371_000;
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(b[1] - a[1]);
	const dLng = toRad(b[0] - a[0]);
	const lat1 = toRad(a[1]);
	const lat2 = toRad(b[1]);
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

/** "8:27" — hora local sin segundos, para los textos de llegada. */
export function formatClock(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString('es-UY', {
		hour: 'numeric',
		minute: '2-digit'
	});
}

export function formatDistance(meters: number): string {
	return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}
