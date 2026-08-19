import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/private';
import type { HandleServerError } from '@sveltejs/kit';

Sentry.init({
	dsn: env.SENTRY_DSN,
	environment: env.PUBLIC_ENV_NAME ?? 'production',
	tracesSampleRate: 0.1
});

// El wrapper de Sentry envuelve el handle de SvelteKit para capturar
// errores no manejados en cualquier +server.ts o +page.server.ts.
export const handle = Sentry.sentryHandle();

export const handleError: HandleServerError = Sentry.handleErrorWithSentry(({ error, event }) => {
	console.error('[server error]', event.route?.id, error);
});