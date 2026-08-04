import { getBusStopDetail } from '$lib/server/stmCache';
import { jsonFromStmCache, handleStmError } from '$lib/server/stmHttp';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const result = await getBusStopDetail(params.busstopId!);
		return jsonFromStmCache(result, 'public, max-age=3600');
	} catch (err) {
		return handleStmError(err);
	}
};