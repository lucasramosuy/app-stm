import { json, error } from '@sveltejs/kit';
import { getAllBuses } from '$lib/server/stmCache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const line = url.searchParams.get('line')?.trim();
	if (!line) {
		throw error(400, 'Falta el parámetro "line"');
	}

	const allBuses = await getAllBuses();
	const results = allBuses.filter((bus) => bus.line === line);

	return json(results, {
		headers: { 'Cache-Control': 'no-store' }
	});
};