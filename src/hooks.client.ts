import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';
import type { HandleClientError } from '@sveltejs/kit';

Sentry.init({
	dsn: env.PUBLIC_SENTRY_DSN,
	environment: env.PUBLIC_ENV_NAME ?? 'production',
	tracesSampleRate: 0.1,
	tunnel: '/monitoring',

	integrations: [
		Sentry.feedbackIntegration({
			autoInject: false, // no mostrar el botón flotante default — lo ponemos nosotros en el sidebar
			colorScheme: 'dark',
			showBranding: false,
			buttonLabel: 'Reportar un problema',
			submitButtonLabel: 'Enviar',
			formTitle: 'Reportar un problema o sugerencia',
			messageLabel: 'Contanos qué pasó o qué te gustaría que tuviera la app',
			messagePlaceholder: 'Ej: el mapa no me deja seleccionar la parada de...'
		})
	]
});

export const handleError: HandleClientError = Sentry.handleErrorWithSentry(({ error }) => {
	console.error('[client error]', error);
});