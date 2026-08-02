// Tipos basados en respuestas REALES confirmadas contra
// api.montevideo.gub.uy/api/transportepublico (agosto 2026).

export interface LineVariant {
	lineVariantId: number;
	line: string; // ej "103", "G", "L20"
	lineId: number | string;
	origin: string;
	destination: string;
	subline: string;
	special: boolean;
}

/** Forma de cada item en GET /buses/busstops (listado completo) */
export interface BusStopListItem {
	busstopId: number;
	street1: string;
	street2: string;
	street1Id: number;
	street2Id: number;
	location: {
		type: 'Point';
		coordinates: [number, number]; // [lon, lat]
	};
}

/**
 * Forma de GET /buses/busstops/{id} (una parada puntual).
 * OJO: usa nombres de campo distintos al listado (paradaId/calle1/calle2
 * en vez de busstopId/street1/street2) — es la misma API, dos formas.
 * Trae además las líneas y variantes que pasan por esa parada.
 */
export interface BusStopDetail {
	paradaId: number;
	calle1: string;
	calle2: string;
	calle1Id: number;
	calle2Id: number;
	lineas: string[];
	variantes: number[];
	location: {
		type: 'Point';
		coordinates: [number, number];
	};
}

/** Forma real de GET /buses/busstops/{id}/upcomingbuses?lines=... */
export interface UpcomingBus {
	busId: number;
	companyName: string; // ej "CUTCSA"
	lineVariantId: number;
	line: string;
	origin: string;
	destination: string;
	subline: string;
	special: boolean;
	eta: number; // segundos hasta llegar a la parada
	distance: number; // metros hasta la parada
	position: number; // posición del bus en su recorrido
	access: string; // ej "PISO BAJO"
	thermalConfort: string; // ej "Aire Acondicionado"
	emissions: string; // ej "Cero emisiones"
	location: {
		type: 'Point';
		coordinates: [number, number];
	};
}

export interface BusGeoFeature {
	type: 'Feature';
	properties: {
		id?: string;
		codigoEmpresa?: number;
		codigoBus?: number;
		variante?: number;
		linea?: string;
		frecuencia?: number;
		version?: number;
		[key: string]: unknown;
	};
	geometry: {
		type: 'Point';
		coordinates: [number, number]; // [lon, lat]
	};
}

export interface BusGeoCollection {
	type: 'FeatureCollection';
	features: BusGeoFeature[];
}

// Empresas de transporte (para colorear buses en el mapa)
export const EMPRESAS: Record<number, string> = {
	10: 'COETC',
	20: 'COME',
	50: 'CUTCSA',
	70: 'UCOT'
};

/** eta viene en segundos; la UI siempre muestra minutos redondeados. */
export function etaToMinutes(etaSeconds: number): number {
	return Math.max(0, Math.round(etaSeconds / 60));
}