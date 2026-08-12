# Buses Montevideo (App STM)

Aplicación web moderna y rápida en tiempo real para visualizar ómnibus y paradas del transporte público de Montevideo (STM), construida sobre la API oficial de la Intendencia de Montevideo (`api.montevideo.gub.uy`).

![Stack](https://img.shields.io/badge/SvelteKit-v5-FF3E00)
![MapLibre](https://img.shields.io/badge/MapLibre_GL-v6-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-v5-blue)
![Deploy](https://img.shields.io/badge/Deploy-Netlify-00C7B7)

---

## 🚀 Características principales

- **Mapa interactivo en tiempo real**: Visualización de paradas y flota de colectivos en circulación con MapLibre GL (sin necesidad de API keys).
- **Estimaciones de arribo (ETAs) precisas**: Tiempos de llegada actualizados cada 20 segundos con formato `tabular-nums` para evitar parpadeos visuales.
- **Búsqueda rápida e inteligente**: Búsqueda instantánea con debouncing para paradas por intersección de calles y líneas de ómnibus.
- **Paradas y Líneas Favoritas**: Marcadores fijos para guardar tus paradas habituales y líneas preferidas en `localStorage`.
- **Historial de Recientes**: Acceso rápido a las últimas paradas y líneas consultadas, con scrollbar horizontal limpio e imperceptible.
- **Deep Linking (Enlaces directos)**: Soporte para parámetros `?stop=` y `?line=` en la URL para compartir o guardar paradas y líneas específicas.
- **Resiliencia y Caché SWR**: Capa de caché en servidor (`stmCache.ts`) con tolerancia a fallos ante errores `502`/`429` del backend de STM y fallback a datos guardados.
- **Interfaz Adaptativa (Responsive)**: Bottom Sheet deslizable en dispositivos móviles y panel lateral colapsable en escritorio.
- **Selección de buses individuales en el mapa.**
- **Chip de estado del mapa.**
- Indicador de datos demorados (badge "Demorado" cuando la API cachea una respuesta stale, con el header X-Data-Stale)

---

## 🛠️ Stack Tecnológico

- **Frontend / Backend**: [SvelteKit 2](https://svelte.dev/) con Svelte 5 (Runes).
- **Mapa**: [MapLibre GL JS](https://maplibre.org/) con tiles vectoriales de OpenFreeMap.
- **Estilos**: Vanilla CSS con variables de diseño (Tema Oscuro por defecto).
- **Tipografía**: `Inter Variable` (@fontsource-variable/inter).
- **Gestión de Paquetes**: `pnpm`.

---

## 💻 Desarrollo local

1. **Clonar e instalar dependencias:**
   ```bash
   pnpm install
   ```

2. **Configurar variables de entorno:**
   Copiá `.env.example` a `.env` y completá tus credenciales de la API de la STM:
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

---

## ☁️ Arquitectura y Despliegue (Netlify)

El módulo `src/lib/server/stmAuth.ts` cachea el token OAuth en la memoria del proceso (válido por 300s) para evitar sobrecargar los servidores de la STM con peticiones repetidas de autenticación.

### Variables de entorno en Netlify:
En **Site settings → Environment variables**, configurar:
- `STM_CLIENT_ID`
- `STM_CLIENT_SECRET`

---

## 📌 Estado Actual

- ✅ **Paradas y tiempo real activos**: Selección de paradas en mapa/búsqueda con listado de próximos ómnibus.
- ✅ **Favoritos y Recientes**: Persistencia local de paradas y líneas.
- ✅ **Deep links activos**: URLs dinámicas con parámetro `?stop=` o `?line=`.
- ✅ **Resiliencia de API**: Manejo de caché SWR y errores `502 Bad Gateway` / `429 Rate Limit`.
- ✅ **Trazado de rutas**: Polyline del recorrido completo al filtrar por línea, generada offline desde el GTFS estático de STM.
- ✅ **Geolocalización ("Mi Ubicación")**: Botón flotante para centrar el mapa en la ubicación del usuario y listar las paradas más cercanas automáticamente.

---

## 🗺️ Roadmap de Mejoras Pendientes

- [ ] **📱 Soporte PWA (Progressive Web App)**: Instalación en pantalla de inicio de celulares y caché offline de la shell de la aplicación.
- [ ] **🔔 Alertas y Notificaciones**: Notificar al usuario (sonido o notificación web) cuando el coche esperado esté a menos de 3 minutos.
- [ ] **✨ Animación de Marcadores**: Interpolación suave del movimiento de los colectivos en el mapa (`requestAnimationFrame`) entre intervalos de polling.
- [ ] **♿ Accesibilidad por Teclado**: Navegación con flechas en la lista desplegable de resultados de búsqueda.