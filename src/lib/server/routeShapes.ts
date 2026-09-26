// Las geometrías de recorrido viven en un JSON por línea, en
// src/lib/server/data/shapes/<line>.json, generadas offline por
// scripts/build-shapes.mjs a partir del GTFS estático de STM.
//
// Se cargan con import dinámico: Vite/Rollup emite un chunk separado
// por línea y cada uno se carga recién cuando alguien pide esa línea.
// Antes había un único route-shapes.json de ~9MB importado estático,
// que terminaba en un chunk de ~10.8MB dentro de la función serverless:
// cada cold start lo parseaba entero (y lo mantenía en memoria) aunque
// el request no tocara shapes para nada.

// Misma sanitización que scripts/build-shapes.mjs: los nombres de línea
// pueden traer espacios u otros caracteres (ej. "124 Sd") que no sirven
// tal cual como nombre de archivo.
export function shapeFileName(line: string): string {
	return line.replace(/[^A-Za-z0-9-]/g, '_');
}

const cache = new Map<string, number[][][] | null>();

/**
 * Devuelve las variantes de recorrido de una línea (array de polylines,
 * cada una como array de [lon, lat]), o null si no hay datos para esa
 * línea. El resultado (incluido el null) se cachea en memoria del
 * proceso: el archivo no cambia entre deploys.
 */
export async function getRouteShape(line: string): Promise<number[][][] | null> {
	const cached = cache.get(line);
	if (cached !== undefined) return cached;

	let shapes: number[][][] | null = null;
	try {
		const mod = await import(`./data/shapes/${shapeFileName(line)}.json`);
		shapes = mod.default as number[][][];
	} catch {
		// Sin archivo para esa línea (línea nueva todavía sin shapes
		// regenerados, o nombre mal escrito): mismo contrato de antes, null.
		shapes = null;
	}
	cache.set(line, shapes);
	return shapes;
}
