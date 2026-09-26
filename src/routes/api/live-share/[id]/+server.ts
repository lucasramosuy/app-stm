import { json, error } from '@sveltejs/kit';
import {
	deleteLiveShare,
	getLiveShareStore,
	isValidPosition,
	readLiveShare,
	updateLiveSharePosition
} from '$lib/server/liveShare';
import type { RequestHandler } from './$types';

const NO_STORE = { 'Cache-Control': 'no-store' };
// Los ids salen de makeId (base62, 22 chars) — cualquier otra cosa no
// es una sesión.
const ID_RE = /^[0-9A-Za-z]{22}$/;

function checkId(id: string) {
	if (!ID_RE.test(id)) throw error(404, 'Sesión no encontrada');
}

// Lectura pública de la posición (quien tiene el link). Sin token.
export const GET: RequestHandler = async ({ params }) => {
	checkId(params.id);
	const store = await getLiveShareStore();
	const session = await readLiveShare(store, params.id);
	if (!session) throw error(410, 'La sesión terminó o expiró');
	return json(session, { headers: NO_STORE });
};

// Actualización de posición (solo quien comparte: exige el token).
export const POST: RequestHandler = async ({ params, request }) => {
	checkId(params.id);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Cuerpo inválido');
	}
	const { token, position } = (body ?? {}) as { token?: unknown; position?: unknown };
	if (typeof token !== 'string' || !isValidPosition(position)) {
		throw error(400, 'Faltan o son inválidos token/position');
	}
	const store = await getLiveShareStore();
	const result = await updateLiveSharePosition(store, params.id, token, position);
	if (result === 'forbidden') throw error(403, 'Token inválido');
	if (result === 'not_found') throw error(410, 'La sesión terminó o expiró');
	return json({ ok: true }, { headers: NO_STORE });
};

// Corte manual ("Dejar de compartir" / fin del viaje). Token por header.
export const DELETE: RequestHandler = async ({ params, request }) => {
	checkId(params.id);
	const token = request.headers.get('x-live-share-token') ?? '';
	const store = await getLiveShareStore();
	const result = await deleteLiveShare(store, params.id, token);
	if (result === 'forbidden') throw error(403, 'Token inválido');
	if (result === 'not_found') throw error(410, 'La sesión ya no existe');
	return json({ ok: true }, { headers: NO_STORE });
};
