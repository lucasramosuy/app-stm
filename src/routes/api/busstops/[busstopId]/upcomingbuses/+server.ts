import { json, error } from '@sveltejs/kit';
import { getUpcomingBuses } from '$lib/server/stmCache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const lines = url.searchParams.get('lines');
	if (!lines) {
		throw error(400, 'Falta el parámetro "lines" (ej: ?lines=103,G)');
	}

	const data = await getUpcomingBuses(params.busstopId!, lines);

	return json(data, {
		headers: { 'Cache-Control': 'no-store' }
	});
};