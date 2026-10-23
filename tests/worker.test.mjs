import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as image } from '../worker/src/image.js';
import { onRequestGet as search } from '../worker/src/search.js';
import { onRequestGet as mangaDetail } from '../worker/src/manga-detail.js';
import { mangaTitleMatchScore } from '../worker/src/expanded-sources.js';
import worker from '../worker/src/index.js';
function request(url,options){return new Request(url,options);}
const MANGA_UUID='01234567-89ab-4cde-8fab-0123456789ab';
test('image proxy rejects insecure protocol',async()=>{const r=await image({request:request('https://x.test/api/image?url=http%3A%2F%2Fcovers.openlibrary.org%2Fa.jpg')});assert.equal(r.status,403);});
test('image proxy rejects arbitrary domain',async()=>{const r=await image({request:request('https://x.test/api/image?url=https%3A%2F%2Fevil.example%2Fanything.jpg')});assert.equal(r.status,403);});
test('image proxy rejects localhost',async()=>{const r=await image({request:request('https://x.test/api/image?url=https%3A%2F%2Flocalhost%2Fanything.jpg')});assert.equal(r.status,403);});
test('image proxy accepts the approved museum image hosts',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]),{status:200,headers:{'content-type':'image/jpeg','content-length':'3'}});
  try{const r=await image({request:request('https://x.test/api/image?url=https%3A%2F%2Fopenaccess-cdn.clevelandart.org%2F1968.257%2F1968.257_print.jpg')});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');}
  finally{globalThis.fetch=original;}
});
test('search rejects too short query',async()=>{const r=await search({request:request('https://x.test/api/search?q=a'),env:{}});assert.equal(r.status,400);});
test('search rejects invalid category',async()=>{const r=await search({request:request('https://x.test/api/search?q=dune&category=hacks'),env:{}});assert.equal(r.status,400);});
test('worker rejects unapproved cross-origin browser requests',async()=>{const r=await worker.fetch(request('https://x.test/api/search?q=dune',{headers:{Origin:'https://evil.example'}}),{ALLOWED_ORIGINS:'https://bobbyfch.github.io'});assert.equal(r.status,403);});
test('worker answers health checks',async()=>{const r=await worker.fetch(request('https://x.test/health'),{});assert.equal(r.status,200);});
test('sync requires database',async()=>{const r=await worker.fetch(request('https://x.test/sync/chains'),{});assert.equal(r.status,503);});
test('manga detail rejects empty and malformed identifiers without calling providers',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('unexpected provider call');};
  try{
    const empty=await mangaDetail({request:request('https://x.test/api/manga-detail')});
    const malformed=await mangaDetail({request:request('https://x.test/api/manga-detail?id=not-a-uuid')});
    assert.equal(empty.status,400);assert.equal(malformed.status,400);assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});
test('MangaDex series detail maps numbered cover metadata and requests no chapter images',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    if(url.pathname==='/manga')return Response.json({data:[
      {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',attributes:{title:{en:'One Piece Red'},altTitles:[]}},
      {id:MANGA_UUID,attributes:{title:{en:'One Piece'},description:{en:'A series description.'},year:1997,status:'ongoing',lastVolume:'110'},relationships:[{id:'author-1',type:'author',attributes:{name:'Eiichiro Oda'}}]},
    ]});
    if(url.pathname==='/cover')return Response.json({total:4,data:[
      {id:'cover-v10',attributes:{volume:'10',fileName:'volume-10.jpg',locale:'en'}},
      {id:'cover-v2-ja',attributes:{volume:'2',fileName:'volume-2-ja.jpg',locale:'ja'}},
      {id:'cover-v1',attributes:{volume:'1',fileName:'volume-1.jpg',locale:'en'}},
      {id:'cover-v2-en',attributes:{volume:'2',fileName:'volume-2-en.jpg',locale:'en'}},
    ]});
    throw new Error(`unexpected provider URL ${url}`);
  };
  try{
    const response=await mangaDetail({request:request('https://x.test/api/manga-detail?title=One%20Piece')});
    const body=await response.json();
    assert.equal(response.status,200);assert.equal(body.id,MANGA_UUID);assert.equal(body.title,'One Piece');assert.equal(body.year,'1997');assert.deepEqual(body.authors,['Eiichiro Oda']);
    assert.deepEqual(body.volumes.map(item=>item.subtitle.split(' · ')[0]),['Volume 1','Volume 2','Volume 10']);
    assert.ok(body.volumes[1].imageUrl.endsWith('/volume-2-en.jpg.512.jpg'));
    assert.ok(body.volumes.every(item=>item.sourceUrl===`https://mangadex.org/title/${MANGA_UUID}`));
    assert.deepEqual(requested.map(url=>url.pathname),['/manga','/cover']);
    assert.ok(requested.every(url=>url.hostname==='api.mangadex.org'));
  }finally{globalThis.fetch=original;}
});
test('MangaDex detail uses canonical IDs, rejects weak title matches, and is routed by the Worker',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    if(url.hostname==='api.jikan.moe'&&url.pathname==='/v4/manga')return Response.json({data:[]});
    if(url.pathname===`/manga/${MANGA_UUID}`)return Response.json({data:{id:MANGA_UUID,attributes:{title:{en:'One Piece'},description:{en:'Series'},year:1997},relationships:[]}});
    if(url.pathname==='/cover')return Response.json({total:0,data:[]});
    if(url.pathname==='/manga')return Response.json({data:[{id:MANGA_UUID,attributes:{title:{en:'Totally Different Title'}}}]});
    throw new Error(`unexpected provider URL ${url}`);
  };
  try{
    const byId=await worker.fetch(request(`https://x.test/api/manga-detail?id=${MANGA_UUID}`),{});
    assert.equal(byId.status,200);assert.equal((await byId.json()).id,MANGA_UUID);
    const noMatch=await worker.fetch(request('https://x.test/api/manga-detail?title=One%20Piece%20Unique%20Fixture'),{});
    assert.equal(noMatch.status,404);assert.match((await noMatch.json()).error,/matching series/i);
    assert.ok(requested.some(url=>url.pathname===`/manga/${MANGA_UUID}`));
    assert.ok(requested.some(url=>url.pathname==='/manga'));
  }finally{globalThis.fetch=original;}
});
test('MangaDex title matching rejects a short query that only matches a longer series',()=>{
  assert.equal(mangaTitleMatchScore({title:{en:'One Piece'}},'One Piece'),1);
  assert.ok(mangaTitleMatchScore({title:{en:'One Piece Red'}},'One Piece')<.75);
});
test('MangaDex detail gives a recoverable message when its API cannot be reached',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw new TypeError('fetch failed');};
  try{
    const response=await mangaDetail({request:request('https://x.test/api/manga-detail?title=network%20fixture')});
    const body=await response.json();assert.equal(response.status,503);assert.match(body.error,/Open Library/i);assert.match(body.error,/Jikan/i);
  }finally{globalThis.fetch=original;}
});

test('Open Library provides numbered manga cover records when MangaDex is unavailable',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    if(url.hostname==='api.mangadex.org')throw new TypeError('fetch failed');
    if(url.hostname==='openlibrary.org'&&url.pathname==='/search.json')return Response.json({docs:[
      {title:'RUPA MANGA FIXTURE 2',cover_i:9609527,key:'/works/OL8215641W',first_publish_year:1998},
      {title:'RUPA MANGA FIXTURE 1',cover_i:1020563,key:'/works/OL8215661W',first_publish_year:1997},
      {title:'RUPA MANGA FIXTURE PIRATE RECIPES',cover_i:12388174,key:'/works/OL25316198W',first_publish_year:2012},
      {title:'RUPA MANGA FIXTURE 3 COLOR EDITION',cover_i:1200,key:'/works/OL8215644W',first_publish_year:1998},
    ]});
    throw new Error(`unexpected provider URL ${url}`);
  };
  try{
    const response=await mangaDetail({request:request('https://x.test/api/manga-detail?title=Rupa%20Manga%20Fixture')});
    const body=await response.json();
    assert.equal(response.status,200);assert.equal(body.source,'Open Library');assert.equal(body.galleryLabel,'Numbered cover records');assert.equal(body.volumesNumbered,true);
    assert.deepEqual(body.volumes.map(item=>item.subtitle.split(' · ')[0]),['Volume 1','Volume 2']);
    assert.equal(body.volumes[0].previewUrl,'https://covers.openlibrary.org/b/id/1020563-M.jpg');
    assert.equal(body.volumes[1].imageUrl,'https://covers.openlibrary.org/b/id/9609527-L.jpg');
    assert.equal(body.volumes[0].sourceUrl,'https://openlibrary.org/works/OL8215661W');
    assert.match(body.detailNote,/coverage and edition numbering can vary/i);
    assert.deepEqual(requested.map(url=>url.hostname),['api.mangadex.org','openlibrary.org']);
    assert.ok(requested.every(url=>!url.pathname.includes('chapter')&&!url.pathname.includes('at-home')));
  }finally{globalThis.fetch=original;}
});

test('MangaDex failure falls back to a clearly unnumbered Jikan gallery without requesting chapters',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    if(url.hostname==='api.mangadex.org')throw new TypeError('fetch failed');
    if(url.hostname==='api.jikan.moe'&&url.pathname==='/v4/manga')return Response.json({data:[{mal_id:42013,title:'Rupa fallback fixture',title_english:'Rupa fallback fixture',synopsis:'Fallback fixture',published:{from:'1997-07-22T00:00:00+00:00'},status:'Publishing',volumes:110,authors:[{name:'Fixture Author'}]}]});
    if(url.hostname==='api.jikan.moe'&&url.pathname==='/v4/manga/42013/pictures')return Response.json({data:[
      {jpg:{image_url:'https://cdn.myanimelist.net/images/manga/1/1.jpg',large_image_url:'https://cdn.myanimelist.net/images/manga/1/1l.jpg'}},
      {webp:{image_url:'https://cdn.myanimelist.net/images/manga/1/2.webp',large_image_url:'https://cdn.myanimelist.net/images/manga/1/2l.webp'}},
    ]});
    throw new Error(`unexpected provider URL ${url}`);
  };
  try{
    const response=await mangaDetail({request:request('https://x.test/api/manga-detail?title=Rupa%20fallback%20fixture')});
    const body=await response.json();
    assert.equal(response.status,200);assert.equal(body.source,'Jikan / MyAnimeList');assert.equal(body.galleryLabel,'Related cover artwork');
    assert.match(body.detailNote,/not numbered/i);assert.equal(body.year,'1997');assert.equal(body.lastVolume,'');assert.deepEqual(body.authors,['Fixture Author']);
    assert.deepEqual(body.volumes.map(item=>item.subtitle),['Image 1 · Jikan / MyAnimeList','Image 2 · Jikan / MyAnimeList']);
    assert.ok(body.volumes[0].imageUrl.endsWith('/1l.jpg'));assert.ok(body.volumes.every(item=>item.rights==='source-only'));
    assert.deepEqual(requested.filter(url=>url.hostname==='api.jikan.moe').map(url=>url.pathname),['/v4/manga','/v4/manga/42013/pictures']);
    assert.ok(requested.every(url=>!url.pathname.includes('chapter')&&!url.pathname.includes('at-home')));
  }finally{globalThis.fetch=original;}
});
test('MangaDex series with no numbered covers falls back to related Jikan art',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    if(url.hostname==='api.mangadex.org'&&url.pathname==='/manga')return Response.json({data:[{id:'44444444-4444-4444-8444-444444444444',attributes:{title:{en:'Rupa zero cover fixture'},year:2021,status:'ongoing'},relationships:[]}]});
    if(url.hostname==='api.mangadex.org'&&url.pathname==='/cover')return Response.json({data:[],total:0});
    if(url.hostname==='api.jikan.moe'&&url.pathname==='/v4/manga')return Response.json({data:[{mal_id:43001,title:'Rupa zero cover fixture',title_english:'Rupa zero cover fixture',published:{from:'2021-01-01'}}]});
    if(url.hostname==='api.jikan.moe'&&url.pathname==='/v4/manga/43001/pictures')return Response.json({data:[{jpg:{image_url:'https://cdn.myanimelist.net/images/manga/1/zero.jpg',large_image_url:'https://cdn.myanimelist.net/images/manga/1/zero-large.jpg'}}]});
    throw new Error(`unexpected provider URL ${url}`);
  };
  try{
    const response=await mangaDetail({request:request('https://x.test/api/manga-detail?title=Rupa%20zero%20cover%20fixture')});
    const body=await response.json();
    assert.equal(response.status,200);assert.equal(body.source,'Jikan / MyAnimeList');assert.equal(body.galleryLabel,'Related cover artwork');
    assert.equal(body.volumes.length,1);assert.equal(body.volumes[0].title,'Rupa zero cover fixture · Image 1');
    assert.ok(requested.some(url=>url.pathname==='/cover'));assert.ok(requested.every(url=>!url.pathname.includes('chapter')&&!url.pathname.includes('at-home')));
  }finally{globalThis.fetch=original;}
});
test('All and coming-soon categories cannot call external providers',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('No non-Apple provider should be called');};
  try{
    const all=await search({request:request('https://x.test/api/search?q=placeholder%20all&category=all'),env:{}});
    assert.equal(all.status,409);
    assert.match((await all.json()).error,/Pilih satu kategori/);
    for(const category of ['comics','boardgames','magazines','physical']){
      const response=await search({request:request(`https://x.test/api/search?q=placeholder%20${category}&category=${category}`),env:{}});
      assert.equal(response.status,400,category);
      const body=await response.json();
      assert.equal(typeof body.error,'string',category);
    }
    assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});

test('Apple TV season URLs and numeric IDs resolve through exact iTunes Lookup',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    return Response.json({results:[{wrapperType:'collection',collectionId:257255214,collectionName:'Star Trek: Deep Space Nine, Season 1',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Video/f8/14/cc/mzl.pyjjqqot.jpg/100x100bb.jpg',collectionViewUrl:'https://itunes.apple.com/us/tv-season/star-trek-deep-space-nine-season-1/id257255214'}]});
  };
  try{
    const link='https://itunes.apple.com/us/tv-season/star-trek-deep-space-nine-season-1/id257255214';
    const response=await search({request:request('https://x.test/api/search?q='+encodeURIComponent(link)+'&category=tv&country=us'),env:{}}),body=await response.json();
    assert.equal(response.status,200);
    assert.equal(requested[0].pathname,'/lookup');
    assert.equal(requested[0].searchParams.get('id'),'257255214');
    assert.equal(requested[0].searchParams.get('entity'),'tvSeason');
    assert.equal(requested[0].searchParams.get('country'),'us');
    assert.equal(body.results[0].id,'tv:apple:257255214');
    assert.equal(body.results[0].title,'Star Trek: Deep Space Nine, Season 1');
    const byId=await search({request:request('https://x.test/api/search?q=257255214&category=tv&country=us'),env:{}});
    assert.equal((await byId.json()).results[0].title,body.results[0].title);
  }finally{globalThis.fetch=original;}
});


test('image proxy allows image hosts used by enabled tools and collections',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]),{status:200,headers:{'content-type':'image/jpeg','content-length':'3'}});
  try{
    for(const host of ['is1-ssl.mzstatic.com','a5.mzstatic.com','s4.anilist.co','i.ytimg.com','openaccess-cdn.clevelandart.org','uploads.mangadex.org','images.metahub.space','static.tvmaze.com','www.ghibli.jp','ghibli.jp','thumbnails.libretro.com','raw.githubusercontent.com','file.adquan.com','comicbook.com','assets.recordchina.co.jp','p2.cri.cn','www.ifensi.com','p3.itc.cn','p9.itc.cn','mir-s3-cdn-cf.behance.net','obj.shine.cn','images.shobserver.com','en.shinkaiworks.com','shinkaiworks.com','tenkinoko.com','www.tenkinoko.com','kiminona.com','www.kiminona.com','kotonohanoniwa.jp','www.kotonohanoniwa.jp','cwfilms.jp','www.cwfilms.jp']){
      const url='https://'+host+'/cover.jpg';
      const result=await image({request:request('https://x.test/api/image?url='+encodeURIComponent(url))});
      assert.equal(result.status,200,host);
    }
  }finally{globalThis.fetch=original;}
});

test('Cinemeta search returns poster metadata for the requested film category only',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async input=>{
    requested=new URL(typeof input==='string'?input:input.url||input);
    return Response.json({metas:[{id:'tt16428256',type:'movie',name:'Suzume',releaseInfo:'2022',poster:'https://images.metahub.space/poster/medium/tt16428256/img',background:'https://images.metahub.space/background/medium/tt16428256/img',genres:['Animation','Fantasy'],streams:[{url:'https://example.invalid/video'}]}]});
  };
  try{
    const response=await search({request:request('https://x.test/api/search?q=workflow%20cinemeta%20Suzume&category=movies&source=cinemeta'),env:{}}),body=await response.json(),item=body.results[0];
    assert.equal(response.status,200);
    assert.equal(requested.hostname,'v3-cinemeta.strem.io');
    assert.match(requested.pathname,/\/catalog\/movie\//);
    assert.equal(item.id,'movies:cinemeta:tt16428256');
    assert.equal(item.title,'Suzume');
    assert.equal(item.category,'movies');
    assert.equal(item.imageUrl,'https://images.metahub.space/poster/medium/tt16428256/img');
    assert.equal(item.provider,'Cinemeta');
    assert.equal('streams' in item,false);
    assert.equal('background' in item,false);
  }finally{globalThis.fetch=original;}
});

test('TVmaze search resolves the selected show to its series poster',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async input=>{
    requested=new URL(typeof input==='string'?input:input.url||input);
    return Response.json([{score:1,show:{id:169,name:'Breaking Bad',premiered:'2008-01-20',genres:['Drama','Crime'],url:'https://www.tvmaze.com/shows/169/breaking-bad',image:{medium:'https://static.tvmaze.com/uploads/images/medium_portrait/0/2400.jpg',original:'https://static.tvmaze.com/uploads/images/original_untouched/0/2400.jpg'}}}]);
  };
  try{
    const response=await search({request:request('https://x.test/api/search?q=workflow%20tvmaze%20breaking%20bad&category=tv&source=tvmaze'),env:{}}),body=await response.json(),item=body.results[0];
    assert.equal(response.status,200);
    assert.equal(requested.hostname,'api.tvmaze.com');
    assert.equal(requested.searchParams.get('q'),'workflow tvmaze breaking bad');
    assert.equal(item.id,'tv:tvmaze:show:169');
    assert.equal(item.title,'Breaking Bad');
    assert.equal(item.year,'2008');
    assert.equal(item.provider,'TVmaze');
  }finally{globalThis.fetch=original;}
});

test('mixed manga search merges MangaDex, Jikan, and AniList works under canonical ids',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    if(url.hostname==='api.mangadex.org')return Response.json({data:[{id:'manga-id-1',attributes:{title:{en:'Rupa Manga Fixture'},year:2020},relationships:[{id:'cover-id-1',type:'cover_art',attributes:{fileName:'cover.jpg'}}]}]});
    if(url.hostname==='api.jikan.moe')return Response.json({data:[{mal_id:420,title:'Rupa Manga Fixture',title_english:'Rupa Manga Fixture',published:{from:'2020-01-01'},images:{jpg:{image_url:'https://cdn.test/preview.jpg',large_image_url:'https://cdn.test/large.jpg'}}}]});
    if(url.hostname==='graphql.anilist.co')return Response.json({data:{Page:{media:[{id:42,title:{userPreferred:'Rupa Manga Fixture'},coverImage:{large:'https://s4.anilist.co/medium.jpg',extraLarge:'https://s4.anilist.co/large.jpg'},startDate:{year:2020},siteUrl:'https://anilist.co/manga/42/Rupa-Fixture/'}]}}});
    throw new Error('Unexpected source '+url.hostname);
  };
  try{
    const response=await search({request:request('https://x.test/api/search?q=Rupa%20Manga%20Fixture&category=manga&source=all'),env:{}}),body=await response.json();
    assert.equal(response.status,200);
    assert.deepEqual(new Set(requested.map(url=>url.hostname)),new Set(['api.mangadex.org','api.jikan.moe','graphql.anilist.co']));
    assert.deepEqual(new Set(body.results.map(item=>item.provider)),new Set(['MangaDex','Jikan / MyAnimeList','AniList']));
    assert.ok(body.results.some(item=>item.id==='manga:anilist:42'&&item.sourceUrl==='https://anilist.co/manga/42/Rupa-Fixture/'));
    assert.ok(body.results.some(item=>item.id==='manga:jikan:420'));
    assert.ok(body.results.some(item=>item.id==='manga:mangadex:manga-id-1'&&item.imageUrl.endsWith('/cover.jpg.512.jpg')));
    assert.deepEqual(body.warnings,[]);
  }finally{globalThis.fetch=original;}
});


test('Apple movie URLs and numeric IDs resolve through exact iTunes lookup',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    return Response.json({results:[{wrapperType:'track',kind:'feature-movie',trackId:314918278,collectionId:1653016379,trackName:"Harry Potter and the Philosopher's Stone",collectionName:'Wizarding World 11-Film Collection',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Video221/v4/poster.png/100x100bb.jpg',trackViewUrl:'https://itunes.apple.com/gb/movie/harry-potter/id314918278'}]});
  };
  try{
    const link='https://itunes.apple.com/gb/movie/harry-potter/id314918278';
    const response=await search({request:request('https://x.test/api/search?q='+encodeURIComponent(link)+'&category=movies&country=gb'),env:{}});
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(requested[0].pathname,'/lookup');
    assert.equal(requested[0].searchParams.get('id'),'314918278');
    assert.equal(requested[0].searchParams.get('entity'),'movie');
    assert.equal(requested[0].searchParams.get('country'),'gb');
    assert.equal(body.results[0].id,'movies:apple:314918278');
    assert.equal(body.results[0].title,"Harry Potter and the Philosopher's Stone");
    const byId=await search({request:request('https://x.test/api/search?q=314918278&category=movies&country=gb'),env:{}});
    assert.equal((await byId.json()).results[0].title,body.results[0].title);
  }finally{globalThis.fetch=original;}
});

test('Apple Books accepts ISBN-13 and converts ISBN-10 to exact lookup keys',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    requested.push(new URL(typeof input==='string'?input:input.url||input));
    return Response.json({results:[{trackId:597944491,trackName:'Dune',artistName:'Frank Herbert',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Publication122/v4/book.jpg/100x100bb.jpg',trackViewUrl:'https://books.apple.com/us/book/dune/id597944491'}]});
  };
  try{
    for(const isbn of ['978-0-441-17271-9','0-441-17271-7']){
      const response=await search({request:request(`https://x.test/api/search?q=${encodeURIComponent(isbn)}&category=books&source=apple&country=us`),env:{}}),body=await response.json();
      assert.equal(response.status,200);
      assert.equal(body.results[0].title,'Dune');
    }
    assert.equal(requested.length,2);
    assert.ok(requested.every(url=>url.pathname==='/lookup'));
    assert.ok(requested.every(url=>url.searchParams.get('isbn')==='9780441172719'));
  }finally{globalThis.fetch=original;}
});

test('Podcast episode search and URLs return episode-specific artwork',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    return Response.json({results:[
      {wrapperType:'track',kind:'podcast',trackId:917918570,collectionId:917918570,trackName:'Serial',collectionName:'Serial',artworkUrl600:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/show.jpg/600x600bb.jpg'},
      {wrapperType:'podcastEpisode',kind:'podcast-episode',trackId:1000319686008,collectionId:917918570,trackName:'The Alibi',collectionName:'Serial',artworkUrl600:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/episode.jpg/600x600bb.jpg',trackViewUrl:'https://podcasts.apple.com/us/podcast/serial/id917918570?i=1000319686008'}
    ]});
  };
  try{
    const link='https://podcasts.apple.com/us/podcast/serial/id917918570?i=1000319686008';
    const response=await search({request:request('https://x.test/api/search?q='+encodeURIComponent(link)+'&category=podcastepisodes&country=us'),env:{}}),body=await response.json();
    assert.equal(response.status,200);
    assert.equal(requested[0].searchParams.get('entity'),'podcastEpisode');
    assert.equal(requested[0].searchParams.get('limit'),'200');
    assert.equal(body.results.length,1);
    assert.equal(body.results[0].title,'The Alibi');
    assert.equal(body.results[0].subtitle,'Serial');
    assert.match(body.results[0].previewUrl,/episode\.jpg/);
  }finally{globalThis.fetch=original;}
});

test('App Store screenshot search maps device screenshots to Apple rendition URLs',async()=>{
  const original=globalThis.fetch,requested=[];
  const screenshot='https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/c2/bc/eb/screen.PNG/406x228bb.png';
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    const entity=url.searchParams.get('entity'),mac=entity==='desktopSoftware',ipad=entity==='iPadSoftware';
    return Response.json({results:[{trackId:mac?634148309:ipad?425073498:408709785,kind:mac?'mac-software':'software',trackName:mac?'Logic Pro':ipad?'Procreate':'GarageBand',artistName:'Apple',trackViewUrl:`https://apps.apple.com/us/app/example/id${mac?634148309:ipad?425073498:408709785}`,screenshotUrls:ipad?[]:[screenshot],ipadScreenshotUrls:ipad?[screenshot]:!mac?[screenshot]:[],appletvScreenshotUrls:[]}]});
  };
  try{
    const response=await search({request:request('https://x.test/api/search?q=Procreate&category=appscreenshots&country=us'),env:{}}),body=await response.json();
    assert.equal(response.status,200);
    assert.deepEqual(requested.map(url=>url.searchParams.get('entity')),['software','iPadSoftware','desktopSoftware']);
    assert.ok(body.results.some(item=>item.title==='Procreate · iPad 1'));
    assert.ok(body.results.some(item=>item.title==='Logic Pro · Mac 1'));
    assert.ok(body.results[0].sdDownloadUrl.endsWith('/600x600bb.png'));
    assert.ok(body.results[0].imageUrl.endsWith('/1200x1200bb.png'));
  }finally{globalThis.fetch=original;}
});

test('Music search checks song artwork only when album search has no match',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    if(url.searchParams.get('entity')==='album')return Response.json({results:[]});
    return Response.json({results:[{wrapperType:'track',kind:'song',collectionId:1234,trackId:5678,collectionName:'Meteora',trackName:'Numb',artistName:'LINKIN PARK',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/song.jpg/100x100bb.jpg',collectionViewUrl:'https://music.apple.com/us/album/meteora/1234'}]});
  };
  try{
    const response=await search({request:request('https://x.test/api/search?q=Numb%20song%20fallback%20unique&category=music&source=apple'),env:{}}),body=await response.json();
    assert.equal(response.status,200);
    assert.equal(requested.length,2);
    assert.equal(requested[0].searchParams.get('entity'),'album');
    assert.equal(requested[1].searchParams.get('entity'),'song');
    assert.equal(body.results[0].title,'Meteora');
  }finally{globalThis.fetch=original;}
});

test('music Worker results use Apple Music covers only',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async(input)=>{
    const url=typeof input==='string'?new URL(input):new URL(input.url||input);requested.push(url.hostname);
    if(url.hostname==='itunes.apple.com')return Response.json({results:[{collectionId:909,collectionName:'Blue',artistName:'Joni Mitchell',artistViewUrl:'https://music.apple.com/id/artist/joni-mitchell/9090',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/ef/cover.jpg/100x100bb.jpg',collectionViewUrl:'https://music.apple.com/id/album/blue/909'}]});
    throw new Error('Unexpected non-Apple music source '+url.hostname);
  };
  try{
    const response=await search({request:request('https://x.test/api/search?q=Apple%20catalog%20Blue%20unique&category=music&source=apple'),env:{MUSICBRAINZ_CONTACT:'mailto:unused@example.test'}});
    const body=await response.json(),item=body.results[0];
    assert.equal(response.status,200);
    assert.equal(body.results.length,1);
    assert.equal(item.provider,'Apple Music');
    assert.equal(item.previewUrl,'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/ef/cover.jpg/600x600bb.jpg');
    assert.equal(item.imageUrl,'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/ef/cover.jpg/1200x1200bb.jpg');
    assert.equal(item.sdDownloadUrl,item.previewUrl);
    assert.equal(item.downloadUrl,'https://a5.mzstatic.com/us/r1000/0/Music/v4/ab/cd/ef/cover.jpg');
    assert.deepEqual(requested,['itunes.apple.com']);
  }finally{globalThis.fetch=original;}
});

test('music Worker resolves Apple Music album URLs through Apple lookup',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async(input)=>{
    requested=new URL(typeof input==='string'?input:input.url||input);
    return Response.json({results:[{wrapperType:'collection',collectionType:'Album',collectionId:518869932,collectionName:'LIVING THINGS',artistName:'LINKIN PARK',artistViewUrl:'https://music.apple.com/id/artist/linkin-park/148662',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Features115/v4/aa/bb/cc/cover.jpg/100x100bb.jpg',collectionViewUrl:'https://music.apple.com/id/album/living-things/518869932'}]});
  };
  try{
    const response=await search({request:request('https://x.test/api/search?q='+encodeURIComponent('https://music.apple.com/id/album/living-things/518869932')+'&category=music'),env:{}});
    const body=await response.json();
    assert.equal(requested.pathname,'/lookup');
    assert.equal(requested.searchParams.get('id'),'518869932');
    assert.equal(body.results[0].title,'LIVING THINGS');
    assert.equal(body.results[0].sourceUrl,'https://music.apple.com/id/album/living-things/518869932');
  }finally{globalThis.fetch=original;}
});

test('music Worker resolves an exact artist-name search to the full Apple discography',async()=>{
  const original=globalThis.fetch,requested=[];
  const artworkUrl100='https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/cover.jpg/100x100bb.jpg';
  globalThis.fetch=async input=>{
    const url=typeof input==='string'?new URL(input):new URL(input.url||input);requested.push(url);
    if(url.pathname==='/search')return Response.json({results:[{collectionId:528435845,collectionName:'Meteora',artistName:'LINKIN PARK',artistId:148662,artistViewUrl:'https://music.apple.com/id/artist/linkin-park/148662',artworkUrl100,collectionViewUrl:'https://music.apple.com/id/album/meteora/528435845'}]});
    const albums=Array.from({length:22},(_,index)=>({collectionId:1766137049+index,collectionName:index===0?'From Zero':`Archive album ${index}`,artistName:'LINKIN PARK',artistId:148662,artistViewUrl:'https://music.apple.com/id/artist/linkin-park/148662',releaseDate:index===0?'2024-11-15':`200${index%10}-01-01`,artworkUrl100,collectionViewUrl:`https://music.apple.com/id/album/archive-${index}/${1766137049+index}`}));
    return Response.json({results:[{wrapperType:'artist',artistId:148662,artistName:'LINKIN PARK'},...albums]});
  };
  try{
    const response=await search({request:request('https://x.test/api/search?q=Linkin%20Park&category=music&source=apple'),env:{}}),body=await response.json();
    assert.equal(response.status,200);
    assert.equal(requested.length,2);
    assert.equal(requested[1].pathname,'/lookup');
    assert.equal(requested[1].searchParams.get('id'),'148662');
    assert.equal(requested[1].searchParams.get('entity'),'album');
    assert.equal(requested[1].searchParams.get('limit'),'200');
    assert.equal(body.results.length,22);
    assert.equal(body.results[0].title,'From Zero');
    const artistUrl='https://music.apple.com/id/artist/linkin-park/148662';
    const urlResponse=await search({request:request('https://x.test/api/search?q='+encodeURIComponent(artistUrl)+'&category=music'),env:{}}),urlBody=await urlResponse.json();
    assert.equal(urlResponse.status,200);
    assert.equal(requested.length,3);
    assert.equal(requested[2].pathname,'/lookup');
    assert.equal(requested[2].searchParams.get('limit'),'200');
    assert.equal(urlBody.results.length,22);
  }finally{globalThis.fetch=original;}
});

test('Apple artist image route accepts Apple artist pages and returns only Apple CDN images',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async(input)=>{
    requested=new URL(typeof input==='string'?input:input.url||input);
    return new Response('<html><head><meta property="og:image" content="https://is1-ssl.mzstatic.com/image/thumb/AMCArtistImages/artist.png/1200x630cw.png"></head></html>',{status:200,headers:{'content-type':'text/html'}});
  };
  const artist='https://music.apple.com/id/artist/linkin-park/148662';
  try{
    const response=await worker.fetch(request('https://x.test/api/artist-image?url='+encodeURIComponent(artist),{headers:{Origin:'http://localhost:5173'}}),{});
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(requested.href,artist);
    assert.equal(response.headers.get('access-control-allow-origin'),'http://localhost:5173');
    assert.equal(body.imageUrl,'https://is1-ssl.mzstatic.com/image/thumb/AMCArtistImages/artist.png/1200x630cw.png');
    const invalid=await worker.fetch(request('https://x.test/api/artist-image?url='+encodeURIComponent('https://evil.example/artist/linkin-park/148662'),{headers:{Origin:'http://localhost:5173'}}),{});
    assert.equal(invalid.status,400);
  }finally{globalThis.fetch=original;}
});


test('YouTube needs a video link or ID and never calls a keyed API',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('YouTube placeholder made an external request');};
  try{
    const response=await search({request:request('https://x.test/api/search?q=video%20source%20missing&category=videos&source=youtube'),env:{}});
    const body=await response.json();
    assert.equal(response.status,200);
    assert.match(body.warnings.join(' '),/Paste a YouTube video URL/);
    assert.doesNotMatch(body.warnings.join(' '),/API_KEY/);
    assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});




test('keyed game sources are not selectable: an unknown source is rejected without a network call',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Game placeholder made an external request');};
  try{
    const response=await search({request:request('https://x.test/api/search?q=Sample%20game&category=games&source=igdb'),env:{}});
    const body=await response.json();
    assert.equal(response.status,400);
    assert.equal(typeof body.error,'string');
    assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});
test('Apple Music uses one public Apple Search result and ignores optional duplicate catalogs',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async(input)=>{
    const url=typeof input==='string'?new URL(input):new URL(input.url||input);requested.push(url);
    if(url.hostname==='itunes.apple.com')return Response.json({results:[{collectionId:708,collectionName:'HD album',artistName:'Artist',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/album.jpg/100x100bb.jpg',collectionViewUrl:'https://music.apple.com/id/album/hd-album/708'}]});
    throw new Error('Unexpected non-Apple Music catalog '+url);
  };
  try{
    const response=await search({request:request('https://x.test/api/search?q=apple%20music%20large%20artwork&category=music&source=apple'),env:{APPLE_MUSIC_DEVELOPER_TOKEN:'test-token'}});
    const body=await response.json(),album=body.results[0];
    assert.equal(requested.length,1);
    assert.equal(requested[0].searchParams.get('country'),'id');
    assert.equal(album.title,'HD album');
    assert.equal(album.imageUrl,'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/album.jpg/1200x1200bb.jpg');
    assert.ok(album.hdDownloadUrls.includes('https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/album.jpg/10000x10000bb.jpg'));
  }finally{globalThis.fetch=original;}
});

test('Apple Books Worker search uses only the selected Apple storefront',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async(input)=>{
    requested=new URL(typeof input==='string'?input:input.url||input);
    return Response.json({results:[{trackId:501,trackName:'Dune',artistName:'Frank Herbert',releaseDate:'1965-01-01',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Publication/v4/book.jpg/100x100bb.jpg',trackViewUrl:'https://books.apple.com/us/book/dune/id501'}]});
  };
  try{
    const response=await search({request:request('https://x.test/api/search?q=Dune&category=books&source=apple&country=us'),env:{GOOGLE_BOOKS_API_KEY:'ignored-test-key'}});
    const body=await response.json(),book=body.results[0];
    assert.equal(response.status,200);
    assert.equal(requested.searchParams.get('media'),'ebook');
    assert.equal(requested.searchParams.get('entity'),'ebook');
    assert.equal(requested.searchParams.get('country'),'us');
    assert.equal(book.source,'Apple Books');
    assert.equal(book.title,'Dune');
    assert.ok(book.hdDownloadUrls.some(url=>url.endsWith('/10000x10000bb.jpg')));
  }finally{globalThis.fetch=original;}
});

test('music videos, audiobooks, podcasts, and apps use Apple endpoints',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    return Response.json({results:[{trackId:901,trackName:'Apple item',artistName:'Creator',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Source/v4/aa/bb/cc/item.jpg/100x100bb.jpg',previewUrl:'https://video-ssl.itunes.apple.com/preview.m4v',trackViewUrl:'https://music.apple.com/us/music-video/item/901'}]});
  };
  const cases=[['musicvideos','musicVideo','musicVideo'],['audiobooks','audiobook','audiobook'],['podcasts','podcast','podcast'],['apps','software','software']];
  try{
    for(const [category,media,entity] of cases){
      const requestStart=requested.length;
      const response=await search({request:request(`https://x.test/api/search?q=Apple%20item%20${category}&category=${category}&country=us`),env:{}});
      const body=await response.json();
      assert.equal(response.status,200,category);
      assert.equal(body.results[0].category,category);
      assert.equal(body.results[0].source,category==='podcasts'?'Apple Podcasts':category==='apps'?'App Store':category==='musicvideos'?'Apple Music':'Apple Books');
      if(category==='musicvideos')assert.equal(body.results[0].mediaPreviewUrl,'https://video-ssl.itunes.apple.com/preview.m4v');
      const app=category==='apps',calls=requested.slice(requestStart);
      assert.ok(calls.length=== (app?3:1),category);
      assert.ok(calls.every(url=>url.searchParams.get('media')===media),category);
      assert.ok(calls.some(url=>url.searchParams.get('entity')===entity),category);
      if(app)assert.deepEqual(calls.map(url=>url.searchParams.get('entity')),['software','iPadSoftware','desktopSoftware']);
      assert.ok(calls.every(url=>url.searchParams.get('country')==='us'),category);
    }
  }finally{globalThis.fetch=original;}
});

test('All is not a search scope; users choose one collection first',async()=>{
  const response=await search({request:request('https://x.test/api/search?q=progressive%20stream%20test&category=all&stream=1'),env:{YOUTUBE_API_KEY:'ignored'}});
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/Pilih satu kategori/);
});


test('Worker search retries a temporary provider failure instead of caching it',async()=>{
  const original=globalThis.fetch;let attempts=0;
  globalThis.fetch=async(input)=>{
    const url=typeof input==='string'?new URL(input):new URL(input.url||input);
    if(url.hostname==='itunes.apple.com'){
      attempts++;
      if(attempts===1)throw new Error('temporary catalog outage');
      return Response.json({results:[{collectionId:7002,collectionName:'Worker Retry Album',artistName:'Worker Retry Artist',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg'}]});
    }
    throw new Error('Unexpected API '+url);
  };
  try{
    const url='https://x.test/api/search?q=retry%20worker%20cache%20unique&category=music';
    const first=await search({request:request(url),env:{}});
    assert.ok((await first.json()).warnings.length);
    const second=await search({request:request(url),env:{}}),body=await second.json();
    assert.equal(attempts,2);
    assert.equal(body.results[0].title,'Worker Retry Album');
  }finally{globalThis.fetch=original;}
});

