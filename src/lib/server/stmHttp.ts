import { json, type NumericRange } from '@sveltejs/kit';
import { StmDataUnavailableError, type StmCacheResult } from './stmCache';
import { StmApiError } from './stmApi';

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

export function handleStmError(err: unknown): ReturnType<typeof json> {
	if (err instanceof StmDataUnavailableError) {
		return json(
			{ error: 'data_unavailable', message: err.message, retryAfterMs: err.retryAfterMs },
			{ status: err.httpStatus as NumericRange<400, 599> }
		);
	}
	if (err instanceof StmApiError) {
		const status = err.status >= 400 && err.status < 600 ? err.status : 503;
		return json(
			{ error: 'stm_api_error', message: err.message, status: err.status },
			{ status: status as NumericRange<400, 599> }
		);
	}
	console.error('[API Handler Error]', err);
	return json(
		{ error: 'internal_error', message: 'Error interno al procesar la solicitud' },
		{ status: 500 }
	);
}