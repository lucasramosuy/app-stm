import { error, json } from '@sveltejs/kit';
import { getBusStops } from '$lib/server/stmCache';
import { stmResultHeaders, handleStmError } from '$lib/server/stmHttp';
import type { RequestHandler } from './$types';

const MAX_RESULTS = 300;

export const GET: RequestHandler = async ({ url }) => {
	const minLat = Number(url.searchParams.get('minLat'));
	const minLng = Number(url.searchParams.get('minLng'));
	const maxLat = Number(url.searchParams.get('maxLat'));
	const maxLng = Number(url.searchParams.get('maxLng'));

	if ([minLat, minLng, maxLat, maxLng].some((n) => Number.isNaN(n))) {
		throw error(400, 'Faltan o son inválidos los parámetros minLat/minLng/maxLat/maxLng');
	}

	try {
		const result = await getBusStops();
		const results = [];
		for (const stop of result.data) {
			const [lng, lat] = stop.location.coordinates;
			if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
				results.push({
					busstopId: stop.busstopId,
					street1: stop.street1,
					street2: stop.street2,
					location: stop.location
				});
				if (results.length >= MAX_RESULTS) break;
			}
		}

		return json(results, {
			headers: stmResultHeaders(result, 'no-store')
		});
	} catch (err) {
		return handleStmError(err);
	}
};