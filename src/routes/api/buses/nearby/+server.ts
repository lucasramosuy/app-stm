import { json, error } from '@sveltejs/kit';
import { getAllBuses } from '$lib/server/stmCache';
import type { RequestHandler } from './$types';

const MAX_RESULTS = 400;

export const GET: RequestHandler = async ({ url }) => {
	const minLat = Number(url.searchParams.get('minLat'));
	const minLng = Number(url.searchParams.get('minLng'));
	const maxLat = Number(url.searchParams.get('maxLat'));
	const maxLng = Number(url.searchParams.get('maxLng'));

	if ([minLat, minLng, maxLat, maxLng].some((n) => Number.isNaN(n))) {
		throw error(400, 'Faltan o son inválidos los parámetros minLat/minLng/maxLat/maxLng');
	}

	const allBuses = await getAllBuses();

	const results = [];
	for (const bus of allBuses) {
		const [lng, lat] = bus.location.coordinates;
		if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
			results.push(bus);
			if (results.length >= MAX_RESULTS) break;
		}
	}

	return json(results, {
		headers: { 'Cache-Control': 'no-store' }
	});
};