/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

// Redeclarar `self` con el tipo correcto para este contexto — sin esto,
// TypeScript lo sigue viendo como el `self` de una página normal (tipo
// `Window`) en vez del scope real de un service worker.
declare const self: ServiceWorkerGlobalScope;

const CACHE_NAME = `app-shell-${version}`;

// Todo lo que Vite generó en el build (JS/CSS con hash) + los archivos
// estáticos de /static (íconos, manifest, fuentes). Los tiles del mapa
// (OpenFreeMap) y cualquier /api/* quedan afuera a propósito — ver
// comentarios más abajo.
const ASSETS_TO_CACHE = [...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(ASSETS_TO_CACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Nunca cachear la API propia: buses, ETAs y paradas son datos en
	// vivo — servir una respuesta vieja de caché sería mostrarle al
	// usuario un bus que ya no está ahí. Se deja pasar directo a la red;
	// si falla, que falle (la UI ya maneja loading/error por su cuenta).
	if (url.pathname.startsWith('/api/')) return;

	// Tiles del mapa (OpenFreeMap) y Nominatim: externos, no son
	// nuestros para cachear con esta estrategia, y el volumen de datos
	// (miles de tiles) haría que el cache se descontrole rápido.
	if (url.origin !== self.location.origin) return;

	// App shell: cache-first con fallback a red — carga instantánea en
	// visitas repetidas, se actualiza solo cuando cambia `version`
	// (nuevo deploy → nuevo CACHE_NAME → los viejos se limpian en
	// 'activate').
	event.respondWith(
		caches.match(request).then((cached) => {
			if (cached) return cached;
			return fetch(request).catch(() => {
				// Sin red y sin caché para esta request: si pedían una
				// página de navegación, mostrar el shell raíz en vez de
				// un error de red crudo. Para todo lo demás (assets
				// puntuales), dejar que falle.
				if (request.mode === 'navigate') {
					return caches.match('/').then((shell) => shell ?? Response.error());
				}
				return Response.error();
			});
		})
	);
});