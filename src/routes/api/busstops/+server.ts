import { json } from '@sveltejs/kit';
import { stmFetch } from '$lib/server/stmApi';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const data = await stmFetch('/buses/busstops');
	return json(data, {
		headers: { 'Cache-Control': 'public, max-age=3600' }
	});
};
