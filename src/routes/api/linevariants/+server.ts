import { json } from '@sveltejs/kit';
import { stmFetch } from '$lib/server/stmApi';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const data = await stmFetch('/buses/linevariants');
	// Dato estático que cambia poco: cacheamos fuerte en el CDN/navegador.
	return json(data, {
		headers: { 'Cache-Control': 'public, max-age=3600' }
	});
};
