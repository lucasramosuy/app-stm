import { json, error } from '@sveltejs/kit';
import { stmFetch } from '$lib/server/stmApi';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	// Bounding box del área visible del mapa. Nombres de parámetros (minLat,
	// minLng, maxLat, maxLng) son un supuesto razonable a confirmar contra
	// la respuesta real la primera vez que probemos este endpoint.
	const minLat = url.searchParams.get('minLat');
	const minLng = url.searchParams.get('minLng');
	const maxLat = url.searchParams.get('maxLat');
	const maxLng = url.searchParams.get('maxLng');

	if (!minLat || !minLng || !maxLat || !maxLng) {
		throw error(400, 'Faltan parámetros de bounding box (minLat, minLng, maxLat, maxLng)');
	}

	const data = await stmFetch('/buses/geo', { minLat, minLng, maxLat, maxLng });

	return json(data, {
		headers: { 'Cache-Control': 'no-store' }
	});
};
