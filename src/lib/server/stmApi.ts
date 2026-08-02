import { getStmAccessToken } from './stmAuth';

const BASE_URL = 'https://api.montevideo.gub.uy/api/transportepublico';

/**
 * Llama a un endpoint de la API de transporte público, agregando el
 * Bearer token automáticamente. Si la respuesta es 401 (token vencido
 * justo en el medio), pide un token nuevo y reintenta una vez.
 */
export async function stmFetch(path: string, params?: Record<string, string>): Promise<unknown> {
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

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`STM API ${path} devolvió ${res.status}: ${body}`);
	}

	return res.json();
}
