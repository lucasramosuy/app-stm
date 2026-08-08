import { json, error } from '@sveltejs/kit';
import { getRouteShape } from '$lib/server/routeShapes';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const line = params.line!;
	const shapes = getRouteShape(line);

	if (!shapes) {
		throw error(404, `No hay recorrido geográfico para la línea "${line}"`);
	}

	return json(
		{
			type: 'FeatureCollection',
			features: shapes.map((coordinates, i) => ({
				type: 'Feature',
				properties: { line, variant: i },
				geometry: { type: 'LineString', coordinates }
			}))
		},
		{
			// Dato estático (se regenera manualmente con build-shapes.mjs, no en
			// cada deploy): cache fuerte tanto en CDN como en el navegador.
			headers: { 'Cache-Control': 'public, max-age=86400' }
		}
	);
};