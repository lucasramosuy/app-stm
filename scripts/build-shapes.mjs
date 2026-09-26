#!/usr/bin/env node
/**
 * scripts/build-shapes.mjs
 *
 * Procesa el GTFS estático de STM (ya descomprimido en disco) y genera
 * un JSON por línea en src/lib/server/data/shapes/<linea>.json con la
 * geometría de cada recorrido.
 *
 * Se corre UNA SOLA VEZ, manualmente, cada vez que STM publica un GTFS
 * nuevo. No se ejecuta en cada request ni en cada deploy — el JSON
 * resultante se commitea al repo.
 *
 * Uso:
 *   pnpm add -D csv-parse
 *   node scripts/build-shapes.mjs
 *   node scripts/build-shapes.mjs "C:\ruta\custom\a\gtfs"   (path opcional)
 *
 * Por default busca la carpeta en %USERPROFILE%\Downloads\gtfs (o
 * $HOME/Downloads/gtfs en mac/linux).
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));

const gtfsDir = process.argv[2] || join(os.homedir(), 'Downloads', 'gtfs');
const outDir = join(__dirname, '..', 'src', 'lib', 'server', 'data', 'shapes');

// Los nombres de línea pueden traer espacios u otros caracteres
// (ej. "124 Sd") que no sirven tal cual como nombre de archivo.
// MISMA sanitización que src/lib/server/routeShapes.ts (shapeFileName) —
// si se cambia acá, cambiar allá también.
const sanitize = (line) => line.replace(/[^A-Za-z0-9-]/g, '_');

console.log(`[build-shapes] leyendo GTFS desde: ${gtfsDir}`);

function readCsv(filename, encoding = 'utf8') {
	const filePath = join(gtfsDir, filename);
	const raw = readFileSync(filePath, encoding);
	return parse(raw, { columns: true, skip_empty_lines: true });
}

// --- 1. routes.txt -> route_id -> route_short_name ------------------------
// Se lee en latin1 porque el archivo trae mojibake en textos con tildes
// (route_long_name, ej. "espaÃ±a" en vez de "españa"). No afecta a
// route_short_name, que es lo único que necesitamos y es simple
// (numérico/alfanumérico sin tildes).
const routes = readCsv('routes.txt', 'latin1');
const routeIdToShortName = new Map();
for (const r of routes) {
	routeIdToShortName.set(r.route_id, r.route_short_name);
}
console.log(`[build-shapes] routes.txt: ${routes.length} filas`);

// --- 2. trips.txt -> route_short_name -> Set<shape_id> ---------------------
// Nota: puede haber varios route_id para el mismo route_short_name (ej.
// "100" con variantes de días hábiles/fin de semana) — por eso agrupamos
// directamente por nombre corto, no por route_id.
const trips = readCsv('trips.txt');
const shortNameToShapeIds = new Map();
for (const t of trips) {
	if (!t.shape_id) continue;
	const shortName = routeIdToShortName.get(t.route_id);
	if (!shortName) continue;
	if (!shortNameToShapeIds.has(shortName)) shortNameToShapeIds.set(shortName, new Set());
	shortNameToShapeIds.get(shortName).add(t.shape_id);
}
console.log(
	`[build-shapes] trips.txt: ${trips.length} filas, ${shortNameToShapeIds.size} líneas distintas`
);

// --- 3. shapes.txt -> shape_id -> puntos ordenados -------------------------
console.log('[build-shapes] leyendo shapes.txt (es el archivo grande, puede tardar unos segundos)...');
const shapePoints = readCsv('shapes.txt');
const shapeIdToPoints = new Map();
for (const p of shapePoints) {
	if (!shapeIdToPoints.has(p.shape_id)) shapeIdToPoints.set(p.shape_id, []);
	shapeIdToPoints.get(p.shape_id).push({
		seq: Number(p.shape_pt_sequence),
		lon: Number(p.shape_pt_lon),
		lat: Number(p.shape_pt_lat)
	});
}
for (const points of shapeIdToPoints.values()) {
	points.sort((a, b) => a.seq - b.seq);
}
console.log(
	`[build-shapes] shapes.txt: ${shapePoints.length} puntos, ${shapeIdToPoints.size} shapes distintos`
);

// --- 4. Escribir un JSON por línea ------------------------------------------
// Cada archivo es un array de shapes por línea, porque una línea puede
// tener varias variantes físicas de recorrido (ida/vuelta, ramales, etc.):
// [[[lon,lat],...], [[lon,lat],...]]
// Se borra el directorio antes de escribir para que las líneas dadas de
// baja en el GTFS nuevo no queden como archivos huérfanos.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let written = 0;
let totalBytes = 0;
for (const [shortName, shapeIds] of shortNameToShapeIds) {
	const shapes = [];
	for (const shapeId of shapeIds) {
		const points = shapeIdToPoints.get(shapeId);
		if (!points || points.length === 0) continue;
		shapes.push(points.map((p) => [p.lon, p.lat]));
	}
	if (shapes.length > 0) {
		const json = JSON.stringify(shapes);
		writeFileSync(join(outDir, `${sanitize(shortName)}.json`), json);
		written += 1;
		totalBytes += json.length;
	}
}

const sizeKb = (totalBytes / 1024).toFixed(0);
console.log(`[build-shapes] listo: ${written} archivos de línea escritos en ${outDir} (${sizeKb} KB)`);
