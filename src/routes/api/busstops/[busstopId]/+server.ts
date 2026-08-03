import { json } from '@sveltejs/kit';
import { getBusStopDetail } from '$lib/server/stmCache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const data = await getBusStopDetail(params.busstopId!);
	return json(data, {
		headers: { 'Cache-Control': 'public, max-age=3600' }
	});
};