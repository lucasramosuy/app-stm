import { etaToMinutes, type UpcomingBus } from '$lib/types/stm';

/**
 * Alertas in-app de "bus a punto de llegar" — lógica pura, extraída de
 * +page.svelte para testearla sin UI. Reglas:
 * - Se avisa la PRIMERA vez que un bus cruza el umbral (estrictamente
 *   menos de thresholdMin), no en cada poll mientras sigue bajando.
 * - Si un bus ya alertado desaparece del listado (llegó, pasó de
 *   largo, o ya no es "upcoming"), se libera: puede volver a alertar
 *   si reaparece más adelante (p. ej. otra vuelta del recorrido).
 */

export interface ArrivalHit {
	busId: number;
	line: string;
	destination: string;
	etaMinutes: number;
}

/** Revisa un listado de upcomingbuses recién llegado contra el Set de
 * ids ya alertados (lo muta: marca los nuevos y libera los que
 * salieron) y devuelve los avisos a disparar. */
export function collectArrivalHits(
	alertedBusIds: Set<number>,
	upcoming: UpcomingBus[],
	thresholdMin: number
): ArrivalHit[] {
	const hits: ArrivalHit[] = [];
	const stillPresent = new Set<number>();

	for (const bus of upcoming) {
		stillPresent.add(bus.busId);
		const minutes = etaToMinutes(bus.eta);
		if (minutes < thresholdMin && !alertedBusIds.has(bus.busId)) {
			alertedBusIds.add(bus.busId);
			hits.push({
				busId: bus.busId,
				line: bus.line,
				destination: bus.destination,
				etaMinutes: minutes
			});
		}
	}

	for (const id of alertedBusIds) {
		if (!stillPresent.has(id)) alertedBusIds.delete(id);
	}

	return hits;
}
