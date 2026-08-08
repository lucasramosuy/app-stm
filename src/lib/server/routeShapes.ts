import routeShapes from './data/route-shapes.json';

// Generado offline por scripts/build-shapes.mjs a partir del GTFS estático
// de STM (ver src/lib/server/data/route-shapes.json). Se importa como
// módulo ES para que Vite/Rollup lo bundlee directo en el output de la
// función serverless — evita depender de que Netlify incluya archivos de
// datos sueltos en el paquete de deploy.
const shapes = routeShapes as Record<string, number[][][]>;

/**
 * Devuelve las variantes de recorrido de una línea (array de polylines,
 * cada una como array de [lon, lat]), o null si no hay datos para esa línea.
 */
export function getRouteShape(line: string): number[][][] | null {
	return shapes[line] ?? null;
}