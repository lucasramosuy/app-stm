import { describe, it, expect } from 'vitest';
import { collectArrivalHits } from '$lib/arrivalAlerts';
import type { UpcomingBus } from '$lib/types/stm';

function bus(busId: number, etaSeconds: number, line = '121'): UpcomingBus {
	return {
		busId,
		lineVariantId: 1,
		line,
		origin: 'Pocitos',
		destination: 'Ciudad Vieja',
		subline: '1',
		special: false,
		companyName: 'CUTCSA',
		access: 'PISO BAJO',
		thermalConfort: 'Aire Acondicionado',
		emissions: 'Cero emisiones',
		eta: etaSeconds,
		distance: 800,
		position: 12,
		location: { type: 'Point', coordinates: [-56.1, -34.9] }
	};
}

describe('collectArrivalHits', () => {
	it('avisa la primera vez que un bus cruza el umbral', () => {
		const alerted = new Set<number>();
		const hits = collectArrivalHits(alerted, [bus(1, 120)], 3);
		expect(hits).toHaveLength(1);
		expect(hits[0]).toMatchObject({ busId: 1, line: '121', etaMinutes: 2 });
		expect(alerted.has(1)).toBe(true);
	});

	it('no repite el aviso mientras el bus sigue en el listado', () => {
		const alerted = new Set<number>();
		collectArrivalHits(alerted, [bus(1, 120)], 3);
		const hits = collectArrivalHits(alerted, [bus(1, 60)], 3);
		expect(hits).toHaveLength(0);
	});

	it('vuelve a armar cuando el bus desaparece del listado', () => {
		const alerted = new Set<number>();
		collectArrivalHits(alerted, [bus(1, 120)], 3);
		collectArrivalHits(alerted, [], 3); // salió del listado
		expect(alerted.has(1)).toBe(false);
		const hits = collectArrivalHits(alerted, [bus(1, 90)], 3);
		expect(hits).toHaveLength(1);
	});

	it('no avisa por encima del umbral', () => {
		const alerted = new Set<number>();
		expect(collectArrivalHits(alerted, [bus(1, 300)], 3)).toHaveLength(0);
	});

	it('el umbral es estricto: exactamente N min no avisa', () => {
		const alerted = new Set<number>();
		expect(collectArrivalHits(alerted, [bus(1, 180)], 3)).toHaveLength(0);
	});

	it('un bus por encima del umbral no marca el id', () => {
		const alerted = new Set<number>();
		collectArrivalHits(alerted, [bus(1, 300)], 3);
		const hits = collectArrivalHits(alerted, [bus(1, 100)], 3);
		expect(hits).toHaveLength(1);
	});
});
