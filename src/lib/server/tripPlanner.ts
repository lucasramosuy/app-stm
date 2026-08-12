import { getBusStops, getBusStopDetail } from './stmCache';
import { getRouteShape } from './routeShapes';
import { haversineDistance, pointToPolylineMeters, polylineToPolylineMeters } from './geo';
import type { TripOption } from '$lib/types/trip';

export const DEFAULT_WALK_RADIUS_M = 500;

// Qué tan cerca tienen que pasar dos TRAZADOS para considerarse
// conectados en un transbordo. Más generoso que el radio de caminata
// porque acá se compara contra el recorrido completo de la línea, no
// contra una parada puntual — dos líneas pueden cruzarse en una esquina
// sin compartir oficialmente ninguna parada según el dato de STM.
const LINE_PROXIMITY_M = 250;
const MAX_CANDIDATE_LINES = 8;
const MAX_RESULTS = 5;
const MAX_NEARBY_STOPS = 15;

interface StopWithLines {
	busstopId: number;
	street1: string;
	street2: string;
	distance: number;
	coordinates: [number, number];
	lines: string[];
}

async function findNearbyStopsWithLines(point: [number, number], radiusM: number): Promise<StopWithLines[]> {
	const allStops = await getBusStops();
	const nearby = allStops
		.map((s) => ({ stop: s, distance: haversineDistance(point, s.location.coordinates) }))
		.filter((s) => s.distance <= radiusM)
		.sort((a, b) => a.distance - b.distance)
		.slice(0, MAX_NEARBY_STOPS);

	const results: StopWithLines[] = [];
	for (const { stop, distance } of nearby) {
		try {
			const detail = await getBusStopDetail(stop.busstopId);
			results.push({
				busstopId: stop.busstopId,
				street1: stop.street1,
				street2: stop.street2,
				distance,
				coordinates: stop.location.coordinates,
				lines: detail.lineas ?? []
			});
		} catch {
			// Una parada puntual que falla (ej. 429 momentáneo) se
			// descarta — no vale la pena tirar abajo toda la búsqueda de
			// ruta por una sola parada rota.
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

/** Punto aproximado de cruce entre dos líneas: el punto del shape de L1
 * más cercano a cualquier shape de L2. Ahí buscamos paradas reales que
 * sirvan L1 (para bajarse) y L2 (para subirse). */
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
	radiusM: number
): Promise<TripOption[]> {
	const originLines = [...new Set(originStops.flatMap((s) => s.lines))].slice(0, MAX_CANDIDATE_LINES);
	const destLines = [...new Set(destStops.flatMap((s) => s.lines))].slice(0, MAX_CANDIDATE_LINES);

	const options: TripOption[] = [];

	for (const l1 of originLines) {
		for (const l2 of destLines) {
			if (l1 === l2) continue; // eso ya lo cubre directOptions
			if (!linesAreTransferable(l1, l2)) continue;

			const crossPoint = findCrossPoint(l1, l2);
			if (!crossPoint) continue;

			const transferCandidates = await findNearbyStopsWithLines(crossPoint, radiusM);
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
	const originStops = await findNearbyStopsWithLines(origin, radiusM);
	const destStops = await findNearbyStopsWithLines(destination, radiusM);

	let options = directOptions(originStops, destStops);

	if (options.length === 0) {
		options = await oneTransferOptions(originStops, destStops, radiusM);
	}

	// 2 transbordos queda deliberadamente afuera de esta versión — ver
	// nota en el mensaje de la sesión donde se agregó esto.

	return { options: options.slice(0, MAX_RESULTS), radiusUsed: radiusM };
}