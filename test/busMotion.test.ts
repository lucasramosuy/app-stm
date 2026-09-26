import { describe, it, expect } from 'vitest';
import {
	MIN_ANIM_MS,
	MAX_ANIM_MS,
	MAX_ANIM_DIST_M,
	MAX_PLAUSIBLE_SPEED_KMH,
	MAX_PATH_DETOUR_FACTOR,
	animDurationMs,
	impliedSpeedKmh,
	shouldSnap,
	shouldDropPath,
	degDistSq,
	distMeters
} from '$lib/animation/busMotion';

describe('animDurationMs', () => {
	it('usa el elapsed real dentro del rango', () => {
		expect(animDurationMs(8_000, 8_000)).toBe(8_000);
	});
	it('acota por abajo al mínimo', () => {
		expect(animDurationMs(200, 8_000)).toBe(MIN_ANIM_MS);
	});
	it('acota por arriba al máximo', () => {
		expect(animDurationMs(120_000, 8_000)).toBe(MAX_ANIM_MS);
	});
	it('sin elapsed usa el período de poll', () => {
		expect(animDurationMs(0, 8_000)).toBe(8_000);
	});
});

describe('impliedSpeedKmh', () => {
	it('calcula km/h correctamente', () => {
		expect(impliedSpeedKmh(1_000, 60_000)).toBeCloseTo(60);
	});
});

describe('shouldSnap (anti buses voladores)', () => {
	it('anima un salto corto y plausible', () => {
		// 100 m en 8 s = 45 km/h: plausible para un ómnibus urbano
		expect(shouldSnap(100, impliedSpeedKmh(100, 8_000))).toBe(false);
	});
	it('no anima saltos más largos que el máximo', () => {
		expect(shouldSnap(MAX_ANIM_DIST_M + 1, 10)).toBe(true);
	});
	it('anima exactamente en el límite de distancia', () => {
		expect(shouldSnap(MAX_ANIM_DIST_M, 10)).toBe(false);
	});
	it('no anima velocidades implausibles', () => {
		// 900 m en 8 s = 405 km/h: ruido de GPS aunque el salto "quepa"
		expect(shouldSnap(900, impliedSpeedKmh(900, 8_000))).toBe(true);
	});
	it('anima exactamente en el límite de velocidad', () => {
		expect(shouldSnap(100, MAX_PLAUSIBLE_SPEED_KMH)).toBe(false);
	});
});

describe('shouldDropPath (rodeo por mal snap al trazado)', () => {
	it('conserva el trazado si el rodeo es razonable', () => {
		expect(shouldDropPath(0.001, 0.002)).toBe(false);
	});
	it('descarta el trazado si el rodeo supera el factor', () => {
		expect(shouldDropPath(0.001, 0.001 * (MAX_PATH_DETOUR_FACTOR + 0.1))).toBe(true);
	});
	it('conserva exactamente en el factor límite', () => {
		expect(shouldDropPath(0.001, 0.001 * MAX_PATH_DETOUR_FACTOR)).toBe(false);
	});
	it('no divide por cero con origen igual a destino', () => {
		expect(shouldDropPath(0, 5)).toBe(false);
	});
});

describe('helpers geo', () => {
	it('degDistSq es cero para el mismo punto', () => {
		expect(degDistSq([-56.1, -34.9], [-56.1, -34.9])).toBe(0);
	});
	it('distMeters da ~111 km por grado de latitud', () => {
		expect(distMeters([-56.0, -34.0], [-56.0, -33.0])).toBeGreaterThan(110_000);
		expect(distMeters([-56.0, -34.0], [-56.0, -33.0])).toBeLessThan(112_500);
	});
});
