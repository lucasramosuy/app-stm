import { getUpcomingBuses } from '$lib/server/stmCache';
import { jsonFromStmCache, handleStmError } from '$lib/server/stmHttp';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const lines = url.searchParams.get('lines') ?? '';
	try {
		const result = await getUpcomingBuses(params.busstopId!, lines);
		return jsonFromStmCache(result, 'no-store');
	} catch (err) {
		return handleStmError(err);
	}
};