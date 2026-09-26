import { json, error } from '@sveltejs/kit';
import { createLiveShare, getLiveShareStore } from '$lib/server/liveShare';
import type { RequestHandler } from './$types';

// Crea una sesión efímera de ubicación en vivo (TTL 1h, sin historial).
export const POST: RequestHandler = async () => {
	try {
		const store = await getLiveShareStore();
		const session = await createLiveShare(store);
		return json(session, { headers: { 'Cache-Control': 'no-store' } });
	} catch (e) {
		console.error('[live-share] no se pudo crear la sesión', e);
		throw error(500, 'No se pudo crear la sesión');
	}
};
