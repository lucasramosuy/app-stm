import { json, type NumericRange } from '@sveltejs/kit';
import { StmDataUnavailableError, type StmCacheResult } from './stmCache';

export const STM_STALE_HEADER = 'X-Data-Stale';

export function stmResultHeaders(
	result: StmCacheResult<unknown>,
	cacheControl: string
): Record<string, string> {
	return {
		'Cache-Control': cacheControl,
		[STM_STALE_HEADER]: result.stale ? '1' : '0'
	};
}

export function jsonFromStmCache<T>(
	result: StmCacheResult<T>,
	cacheControl = 'no-store'
): ReturnType<typeof json> {
	return json(result.data, {
		headers: stmResultHeaders(result, cacheControl)
	});
}

export function errorFromStmFailure(err: unknown): ReturnType<typeof json> | null {
	if (err instanceof StmDataUnavailableError) {
		return json(
			{ message: err.message, retryAfterMs: err.retryAfterMs },
			{ status: err.httpStatus as NumericRange<400, 599> }
		);
	}
	return null;
}
