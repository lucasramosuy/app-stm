# Buses Montevideo (App STM)

Aplicación web moderna y rápida en tiempo real para visualizar ómnibus, paradas y planificar viajes en el transporte público de Montevideo (STM), construida sobre la API oficial de la Intendencia de Montevideo (`api.montevideo.gub.uy`).

![Stack](https://img.shields.io/badge/SvelteKit-v5-FF3E00)
![MapLibre](https://img.shields.io/badge/MapLibre_GL-v6-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-v5-blue)
![Deploy](https://img.shields.io/badge/Deploy-Netlify-00C7B7)
![PWA](https://img.shields.io/badge/PWA-Instalable-5A0FC8)

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
- **Deep Linking**: parámetro `?line=` en la URL para compartir o guardar filtros de línea.
- **Resiliencia y caché SWR**: capa de caché en servidor (`stmCache.ts`) con tolerancia a errores `502`/`429` de STM y fallback a datos guardados, con indicador visual de datos demorados.
- **Interfaz adaptativa**: bottom sheet deslizable (con arrastre táctil fluido) en mobile, panel lateral colapsable en desktop.
- **404 y pop-up de bienvenida**: página de error acorde a la estética de la app, y onboarding breve la primera vez que se abre.
- **PWA instalable**: manifest + service worker con app shell cacheado (nunca los endpoints `/api/*`, que son datos en vivo), botón de instalación nativo donde el navegador lo soporta.

---

## 🛠️ Stack Tecnológico

- **Frontend / Backend**: [SvelteKit 2](https://svelte.dev/) con Svelte 5 (Runes).
- **Mapa**: [MapLibre GL JS](https://maplibre.org/) con tiles vectoriales de OpenFreeMap.
- **Geocoding**: Nominatim (OpenStreetMap), throttled server-side.
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

2. **Configurar variables de entorno:**
   Copiá `.env.example` a `.env` y completá tus credenciales de la API de STM:
```env
   STM_CLIENT_ID="tu_client_id"
   STM_CLIENT_SECRET="tu_client_secret"
```
   *Las credenciales se obtienen gratis en [api.montevideo.gub.uy](https://api.montevideo.gub.uy) (Sección Mis Aplicaciones).*

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

En **Site settings → Environment variables**, configurar:
- `STM_CLIENT_ID`
- `STM_CLIENT_SECRET`

---

## 📌 Estado Actual

- ✅ Paradas y tiempo real activos, con selección múltiple.
- ✅ Favoritos y recientes.
- ✅ Deep links de línea.
- ✅ Resiliencia de API (caché SWR, 429/502).
- ✅ Trazado de rutas por línea (GTFS estático).
- ✅ Geolocalización.
- ✅ **Cómo llegar**: motor de rutas propio (0-1 transbordo), UI de origen/destino, trazado del viaje en el mapa.
- ✅ **Geocoding**: búsqueda de direcciones libres vía Nominatim.
- ✅ **PWA instalable**: manifest, service worker, app shell cacheado.
- ✅ 404 y pop-up de bienvenida.

---

## 🗺️ Roadmap de Mejoras Pendientes

- [ ] **2 transbordos** en el motor de rutas (hoy tope en 1, recortado a propósito por costo de cómputo).
- [ ] **🔔 Alertas y Notificaciones**: avisar cuando el bus esperado esté a menos de 3 minutos.
- [ ] **✨ Animación de Marcadores**: interpolación suave del movimiento de los colectivos entre intervalos de polling.
- [ ] **♿ Accesibilidad por Teclado**: navegación con flechas en la lista de resultados de búsqueda.
- [ ] **Escalabilidad de geocoding**: el throttle de Nominatim es global del servidor (1 req/seg compartido); evaluar instancia propia o proveedor pago si crece el uso concurrente.