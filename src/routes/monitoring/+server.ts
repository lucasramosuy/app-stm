import type { RequestHandler } from './$types';

// Tunnel de Sentry: reenvía los envelopes desde nuestro propio origen en
// vez de que el navegador pegue directo a ingest.sentry.io. Bloqueadores
// de ads/privacidad (uBlock, Brave Shields, etc.) tienen ese dominio en
// sus listas y cortan el request — con el tunnel, para el bloqueador es
// tráfico normal de la app. Ver: https://docs.sentry.io/platforms/javascript/troubleshooting/#dealing-with-ad-blockers

const SENTRY_HOST = 'o4510988275482624.ingest.us.sentry.io';
// Whitelist de project IDs válidos, para no convertir esto en un proxy
// abierto que cualquiera pueda usar para mandar tráfico a donde quiera.
const ALLOWED_PROJECT_IDS = ['4511939418390528'];

export const POST: RequestHandler = async ({ request }) => {
	const envelopeText = await request.text();

	let projectId: string;
	try {
		const firstLine = envelopeText.split('\n')[0];
		const header = JSON.parse(firstLine) as { dsn?: string };
		if (!header.dsn) throw new Error('Envelope sin dsn en el header');
		projectId = new URL(header.dsn).pathname.replace('/', '');
	} catch (err) {
		console.warn('[monitoring tunnel] no se pudo parsear el envelope', err);
		return new Response('Bad envelope', { status: 400 });
	}

	if (!ALLOWED_PROJECT_IDS.includes(projectId)) {
		return new Response('Unknown project id', { status: 400 });
	}

	const upstreamUrl = `https://${SENTRY_HOST}/api/${projectId}/envelope/`;

	const upstreamRes = await fetch(upstreamUrl, {
		method: 'POST',
		body: envelopeText,
		headers: { 'Content-Type': 'application/x-sentry-envelope' }
	});

	return new Response(await upstreamRes.text(), { status: upstreamRes.status });
};