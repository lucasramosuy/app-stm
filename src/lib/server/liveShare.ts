// Sesiones efímeras de "compartir ubicación en vivo".
//
// Privacidad por diseño:
// - TTL fijo de 1 hora desde la creación (no se renueva): la sesión
//   muere sola aunque quien comparte se olvide de cortarla, y también
//   se borra apenas termina el viaje.
// - El id es aleatorio de 128 bits (no adivinable) y alcanza para LEER
//   la posición — es lo que viaja en el link compartido.
// - Escribir o borrar exige además el token de escritura, que solo
//   conoce el dispositivo que comparte.
// - No hay historial: cada actualización pisa la posición anterior.
// - Al expirar, la primera lectura borra la sesión (lazy delete) y el
//   blob se guarda con metadata.expiration como red de seguridad.
//
// Storage: Netlify Blobs en producción (incluido en todos los planes;
// consume del pool de 300 créditos/mes del plan Free, que tiene límite
// duro — agota cuota pero nunca cobra). En dev local y en los tests se
// usa un store en memoria con la misma interfaz.

export interface LiveShareRecord {
	position: [number, number] | null; // [lng, lat] — null hasta el primer fix
	updatedAt: number; // epoch ms del último fix
	expiresAt: number; // epoch ms — fijo desde la creación
	token: string; // token de escritura (solo lo tiene quien comparte)
}

export interface LiveShareStore {
	get(id: string): Promise<LiveShareRecord | null>;
	set(id: string, record: LiveShareRecord): Promise<void>;
	delete(id: string): Promise<void>;
}

export const LIVE_SHARE_TTL_MS = 60 * 60 * 1000; // 1 hora

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Id aleatorio base62. Con 22 chars son ~131 bits de entropía: no
 * adivinable por fuerza bruta. */
export function makeId(length = 22): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let out = '';
	for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
	return out;
}

export function isValidPosition(value: unknown): value is [number, number] {
	return (
		Array.isArray(value) &&
		value.length === 2 &&
		typeof value[0] === 'number' &&
		typeof value[1] === 'number' &&
		Number.isFinite(value[0]) &&
		Number.isFinite(value[1]) &&
		Math.abs(value[0]) <= 180 &&
		Math.abs(value[1]) <= 90
	);
}

// --- Store en memoria (dev local y tests) ---

export function createMemoryStore(): LiveShareStore {
	const map = new Map<string, LiveShareRecord>();
	return {
		async get(id) {
			return map.get(id) ?? null;
		},
		async set(id, record) {
			map.set(id, { ...record });
		},
		async delete(id) {
			map.delete(id);
		}
	};
}

// --- Store de Netlify Blobs (producción) ---

async function createNetlifyStore(): Promise<LiveShareStore> {
	const { getStore } = await import('@netlify/blobs');
	// consistencia fuerte: quien recibe el link tiene que ver el último
	// punto apenas se escribe, no una versión cacheada de otra región.
	const store = getStore({ name: 'live-share', consistency: 'strong' });
	return {
		async get(id) {
			const result = await store.getWithMetadata(id, { type: 'json' });
			if (!result) return null;
			return result.data as LiveShareRecord;
		},
		async set(id, record) {
			await store.setJSON(id, record, {
				metadata: { expiration: record.expiresAt }
			});
		},
		async delete(id) {
			await store.delete(id);
		}
	};
}

let cachedStore: LiveShareStore | null = null;

/** Blobs solo existe dentro del runtime de Netlify; en `vite dev` se cae
 * a memoria (no persiste entre reinicios, suficiente para probar). */
export async function getLiveShareStore(): Promise<LiveShareStore> {
	if (cachedStore) return cachedStore;
	if (process.env.NETLIFY) {
		cachedStore = await createNetlifyStore();
	} else {
		cachedStore = createMemoryStore();
	}
	return cachedStore;
}

// --- Operaciones (puras respecto del store: testeables) ---

export interface LiveSharePublic {
	position: [number, number] | null;
	updatedAt: number;
	expiresAt: number;
}

export async function createLiveShare(
	store: LiveShareStore,
	now = Date.now()
): Promise<{ id: string; token: string; expiresAt: number }> {
	const id = makeId();
	const token = makeId(30);
	const expiresAt = now + LIVE_SHARE_TTL_MS;
	await store.set(id, { position: null, updatedAt: now, expiresAt, token });
	return { id, token, expiresAt };
}

/** Devuelve la sesión pública o null si no existe o expiró (borrándola
 * en ese caso). Nunca expone el token de escritura. */
export async function readLiveShare(
	store: LiveShareStore,
	id: string,
	now = Date.now()
): Promise<LiveSharePublic | null> {
	const record = await store.get(id);
	if (!record) return null;
	if (now > record.expiresAt) {
		await store.delete(id).catch(() => {});
		return null;
	}
	return { position: record.position, updatedAt: record.updatedAt, expiresAt: record.expiresAt };
}

export type WriteResult = 'ok' | 'not_found' | 'forbidden';

/** Pisa la posición anterior: no se guarda historial. El TTL no se
 * extiende — la sesión muere a la hora de creada igual. */
export async function updateLiveSharePosition(
	store: LiveShareStore,
	id: string,
	token: string,
	position: [number, number],
	now = Date.now()
): Promise<WriteResult> {
	const record = await store.get(id);
	if (!record) return 'not_found';
	if (now > record.expiresAt) {
		await store.delete(id).catch(() => {});
		return 'not_found';
	}
	if (record.token !== token) return 'forbidden';
	await store.set(id, { ...record, position, updatedAt: now });
	return 'ok';
}

export async function deleteLiveShare(
	store: LiveShareStore,
	id: string,
	token: string
): Promise<WriteResult> {
	const record = await store.get(id);
	if (!record) return 'not_found';
	if (record.token !== token) return 'forbidden';
	await store.delete(id);
	return 'ok';
}
