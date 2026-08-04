import { stmFetch } from './stmApi';
import type { LineVariant, BusStopListItem, BusStopDetail, UpcomingBus, Bus } from '$lib/types/stm';

// Datos estáticos (líneas y paradas cambian con muy poca frecuencia).
// Se cachean en memoria del proceso para que el buscador no tenga que
// pedirle a la API de STM la lista completa (~900KB) en cada tecleo.
const TTL_MS = 60 * 60 * 1000; // 1 hora

interface Cache<T> {
	data: T | null;
	fetchedAt: number;
	inFlight: Promise<T> | null;
}

const lineVariantsCache: Cache<LineVariant[]> = { data: null, fetchedAt: 0, inFlight: null };
const busStopsCache: Cache<BusStopListItem[]> = { data: null, fetchedAt: 0, inFlight: null };

async function getCached<T>(cache: Cache<T>, fetcher: () => Promise<T>): Promise<T> {
	const isFresh = cache.data !== null && Date.now() - cache.fetchedAt < TTL_MS;
	if (isFresh) return cache.data as T;

	if (!cache.inFlight) {
		cache.inFlight = fetcher()
			.then((data) => {
				cache.data = data;
				cache.fetchedAt = Date.now();
				return data;
			})
			.finally(() => {
				cache.inFlight = null;
			});
	}

	return cache.inFlight;
}

export function getLineVariants(): Promise<LineVariant[]> {
	return getCached(lineVariantsCache, () => stmFetch('/buses/linevariants') as Promise<LineVariant[]>);
}

export function getBusStops(): Promise<BusStopListItem[]> {
	return getCached(busStopsCache, () => stmFetch('/buses/busstops') as Promise<BusStopListItem[]>);
}

// --- Caches por clave (una entrada por parada / por parada+líneas) ---
// Evita pegarle a la API de STM de nuevo por cada tap sobre una parada,
// que es lo que dispara el 429 "Usage limit exceeded" cuando se prueba
// tocando varias paradas seguidas.

interface KeyedEntry<T> {
	data: T;
	fetchedAt: number;
}

function makeKeyedGetter<T>(ttlMs: number, fetcher: (key: string) => Promise<T>) {
	const store = new Map<string, KeyedEntry<T>>();
	const inFlight = new Map<string, Promise<T>>();

	return async function get(key: string): Promise<T> {
		const entry = store.get(key);
		if (entry && Date.now() - entry.fetchedAt < ttlMs) {
			return entry.data;
		}

		const pending = inFlight.get(key);
		if (pending) return pending;

		const promise = fetcher(key)
			.then((data) => {
				store.set(key, { data, fetchedAt: Date.now() });
				return data;
			})
			.finally(() => {
				inFlight.delete(key);
			});

		inFlight.set(key, promise);
		return promise;
	};
}

// Detalle de parada: casi estático (calles, líneas que pasan), TTL largo.
const getBusStopDetailCached = makeKeyedGetter<BusStopDetail>(
	60 * 60 * 1000, // 1 hora
	(busstopId) => stmFetch(`/buses/busstops/${busstopId}`) as Promise<BusStopDetail>
);

export function getBusStopDetail(busstopId: number | string): Promise<BusStopDetail> {
	return getBusStopDetailCached(String(busstopId));
}

// Próximos buses: genuinamente dinámico, pero un TTL corto (bien por debajo
// de nuestro propio intervalo de polling de 12s) alcanza para absorber
// ráfagas de clicks o varias pestañas pidiendo la misma parada a la vez,
// sin mostrar datos desactualizados de forma perceptible.
const UPCOMING_TTL_MS = 8_000;
const upcomingCache = makeKeyedGetter<UpcomingBus[]>(UPCOMING_TTL_MS, async (key) => {
	const [busstopId, lines] = key.split('::');
	return stmFetch(`/buses/busstops/${busstopId}/upcomingbuses`, { lines }) as Promise<UpcomingBus[]>;
});

export function getUpcomingBuses(busstopId: number | string, lines: string): Promise<UpcomingBus[]> {
	return upcomingCache(`${busstopId}::${lines}`);
}

// Flota completa (GET /buses, sin filtro geográfico): cambia todo el
// tiempo, TTL bien corto (5s) solo para absorber ráfagas de varias
// pestañas/usuarios pidiendo casi al mismo tiempo, no para "ahorrar"
// frescura real.
let allBusesCache: Cache<Bus[]> = { data: null, fetchedAt: 0, inFlight: null };
const ALL_BUSES_TTL_MS = 5_000;

export async function getAllBuses(): Promise<Bus[]> {
	const isFresh = allBusesCache.data !== null && Date.now() - allBusesCache.fetchedAt < ALL_BUSES_TTL_MS;
	if (isFresh) return allBusesCache.data as Bus[];

	if (!allBusesCache.inFlight) {
		allBusesCache.inFlight = (stmFetch('/buses') as Promise<Bus[]>)
			.then((data) => {
				allBusesCache = { data, fetchedAt: Date.now(), inFlight: null };
				return data;
			})
			.finally(() => {
				allBusesCache.inFlight = null;
			});
	}

	return allBusesCache.inFlight;
}