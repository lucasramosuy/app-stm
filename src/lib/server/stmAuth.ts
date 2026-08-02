import { env } from '$env/dynamic/private';

const TOKEN_URL = 'https://mvdapi-auth.montevideo.gub.uy/token';

// El token de STM dura 300s (5 min). Lo cacheamos en memoria del proceso
// y lo renovamos un poco antes de que expire para no quedarnos sin él
// a mitad de un request.
const REFRESH_MARGIN_SECONDS = 30;

interface CachedToken {
	accessToken: string;
	expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

async function fetchNewToken(): Promise<CachedToken> {
	const clientId = env.STM_CLIENT_ID;
	const clientSecret = env.STM_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new Error(
			'Faltan STM_CLIENT_ID / STM_CLIENT_SECRET. Definilos en tu .env (ver .env.example).'
		);
	}

	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: clientId,
			client_secret: clientSecret
		})
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`No se pudo obtener token de STM (${res.status}): ${body}`);
	}

	const data = (await res.json()) as { access_token: string; expires_in: number };

	return {
		accessToken: data.access_token,
		expiresAt: Date.now() + (data.expires_in - REFRESH_MARGIN_SECONDS) * 1000
	};
}

/**
 * Devuelve un access token válido, reusando el cacheado si todavía
 * no está por expirar. Si varios requests piden token al mismo tiempo
 * mientras no hay uno cacheado, comparten la misma promesa en vez de
 * pedir varios tokens en paralelo.
 */
export async function getStmAccessToken(): Promise<string> {
	if (cached && cached.expiresAt > Date.now()) {
		return cached.accessToken;
	}

	if (!inFlight) {
		inFlight = fetchNewToken()
			.then((token) => {
				cached = token;
				return token.accessToken;
			})
			.finally(() => {
				inFlight = null;
			});
	}

	return inFlight;
}
