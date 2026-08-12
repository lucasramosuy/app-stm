import { error } from '@sveltejs/kit';
import { getUpcomingBuses } from '$lib/server/stmCache';
import { jsonFromStmCache, handleStmError } from '$lib/server/stmHttp';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	// La API de STM exige indicar qué líneas se quieren ver en esta parada
	// (confirmado empíricamente). Sin esta validación temprana, un request
	// sin "lines" le pegaba igual a STM y devolvía un error genérico de
	// ellos en vez de un 400 nuestro y descriptivo.
	const lines = url.searchParams.get('lines');
	if (!lines) {
		throw error(400, 'Falta el parámetro "lines" (ej: ?lines=103,G)');
	}

	try {
		const result = await getUpcomingBuses(params.busstopId!, lines);
		return jsonFromStmCache(result, 'no-store');
	} catch (err) {
		return handleStmError(err);
	}
};