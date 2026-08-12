import { stmFetch, StmApiError, getStmRateLimitCooldownMs } from './stmApi';
import type { LineVariant, BusStopListItem, BusStopDetail, UpcomingBus, Bus } from '$lib/types/stm';

const LONG_TTL_MS = 60 * 60 * 1000; // 1 hora para listas de paradas y líneas
const UPCOMING_TTL_MS = 12_000; // 12 segundos para buses aproximándose
const ALL_BUSES_TTL_MS = 8_000; // 8 segundos para flota completa

// TTL corto para datos servidos por fallback (ej. detalle de parada
// reconstruido desde el listado completo cuando STM falla). Si lo
// guardáramos con el TTL largo normal, un solo fallo de STM dejaría el
// dato incompleto (ej. `lineas: []`) cacheado como "fresco" durante una
// hora entera, sin volver a intentar el fetch real hasta que expire.
const FALLBACK_TTL_MS = 15_000;

export interface StmCacheResult<T> {
	data: T;
	stale: boolean;
}

export class StmDataUnavailableError extends Error {
	readonly httpStatus: number;
	readonly retryAfterMs: number;

	constructor(message: string, httpStatus = 503, retryAfterMs = 15000) {
		super(message);
		this.name = 'StmDataUnavailableError';
		this.httpStatus = httpStatus;
		this.retryAfterMs = retryAfterMs;
	}
}

interface CacheEntry<T> {
	data: T | null;
	fetchedAt: number;
	inFlight: Promise<T> | null;
}

function createCacheEntry<T>(): CacheEntry<T> {
	return { data: null, fetchedAt: 0, inFlight: null };
}

/** fetchedAt "retrasado" para que la entrada solo se considere fresca
 * durante FALLBACK_TTL_MS, aunque el ttlMs normal de esa cache sea mucho
 * más largo (ver comentario de FALLBACK_TTL_MS arriba). */
function backdatedFetchedAt(ttlMs: number): number {
	return Date.now() - ttlMs + FALLBACK_TTL_MS;
}

async function getCached<T>(
	cache: CacheEntry<T>,
	ttlMs: number,
	fetcher: () => Promise<T>,
	fallbackGetter?: () => Promise<T | null>
): Promise<StmCacheResult<T>> {
	const now = Date.now();
	const isFresh = cache.data !== null && now - cache.fetchedAt < ttlMs;

	if (isFresh) {
		return { data: cache.data as T, stale: false };
	}

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

	try {
		const freshData = await cache.inFlight;
		return { data: freshData, stale: false };
	} catch (err) {
		console.warn(`[stmCache] error al refrescar datos frescos (${err instanceof Error ? err.message : err})`);

		// Si ya teníamos datos previos en memoria, los devolvemos como STALE
		if (cache.data !== null) {
			return { data: cache.data, stale: true };
		}

		// Intentar fallback si se provee uno (ej. listado global)
		if (fallbackGetter) {
			try {
				const fallback = await fallbackGetter();
				if (fallback !== null) {
					cache.data = fallback;
					cache.fetchedAt = backdatedFetchedAt(ttlMs);
					return { data: fallback, stale: true };
				}
			} catch (fErr) {
				console.warn('[stmCache] error en fallback', fErr);
			}
		}

		const is429 = err instanceof StmApiError && err.status === 429;
		const cooldown = getStmRateLimitCooldownMs();
		throw new StmDataUnavailableError(
			is429 ? 'Límite de peticiones alcanzado en STM (cooldown activo)' : 'Servicio STM no disponible',
			is429 ? 429 : 503,
			cooldown > 0 ? cooldown : 15_000
		);
	}
}

const lineVariantsCache = createCacheEntry<LineVariant[]>();
const busStopsCache = createCacheEntry<BusStopListItem[]>();
const allBusesCache = createCacheEntry<Bus[]>();

export function getLineVariants(): Promise<StmCacheResult<LineVariant[]>> {
	return getCached(lineVariantsCache, LONG_TTL_MS, () => stmFetch('/buses/linevariants') as Promise<LineVariant[]>);
}

export function getBusStops(): Promise<StmCacheResult<BusStopListItem[]>> {
	return getCached(busStopsCache, LONG_TTL_MS, () => stmFetch('/buses/busstops') as Promise<BusStopListItem[]>);
}

export function getAllBuses(): Promise<StmCacheResult<Bus[]>> {
	return getCached(allBusesCache, ALL_BUSES_TTL_MS, () => stmFetch('/buses') as Promise<Bus[]>);
}

// --- Caches por clave para BusStopDetail y UpcomingBuses ---
interface KeyedStoreEntry<T> {
	data: T;
	fetchedAt: number;
}

function makeKeyedSwrGetter<T>(ttlMs: number, fetcher: (key: string) => Promise<T>) {
	const store = new Map<string, KeyedStoreEntry<T>>();
	const inFlightMap = new Map<string, Promise<T>>();

	return async function get(key: string, fallbackFetcher?: () => Promise<T | null>): Promise<StmCacheResult<T>> {
		const entry = store.get(key);
		const now = Date.now();
		const isFresh = entry && now - entry.fetchedAt < ttlMs;

		if (isFresh) {
			return { data: entry.data, stale: false };
		}

		let pending = inFlightMap.get(key);
		if (!pending) {
			pending = fetcher(key)
				.then((data) => {
					store.set(key, { data, fetchedAt: Date.now() });
					return data;
				})
				.finally(() => {
					inFlightMap.delete(key);
				});
			inFlightMap.set(key, pending);
		}

		try {
			const data = await pending;
			return { data, stale: false };
		} catch (err) {
			console.warn(`[stmCache] Keyed fetch falló para ${key}: ${err instanceof Error ? err.message : err}`);

			if (entry) {
				return { data: entry.data, stale: true };
			}

			if (fallbackFetcher) {
				try {
					const fallback = await fallbackFetcher();
					if (fallback !== null) {
						// Backdateado a propósito: ver comentario de FALLBACK_TTL_MS
						// arriba del archivo. Sin esto, un dato incompleto (ej. parada
						// sin `lineas`) queda "fresco" por el ttlMs completo (1h) y no
						// se reintenta el fetch real hasta que expire.
						store.set(key, { data: fallback, fetchedAt: backdatedFetchedAt(ttlMs) });
						return { data: fallback, stale: true };
					}
				} catch (fbErr) {
					console.warn(`[stmCache] Fallback falló para ${key}`, fbErr);
				}
			}

			const is429 = err instanceof StmApiError && err.status === 429;
			const cooldown = getStmRateLimitCooldownMs();
			throw new StmDataUnavailableError(
				is429 ? 'Límite de peticiones alcanzado en STM' : 'Datos no disponibles',
				is429 ? 429 : 503,
				cooldown > 0 ? cooldown : 15_000
			);
		}
	};
}

const getBusStopDetailSwr = makeKeyedSwrGetter<BusStopDetail>(
	LONG_TTL_MS,
	(busstopId) => stmFetch(`/buses/busstops/${busstopId}`) as Promise<BusStopDetail>
);

export async function getBusStopDetail(busstopId: number | string): Promise<StmCacheResult<BusStopDetail>> {
	const key = String(busstopId);

	// Fallback si la API de STM falla al pedir el detalle: construir la parada desde `getBusStops()` cacheado
	const fallbackFromBusStopsList = async (): Promise<BusStopDetail | null> => {
		if (busStopsCache.data) {
			const idNum = Number(busstopId);
			const match = busStopsCache.data.find((s) => s.busstopId === idNum);
			if (match) {
				return {
					paradaId: match.busstopId,
					calle1: match.street1,
					calle2: match.street2,
					calle1Id: match.street1Id,
					calle2Id: match.street2Id,
					lineas: [],
					variantes: [],
					location: match.location
				};
			}
		}
		return null;
	};

	return getBusStopDetailSwr(key, fallbackFromBusStopsList);
}

const upcomingCacheSwr = makeKeyedSwrGetter<UpcomingBus[]>(UPCOMING_TTL_MS, async (key) => {
	const [busstopId, lines] = key.split('::');
	const params: Record<string, string> = {};
	if (lines) params.lines = lines;
	return stmFetch(`/buses/busstops/${busstopId}/upcomingbuses`, params) as Promise<UpcomingBus[]>;
});

export function getUpcomingBuses(busstopId: number | string, lines: string): Promise<StmCacheResult<UpcomingBus[]>> {
	return upcomingCacheSwr(`${busstopId}::${lines}`);
}