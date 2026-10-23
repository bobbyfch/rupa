const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set(['covers.openlibrary.org', 'coverartarchive.org', 'archive.org', 'cdn.myanimelist.net', 'images.myanimelist.net', 'myanimelist.net', 'images.metmuseum.org', 'openaccess-cdn.clevelandart.org', 's4.anilist.co', 'i.ytimg.com', 'uploads.mangadex.org', 'raw.githubusercontent.com', 'upload.wikimedia.org', 'api.openverse.org', 'images.openverse.org', 'ghibli.jp', 'www.ghibli.jp', 'thumbnails.libretro.com', 'file.adquan.com', 'comicbook.com', 'assets.recordchina.co.jp', 'p2.cri.cn', 'www.ifensi.com', 'p3.itc.cn', 'p9.itc.cn', 'mir-s3-cdn-cf.behance.net', 'obj.shine.cn', 'images.shobserver.com']);
const okHostname = (host) => ALLOWED.has(host) || host.endsWith('.archive.org') || host.endsWith('.mzstatic.com') || host.endsWith('.dzcdn.net');
const isSafe = (url) => url.protocol === 'https:' && !url.username && !url.password && (url.port === '' || url.port === '443') && okHostname(url.hostname.toLowerCase());
function err(text, status = 400) { return new Response(JSON.stringify({ error: text }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }

async function trustedFetch(input) {
  let url = new URL(input);
  for (let i = 0; i < 5; i++) {
    if (!isSafe(url)) throw new Error('Sumber gambar tidak termasuk daftar yang diizinkan.');
    const response = await fetch(url.toString(), { redirect: 'manual', signal: AbortSignal.timeout(16000), headers: { 'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Pengalihan gambar tidak valid.');
      const next = new URL(location, url);
      // Archive's older redirects sometimes use http:// on its own approved host.
      // Upgrade instead of making an insecure HTTP request.
      if (next.protocol === 'http:' && okHostname(next.hostname.toLowerCase())) next.protocol = 'https:';
      if (!isSafe(next)) throw new Error('Tujuan pengalihan gambar tidak diizinkan.');
      url = next;
      continue;
    }
    return response;
  }
  throw new Error('Terlalu banyak pengalihan gambar.');
}

function extension(type) {
  if (type === 'image/png') return '.png';
  if (type === 'image/webp') return '.webp';
  if (type === 'image/avif') return '.avif';
  if (type === 'image/tiff') return '.tif';
  return '.jpg';
}
export async function onRequestGet({ request }) {
  const params = new URL(request.url).searchParams;
  const remote = params.get('url');
  if (!remote || remote.length > 1900) return err('URL gambar tidak valid.');
  let source;
  try { source = new URL(remote); } catch { return err('URL gambar tidak valid.'); }
  if (!isSafe(source)) return err('Domain gambar tidak diizinkan.', 403);
  try {
    const upstream = await trustedFetch(source);
    if (!upstream.ok) return err(`Gambar tidak tersedia di sumber (HTTP ${upstream.status}).`, upstream.status === 404 ? 404 : 502);
    const type = (upstream.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff'].includes(type)) return err('Sumber tidak mengirim gambar yang valid.', 415);
    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > MAX_BYTES) return err('Ukuran gambar melampaui batas 20 MB.', 413);
    if (!upstream.body) return err('Gambar kosong.', 502);
    let bytes = 0;
    const limited = upstream.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > MAX_BYTES) { controller.error(new Error('Batas 20 MB terlampaui.')); return; }
        controller.enqueue(chunk);
      },
    }));
    const filename = (params.get('name') || 'artwork').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 95) || 'artwork';
    return new Response(limited, {
      status: 200,
      headers: {
        'content-type': type,
        'content-disposition': `attachment; filename="${filename}${extension(type)}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return err(error?.message || 'Gagal mengambil gambar dari sumber.', 502);
  }
}
