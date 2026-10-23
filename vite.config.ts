import { fileURLToPath } from 'node:url';
import { existsSync, createReadStream, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { onRequestGet as getLocalSearch } from './worker/src/search.js';
import { onRequestGet as getLocalMangaDetail } from './worker/src/manga-detail.js';
import { onRequestGet as getLocalImage } from './worker/src/image.js';
const LOCAL_HEXFLOW_ROOT=fileURLToPath(new URL('./.local-only/source-mirrors/hexflow-covers',import.meta.url));
const normalizeLocalTitle=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function localHexflowMiddleware(){
  return {name:'rupa-local-hexflow-mirror',configureServer(server:any){
    let index:{appId:string;title:string}[]|null=null;
    const loadIndex=()=>{
      if(index)return index;
      const file=path.join(LOCAL_HEXFLOW_ROOT,'HEXFlow-Coverlisting.txt');
      if(!existsSync(file))return [];
      index=readFileSync(file,'utf8').split(/\r?\n/).flatMap(line=>{const match=line.trim().match(/^([A-Z]{4}\d{5})\s+(.{2,140})$/i);return match?[{appId:match[1].toUpperCase(),title:match[2].trim()}]:[];});
      return index;
    };
    server.middlewares.use((req:any,res:any,next:any)=>{
      if(!req.url?.startsWith('/__rupa-local/hexflow/'))return next();
      if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;return res.end();}
      const requestUrl=new URL(req.url,'http://localhost');
      if(requestUrl.pathname==='/__rupa-local/hexflow/search'){
        const rawQuery=(requestUrl.searchParams.get('q')||'').slice(0,180),normalized=normalizeLocalTitle(rawQuery);
        const id=(rawQuery.match(/(?:^|\/)([A-Z]{4}\d{5})(?:\.png)?(?:$|[?#/])/i)||rawQuery.match(/^(?:ps\s*vita\s*[|:]\s*)?([A-Z]{4}\d{5})$/i))?.[1]?.toUpperCase();
        const rows=loadIndex(),matched=id?rows.filter(row=>row.appId===id).length?rows.filter(row=>row.appId===id):[{appId:id,title:id}]:rows.filter(row=>{const title=normalizeLocalTitle(row.title);return title.includes(normalized)||normalized.split(' ').every(token=>title.split(' ').includes(token));}).slice(0,12);
        const results=matched.flatMap(row=>{
          const relative='Covers/PSVita/'+row.appId+'.png',file=path.resolve(LOCAL_HEXFLOW_ROOT,relative);
          if(!file.startsWith(path.resolve(LOCAL_HEXFLOW_ROOT)+path.sep)||!existsSync(file))return [];
          const image='/__rupa-local/hexflow/'+relative;
          return [{id:'games:vitahex:'+row.appId,category:'games',title:row.title,subtitle:'PS Vita · App ID '+row.appId+' · 250 × 320 px',sourceUrl:'https://github.com/VitaHEX-Games/hexflow-covers/blob/main/'+relative,source:'HexFlow Covers',provider:'HexFlow Covers',previewUrl:image,imageUrl:image,sdDownloadUrl:image,downloadUrl:image,hdDownloadUrls:[image],kind:'cover',rights:'source-only'}];
        });
        res.statusCode=200;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');return res.end(JSON.stringify({results,warnings:[],unavailable:[]}));
      }
      const prefix='/__rupa-local/hexflow/';
      let relative;try{relative=decodeURIComponent(requestUrl.pathname.slice(prefix.length));}catch{res.statusCode=400;return res.end();}
      if(!/^Covers\/PSVita\/[A-Z]{4}\d{5}\.png$/i.test(relative)){res.statusCode=404;return res.end();}
      const file=path.resolve(LOCAL_HEXFLOW_ROOT,relative);
      if(!file.startsWith(path.resolve(LOCAL_HEXFLOW_ROOT)+path.sep)||!existsSync(file)){res.statusCode=404;return res.end();}
      const stats=statSync(file);res.statusCode=200;res.setHeader('content-type','image/png');res.setHeader('content-length',String(stats.size));res.setHeader('cache-control','public, max-age=86400');res.setHeader('x-content-type-options','nosniff');
      if(req.method==='HEAD')return res.end();
      createReadStream(file).pipe(res);
    });
  }};
}
// Personal cover copies (scripts/local/fetch-covers.mjs) live in .local-only/covers, which is git-ignored and never deployed.
// Names stay percent-encoded exactly as on disk, so no decoding happens and no path can climb out of the folder.
function localCovers() {
  const root = path.resolve(fileURLToPath(new URL('./.local-only/covers', import.meta.url)));
  const SAFE = /^[a-z0-9]+\/(?:boxart\/[A-Za-z0-9%._()'~!*-]+\.png|serial\/(?:default\/[A-Z0-9-]+\.jpg|3d\/[A-Z0-9-]+\.png))$/;
  const handler = (req: any, res: any, next: any) => {
    if (!req.url?.startsWith('/__rupa-local/covers/')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
    const rel = new URL(req.url, 'http://localhost').pathname.slice('/__rupa-local/covers/'.length);
    res.setHeader('x-content-type-options', 'nosniff');
    if (rel === 'index.json') {
      const list = (dir: string) => { try { return readdirSync(path.join(root, dir)); } catch { return []; } };
      const index: Record<string, unknown> = {};
      for (const platform of list('.')) index[platform] = { boxart: list(platform + '/boxart'), serial: { default: list(platform + '/serial/default'), '3d': list(platform + '/serial/3d') } };
      res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
      return res.end(JSON.stringify(index));
    }
    const file = path.resolve(root, rel);
    if (!SAFE.test(rel) || rel.includes('..') || !file.startsWith(root + path.sep) || !existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', file.endsWith('.png') ? 'image/png' : 'image/jpeg'); res.setHeader('cache-control', 'public, max-age=86400');
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  };
  return { name: 'rupa-local-covers', configureServer(server: any) { server.middlewares.use(handler); }, configurePreviewServer(server: any) { server.middlewares.use(handler); } };
}
// The deployed image worker also serves same-origin downloads while running locally.
function localImageProxy() {
  const handler = async (req: any, res: any, next: any) => {
    if (!req.url?.startsWith('/api/image')) return next();
    if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
    try {
      const request = new Request(new URL(req.url, 'http://localhost').toString(), { method: 'GET' });
      const response = await getLocalImage({ request } as any);
      res.statusCode = response.status;
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Image proxy could not complete the request.' }));
    }
  };
  return { name: 'rupa-local-image-proxy', configureServer(server: any) { server.middlewares.use(handler); }, configurePreviewServer(server: any) { server.middlewares.use(handler); } };
}
// Reuse the production search Worker in local development so browser-only CORS rules do not hide usable feeds.
function localSearchProxy() {
  const handler = async (req: any, res: any, next: any) => {
    if (!req.url?.startsWith('/api/search') && !req.url?.startsWith('/api/manga-detail')) return next();
    if (req.method !== 'GET') { res.statusCode = 405; return res.end(); }
    try {
      const request = new Request(new URL(req.url, 'http://localhost').toString(), { method: 'GET' });
      const response = req.url.startsWith('/api/manga-detail')
        ? await getLocalMangaDetail({ request, env: {} } as any)
        : await getLocalSearch({ request, env: {} } as any);
      res.statusCode = response.status;
      response.headers.forEach((value, name) => res.setHeader(name, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Search proxy could not complete the request.' }));
    }
  };
  return { name: 'rupa-local-search-proxy', configureServer(server: any) { server.middlewares.use(handler); }, configurePreviewServer(server: any) { server.middlewares.use(handler); } };
}
// GitHub Pages cannot set response headers, so the production page carries its policy in a meta tag.
// script-src allows itunes.apple.com because the Apple Search fallback uses JSONP. Dev is left open for Vite's inline HMR scripts.
function productionCsp() {
  const policy = [
    "default-src 'self'", "script-src 'self' https://itunes.apple.com", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", 'font-src https://fonts.gstatic.com',
    "img-src 'self' data: blob: https:", "media-src 'self' blob: https:", "connect-src 'self' https:", "worker-src 'self' blob:", "manifest-src 'self'",
    "base-uri 'self'", "object-src 'none'", "form-action 'self'",
  ].join('; ');
  return { name: 'rupa-csp', apply: 'build' as const, transformIndexHtml: (html: string) => html.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="' + policy + '" />') };
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || (env.GITHUB_REPOSITORY && !env.GITHUB_REPOSITORY.endsWith('.github.io') ? `/${env.GITHUB_REPOSITORY.split('/')[1]}/` : '/');
  return { base, plugins: [react(), tailwindcss(), localHexflowMiddleware(), localCovers(), localSearchProxy(), localImageProxy(), productionCsp()], resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, server: { port: 5173 } };
});
