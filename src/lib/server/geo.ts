const EARTH_RADIUS_M = 6_371_000;

/** Distancia entre dos puntos [lon, lat], en metros. */
export function haversineDistance(a: [number, number], b: [number, number]): number {
	const [lon1, lat1] = a;
	const [lon2, lat2] = b;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/** Distancia mínima (metros) de un punto a un segmento de recta.
 * Proyecta a un plano local ponderando la longitud por cos(lat) — no es
 * exacto para distancias largas, pero de sobra para segmentos cortos de
 * un shape de GTFS o para paradas cercanas entre sí. */
function pointToSegmentMeters(p: [number, number], a: [number, number], b: [number, number]): number {
	const latRef = (p[1] + a[1] + b[1]) / 3;
	const mPerDegLat = 111_320;
	const mPerDegLon = 111_320 * Math.cos((latRef * Math.PI) / 180);
	const toXY = (pt: [number, number]): [number, number] => [pt[0] * mPerDegLon, pt[1] * mPerDegLat];

	const [px, py] = toXY(p);
	const [ax, ay] = toXY(a);
	const [bx, by] = toXY(b);

	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
	t = Math.max(0, Math.min(1, t));
	const cx = ax + t * dx;
	const cy = ay + t * dy;
	return Math.hypot(px - cx, py - cy);
}

/** Distancia mínima de un punto a cualquier polyline. */
export function pointToPolylineMeters(point: [number, number], polyline: number[][]): number {
	let min = Infinity;
	for (let i = 0; i < polyline.length - 1; i++) {
		const d = pointToSegmentMeters(point, polyline[i] as [number, number], polyline[i + 1] as [number, number]);
		if (d < min) min = d;
	}
	return min;
}

/** Distancia mínima entre dos polylines — alcanza para decidir si dos
 * recorridos "se cruzan o pasan cerca" en algún punto, sin necesitar
 * una intersección geométrica exacta. Corta apenas encuentra un cruce
 * real (distancia ~0) para no seguir de más. */
export function polylineToPolylineMeters(a: number[][], b: number[][]): number {
	let min = Infinity;
	for (const point of a) {
		const d = pointToPolylineMeters(point as [number, number], b);
		if (d < min) min = d;
		if (min < 1) break;
	}
	return min;
}