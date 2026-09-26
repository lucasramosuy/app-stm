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

// --- Intersecciones ("18 de julio y rio branco") ---------------------
// Nominatim no resuelve cruces de calles, que es justo como se dicen
// las direcciones en Uruguay. Para esas búsquedas consultamos Overpass
// (OpenStreetMap, gratis, fair use): los nodos compartidos entre las
// calles (ways) con esos nombres SON los cruces.

// Instancia principal + espejo: la pública se satura seguido (504/429)
// y el cruce es justo la búsqueda que más importa que no falle.
const OVERPASS_URLS = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter'
];
// Área urbana de Montevideo y alrededores (sur, oeste, norte, este).
const MVD_BBOX = '-34.96,-56.45,-34.70,-55.90';

const INTERSECTION_SEP = /\s+(?:y|e|esq\.?|esquina)\s+|\s*\/\s*/i;

/** Detecta búsquedas de cruce ("A y B", "A esq. B", "A/B") y devuelve
 * las dos calles, o null si la búsqueda no es un cruce. */
export function splitIntersection(query: string): [string, string] | null {
	const parts = query.trim().split(INTERSECTION_SEP);
	if (parts.length !== 2) return null;
	const [a, b] = parts.map((p) => p.trim());
	// Evitar falsos positivos con conectores sueltos ("calle e")
	if (a.length < 3 || b.length < 3) return null;
	return [a, b];
}

/** Regex para Overpass que tolera tildes: el usuario escribe "rio
 * branco" y en OSM la calle es "Río Branco". */
export function accentFlexibleRegex(name: string): string {
	// Sin tildes primero: así "Río" e "rio" generan la misma regex.
	const plain = name.normalize('NFD').replace(/\p{Diacritic}/gu, '');
	const escaped = plain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return escaped
		.replace(/a/gi, '[aá]').replace(/e/gi, '[eé]')
		.replace(/i/gi, '[ií]').replace(/o/gi, '[oó]')
		.replace(/u/gi, '[uúü]').replace(/n/gi, '[nñ]');
}

interface OverpassNode {
	type: 'node';
	lat: number;
	lon: number;
}

let lastOverpassAt = 0;
const OVERPASS_MIN_INTERVAL_MS = 1100;

async function throttleOverpass() {
	const now = Date.now();
	const wait = lastOverpassAt + OVERPASS_MIN_INTERVAL_MS - now;
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	lastOverpassAt = Date.now();
}

/** Cruces de dos calles vía Overpass: nodos que comparten las ways con
 * esos nombres dentro del bbox de Montevideo. Avenidas de doble vía
 * cruzan en dos nodos casi pegados — se agrupan a ~60 m. */
export async function geocodeIntersection(
	streetA: string,
	streetB: string
): Promise<GeocodeResult[]> {
	await throttleOverpass();
	const query = `[out:json][timeout:15];
way["name"~"${accentFlexibleRegex(streetA)}",i](${MVD_BBOX});node(w)->.a;
way["name"~"${accentFlexibleRegex(streetB)}",i](${MVD_BBOX});node(w)->.b;
node.a.b;out 25;`;

	let nodes: OverpassNode[] | null = null;
	let lastErr: unknown = null;
	for (const url of OVERPASS_URLS) {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'User-Agent': 'BusesMontevideo/1.0 (app de tiempo real de transporte publico)'
				},
				body: `data=${encodeURIComponent(query)}`,
				signal: AbortSignal.timeout(12_000)
			});
			if (!res.ok) {
				lastErr = new Error(`Overpass devolvió ${res.status}`);
				continue;
			}
			const data: { elements?: OverpassNode[] } = await res.json();
			nodes = (data.elements ?? []).filter((e) => e.type === 'node');
			break;
		} catch (err) {
			lastErr = err;
		}
	}
	if (nodes === null) throw lastErr;

	// Agrupar nodos a ~60 m (0.0006°) para que una avenida de doble
	// mano no devuelva el mismo cruce dos veces.
	const clusters: { lat: number; lon: number }[] = [];
	for (const n of nodes) {
		const hit = clusters.find(
			(c) => Math.abs(c.lat - n.lat) < 0.0006 && Math.abs(c.lon - n.lon) < 0.0006
		);
		if (hit) {
			hit.lat = (hit.lat + n.lat) / 2;
			hit.lon = (hit.lon + n.lon) / 2;
		} else {
			clusters.push({ lat: n.lat, lon: n.lon });
		}
	}

	// La etiqueta respeta el texto tal como lo escribió el usuario.
	const label = `${streetA} y ${streetB}`;
	return clusters.slice(0, 5).map((c) => ({
		label,
		coordinates: [c.lon, c.lat] as [number, number],
		approximate: false
	}));
}

export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
	// Cruces de calles: Nominatim no los resuelve, van por Overpass.
	// Si no hay resultado (o Overpass falla), se sigue con el flujo
	// normal — para una búsqueda de cruce Nominatim devuelve [].
	const intersection = splitIntersection(query);
	if (intersection) {
		try {
			const crosses = await geocodeIntersection(...intersection);
			if (crosses.length > 0) return crosses;
		} catch (err) {
			console.warn('[geocode] falló Overpass para cruce, sigue Nominatim', err);
		}
	}

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