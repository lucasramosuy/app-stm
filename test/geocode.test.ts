import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	splitIntersection,
	accentFlexibleRegex,
	geocodeAddress
} from '$lib/server/geocode';

describe('splitIntersection', () => {
	it('detecta cruces con "y", "e", "esq.", "esquina" y "/"', () => {
		expect(splitIntersection('18 de julio y rio branco')).toEqual([
			'18 de julio',
			'rio branco'
		]);
		expect(splitIntersection('Av. Italia e Isla de Flores')).toEqual([
			'Av. Italia',
			'Isla de Flores'
		]);
		expect(splitIntersection('Rivera esq. Jackson')).toEqual(['Rivera', 'Jackson']);
		expect(splitIntersection('Rivera esquina Jackson')).toEqual(['Rivera', 'Jackson']);
		expect(splitIntersection('Rivera/Jackson')).toEqual(['Rivera', 'Jackson']);
	});

	it('no confunde búsquedas que no son cruces', () => {
		expect(splitIntersection('Pocitos')).toBeNull();
		expect(splitIntersection('18 de Julio 1854')).toBeNull();
		expect(splitIntersection('Tres Cruces')).toBeNull();
	});
});

describe('accentFlexibleRegex', () => {
	it('tolera tildes en cualquier dirección', () => {
		expect(new RegExp(accentFlexibleRegex('rio branco'), 'i').test('Río Branco')).toBe(true);
		expect(new RegExp(accentFlexibleRegex('Río Branco'), 'i').test('rio branco')).toBe(true);
		expect(new RegExp(accentFlexibleRegex('18 de julio'), 'i').test('Avenida 18 de Julio')).toBe(
			true
		);
	});

	it('escapa caracteres especiales de regex', () => {
		const rx = accentFlexibleRegex('Av. 8 de Octubre (esq.)');
		expect(() => new RegExp(rx)).not.toThrow();
	});
});

const OVERPASS_TWO_CROSSES = {
	elements: [
		{ type: 'node', id: 1, lat: -34.9062303, lon: -56.1958589 },
		// mismo cruce, otra mano de la avenida (~30 m): se agrupa
		{ type: 'node', id: 2, lat: -34.9062503, lon: -56.1958889 },
		// otro cruce más lejos (~1 km)
		{ type: 'node', id: 3, lat: -34.8962, lon: -56.1858 }
	]
};

function mockFetch(handlers: Record<string, unknown>) {
	return vi.fn(async (input: unknown) => {
		const url = String(input);
		for (const [key, body] of Object.entries(handlers)) {
			if (url.includes(key)) {
				return new Response(JSON.stringify(body), { status: 200 });
			}
		}
		return new Response('not found', { status: 404 });
	});
}

describe('geocodeAddress con cruces', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', mockFetch({ 'overpass-api.de': OVERPASS_TWO_CROSSES }));
	});
	afterEach(() => vi.unstubAllGlobals());

	it('resuelve un cruce por Overpass y agrupa nodos pegados', async () => {
		const results = await geocodeAddress('18 de julio y rio branco');
		expect(results).toHaveLength(2);
		expect(results[0].label).toBe('18 de julio y rio branco');
		expect(results[0].coordinates).toHaveLength(2);
	});

	it('cae a Nominatim si Overpass no devuelve cruces', async () => {
		vi.stubGlobal(
			'fetch',
			mockFetch({
				'overpass-api.de': { elements: [] },
				'nominatim.openstreetmap.org': []
			})
		);
		const results = await geocodeAddress('una calle y otra');
		expect(results).toEqual([]);
	});

	it('cae a Nominatim si Overpass responde error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: unknown) => {
				const url = String(input);
				if (url.includes('overpass-api.de')) return new Response('boom', { status: 500 });
				return new Response(JSON.stringify([]), { status: 200 });
			})
		);
		await expect(geocodeAddress('una calle y otra')).resolves.toEqual([]);
	});
});
