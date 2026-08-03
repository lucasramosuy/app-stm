import { json } from '@sveltejs/kit';
import { getBusStops, getLineVariants } from '$lib/server/stmCache';
import type { RequestHandler } from './$types';

const MAX_STOP_RESULTS = 20;
const MAX_LINE_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;

/** minúsculas + sin tildes, para que "andes" encuentre "ANDES" o "Añdes". */
function normalize(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

export const GET: RequestHandler = async ({ url }) => {
	const rawQuery = url.searchParams.get('q')?.trim() ?? '';

	if (rawQuery.length < MIN_QUERY_LENGTH) {
		return json({ stops: [], lines: [] });
	}

	const q = normalize(rawQuery);

	const [busStops, lineVariants] = await Promise.all([getBusStops(), getLineVariants()]);

	const stops = [];
	for (const stop of busStops) {
		const haystack = normalize(`${stop.street1} ${stop.street2}`);
		if (haystack.includes(q)) {
			stops.push({
				busstopId: stop.busstopId,
				street1: stop.street1,
				street2: stop.street2,
				location: stop.location
			});
			if (stops.length >= MAX_STOP_RESULTS) break;
		}
	}

	const linesSeen = new Map<string, { line: string; origin: string; destination: string }>();
	for (const variant of lineVariants) {
		const lineNormalized = normalize(String(variant.line));
		if (lineNormalized.includes(q) && !linesSeen.has(variant.line)) {
			linesSeen.set(variant.line, {
				line: variant.line,
				origin: variant.origin,
				destination: variant.destination
			});
			if (linesSeen.size >= MAX_LINE_RESULTS) break;
		}
	}

	return json({
		stops,
		lines: Array.from(linesSeen.values())
	});
};