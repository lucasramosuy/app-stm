import { error, json } from '@sveltejs/kit';
import { getAllBuses } from '$lib/server/stmCache';
import { stmResultHeaders, handleStmError } from '$lib/server/stmHttp';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const line = url.searchParams.get('line')?.trim();
	if (!line) {
		throw error(400, 'Falta el parámetro "line"');
	}

	try {
		const result = await getAllBuses();
		const filtered = result.data.filter((bus) => bus.line === line);

		return json(filtered, {
			headers: stmResultHeaders(result, 'no-store')
		});
	} catch (err) {
		return handleStmError(err);
	}
};