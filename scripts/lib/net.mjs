// Keyless HTTP helpers for ingest scripts. Honors Retry-After, backs off on 429/5xx, never sends credentials.
import { createHash } from 'node:crypto';
const UA = 'RupaIngest/1.0 (+https://github.com/bobbyfch/rupa)';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function request(url, { retries = 3, timeoutMs = 60_000, method = 'GET', headers = {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': UA, ...headers } });
      if (response.status === 429 || response.status >= 500) {
        const wait = Number(response.headers.get('retry-after')) * 1000 || 1500 * 2 ** attempt;
        lastError = new Error(`HTTP ${response.status} ${url}`);
        if (attempt < retries) { await sleep(Math.min(wait, 30_000)); continue; }
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(1500 * 2 ** attempt);
    }
  }
  throw lastError;
}
// A connection can reset while the body streams, after request() already succeeded: retry the whole read.
async function readBody(url, options, read) {
  const attempts = (options?.retries ?? 3) + 1;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await request(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
      return await read(response);
    } catch (error) {
      lastError = error;
      if (/HTTP 4[0-9][0-9]/.test(String(error.message)) || attempt === attempts - 1) break;
      await sleep(1500 * 2 ** attempt);
    }
  }
  throw lastError;
}
export const getJson = (url, options) => readBody(url, { ...options, headers: { Accept: 'application/json', ...(options?.headers || {}) } }, response => response.json());
export const getText = (url, options) => readBody(url, options, response => response.text());
export const getBuffer = (url, options) => readBody(url, options, async response => ({ buffer: Buffer.from(await response.arrayBuffer()), mime: (response.headers.get('content-type') || '').split(';')[0].trim() }));
export const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
