import { json } from '@sveltejs/kit';
import { getBusStops, getLineVariants } from '$lib/server/stmCache';
import { handleStmError } from '$lib/server/stmHttp';
import type { RequestHandler } from './$types';

const MAX_STOP_RESULTS = 20;
const MAX_LINE_RESULTS = 8;
const MIN_QUERY_LENGTH = 2;

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

	try {
		const [busStopsRes, lineVariantsRes] = await Promise.all([getBusStops(), getLineVariants()]);

		const stops = [];
		for (const stop of busStopsRes.data) {
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
		for (const variant of lineVariantsRes.data) {
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
	} catch (err) {
		return handleStmError(err);
	}
};