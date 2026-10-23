import { onRequestGet as search } from './search.js';
import { onRequestGet as image } from './image.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const UUID=/^[a-f0-9-]{36}$/i;
function safeOrigin(request,env){
  const origin=request.headers.get('origin')||'';
  const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(origin.startsWith('http://localhost:')||origin.startsWith('http://127.0.0.1:'))return origin;
  return allowed.includes(origin)?origin:null;
}
function cors(res,origin){
  const headers=new Headers(res.headers);headers.delete('access-control-allow-origin');
  if(origin){headers.set('access-control-allow-origin',origin);headers.set('access-control-allow-methods','GET,PUT,POST,OPTIONS');headers.set('access-control-allow-headers','Authorization,Content-Type');headers.set('vary','Origin');}
  headers.set('x-content-type-options','nosniff');return new Response(res.body,{status:res.status,headers});
}
async function digest(token){const input=new TextEncoder().encode(token);const hash=await crypto.subtle.digest('SHA-256',input);return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');}
function equal(a,b){ if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0; }
async function authorized(request,row){
  const match=/^Bearer ([\w-]{40,90})$/.exec(request.headers.get('authorization')||'');
  return Boolean(match && equal(await digest(match[1]),row.auth_hash));
}
async function appleArtistImage(rawUrl){
  let page;
  try{page=new URL(rawUrl);}catch{return json({error:'Invalid Apple Music artist URL'},400);}
  if(page.protocol!=='https:'||page.hostname!=='music.apple.com'||!/^\/(?:[a-z]{2}\/)?artist\/[^/]+\/\d+\/?$/i.test(page.pathname))return json({error:'Only Apple Music artist pages are supported'},400);
  const response=await fetch(page.toString(),{signal:AbortSignal.timeout(9000),headers:{Accept:'text/html', 'User-Agent':'Mozilla/5.0 (compatible; RUPA artwork lookup)'}});
  if(!response.ok)return json({error:`Apple Music returned HTTP ${response.status}`},response.status===404?404:502);
  if(!(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return json({error:'Apple Music did not return an artist page'},502);
  const html=await response.text();
  if(html.length>2_000_000)return json({error:'Apple Music artist page is too large'},502);
  const tag=html.match(/<meta\b[^>]*(?:property|name)=["']og:image["'][^>]*>/i)?.[0];
  const encoded=tag?.match(/\bcontent=["']([^"']+)["']/i)?.[1]?.replaceAll('&amp;','&');
  if(!encoded)return json({error:'Artist image is not available'},404);
  let image;
  try{image=new URL(encoded);}catch{return json({error:'Invalid Apple artist image URL'},502);}
  const host=image.hostname.toLowerCase();
  if(image.protocol!=='https:'||!(host==='mzstatic.com'||host.endsWith('.mzstatic.com'))||!image.pathname.startsWith('/image/thumb/'))return json({error:'Apple artist image host was not recognized'},502);
  const result=json({imageUrl:image.toString()});
  result.headers.set('cache-control','public, max-age=86400');
  return result;
}
async function sync(request,env,url){
  if(!env.ARCHIVE_DB)return json({error:'Sync database not configured'},503);
  const segments=url.pathname.split('/').filter(Boolean);
  const chainId=segments.length===3?segments[2]:null;
  if(segments.length!==2&&!chainId)return json({error:'Not found'},404);
  if(chainId&&!UUID.test(chainId))return json({error:'Invalid chain'},400);
  const db=env.ARCHIVE_DB;
  if(request.method==='POST' && !chainId){
    let body;try{body=await request.json();}catch{return json({error:'Invalid JSON'},400);}
    if(!UUID.test(body?.id)||!body.payload?.ciphertext||!body.payload?.iv)return json({error:'Invalid chain data'},400);
    const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
    if(!/^[\w-]{40,90}$/.test(token))return json({error:'Missing authorization'},401);
    const payload=JSON.stringify(body.payload);if(payload.length>1048576)return json({error:'Too large'},413);
    try{await db.prepare('INSERT INTO chains(id,auth_hash,payload,version,updated_at) VALUES(?,?,?,1,?)').bind(body.id,await digest(token),payload,Date.now()).run();}
    catch{return json({error:'Chain creation failed or already exists'},409);}
    return json({version:1},201);
  }
  if(!chainId)return json({error:'Method not allowed'},405);
  const row=await db.prepare('SELECT auth_hash, payload, version FROM chains WHERE id=?').bind(chainId).first();
  // Do not disclose existence of chain IDs.
  if(!row || !(await authorized(request,row)))return json({error:'Unauthorized chain'},401);
  if(request.method==='GET')return json({version:row.version,payload:JSON.parse(row.payload)});
  if(request.method==='PUT'){
    let body;try{body=await request.json();}catch{return json({error:'Invalid JSON'},400);}
    if(!Number.isSafeInteger(body?.expectedVersion)||typeof body?.payload?.iv!=='string'||typeof body?.payload?.ciphertext!=='string')return json({error:'Invalid update'},400);
    const payload=JSON.stringify(body.payload);if(payload.length>1048576)return json({error:'Too large'},413);
    const res=await db.prepare('UPDATE chains SET payload=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(payload,Date.now(),chainId,body.expectedVersion).run();
    if(res.meta.changes!==1)return json({error:'Sync version conflict'},409);
    return json({version:body.expectedVersion+1});
  }
  return json({error:'Method not allowed'},405);
}
export default {
  async fetch(request,env){
    const url=new URL(request.url),origin=safeOrigin(request,env);
    if(request.method==='OPTIONS')return cors(new Response(null,{status:204}),origin);
    if(request.headers.has('origin')&&!origin)return json({error:'Origin not allowed'},403);
    if(url.pathname.startsWith('/sync/chains'))return cors(await sync(request,env,url),origin);
    if(request.method!=='GET')return cors(json({error:'Method not allowed'},405),origin);
    try{
      if(url.pathname==='/api/search')return cors(await search({request,env}),origin);
      if(url.pathname==='/api/image')return cors(await image({request}),origin);
      if(url.pathname==='/api/artist-image')return cors(await appleArtistImage(url.searchParams.get('url')||''),origin);
      if(url.pathname==='/health')return cors(json({status:'ok',app:'rupa'}),origin);
      return cors(json({error:'Not found'},404),origin);
    }catch(error){return cors(json({error:error instanceof Error?error.message:'Server error'},500),origin);}
  }
};
