import { getStmAccessToken } from './stmAuth';

const BASE_URL = 'https://api.montevideo.gub.uy/api/transportepublico';

/** Tras un 429 de STM, evitamos nuevos requests hasta que pase este instante. */
let blockedUntil = 0;

const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 45_000;

export class StmApiError extends Error {
	readonly status: number;
	readonly path: string;
	readonly body: string;

	constructor(status: number, path: string, body: string) {
		super(`STM API ${path} devolvió ${status}: ${body}`);
		this.name = 'StmApiError';
		this.status = status;
		this.path = path;
		this.body = body;
	}
}

export function isStmRateLimited(): boolean {
	return Date.now() < blockedUntil;
}

export function getStmRateLimitCooldownMs(): number {
	return Math.max(0, blockedUntil - Date.now());
}

function markRateLimited(res: Response) {
	const retryAfter = res.headers.get('Retry-After');
	let ms = DEFAULT_RATE_LIMIT_COOLDOWN_MS;
	if (retryAfter) {
		const asSeconds = Number(retryAfter);
		if (Number.isFinite(asSeconds) && asSeconds > 0) {
			ms = asSeconds * 1000;
		}
	}
	blockedUntil = Math.max(blockedUntil, Date.now() + ms);
	console.warn(`[STM] rate limit (429); pausando requests ~${Math.round(ms / 1000)}s`);
}

/**
 * Llama a un endpoint de la API de transporte público, agregando el
 * Bearer token automáticamente. Si la respuesta es 401 (token vencido
 * justo en el medio), pide un token nuevo y reintenta una vez.
 */
export async function stmFetch(path: string, params?: Record<string, string>): Promise<unknown> {
	if (isStmRateLimited()) {
		throw new StmApiError(
			429,
			path,
			'Usage limit exceeded (cooldown local tras 429 previo)'
		);
	}

	const url = new URL(BASE_URL + path);
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
	}

	const doFetch = async (token: string) =>
		fetch(url, {
			headers: { Authorization: `Bearer ${token}` }
		});

	let token = await getStmAccessToken();
	let res = await doFetch(token);

	if (res.status === 401) {
		// token vencido a destiempo: forzamos uno nuevo y reintentamos una vez
		token = await getStmAccessToken();
		res = await doFetch(token);
	}

	if (res.status === 429) {
		markRateLimited(res);
		const body = await res.text();
		throw new StmApiError(429, path, body);
	}

	if (!res.ok) {
		const body = await res.text();
		throw new StmApiError(res.status, path, body);
	}

	return res.json();
}
