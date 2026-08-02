import { json, error } from '@sveltejs/kit';
import { stmFetch } from '$lib/server/stmApi';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	// La API exige indicar qué líneas se quieren ver en esta parada.
	const lines = url.searchParams.get('lines');
	if (!lines) {
		throw error(400, 'Falta el parámetro "lines" (ej: ?lines=103,G)');
	}

	const data = await stmFetch(`/buses/busstops/${params.busstopId}/upcomingbuses`, {
		lines
	});

	// Tiempo real: sin cache.
	return json(data, {
		headers: { 'Cache-Control': 'no-store' }
	});
};
