# Buses Montevideo

App de tiempo real de ómnibus para Montevideo, sobre la API oficial de STM
(api.montevideo.gub.uy).

## Stack

- SvelteKit (frontend + backend en el mismo proyecto)
- MapLibre GL (mapa, sin API key)
- Inter Variable (tipografía)

## Desarrollo local

```bash
npm install
cp .env.example .env   # completá STM_CLIENT_ID y STM_CLIENT_SECRET
npm run dev -- --host
```

Las credenciales se consiguen en https://api.montevideo.gub.uy → Mis Aplicaciones.

## Por qué Netlify (no Cloudflare Workers)

El módulo `src/lib/server/stmAuth.ts` cachea el access token OAuth en memoria
del proceso, para no pedir un token nuevo en cada request (el token dura 300s).
Esto funciona bien en runtimes Node persistentes como los de Netlify, pero no
es confiable en runtimes edge (Cloudflare Workers), que reciclan el proceso
más agresivamente. Si en algún momento se migra a edge, ese cache debería
pasar a un KV store en vez de una variable en memoria.

## Deploy en Netlify

1. Subir este repo a GitHub (sin el `.env`, ya está en `.gitignore`).
2. En Netlify: "Add new site" → "Import an existing project" → conectar el repo.
   Build command y publish directory ya quedan definidos en `netlify.toml`.
3. **Antes del primer deploy**, cargar en Site settings → Environment variables:
   - `STM_CLIENT_ID`
   - `STM_CLIENT_SECRET`

Nunca subir estos valores al repo ni pegarlos en ningún archivo versionado.

## Estado actual (WIP)

- El mapa usa un estilo base gratuito de OpenFreeMap oscurecido con CSS,
  como placeholder — falta el estilo oscuro custom definitivo.
- La parada mostrada en el bottom sheet está fija (3914, 18 de Julio y Andes)
  mientras no está implementado el tap sobre paradas reales en el mapa.
- Los endpoints reales confirmados contra la API: `/buses/busstops`,
  `/buses/busstops/{id}`, `/buses/busstops/{id}/upcomingbuses?lines=...`.
  `/buses/geo` (buses en tiempo real por bounding box) todavía no se probó
  contra la API real — los nombres de parámetros en el proxy son un supuesto.
