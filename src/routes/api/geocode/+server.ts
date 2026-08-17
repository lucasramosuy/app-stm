import { json, error } from '@sveltejs/kit';
import { geocodeAddress } from '$lib/server/geocode';
import type { RequestHandler } from './$types';

const MIN_QUERY_LENGTH = 4;

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	if (q.length < MIN_QUERY_LENGTH) {
		return json([]);
	}

	try {
		const results = await geocodeAddress(q);
		// No cacheamos agresivo: una dirección puede tener varios
		// resultados según cómo la escriba cada usuario, y el volumen
		// de búsquedas de dirección es bajo comparado con paradas/buses.
		return json(results, { headers: { 'Cache-Control': 'private, max-age=300' } });
	} catch (err) {
		console.error('[geocode] error consultando Nominatim', err);
		throw error(502, 'No se pudo buscar la dirección');
	}
};