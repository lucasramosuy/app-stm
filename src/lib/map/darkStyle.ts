import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';

// Reescribe el estilo vectorial "Liberty" de OpenFreeMap (pensado para
// fondo claro) a la paleta oscura de la app, tocando los colores reales
// de cada capa en vez de aplicar un filtro CSS sobre el canvas entero.
//
// Estrategia: un mapa curado a mano para las capas que más se ven en el
// uso real (zoom 13-17, nivel calle/barrio) — calles, edificios, agua,
// parques, etiquetas — más un fallback genérico que oscurece cualquier
// color plano que haya quedado claro, preservando el matiz.

const BG = '#0B1220';

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

interface RGBA {
	r: number;
	g: number;
	b: number;
	a: number;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
	s /= 100;
	l /= 100;
	const k = (n: number) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;
	const d = max - min;
	if (d !== 0) {
		s = d / (1 - Math.abs(2 * l - 1));
		switch (max) {
			case r:
				h = ((g - b) / d) % 6;
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			default:
				h = (r - g) / d + 4;
		}
		h *= 60;
		if (h < 0) h += 360;
	}
	return { h, s: s * 100, l: l * 100 };
}

function parseColor(input: string): RGBA | null {
	const s = input.trim();

	let m = s.match(/^#([0-9a-f]{3})$/i);
	if (m) {
		const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
		return { r, g, b, a: 1 };
	}

	m = s.match(/^#([0-9a-f]{6})$/i);
	if (m) {
		const hex = m[1];
		return {
			r: parseInt(hex.slice(0, 2), 16),
			g: parseInt(hex.slice(2, 4), 16),
			b: parseInt(hex.slice(4, 6), 16),
			a: 1
		};
	}

	m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
	if (m) {
		return {
			r: Number(m[1]),
			g: Number(m[2]),
			b: Number(m[3]),
			a: m[4] !== undefined ? Number(m[4]) : 1
		};
	}

	m = s.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/i);
	if (m) {
		const { r, g, b } = hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
		return { r, g, b, a: m[4] !== undefined ? Number(m[4]) : 1 };
	}

	return null;
}

/** Invierte colores claros a oscuros preservando el matiz. Se usa como
 * red de contención para capas que no curamos a mano explícitamente. */
function autoDarken(input: string): string {
	const rgba = parseColor(input);
	if (!rgba) return input; // expresión (array) u formato no soportado

	const { h, s, l } = rgbToHsl(rgba.r, rgba.g, rgba.b);
	if (l < 35) return input; // ya es razonablemente oscuro

	const newL = clamp(100 - l, 10, 30);
	const newS = clamp(s * 0.6, 0, 60);
	const { r, g, b } = hslToRgb(h, newS, newL);
	return `rgba(${r}, ${g}, ${b}, ${rgba.a})`;
}

// Overrides directos por id de capa (paint properties completas o parciales).
const CURATED: Record<string, Record<string, unknown>> = {
	background: { 'background-color': BG },

	water: { 'fill-color': '#132132' },
	waterway_river: { 'line-color': '#3f6f9c' },
	waterway_other: { 'line-color': '#345d84' },
	waterway_tunnel: { 'line-color': '#345d84' },
	water_name_point_label: { 'text-color': '#7fb3e0', 'text-halo-color': BG },
	water_name_line_label: { 'text-color': '#7fb3e0', 'text-halo-color': BG },
	waterway_line_label: { 'text-color': '#7fb3e0', 'text-halo-color': BG },

	park: { 'fill-color': '#14261a', 'fill-opacity': 0.6, 'fill-outline-color': '#1f4430' },
	park_outline: { 'line-color': '#234f34' },
	landcover_wood: { 'fill-color': '#15311f', 'fill-opacity': 0.5 },
	landcover_grass: { 'fill-color': '#17301f', 'fill-opacity': 0.4 },
	landcover_ice: { 'fill-color': '#1c2733' },
	landcover_sand: { 'fill-color': '#2a2416' },
	landuse_pitch: { 'fill-color': '#182016' },
	landuse_track: { 'fill-color': '#182016' },
	landuse_cemetery: { 'fill-color': '#1a2419' },
	landuse_hospital: { 'fill-color': '#2a1620' },
	landuse_school: { 'fill-color': '#1c2a1c' },
	landuse_residential: { 'fill-color': 'rgba(255, 255, 255, 0.03)' },

	building: { 'fill-color': '#1a2438', 'fill-outline-color': '#2a3652' },
	'building-3d': { 'fill-extrusion-color': '#1c2740' },

	aeroway_fill: { 'fill-color': '#1f2530' },

	label_city: { 'text-color': '#f5f6f8', 'text-halo-color': BG },
	label_city_capital: { 'text-color': '#f5f6f8', 'text-halo-color': BG },
	label_town: { 'text-color': '#e2e5ea', 'text-halo-color': BG },
	label_village: { 'text-color': '#c7cdd6', 'text-halo-color': BG },
	label_other: { 'text-color': '#9aa3b2', 'text-halo-color': BG },
	label_state: { 'text-color': '#9aa3b2', 'text-halo-color': BG },
	label_country_1: { 'text-color': '#c7cdd6', 'text-halo-color': BG },
	label_country_2: { 'text-color': '#c7cdd6', 'text-halo-color': BG },
	label_country_3: { 'text-color': '#9aa3b2', 'text-halo-color': BG },
	'highway-name-major': { 'text-color': '#c7cdd6', 'text-halo-color': BG },
	'highway-name-minor': { 'text-color': '#9aa3b2', 'text-halo-color': BG },
	'highway-name-path': { 'text-color': '#7a8296', 'text-halo-color': BG },
	poi_r1: { 'text-color': '#c7cdd6', 'text-halo-color': BG },
	poi_r7: { 'text-color': '#9aa3b2', 'text-halo-color': BG },
	poi_r20: { 'text-color': '#9aa3b2', 'text-halo-color': BG },
	poi_transit: { 'text-color': '#9aa3b2', 'text-halo-color': BG },
	airport: { 'text-color': '#9aa3b2', 'text-halo-color': BG },

	boundary_2: { 'line-color': '#3a4256' },
	boundary_3: { 'line-color': '#2a3140' },
	boundary_disputed: { 'line-color': '#3a4256' }
};

// Jerarquía de color para calles, generada para las tres variantes que
// usa el estilo base (a nivel calle, en túnel, en puente).
const ROAD_FILL: Record<string, string> = {
	motorway: '#e0a458',
	motorway_link: '#e0a458',
	trunk_primary: '#dba05a',
	secondary_tertiary: '#8f97a8',
	minor: '#3d4863',
	street: '#3d4863',
	link: '#3d4863',
	service_track: '#2e3750',
	path_pedestrian: '#5b6472'
};
const ROAD_CASING: Record<string, string> = {
	motorway: '#7a5a34',
	motorway_link: '#7a5a34',
	trunk_primary: '#785d3c',
	secondary_tertiary: '#4a4f5c',
	minor: '#1c2230',
	street: '#1c2230',
	link: '#1c2230',
	service_track: '#1a1f2c'
};

for (const prefix of ['road', 'tunnel', 'bridge']) {
	for (const [cls, color] of Object.entries(ROAD_FILL)) {
		CURATED[`${prefix}_${cls}`] = { 'line-color': color };
	}
	for (const [cls, color] of Object.entries(ROAD_CASING)) {
		CURATED[`${prefix}_${cls}_casing`] = { 'line-color': color };
	}
}

export function buildDarkStyle(base: StyleSpecification): StyleSpecification {
	const style = JSON.parse(JSON.stringify(base)) as StyleSpecification;

	for (const layer of style.layers as LayerSpecification[]) {
		if (!('paint' in layer) || !layer.paint) continue;
		const paint = layer.paint as Record<string, unknown>;

		if (CURATED[layer.id]) {
			Object.assign(paint, CURATED[layer.id]);
			continue;
		}

		// Fallback: cualquier color plano que haya quedado claro se
		// oscurece automáticamente preservando el matiz. Las expresiones
		// (arrays de interpolate/match/step) se dejan como están.
		for (const [key, value] of Object.entries(paint)) {
			if (typeof value === 'string' && /color/i.test(key)) {
				paint[key] = autoDarken(value);
			}
		}
	}

	return style;
}