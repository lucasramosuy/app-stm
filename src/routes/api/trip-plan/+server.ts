import { json, error } from '@sveltejs/kit';
import { planTrip, DEFAULT_WALK_RADIUS_M } from '$lib/server/tripPlanner';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const originLat = Number(url.searchParams.get('originLat'));
	const originLng = Number(url.searchParams.get('originLng'));
	const destLat = Number(url.searchParams.get('destLat'));
	const destLng = Number(url.searchParams.get('destLng'));
	const radius = Number(url.searchParams.get('radius')) || DEFAULT_WALK_RADIUS_M;

	if ([originLat, originLng, destLat, destLng].some((n) => Number.isNaN(n))) {
		throw error(400, 'Faltan o son inválidos los parámetros de origen/destino');
	}

	try {
		const result = await planTrip([originLng, originLat], [destLng, destLat], radius);
		return json(result, { headers: { 'Cache-Control': 'no-store' } });
	} catch (err) {
		console.error('[trip-plan] error calculando ruta', err);
		throw error(500, 'No se pudo calcular la ruta');
	}
};