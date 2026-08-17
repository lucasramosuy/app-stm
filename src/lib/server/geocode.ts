// Geocoding vía Nominatim (OpenStreetMap) — mismo origen de datos que el
// mapa base (OpenFreeMap), así que los resultados son consistentes con
// lo que se ve en pantalla. Instancia pública: rate limit de 1 req/seg,
// requiere User-Agent identificable y atribución visible en el UI (ver
// GeocodeAttribution en el dropdown de búsqueda).
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Bounding box aproximado de Montevideo, para sesgar resultados sin
// excluir del todo direcciones justo en el borde del departamento.
const MVD_VIEWBOX = '-56.42,-34.75,-55.95,-34.95'; // lon1,lat1,lon2,lat2

export interface GeocodeResult {
	label: string;
	coordinates: [number, number];
	/** true cuando el punto agrupa varias numeraciones en un mismo nodo
	 * de OSM (edificio con múltiples entradas tageado como una lista de
	 * housenumbers) — la coordenada es real, pero puede no corresponder
	 * exactamente al número buscado dentro de ese grupo. */
	approximate: boolean;
}

let lastRequestAt = 0;
const MIN_INTERVAL_MS = 1100; // margen sobre el límite de 1 req/seg de Nominatim

/** Espacia los pedidos salientes a Nominatim — server-side, así que
 * afecta a TODOS los usuarios de la app compartiendo el mismo throttle,
 * no por usuario individual. Para el volumen actual alcanza; si la app
 * escala, esto es candidato a mover a una cola real o a auto-hostear
 * una instancia propia de Nominatim. */
async function throttle() {
	const now = Date.now();
	const wait = lastRequestAt + MIN_INTERVAL_MS - now;
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	lastRequestAt = Date.now();
}

export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
	await throttle();

	const params = new URLSearchParams({
		q: query,
		format: 'jsonv2',
		countrycodes: 'uy',
		viewbox: MVD_VIEWBOX,
		bounded: '1',
		limit: '5',
		addressdetails: '1',
		'accept-language': 'es'
	});

	const res = await fetch(`${NOMINATIM_URL}?${params}`, {
		headers: {
			// Nominatim exige un User-Agent identificable — pedidos
			// anónimos/genéricos se banean de la instancia pública.
			'User-Agent': 'BusesMontevideo/1.0 (app de tiempo real de transporte publico)'
		}
	});

	if (!res.ok) {
		throw new Error(`Nominatim devolvió ${res.status}`);
	}

	interface NominatimResult {
		display_name: string;
		lat: string;
		lon: string;
		address?: {
			road?: string;
			house_number?: string;
			suburb?: string;
			city?: string;
			town?: string;
		};
	}

	const data: NominatimResult[] = await res.json();

	const results = data.map((r) => {
		const houseNumber = r.address?.house_number ?? '';
		// Un edificio con varias entradas viene como "1854,1856,1858,1862"
		// o separado por punto y coma — cualquiera de las dos formas
		// indica que la coordenada agrupa más de un número real.
		const approximate = /[,;]/.test(houseNumber);

		const road = r.address?.road;
		const locality = r.address?.suburb ?? r.address?.city ?? r.address?.town;
		// Etiqueta corta (calle + número, + barrio si está) en vez del
		// display_name completo, que arrastra barrio/depto/país/código
		// postal — útil como dato crudo pero ilegible como resultado de
		// búsqueda.
		const shortLabel = road
			? [road, houseNumber, locality].filter(Boolean).join(' ')
			: r.display_name;

		return {
			label: shortLabel,
			coordinates: [Number(r.lon), Number(r.lat)] as [number, number],
			approximate
		};
	});

	// Si la búsqueda buscaba un número puntual, priorizar resultados con
	// numeración exacta (no agrupada) antes que los aproximados.
	return results.sort((a, b) => Number(a.approximate) - Number(b.approximate));
}