import { error } from '@sveltejs/kit';
import { getAllBuses } from '$lib/server/stmCache';
import { jsonFromStmCache, handleStmError } from '$lib/server/stmHttp';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const line = url.searchParams.get('line')?.trim();
	if (!line) {
		throw error(400, 'Falta el parámetro "line"');
	}

	try {
		// getAllBuses() devuelve { data, stale } (ver stmCache.ts), no el
		// array directo — de ahí el bug: filtrar sobre el objeto en vez de
		// sobre result.data explotaba con "allBuses.filter is not a function".
		const result = await getAllBuses();
		const results = result.data.filter((bus) => bus.line === line);

		return jsonFromStmCache({ data: results, stale: result.stale }, 'no-store');
	} catch (err) {
		return handleStmError(err);
	}
};