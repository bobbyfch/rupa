import { onRequestGet as search } from '../worker/src/search.js';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'Accept, Content-Type',
  'access-control-max-age': '86400',
  'x-content-type-options': 'nosniff',
};

function requestHeaders(incoming) {
  const headers = new Headers();
  for (const name of ['accept', 'accept-language', 'origin', 'user-agent']) {
    const value = incoming?.[name];
    if (typeof value === 'string' && value) headers.set(name, value);
  }
  return headers;
}

function writeError(res, status, message) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  for (const [name, value] of Object.entries(CORS_HEADERS)) res.setHeader(name, value);
  res.end(JSON.stringify({ error: message }));
}

/** Runtime-neutral adapter: reuse Rupa's search handler as a Vercel Node Function. */
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    for (const [name, value] of Object.entries(CORS_HEADERS)) res.setHeader(name, value);
    res.end();
    return;
  }
  if (req.method !== 'GET') return writeError(res, 405, 'Method not allowed.');

  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  const url = new URL(req.url || '/api/search', protocol + '://' + host);
  let response;
  try {
    const request = new Request(url, {
      method: 'GET',
      headers: requestHeaders(req.headers),
      signal: AbortSignal.timeout(28000),
    });
    response = await search({ request, env: process.env });
  } catch (error) {
    response = new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Search failed.' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  for (const [name, value] of Object.entries(CORS_HEADERS)) res.setHeader(name, value);
  res.end(Buffer.from(await response.arrayBuffer()));
}
