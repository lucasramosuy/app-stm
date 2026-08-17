import { getBusStops, getBusStopDetail } from './stmCache';
import { getStmRateLimitCooldownMs } from './stmApi';
import { getRouteShape } from './routeShapes';
import { haversineDistance, pointToPolylineMeters, polylineToPolylineMeters } from './geo';
import type { TripOption } from '$lib/types/trip';

export const DEFAULT_WALK_RADIUS_M = 500;

const LINE_PROXIMITY_M = 250;
const MAX_CANDIDATE_LINES = 5;
const MAX_RESULTS = 5;
const MAX_NEARBY_STOPS = 10;

// Techo duro de pedidos NUEVOS a la API de STM por cada llamada a
// planTrip(). Sin esto, la búsqueda de transbordo (que compara cada
// línea candidata de origen contra cada una de destino) puede disparar
// decenas de búsquedas de "paradas cercanas al cruce", cada una
// pidiendo detalle de hasta MAX_NEARBY_STOPS paradas — sin límite,
// eso escaló a cientos de pedidos reales en un solo cálculo de ruta y
// tumbó el rate limit de STM para toda la app (visto en producción).
const MAX_NEW_DETAIL_FETCHES = 30;

interface StopWithLines {
	busstopId: number;
	street1: string;
	street2: string;
	distance: number;
	coordinates: [number, number];
	lines: string[];
}

/** Estado compartido durante UNA llamada a planTrip(): evita pedir el
 * detalle de la misma parada dos veces (ej. dos puntos de transbordo
 * cercanos entre sí que comparten paradas vecinas) y aplica el techo
 * global de pedidos nuevos. No persiste entre llamadas — es solo para
 * no repetir trabajo dentro de un mismo cálculo. */
interface FetchBudget {
	cache: Map<number, StopWithLines | null>; // null = se intentó y falló, no reintentar en esta llamada
	remaining: number;
}

function createFetchBudget(): FetchBudget {
	return { cache: new Map(), remaining: MAX_NEW_DETAIL_FETCHES };
}

async function findNearbyStopsWithLines(
	point: [number, number],
	radiusM: number,
	budget: FetchBudget
): Promise<StopWithLines[]> {
	const { data: allStops } = await getBusStops();
	const nearby = allStops
		.map((s) => ({ stop: s, distance: haversineDistance(point, s.location.coordinates) }))
		.filter((s) => s.distance <= radiusM)
		.sort((a, b) => a.distance - b.distance)
		.slice(0, MAX_NEARBY_STOPS);

	const results: StopWithLines[] = [];
	for (const { stop, distance } of nearby) {
		const cached = budget.cache.get(stop.busstopId);
		if (cached) {
			// Reusar tal cual, pero con la distancia relativa a ESTE punto
			// (la misma parada puede estar cerca de más de un punto de
			// interés con distancias distintas).
			results.push({ ...cached, distance });
			continue;
		}
		if (cached === null) continue; // ya se intentó antes en esta llamada y falló

		if (budget.remaining <= 0 || getStmRateLimitCooldownMs() > 0) {
			// Presupuesto agotado o STM ya nos frenó: seguimos con lo que
			// tengamos, no insistimos. Se marca como "no intentado" (no se
			// guarda en cache) por si queda presupuesto más adelante en
			// esta misma llamada.
			continue;
		}

		budget.remaining -= 1;
		try {
			const { data: detail } = await getBusStopDetail(stop.busstopId);
			const withLines: StopWithLines = {
				busstopId: stop.busstopId,
				street1: stop.street1,
				street2: stop.street2,
				distance,
				coordinates: stop.location.coordinates,
				lines: detail.lineas ?? []
			};
			budget.cache.set(stop.busstopId, withLines);
			results.push(withLines);
		} catch {
			budget.cache.set(stop.busstopId, null);
		}
	}
	return results;
}

function bestStopForLine(stops: StopWithLines[], line: string): StopWithLines | null {
	let best: StopWithLines | null = null;
	for (const s of stops) {
		if (!s.lines.includes(line)) continue;
		if (!best || s.distance < best.distance) best = s;
	}
	return best;
}

function toLabel(s: StopWithLines): string {
	return `${s.street1} y ${s.street2}`;
}

function toStopRef(s: StopWithLines) {
	return { busstopId: s.busstopId, label: toLabel(s), coordinates: s.coordinates };
}

function directOptions(originStops: StopWithLines[], destStops: StopWithLines[]): TripOption[] {
	const originLines = new Set(originStops.flatMap((s) => s.lines));
	const destLines = new Set(destStops.flatMap((s) => s.lines));
	const common = [...originLines].filter((l) => destLines.has(l));

	const options: TripOption[] = [];
	for (const line of common) {
		const board = bestStopForLine(originStops, line);
		const alight = bestStopForLine(destStops, line);
		if (!board || !alight || board.busstopId === alight.busstopId) continue;
		options.push({
			transfers: 0,
			legs: [{ line, boardStop: toStopRef(board), alightStop: toStopRef(alight) }],
			walkToFirstStopM: board.distance,
			walkFromLastStopM: alight.distance
		});
	}
	return options.sort(
		(a, b) => a.walkToFirstStopM + a.walkFromLastStopM - (b.walkToFirstStopM + b.walkFromLastStopM)
	);
}

function linesAreTransferable(lineA: string, lineB: string): boolean {
	const shapesA = getRouteShape(lineA);
	const shapesB = getRouteShape(lineB);
	if (!shapesA || !shapesB) return false;
	for (const a of shapesA) {
		for (const b of shapesB) {
			if (polylineToPolylineMeters(a, b) <= LINE_PROXIMITY_M) return true;
		}
	}
	return false;
}

function findCrossPoint(lineA: string, lineB: string): [number, number] | null {
	const shapesA = getRouteShape(lineA);
	const shapesB = getRouteShape(lineB);
	if (!shapesA || !shapesB) return null;

	let closest: [number, number] | null = null;
	let minDist = Infinity;
	for (const a of shapesA) {
		for (const point of a) {
			for (const b of shapesB) {
				const d = pointToPolylineMeters(point as [number, number], b);
				if (d < minDist) {
					minDist = d;
					closest = point as [number, number];
				}
			}
		}
	}
	return closest;
}

async function oneTransferOptions(
	originStops: StopWithLines[],
	destStops: StopWithLines[],
	radiusM: number,
	budget: FetchBudget
): Promise<TripOption[]> {
	const originLines = [...new Set(originStops.flatMap((s) => s.lines))].slice(0, MAX_CANDIDATE_LINES);
	const destLines = [...new Set(destStops.flatMap((s) => s.lines))].slice(0, MAX_CANDIDATE_LINES);

	const options: TripOption[] = [];

	for (const l1 of originLines) {
		for (const l2 of destLines) {
			if (budget.remaining <= 0 || getStmRateLimitCooldownMs() > 0) {
				// Sin presupuesto (o STM en cooldown): devolvemos lo que
				// ya hayamos encontrado hasta acá, mejor incompleto que
				// seguir insistiendo.
				return options.sort(
					(a, b) =>
						a.walkToFirstStopM + a.walkFromLastStopM - (b.walkToFirstStopM + b.walkFromLastStopM)
				);
			}

			if (l1 === l2) continue;
			if (!linesAreTransferable(l1, l2)) continue;

			const crossPoint = findCrossPoint(l1, l2);
			if (!crossPoint) continue;

			const transferCandidates = await findNearbyStopsWithLines(crossPoint, radiusM, budget);
			const boardL1 = bestStopForLine(originStops, l1);
			const alightL1 = bestStopForLine(transferCandidates, l1);
			const boardL2 = bestStopForLine(transferCandidates, l2);
			const alightL2 = bestStopForLine(destStops, l2);
			if (!boardL1 || !alightL1 || !boardL2 || !alightL2) continue;
			if (boardL1.busstopId === alightL1.busstopId || boardL2.busstopId === alightL2.busstopId) continue;

			options.push({
				transfers: 1,
				legs: [
					{ line: l1, boardStop: toStopRef(boardL1), alightStop: toStopRef(alightL1) },
					{ line: l2, boardStop: toStopRef(boardL2), alightStop: toStopRef(alightL2) }
				],
				walkToFirstStopM: boardL1.distance,
				walkFromLastStopM: alightL2.distance
			});

			if (options.length >= MAX_RESULTS) return options;
		}
	}

	return options.sort(
		(a, b) => a.walkToFirstStopM + a.walkFromLastStopM - (b.walkToFirstStopM + b.walkFromLastStopM)
	);
}

export async function planTrip(
	origin: [number, number],
	destination: [number, number],
	radiusM: number = DEFAULT_WALK_RADIUS_M
): Promise<{ options: TripOption[]; radiusUsed: number }> {
	const budget = createFetchBudget();

	const originStops = await findNearbyStopsWithLines(origin, radiusM, budget);
	const destStops = await findNearbyStopsWithLines(destination, radiusM, budget);

	let options = directOptions(originStops, destStops);

	if (options.length === 0) {
		options = await oneTransferOptions(originStops, destStops, radiusM, budget);
	}

	return { options: options.slice(0, MAX_RESULTS), radiusUsed: radiusM };
}