# Buses Montevideo (App STM)

Aplicación web moderna y rápida en tiempo real para visualizar ómnibus, paradas y planificar viajes en el transporte público de Montevideo (STM), construida sobre la API oficial de la Intendencia de Montevideo (`api.montevideo.gub.uy`).

![Stack](https://img.shields.io/badge/SvelteKit-v5-FF3E00)
![MapLibre](https://img.shields.io/badge/MapLibre_GL-v6-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-v5-blue)
![Deploy](https://img.shields.io/badge/Deploy-Netlify-00C7B7)
![PWA](https://img.shields.io/badge/PWA-Instalable-5A0FC8)
![Monitoring](https://img.shields.io/badge/Errores-Sentry-362D59)

---

## 🚀 Características principales

- **Mapa interactivo en tiempo real**: paradas y flota de colectivos en circulación con MapLibre GL (sin API keys), estilo oscuro custom reescrito sobre OpenFreeMap "Liberty".
- **Estimaciones de arribo (ETAs) precisas**: tiempos de llegada actualizados cada 20 segundos con formato `tabular-nums` para evitar parpadeos visuales.
- **Selección múltiple**: tocá varias paradas y ómnibus a la vez — cada uno mantiene su propio polling independiente, apilados en el panel.
- **Cómo llegar**: planificador de viajes con motor propio (directo o con 1 transbordo, priorizando menos transbordos), origen editable (GPS, tocando el mapa, una parada/bus/ícono, o buscando una dirección) y trazado real de las líneas dibujado sobre el mapa.
- **Buscador de direcciones libres**: geocoding vía Nominatim/OpenStreetMap para direcciones que no son paradas (ej. "Bulevar Artigas 1234"), con aviso cuando el resultado agrupa varias numeraciones del mismo edificio.
- **Trazado de recorridos por línea**: polyline del recorrido completo al filtrar por línea, generada offline desde el GTFS estático de STM.
- **Geolocalización ("Mi ubicación")**: botón flotante para centrar el mapa y usar la posición real como origen de un viaje.
- **Búsqueda rápida e inteligente**: paradas por intersección de calles, líneas de ómnibus, y direcciones libres, todo con debouncing.
- **Paradas y líneas favoritas + historial de recientes**: persistencia en `localStorage`, con estado vacío que las muestra como accesos rápidos.
- **Alertas de llegada**: aviso in-app (toast) la primera vez que un bus de una parada seleccionada baja de 3 minutos de ETA, sin repetirse en cada poll.
- **Notificaciones del sistema (opcional)**: mismo aviso de "bus por llegar" como notificación nativa del navegador cuando la pestaña está en segundo plano, con manejo de permisos y detección de bloqueo persistente.
- **Deep Linking**: parámetros `?line=` y `?stop=` en la URL para compartir o guardar filtros de línea o paradas puntuales.
- **Resiliencia y caché SWR**: capa de caché en servidor (`stmCache.ts`) con tolerancia a errores `502`/`429` de STM y fallback a datos guardados, con indicador visual de datos demorados y backoff (`retryNotBefore`) por parada.
- **Interfaz adaptativa**: bottom sheet deslizable con gesto de arrastre nativo (peek/expand) en mobile, panel lateral colapsable en desktop.
- **404 y pop-up de bienvenida**: página de error acorde a la estética de la app, y onboarding breve la primera vez que se abre (se salta en deep links).
- **PWA instalable**: manifest + service worker con app shell cacheado (nunca los endpoints `/api/*`, que son datos en vivo), botón de instalación nativo donde el navegador lo soporta.
- **Monitoreo de errores y feedback**: captura automática de excepciones (cliente y servidor) vía Sentry, con tunnel propio para no depender de que el navegador del usuario no tenga un bloqueador de anuncios activo, y un botón de "Reportar un problema" integrado en el panel lateral.
- **Analítica de uso**: Microsoft Clarity (heatmaps y grabación de sesión), activado recién después de que el usuario vio el aviso de privacidad — nunca antes.
- **Aviso de privacidad**: página dedicada (`/privacidad`) enlazada desde el modal de bienvenida, explicando qué se recolecta y por qué.

---

## 🛠️ Stack Tecnológico

- **Frontend / Backend**: [SvelteKit 2](https://svelte.dev/) con Svelte 5 (Runes).
- **Mapa**: [MapLibre GL JS](https://maplibre.org/) con tiles vectoriales de OpenFreeMap.
- **Geocoding**: Nominatim (OpenStreetMap), throttled server-side.
- **Monitoreo de errores**: [Sentry](https://sentry.io/) (`@sentry/sveltekit`), con tunnel propio (`/monitoring`) y feedback widget embebido.
- **Analítica de producto**: [Microsoft Clarity](https://clarity.microsoft.com/), carga diferida post-consentimiento.
- **Estilos**: Vanilla CSS con variables de diseño (tema oscuro por defecto).
- **Tipografía**: `Inter Variable` (`@fontsource-variable/inter`).
- **Gestión de paquetes**: `pnpm`.
- **PWA**: service worker nativo de SvelteKit (`$service-worker`), manifest generado con RealFaviconGenerator.

---

## 💻 Desarrollo local

1. **Clonar e instalar dependencias:**
```bash
   pnpm install
```
   Si `pnpm` bloquea algún script de postinstall (ej. `@sentry/cli`), aprobalo con:
```bash
   pnpm approve-builds
```

2. **Configurar variables de entorno:**
   Copiá `.env.example` a `.env` y completá:
```env
   # API de transporte público
   STM_CLIENT_ID="tu_client_id"
   STM_CLIENT_SECRET="tu_client_secret"

   # Sentry (monitoreo de errores)
   SENTRY_DSN="https://xxxx@xxxx.ingest.sentry.io/xxxx"
   PUBLIC_SENTRY_DSN="https://xxxx@xxxx.ingest.sentry.io/xxxx"
   SENTRY_ORG="tu-org"
   SENTRY_PROJECT="tu-proyecto"
   SENTRY_AUTH_TOKEN="sntrys_xxxx"

   # Microsoft Clarity (analítica de uso)
   PUBLIC_CLARITY_ID="tu-project-id-de-clarity"
```
   *Las credenciales de STM se obtienen gratis en [api.montevideo.gub.uy](https://api.montevideo.gub.uy) (Sección Mis Aplicaciones). El DSN de Sentry y el auth token, en [sentry.io](https://sentry.io) (Settings → Projects / Auth Tokens, scope `org:ci`). El project ID de Clarity, en [clarity.microsoft.com](https://clarity.microsoft.com) (Settings → Setup).*

3. **Iniciar el servidor de desarrollo:**
```bash
   pnpm dev --host
```

4. **Verificación de tipos e integración:**
```bash
   pnpm check
   pnpm build
```

5. **Probar la PWA (requiere build de producción, no funciona con `pnpm dev`):**
```bash
   pnpm build && pnpm preview
```

---

## ☁️ Arquitectura y Despliegue (Netlify)

El módulo `src/lib/server/stmAuth.ts` cachea el token OAuth en memoria del proceso (válido por 300s) para evitar sobrecargar los servidores de STM con peticiones repetidas de autenticación. Por esto se usa `adapter-netlify` (runtime Node persistente) en vez de edge/Workers.

### Variables de entorno en Netlify

En **Site settings → Environment variables**, configurar las mismas ocho variables del `.env` local:
`STM_CLIENT_ID`, `STM_CLIENT_SECRET`, `SENTRY_DSN`, `PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `PUBLIC_CLARITY_ID`.

Sin `SENTRY_AUTH_TOKEN` el build igual funciona, pero no se suben sourcemaps y los stack traces en el dashboard de Sentry quedan minificados.

### Monitoreo de errores (Sentry)

- `src/hooks.server.ts` / `src/hooks.client.ts`: inicializan el SDK y capturan excepciones no atrapadas por SvelteKit (`handleError`).
- `src/routes/monitoring/+server.ts`: tunnel que reenvía los envelopes de Sentry desde el mismo origen de la app, para que bloqueadores de anuncios (que suelen tener `*.ingest.sentry.io` en sus listas) no corten el reporte.
- Puntos de captura manual (catches que antes solo hacían `console.warn`, ahora también reportan con `level: 'warning'`): `BusMap.svelte` (fetch de paradas/buses cercanos y por línea), `+page.svelte` (polling de `upcomingbuses` y búsqueda), `tripPlanner.ts` (detalle de parada dentro del cálculo de rutas). Todos pasan por `src/lib/sentryRateLimit.ts`, que limita el volumen reportado por fuente a 1 evento/minuto en escenarios de caída sostenida de la API de STM.
- `src/lib/components/FeedbackButton.svelte`: engancha el formulario de feedback de Sentry a un botón propio en el pie del panel lateral (`BottomSheet.svelte`), en vez del widget flotante default (`autoInject: false`).

### Analítica de uso (Clarity)

- `src/lib/analytics/clarity.ts`: inyecta el script de Clarity de forma perezosa e idempotente.
- Se activa recién cuando el usuario cierra el `WelcomeModal` (o ya lo había cerrado en una visita anterior) — nunca antes de mostrar el aviso de privacidad. Los usuarios que entran por deep link (`?stop=`/`?line=`) no ven el modal en su primera visita, por lo que tampoco se activa Clarity hasta que entren alguna vez sin deep link.

---

## 📌 Estado Actual

- ✅ Paradas y tiempo real activos, con selección múltiple.
- ✅ Favoritos y recientes.
- ✅ Deep links de línea y de parada.
- ✅ Resiliencia de API (caché SWR, 429/502, backoff por parada).
- ✅ Trazado de rutas por línea (GTFS estático).
- ✅ Geolocalización.
- ✅ **Cómo llegar**: motor de rutas propio (0-1 transbordo), UI de origen/destino, trazado del viaje en el mapa.
- ✅ **Geocoding**: búsqueda de direcciones libres vía Nominatim.
- ✅ **PWA instalable**: manifest, service worker, app shell cacheado.
- ✅ 404 y pop-up de bienvenida.
- ✅ **Alertas de llegada y notificaciones del sistema**.
- ✅ **Monitoreo de errores**: Sentry con tunnel, captura manual en catches silenciosos, y feedback widget embebido.
- ✅ **Analítica de uso**: Microsoft Clarity con carga post-consentimiento.
- ✅ **Aviso de privacidad**: página `/privacidad`.

---

## 🗺️ Roadmap de Mejoras Pendientes

- [ ] **2 transbordos** en el motor de rutas (hoy tope en 1, recortado a propósito por costo de cómputo).
- [ ] **✨ Animación de Marcadores**: interpolación suave del movimiento de los colectivos entre intervalos de polling.
- [ ] **♿ Accesibilidad por Teclado**: navegación con flechas en la lista de resultados de búsqueda.
- [ ] **Escalabilidad de geocoding**: el throttle de Nominatim es global del servidor (1 req/seg compartido); evaluar instancia propia o proveedor pago si crece el uso concurrente.