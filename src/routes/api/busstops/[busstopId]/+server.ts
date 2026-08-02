import { json } from '@sveltejs/kit';
import { stmFetch } from '$lib/server/stmApi';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	// Trae la parada puntual + qué líneas pasan por ella (campo "lineas").
	// El cliente usa esto para saber qué pedir después en /upcomingbuses.
	const data = await stmFetch(`/buses/busstops/${params.busstopId}`);
	return json(data, {
		headers: { 'Cache-Control': 'public, max-age=3600' }
	});
};
