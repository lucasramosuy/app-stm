# Especificación de requisitos de software: App STM

**Estado:** código de `master` al 27/09/2026 (`a210e1d`). Este documento registra el alcance implementado; el roadmap del README no se convierte automáticamente en requisito vigente.

## Propósito y usuarios

Aplicación web/PWA para consultar paradas, ómnibus y llegadas del STM de Montevideo, planificar viajes y compartir un viaje. La usa cualquier pasajero sin crear cuenta. Una segunda persona puede abrir un enlace temporal para seguir un viaje compartido. Los datos de tránsito dependen de la API oficial de la Intendencia de Montevideo (IMM); los tiempos son estimaciones, no garantías de llegada.

## Requisitos funcionales

- **RF-01. Exploración:** mostrar mapa interactivo con paradas y ómnibus, buscar paradas por intersección, líneas y direcciones, filtrar líneas y dibujar sus recorridos. Admitir varios buses/paradas seleccionados a la vez y enlaces `?line=` y `?stop=`.
- **RF-02. Llegadas:** consultar las próximas llegadas de cada parada seleccionada aproximadamente cada 20 segundos; indicar cuando los datos estén demorados. Permitir guardar favoritos y recientes en el navegador.
- **RF-03. Planificación:** aceptar origen (GPS, selección en mapa o búsqueda) y destino, calcular opciones directas o con un transbordo, y representar tramos y caminatas en el mapa. No presentar rutas de dos transbordos como disponibles.
- **RF-04. Avisos de parada:** avisar una vez por llegada cuando un bus seleccionado baje del umbral de tres minutos, en la interfaz y, si la persona habilitó permisos, mediante notificación del navegador en segundo plano.
- **RF-05. Viaje activo:** ofrecer avisos por cambio de ETA, cercanía al transbordo y a la bajada final mientras la aplicación puede consultar ubicación y datos del viaje. No prometer avisos con la aplicación cerrada: el código no usa push ni un cron para esto.
- **RF-06. Compartir viaje:** generar un enlace `/v/[data]` con línea, origen/destino, paradas y expiración de una hora. La página receptora debe mostrar el viaje y actualizar el ETA con la API. El enlace codifica datos del viaje: es compartible, no secreto ni mecanismo de autenticación.
- **RF-07. Ubicación en vivo opcional:** crear una sesión separada para compartir la posición del emisor durante un máximo fijo de una hora; la persona que recibe el enlace solo puede leerla, mientras actualizar o borrar exige un token de escritura. Cada posición reemplaza a la anterior, sin historial; una sesión vencida o detenida deja de mostrarse. Distinguir la posición del viajero del ETA del ómnibus.
- **RF-08. Experiencia PWA:** funcionar en pantalla móvil y escritorio, admitir instalación cuando el navegador la soporte, conservar la carcasa de la aplicación en el service worker y no cachear respuestas `/api/*` como si fueran datos en vivo. Mostrar onboarding y aviso de privacidad; el deep link puede saltar onboarding inicial.

## Datos, servicios y límites

- La aplicación no tiene usuarios ni base de datos de cuentas. Favoritos, recientes y preferencias se guardan localmente; las sesiones de ubicación en vivo usan Netlify Blobs en producción y memoria en desarrollo/pruebas. Cada registro contiene `position`, `updatedAt`, `expiresAt` y un token de escritura; el lector nunca recibe el token. La expiración se verifica también al leer, sin depender solo de la limpieza del almacenamiento.
- El servidor consulta la API IMM usando credenciales privadas (`STM_CLIENT_ID`, `STM_CLIENT_SECRET`) y cachea el token OAuth en memoria; nunca se deben exponer al cliente. Una capa SWR maneja errores/limitación 429 y 502, backoff y datos anteriores claramente señalados. Las geometrías por línea provienen de GTFS y se regeneran por el workflow semanal.
- MapLibre usa mapas de OpenFreeMap; Nominatim resuelve direcciones con control de frecuencia desde servidor. Sentry captura errores mediante tunnel propio y ofrece feedback; Clarity solo se carga después del aviso de privacidad, según el flujo existente. La geolocalización y las notificaciones dependen de permisos del navegador.

## Requisitos no funcionales y restricciones

- Stack existente: SvelteKit 2, Svelte 5, TypeScript, MapLibre, adaptador Netlify y pnpm. Mantener el runtime servidor que requiere el caché del token IMM y el almacenamiento de ubicación; una migración a Cloudflare no está aprobada por este documento.
- Priorizar costo cero: Netlify Blobs consume créditos gratuitos con límite duro y las consultas IMM/Nominatim tienen límites. No introducir servicios pagos ni polling descontrolado; indicar degradación cuando las fuentes fallen.
- En enlaces de ubicación, usar identificadores no adivinables y control separado de escritura; no guardar historial de posiciones, no extender la hora al actualizar y no mostrar posición caducada como actual. Los enlaces son públicos para quien los tenga, así que la interfaz debe explicarlo.
- Mantener `pnpm check`, `pnpm build` y pruebas `pnpm test`, en especial lógica de rutas, alertas y ubicación compartida. El README contiene límites y configuración de entorno vigentes.
