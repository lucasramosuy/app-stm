import { getLineVariants } from '$lib/server/stmCache';
import { jsonFromStmCache, handleStmError } from '$lib/server/stmHttp';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const result = await getLineVariants();
		return jsonFromStmCache(result, 'public, max-age=3600');
	} catch (err) {
		return handleStmError(err);
	}
};