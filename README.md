# Buses Montevideo (App STM)

Aplicación web en tiempo real para visualizar ómnibus, paradas y planificar viajes en el transporte público de Montevideo (STM), construida sobre la API oficial de la Intendencia de Montevideo (`api.montevideo.gub.uy`).

![Stack](https://img.shields.io/badge/SvelteKit-v5-FF3E00)
![MapLibre](https://img.shields.io/badge/MapLibre_GL-v6-blue)
![Deploy](https://img.shields.io/badge/Deploy-Netlify-00C7B7)
![PWA](https://img.shields.io/badge/PWA-Instalable-5A0FC8)

---

## 🚀 Características principales

- **Mapa en tiempo real**: paradas y flota en circulación con MapLibre GL (sin API keys), estilo oscuro custom sobre OpenFreeMap.
- **ETAs precisas**: arribos actualizados cada 20 segundos con `tabular-nums` para evitar parpadeos.
- **Selección múltiple**: varias paradas y ómnibus a la vez, cada uno con su polling independiente.
- **Cómo llegar**: planificador con motor propio (directo o 1 transbordo), origen editable (GPS, mapa, parada o dirección) y trazado real de las líneas.
- **Buscador**: paradas por intersección de calles, líneas y direcciones libres (geocoding Nominatim/OSM), con debouncing.
- **Trazado de recorridos**: polyline por línea generada offline desde el GTFS estático de STM.
- **Favoritos, recientes y rutinas**: persistencia en `localStorage`; las rutinas muestran el estado de tu viaje habitual al abrir el mapa.
- **Alertas de llegada**: toast in-app cuando un bus baja de 3 minutos de ETA, con opción de notificación nativa en segundo plano.
- **Compartir**: deep links `?line=`/`?stop=`, enlaces de viaje `/v/[data]` con ETA en vivo (expiran a la hora) y ubicación en vivo (sesión efímera de máximo 1 hora, sin historial).
- **Resiliencia**: caché SWR en servidor (`stmCache.ts`) con tolerancia a `502`/`429` de STM, indicador de datos demorados y backoff por parada.
- **Interfaz adaptativa**: bottom sheet con gesto de arrastre en mobile, panel lateral colapsable en desktop. Marcadores animados con interpolación entre polls (`busMotion.ts`).
- **PWA instalable**: manifest + service worker con app shell cacheado (nunca los endpoints `/api/*`, que son datos en vivo).
- **Monitoreo y feedback**: Sentry con tunnel propio (`/monitoring`) y botón "Reportar un problema" en el panel lateral.
- **Privacidad**: página `/privacidad`; Microsoft Clarity se activa recién después de que el usuario vio el aviso — nunca antes.

---

## 🛠️ Stack

- **SvelteKit 2** con Svelte 5 (Runes) y TypeScript.
- **MapLibre GL JS** con tiles de OpenFreeMap; geocoding Nominatim (throttled server-side).
- **Sentry** (`@sentry/sveltekit`) y **Microsoft Clarity** (carga diferida post-consentimiento).
- Vanilla CSS con variables de diseño (tema oscuro). Tipografía `Inter Variable` (Fontsource). Paquetes con `pnpm`.

---

## 💻 Desarrollo local

```bash
pnpm install
pnpm approve-builds   # si pnpm bloquea postinstalls (ej. @sentry/cli)
cp .env.example .env  # completar credenciales
pnpm dev --host
pnpm check && pnpm build
pnpm build && pnpm preview   # para probar la PWA (no funciona con dev)
```

Variables de entorno (las mismas 8 en `.env` local y en Netlify):
`STM_CLIENT_ID`, `STM_CLIENT_SECRET` ([api.montevideo.gub.uy](https://api.montevideo.gub.uy) → Mis Aplicaciones), `SENTRY_DSN`, `PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` ([sentry.io](https://sentry.io), scope `org:ci`), `PUBLIC_CLARITY_ID` ([clarity.microsoft.com](https://clarity.microsoft.com)).

Sin `SENTRY_AUTH_TOKEN` el build igual funciona, pero no se suben sourcemaps y los stack traces quedan minificados.

---

## ☁️ Arquitectura y despliegue (Netlify)

`src/lib/server/stmAuth.ts` cachea el token OAuth en memoria del proceso (válido 300s) para no sobrecargar la auth de STM; por eso se usa `adapter-netlify` (runtime Node persistente) en vez de edge/Workers.

**Shapes por línea**: `src/lib/server/data/shapes/<linea>.json` (un archivo por línea, regenerado semanalmente desde el GTFS por el workflow `gtfs-update`). `routeShapes.ts` las carga con import dinámico: Vite emite un chunk por línea y solo se carga el pedido. Antes era un único JSON de ~9MB estático (~10.8MB parseados en cada cold start).

**Sentry**: `hooks.server.ts` / `hooks.client.ts` capturan excepciones; `src/routes/monitoring/+server.ts` es el tunnel same-origin (los bloqueadores de anuncios suelen listar `*.ingest.sentry.io`). Los catches que antes solo hacían `console.warn` ahora reportan con `level: 'warning'`, pasando por `sentryRateLimit.ts` (1 evento/minuto por fuente ante caídas sostenidas de STM). `FeedbackButton.svelte` engancha el formulario de Sentry a un botón propio (`autoInject: false`).

**Clarity**: `src/lib/analytics/clarity.ts` inyecta el script de forma perezosa e idempotente, recién cuando el usuario cierra el `WelcomeModal`. Quienes entran por deep link no ven el modal, así que Clarity no se activa hasta que entren sin deep link.

---

## 🗺️ Roadmap

- [ ] **2 transbordos** en el motor de rutas (hoy tope en 1, recortado a propósito por costo de cómputo).
- [ ] **Accesibilidad por teclado**: navegación con flechas en los resultados de búsqueda.
- [ ] **Escalabilidad de geocoding**: el throttle de Nominatim es global del servidor (1 req/seg compartido); evaluar instancia propia o proveedor pago si crece el uso concurrente.
