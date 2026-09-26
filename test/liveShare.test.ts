import { describe, expect, it } from 'vitest';
import {
	createLiveShare,
	createMemoryStore,
	deleteLiveShare,
	isValidPosition,
	LIVE_SHARE_TTL_MS,
	makeId,
	readLiveShare,
	updateLiveSharePosition
} from '../src/lib/server/liveShare';

const T0 = 1_800_000_000_000; // epoch ms fijo para los tests
const POS: [number, number] = [-56.1842, -34.9037];

describe('makeId', () => {
	it('genera ids base62 de 22 chars, únicos', () => {
		const a = makeId();
		const b = makeId();
		expect(a).toMatch(/^[0-9A-Za-z]{22}$/);
		expect(b).toMatch(/^[0-9A-Za-z]{22}$/);
		expect(a).not.toBe(b);
	});
});

describe('isValidPosition', () => {
	it('acepta [lng, lat] válidos', () => {
		expect(isValidPosition(POS)).toBe(true);
		expect(isValidPosition([180, 90])).toBe(true);
		expect(isValidPosition([-180, -90])).toBe(true);
	});

	it('rechaza valores inválidos', () => {
		expect(isValidPosition(null)).toBe(false);
		expect(isValidPosition('acá')).toBe(false);
		expect(isValidPosition([-56.1])).toBe(false);
		expect(isValidPosition([-56.1, -34.9, 3])).toBe(false);
		expect(isValidPosition([181, 0])).toBe(false);
		expect(isValidPosition([0, 91])).toBe(false);
		expect(isValidPosition([NaN, 0])).toBe(false);
		expect(isValidPosition(['-56.1', -34.9])).toBe(false);
	});
});

describe('sesiones de ubicación en vivo', () => {
	it('crear y leer: posición vacía, TTL de 1 hora', async () => {
		const store = createMemoryStore();
		const session = await createLiveShare(store, T0);
		expect(session.expiresAt).toBe(T0 + LIVE_SHARE_TTL_MS);

		const read = await readLiveShare(store, session.id, T0);
		expect(read).not.toBeNull();
		expect(read?.position).toBeNull();
		expect(read?.expiresAt).toBe(session.expiresAt);
	});

	it('actualizar pisa la posición anterior (sin historial)', async () => {
		const store = createMemoryStore();
		const session = await createLiveShare(store, T0);

		expect(await updateLiveSharePosition(store, session.id, session.token, POS, T0 + 1_000)).toBe('ok');
		const next: [number, number] = [-56.15, -34.91];
		expect(await updateLiveSharePosition(store, session.id, session.token, next, T0 + 2_000)).toBe('ok');

		const read = await readLiveShare(store, session.id, T0 + 3_000);
		expect(read?.position).toEqual(next);
		expect(read?.updatedAt).toBe(T0 + 2_000);
	});

	it('el TTL no se extiende con las actualizaciones', async () => {
		const store = createMemoryStore();
		const session = await createLiveShare(store, T0);
		await updateLiveSharePosition(store, session.id, session.token, POS, T0 + 30 * 60_000);

		// A los 61 minutos de creada (aunque hubo actividad) ya expiró.
		expect(await readLiveShare(store, session.id, T0 + 61 * 60_000)).toBeNull();
		// Y la lectura la borró: una escritura posterior también falla.
		expect(await updateLiveSharePosition(store, session.id, session.token, POS, T0 + 61 * 60_000)).toBe('not_found');
	});

	it('expirada: lectura devuelve null pero NO borra la sesión', async () => {
		const store = createMemoryStore();
		const session = await createLiveShare(store, T0);
		await updateLiveSharePosition(store, session.id, session.token, POS, T0);

		expect(await readLiveShare(store, session.id, T0 + LIVE_SHARE_TTL_MS + 1)).toBeNull();
		// No se borra en lectura: una instancia con el reloj corrido no
		// puede destruir la sesión. El token de escritura sigue mandando.
		expect(await deleteLiveShare(store, session.id, session.token)).toBe('ok');
	});

	it('escribir o borrar con token incorrecto es forbidden', async () => {
		const store = createMemoryStore();
		const session = await createLiveShare(store, T0);

		expect(await updateLiveSharePosition(store, session.id, 'token-trucho', POS, T0)).toBe('forbidden');
		expect(await deleteLiveShare(store, session.id, 'token-trucho')).toBe('forbidden');

		// y la posición quedó intacta
		const read = await readLiveShare(store, session.id, T0);
		expect(read?.position).toBeNull();
	});

	it('id desconocido: not_found en lectura, escritura y borrado', async () => {
		const store = createMemoryStore();
		expect(await readLiveShare(store, makeId(), T0)).toBeNull();
		expect(await updateLiveSharePosition(store, makeId(), 'x', POS, T0)).toBe('not_found');
		expect(await deleteLiveShare(store, makeId(), 'x')).toBe('not_found');
	});

	it('borrar con token válido elimina la sesión', async () => {
		const store = createMemoryStore();
		const session = await createLiveShare(store, T0);
		await updateLiveSharePosition(store, session.id, session.token, POS, T0);

		expect(await deleteLiveShare(store, session.id, session.token)).toBe('ok');
		expect(await readLiveShare(store, session.id, T0)).toBeNull();
	});

	it('la lectura pública no expone el token de escritura', async () => {
		const store = createMemoryStore();
		const session = await createLiveShare(store, T0);
		const read = await readLiveShare(store, session.id, T0);
		expect(read).not.toBeNull();
		expect(JSON.stringify(read)).not.toContain(session.token);
	});
});
