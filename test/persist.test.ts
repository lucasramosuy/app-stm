import { describe, it, expect, beforeEach } from 'vitest';
import { loadJson, saveJson, loadFlag, saveFlag } from '$lib/persist';

// localStorage mínimo en memoria para el entorno node.
const store = new Map<string, string>();
beforeEach(() => {
	store.clear();
	(globalThis as Record<string, unknown>).localStorage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k)
	};
});

describe('persist', () => {
	it('saveJson + loadJson hacen roundtrip', () => {
		saveJson('k', [{ id: 'a' }], 't');
		expect(loadJson('k', [], 't')).toEqual([{ id: 'a' }]);
	});

	it('loadJson devuelve el fallback si la clave no existe', () => {
		expect(loadJson('nope', [1, 2], 't')).toEqual([1, 2]);
	});

	it('loadJson devuelve el fallback con JSON corrupto (no rompe)', () => {
		store.set('k', '{no es json');
		expect(loadJson('k', ['safe'], 't')).toEqual(['safe']);
	});

	it('saveFlag + loadFlag hacen roundtrip', () => {
		saveFlag('f', true, 't');
		expect(loadFlag('f', 't')).toBe(true);
		saveFlag('f', false, 't');
		expect(loadFlag('f', 't')).toBe(false);
	});

	it('loadFlag es false si la clave no existe', () => {
		expect(loadFlag('nope', 't')).toBe(false);
	});

	it('sin localStorage no rompe: fallback y no-op', () => {
		delete (globalThis as Record<string, unknown>).localStorage;
		expect(loadJson('k', 'fb', 't')).toBe('fb');
		expect(loadFlag('f', 't')).toBe(false);
		expect(() => saveJson('k', 1, 't')).not.toThrow();
		expect(() => saveFlag('f', true, 't')).not.toThrow();
	});
});
