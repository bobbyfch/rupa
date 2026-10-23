import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appleArtworkSizedUrl, appleOriginalArtworkUrl, downloadLink, fetchAppleTrendArtwork, fetchAppleTrendArtworkWithAvailability, getAppleMotionArtwork, getMangaSeriesDetail, searchArtwork } from '../src/lib/providers.ts';
import { fetchPublicChart } from '../src/lib/publicCharts.ts';

test('physical media merges mirrored and indexed artwork for the same Wikidata entity',async()=>{
  const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
  globalThis.window={location:{origin:'https://rupa.test'}};
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input,'https://rupa.test');
    const relative=url.pathname.replace(/^\/offline\//,'');
    try{return new Response(readFileSync(new URL('../public/offline/'+relative,import.meta.url)),{status:200,headers:{'content-type':'application/json'}});}
    catch{return new Response('not found',{status:404});}
  };
  try{
    const result=await searchArtwork('The Third Man','physicalmedia',undefined,undefined,'id','all');
    const matches=result.results.filter(item=>item.title==='The Third Man');
    assert.equal(matches.length,1);
    assert.equal(matches[0].kind,'poster');
  }finally{
    globalThis.fetch=originalFetch;
    if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;
  }
});

test('AniList trend charts omit an unset status filter and return current anime works',async()=>{
  const original=globalThis.fetch;let requestBody;
  globalThis.fetch=async(_url,init)=>{
    requestBody=JSON.parse(String(init?.body||'{}'));
    return Response.json({data:{Page:{media:[{id:21,title:{userPreferred:'ONE PIECE'},coverImage:{extraLarge:'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21.jpg'},startDate:{year:1999,month:10,day:20},siteUrl:'https://anilist.co/anime/21/One-Piece/'}]}}});
  };
  try{
    const items=await fetchPublicChart('anime','anilist','trending',new AbortController().signal);
    assert.equal(requestBody.variables.type,'ANIME');
    assert.equal('status' in requestBody.variables,false);
    assert.doesNotMatch(requestBody.query,/status:/);
    assert.equal(items[0].title,'ONE PIECE');
    assert.equal(items[0].id,'anime:anilist:21');
    assert.equal(items[0].category,'anime');
    assert.equal(items[0].provider,'AniList');
  }finally{globalThis.fetch=original;}
});

test('AniList search and chart resolve the same work id and source URL without the Worker',async()=>{
  const original=globalThis.fetch;
  const entry={id:21,title:{userPreferred:'ONE PIECE'},coverImage:{large:'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx21.jpg',extraLarge:'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21.jpg'},startDate:{year:1999},siteUrl:'https://anilist.co/anime/21/One-Piece/'};
  globalThis.fetch=async()=>Response.json({data:{Page:{media:[entry]}}});
  try{
    const chart=await fetchPublicChart('anime','anilist','trending',new AbortController().signal);
    const search=await searchArtwork('One Piece AniList parity unique','anime',undefined,undefined,'us','anilist');
    assert.equal(search.results[0].id,chart[0].id);
    assert.equal(search.results[0].sourceUrl,chart[0].sourceUrl);
    assert.equal(search.results[0].title,chart[0].title);
    assert.equal(search.results[0].year,chart[0].year);
    assert.equal(search.results[0].previewUrl,chart[0].previewUrl);
    assert.equal(search.results[0].provider,chart[0].provider);
  }finally{globalThis.fetch=original;}
});

test('MangaDex category search can fall back directly and maps its cover relationship',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async input=>{
    requested=new URL(typeof input==='string'?input:input.url||input);
    return Response.json({data:[{id:'1234-abcd',attributes:{title:{en:'One Piece'},year:1997},relationships:[{id:'cover-1',type:'cover_art',attributes:{fileName:'cover.jpg'}}]}]});
  };
  try{
    const result=await searchArtwork('One Piece MangaDex direct unique','manga',undefined,undefined,'id','mangadex');
    assert.equal(requested.hostname,'api.mangadex.org');
    assert.equal(requested.searchParams.get('contentRating[]'),'safe');
    assert.equal(result.results[0].id,'manga:mangadex:1234-abcd');
    assert.equal(result.results[0].title,'One Piece');
    assert.equal(result.results[0].year,'1997');
    assert.equal(result.results[0].imageUrl,'https://uploads.mangadex.org/covers/1234-abcd/cover.jpg.512.jpg');
    assert.equal(result.results[0].previewUrl,'https://uploads.mangadex.org/covers/1234-abcd/cover.jpg.256.jpg');
  }finally{globalThis.fetch=original;}
});

test('Manga detail passes a Jikan series ID to the Worker for an exact fallback lookup',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async input=>{
    requested=new URL(typeof input==='string'?input:input.url||input,'https://rupa.test');
    return Response.json({id:'jikan:13',title:'One Piece',description:'',status:'Publishing',lastVolume:'',authors:[],source:'Jikan / MyAnimeList',sourceUrl:'https://myanimelist.net/manga/13',volumes:[],galleryLabel:'Related cover artwork'});
  };
  try{
    const detail=await getMangaSeriesDetail('One Piece','manga:anilist:30013',new AbortController().signal,'Jikan / MyAnimeList','13');
    assert.equal(requested.pathname,'/api/manga-detail');
    assert.equal(requested.searchParams.get('title'),'One Piece');
    assert.equal(requested.searchParams.get('malId'),'13');
    assert.equal(detail.source,'Jikan / MyAnimeList');
  }finally{globalThis.fetch=original;}
});

test('mixed public manga search publishes the first provider results while slower services continue',async()=>{
  const original=globalThis.fetch,partial=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input,'http://localhost');
    if(url.hostname==='api.mangadex.org')throw new Error('MangaDex unavailable');
    if(url.hostname==='api.jikan.moe'){
      await new Promise(resolve=>setTimeout(resolve,120));
      return Response.json({data:[{mal_id:421,title:'Later Manga',images:{jpg:{image_url:'https://cdn.test/later.jpg'}}}]});
    }
    if(url.hostname==='graphql.anilist.co')return Response.json({data:{Page:{media:[{id:43,title:{userPreferred:'Fast Manga'},coverImage:{large:'https://s4.anilist.co/fast.jpg'},siteUrl:'https://anilist.co/manga/43/Fast-Manga/'}]}}});
    return new Response('{}',{status:404});
  };
  try{
    const result=await searchArtwork('mixed partial manga search unique','manga',undefined,value=>partial.push(value), 'id','all');
    assert.ok(partial.some(value=>value.results.some(item=>item.id==='manga:anilist:43')));
    assert.ok(result.results.some(item=>item.id==='manga:jikan:421'));
    assert.ok(result.warnings.some(warning=>warning.includes('MangaDex')));
  }finally{globalThis.fetch=original;}
});

test('AniList upcoming charts apply the unreleased status filter explicitly',async()=>{
  const original=globalThis.fetch;let requestBody;
  globalThis.fetch=async(_url,init)=>{
    requestBody=JSON.parse(String(init?.body||'{}'));
    return Response.json({data:{Page:{media:[]}}});
  };
  try{
    await fetchPublicChart('manga','anilist','upcoming',new AbortController().signal);
    assert.equal(requestBody.variables.type,'MANGA');
    assert.equal(requestBody.variables.status,'NOT_YET_RELEASED');
    assert.match(requestBody.query,/status:\s*\$status/);
  }finally{globalThis.fetch=original;}
});

test('Apple Music album search builds measured SD, HD, and max candidates from Apple CDN URLs',async()=>{
  const original=globalThis.fetch;let requested,calls=0;
  globalThis.fetch=async input=>{
    if(!String(input).startsWith('https://itunes.apple.com'))return new Response('not found',{status:404}); // offline index files are not Apple calls
    calls++;requested=new URL(input);
    return Response.json({results:[{collectionId:909,collectionName:'Blue',artistName:'Joni Mitchell',artistViewUrl:'https://music.apple.com/id/artist/joni-mitchell/9090',releaseDate:'1971-06-22',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/ef/cover-123.jpg/100x100bb.jpg',collectionViewUrl:'https://music.apple.com/id/album/blue/909'}]});
  };
  try{
    const response=await searchArtwork('Apple catalog Blue check','music'),item=response.results[0];
    assert.equal(requested.hostname,'itunes.apple.com');
    assert.equal(requested.searchParams.get('country'),'id');
    assert.equal(requested.searchParams.get('media'),'music');
    assert.equal(requested.searchParams.get('entity'),'album');
    assert.equal(item.rights,'source-only');
    assert.equal(item.sourceUrl,'https://music.apple.com/id/album/blue/909');
    assert.equal(item.artistUrl,'https://music.apple.com/id/artist/joni-mitchell/9090');
    assert.equal(item.previewUrl,'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/ef/cover-123.jpg/600x600bb.jpg');
    assert.equal(item.imageUrl,'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/ef/cover-123.jpg/1200x1200bb.jpg');
    assert.equal(item.sdDownloadUrl,item.previewUrl);
    assert.equal(item.downloadUrl,'https://a5.mzstatic.com/us/r1000/0/Music/v4/ab/cd/ef/cover-123.jpg');
    assert.ok(item.hdDownloadUrls.includes('https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/ef/cover-123.jpg/10000x10000bb.jpg'));
    assert.equal(downloadLink(item),item.downloadUrl);
    assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});

test('Apple catalog search removes duplicate tracks before rendering result keys',async()=>{
  const original=globalThis.fetch;
  const artworkUrl100='https://is1-ssl.mzstatic.com/image/thumb/Video/v4/one.png/100x100bb.jpg';
  globalThis.fetch=async()=>Response.json({results:[
    {trackId:12345,trackName:'Blinding Lights',artistName:'The Weeknd',artworkUrl100,trackViewUrl:'https://music.apple.com/us/music-video/blinding-lights/12345'},
    {trackId:12345,trackName:'Blinding Lights',artistName:'The Weeknd',artworkUrl100,trackViewUrl:'https://music.apple.com/us/music-video/blinding-lights/12345'}
  ]});
  try{
    const response=await searchArtwork('Apple duplicate music video unique','musicvideos',undefined,undefined,'us');
    assert.equal(response.results.length,1);
    assert.equal(response.results[0].title,'Blinding Lights');
  }finally{globalThis.fetch=original;}
});

test('Apple Music artist URLs resolve to albums through Apple lookup',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async input=>{
    requested=new URL(typeof input==='string'?input:input.url||input);
    return Response.json({results:[
      {wrapperType:'artist',artistId:148662,artistName:'LINKIN PARK'},
      {wrapperType:'collection',collectionType:'Album',collectionId:518869932,collectionName:'LIVING THINGS',artistName:'LINKIN PARK',artistViewUrl:'https://music.apple.com/id/artist/linkin-park/148662',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Features115/v4/aa/bb/cc/cover.jpg/100x100bb.jpg',collectionViewUrl:'https://music.apple.com/id/album/living-things/518869932'}
    ]});
  };
  try{
    const response=await searchArtwork('https://music.apple.com/id/artist/linkin-park/148662','music');
    assert.equal(requested.pathname,'/lookup');
    assert.equal(requested.searchParams.get('id'),'148662');
    assert.equal(requested.searchParams.get('entity'),'album');
    assert.equal(requested.searchParams.get('limit'),'200');
    assert.deepEqual(response.results.map(item=>item.title),['LIVING THINGS']);
  }finally{globalThis.fetch=original;}
});

test('Apple Music artist-name searches load and sort the full artist discography',async()=>{
  const original=globalThis.fetch,requested=[];
  const artworkUrl100='https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/cover.jpg/100x100bb.jpg';
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    if(url.pathname==='/search')return Response.json({results:[{collectionId:528435845,collectionName:'Meteora',artistName:'LINKIN PARK',artistId:148662,artistViewUrl:'https://music.apple.com/id/artist/linkin-park/148662?uo=4',artworkUrl100,collectionViewUrl:'https://music.apple.com/id/album/meteora/528435845'}]});
    const albums=Array.from({length:22},(_,index)=>({collectionId:1766137049+index,collectionName:index===0?'From Zero':`Archive album ${index}`,artistName:'LINKIN PARK',artistId:148662,artistViewUrl:'https://music.apple.com/id/artist/linkin-park/148662',releaseDate:index===0?'2024-11-15':`200${index%10}-01-01`,artworkUrl100,collectionViewUrl:`https://music.apple.com/id/album/archive-${index}/${1766137049+index}`}));
    return Response.json({results:[{wrapperType:'artist',artistId:148662,artistName:'LINKIN PARK'},...albums]});
  };
  try{
    const response=await searchArtwork('Linkin Park','music');
    assert.equal(requested.length,2);
    assert.equal(requested[0].pathname,'/search');
    assert.equal(requested[1].pathname,'/lookup');
    assert.equal(requested[1].searchParams.get('id'),'148662');
    assert.equal(requested[1].searchParams.get('entity'),'album');
    assert.equal(requested[1].searchParams.get('limit'),'200');
    assert.equal(response.results.length,22);
    assert.equal(response.results[0].title,'From Zero');
  }finally{globalThis.fetch=original;}
});

test('each open Apple category uses the matching Search API media and entity',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    return Response.json({results:[{trackId:810,trackName:'Apple result',artistName:'Creator',releaseDate:'2024-01-02',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Category/v4/ab/cd/ef/image.jpg/100x100bb.jpg',previewUrl:'https://video-ssl.itunes.apple.com/preview.m4v',trackViewUrl:'https://music.apple.com/us/music-video/example/810'}]});
  };
  const cases=[
    {category:'musicvideos',query:'Music video Apple source unique',media:'musicVideo',entity:'musicVideo',source:'Apple Music'},
    {category:'books',query:'Apple Books source unique',media:'ebook',entity:'ebook',source:'Apple Books'},
    {category:'audiobooks',query:'Apple audiobook source unique',media:'audiobook',entity:'audiobook',source:'Apple Books'},
    {category:'podcasts',query:'Apple podcast source unique',media:'podcast',entity:'podcast',source:'Apple Podcasts'},
    {category:'tv',query:'Apple TV season source unique',media:'tvShow',entity:'tvSeason',source:'Apple TV'},
    {category:'apps',query:'App Store source unique',media:'software',entity:'software',source:'App Store'}
  ];
  try{
    for(const item of cases){
      const requestStart=requested.length;
      const response=await searchArtwork(item.query,item.category,undefined,undefined,'us');
      const record=response.results[0],calls=requested.slice(requestStart),isApp=item.category==='apps';
      assert.equal(calls.length,isApp?3:1);
      assert.ok(calls.every(url=>url.searchParams.get('country')==='us'));
      assert.ok(calls.every(url=>url.searchParams.get('media')===item.media));
      assert.ok(calls.some(url=>url.searchParams.get('entity')===item.entity));
      if(isApp)assert.deepEqual(calls.map(url=>url.searchParams.get('entity')),['software','iPadSoftware','desktopSoftware']);
      assert.equal(record.category,item.category);
      assert.equal(record.source,item.source);
      assert.equal(record.previewUrl,'https://is1-ssl.mzstatic.com/image/thumb/Category/v4/ab/cd/ef/image.jpg/600x600bb.jpg');
      assert.equal(record.downloadUrl,'https://a5.mzstatic.com/us/r1000/0/Category/v4/ab/cd/ef/image.jpg');
      assert.equal(record.mediaPreviewUrl,item.category==='musicvideos'?'https://video-ssl.itunes.apple.com/preview.m4v':undefined);
      assert.equal(record.rights,'source-only');
    }
  }finally{globalThis.fetch=original;}
});

test('Apple catalog URL search checks the Apple host and resolves product IDs',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    return Response.json({results:[{trackId:597944491,trackName:'Dune',artistName:'Frank Herbert',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Publication/v4/book.jpg/100x100bb.jpg',trackViewUrl:'https://books.apple.com/us/book/dune/id597944491'}]});
  };
  try{
    const response=await searchArtwork('https://books.apple.com/us/book/dune/id597944491','books',undefined,undefined,'us');
    assert.equal(requested[0].pathname,'/lookup');
    assert.equal(requested[0].searchParams.get('id'),'597944491');
    assert.equal(requested[0].searchParams.get('entity'),'ebook');
    assert.equal(response.results[0].title,'Dune');
    const invalid=await searchArtwork('https://evil.example/us/book/dune/id597944491','books');
    assert.deepEqual(invalid.results,[]);
    assert.match(invalid.warnings[0],/valid Apple books URL/);
  }finally{globalThis.fetch=original;}
});

test('every Apple collection accepts its own canonical product URL',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    return Response.json({results:[{trackId:901,trackName:'Apple item',artistName:'Creator',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Source/v4/aa/bb/cc/item.jpg/100x100bb.jpg',trackViewUrl:'https://music.apple.com/us/music-video/item/901'}]});
  };
  const cases=[
    ['musicvideos','https://music.apple.com/us/music-video/example/901','musicVideo'],
    ['books','https://books.apple.com/us/book/example/id901','ebook'],
    ['audiobooks','https://books.apple.com/us/audiobook/example/id901','audiobook'],
    ['tv','https://itunes.apple.com/us/tv-season/example-season/id901','tvSeason'],
    ['podcasts','https://podcasts.apple.com/us/podcast/example/id901','podcast'],
    ['apps','https://apps.apple.com/us/app/example/id901','software'],
  ];
  try{
    for(const [category,url,entity] of cases){
      const result=await searchArtwork(url,category,undefined,undefined,'us');
      const request=requested.at(-1);
      assert.equal(request.pathname,'/lookup',category);
      assert.equal(request.searchParams.get('id'),'901',category);
      assert.equal(request.searchParams.get('entity'),entity,category);
      assert.equal(request.searchParams.get('country'),'us',category);
      assert.equal(result.results[0].category,category);
    }
  }finally{globalThis.fetch=original;}
});

test('Apple TV season numeric IDs use exact iTunes Lookup',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    return Response.json({results:[{wrapperType:'collection',collectionId:257255214,collectionName:'Star Trek: Deep Space Nine, Season 1',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Video/f8/14/cc/mzl.pyjjqqot.jpg/100x100bb.jpg',collectionViewUrl:'https://itunes.apple.com/us/tv-season/star-trek-deep-space-nine-season-1/id257255214'}]});
  };
  try{
    const result=await searchArtwork('257255214','tv',undefined,undefined,'us');
    assert.equal(requested[0].pathname,'/lookup');
    assert.equal(requested[0].searchParams.get('id'),'257255214');
    assert.equal(requested[0].searchParams.get('entity'),'tvSeason');
    assert.equal(requested[0].searchParams.get('country'),'us');
    assert.equal(result.results[0].id,'tv:apple:257255214');
    assert.equal(result.results[0].title,'Star Trek: Deep Space Nine, Season 1');
    assert.equal(result.results[0].kind,'poster');
  }finally{globalThis.fetch=original;}
});

test('podcast episode search keeps episode artwork and episode IDs separate from show art',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async input=>{
    requested=new URL(typeof input==='string'?input:input.url||input);
    return Response.json({results:[
      {wrapperType:'track',kind:'podcast',trackId:917918570,collectionId:917918570,trackName:'Serial',collectionName:'Serial',artworkUrl600:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/show.jpg/600x600bb.jpg'},
      {wrapperType:'podcastEpisode',kind:'podcast-episode',trackId:1000319686008,collectionId:917918570,trackName:'The Alibi',collectionName:'Serial',artworkUrl600:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/episode.jpg/600x600bb.jpg',trackViewUrl:'https://podcasts.apple.com/us/podcast/serial/id917918570?i=1000319686008'}
    ]});
  };
  try{
    const result=await searchArtwork('Podcast episode artwork unique','podcastepisodes',undefined,undefined,'us');
    assert.equal(requested.searchParams.get('media'),'podcast');
    assert.equal(requested.searchParams.get('entity'),'podcastEpisode');
    assert.equal(result.results.length,1);
    assert.equal(result.results[0].title,'The Alibi');
    assert.equal(result.results[0].subtitle,'Serial');
    assert.equal(result.results[0].mediaId,'1000319686008');
    assert.match(result.results[0].previewUrl,/episode\.jpg/);
  }finally{globalThis.fetch=original;}
});

test('Apple Podcasts episode URLs filter the requested episode from its show lookup',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async input=>{
    requested=new URL(typeof input==='string'?input:input.url||input);
    return Response.json({results:[
      {wrapperType:'track',kind:'podcast',trackId:917918570,collectionId:917918570,trackName:'Serial',collectionName:'Serial',artworkUrl600:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/show.jpg/600x600bb.jpg'},
      {wrapperType:'podcastEpisode',kind:'podcast-episode',trackId:1000319686008,collectionId:917918570,trackName:'The Alibi',collectionName:'Serial',artworkUrl600:'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/episode.jpg/600x600bb.jpg'}
    ]});
  };
  try{
    const result=await searchArtwork('https://podcasts.apple.com/us/podcast/serial/id917918570?i=1000319686008','podcastepisodes',undefined,undefined,'us');
    assert.equal(requested.pathname,'/lookup');
    assert.equal(requested.searchParams.get('id'),'917918570');
    assert.equal(requested.searchParams.get('entity'),'podcastEpisode');
    assert.equal(requested.searchParams.get('limit'),'200');
    assert.deepEqual(result.results.map(item=>item.mediaId),['1000319686008']);
  }finally{globalThis.fetch=original;}
});

test('App Store screenshot search checks iPhone, iPad, and Mac catalogs with Apple sized URLs',async()=>{
  const original=globalThis.fetch,requested=[];
  const screenshot='https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/c2/bc/eb/screen.PNG/406x228bb.png';
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    const mac=url.searchParams.get('entity')==='desktopSoftware';
    const ipad=url.searchParams.get('entity')==='iPadSoftware';
    return Response.json({results:[{trackId:mac?634148309:ipad?425073498:408709785,kind:mac?'mac-software':'software',trackName:mac?'Logic Pro':ipad?'Procreate':'GarageBand',artistName:'Apple',trackViewUrl:`https://apps.apple.com/us/app/example/id${mac?634148309:ipad?425073498:408709785}`,screenshotUrls:ipad?[]:[screenshot],ipadScreenshotUrls:ipad?[screenshot]:!mac?[screenshot]:[],appletvScreenshotUrls:[]} ]});
  };
  try{
    const result=await searchArtwork('Procreate','appscreenshots',undefined,undefined,'us');
    assert.equal(requested.length,3);
    assert.deepEqual(requested.map(url=>url.searchParams.get('entity')),['software','iPadSoftware','desktopSoftware']);
    assert.ok(result.results.some(item=>item.title==='Procreate · iPad 1'));
    assert.ok(result.results.some(item=>item.title==='Logic Pro · Mac 1'));
    assert.ok(result.results[0].sdDownloadUrl.endsWith('/600x600bb.png'));
    assert.ok(result.results[0].imageUrl.endsWith('/1200x1200bb.png'));
    assert.ok(result.results[0].hdDownloadUrls.some(url=>url.endsWith('/10000x10000bb.png')));
  }finally{globalThis.fetch=original;}
});

test('Apple movie links and IDs use exact iTunes lookup when title search misses',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async input=>{
    requested=new URL(typeof input==='string'?input:input.url||input);
    return Response.json({results:[{wrapperType:'track',kind:'feature-movie',trackId:314918278,collectionId:1653016379,trackName:"Harry Potter and the Philosopher's Stone",collectionName:'Wizarding World 11-Film Collection',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Video221/v4/poster.png/100x100bb.jpg',trackViewUrl:'https://itunes.apple.com/gb/movie/harry-potter/id314918278'}]});
  };
  try{
    const result=await searchArtwork('https://itunes.apple.com/gb/movie/harry-potter/id314918278','movies',undefined,undefined,'gb');
    assert.equal(requested.pathname,'/lookup');
    assert.equal(requested.searchParams.get('id'),'314918278');
    assert.equal(requested.searchParams.get('entity'),'movie');
    assert.equal(requested.searchParams.get('country'),'gb');
    assert.equal(result.results[0].id,'movies:apple:314918278');
    assert.equal(result.results[0].title,"Harry Potter and the Philosopher's Stone");
    assert.equal(result.results[0].kind,'poster');
    const byId=await searchArtwork('314918278','movies',undefined,undefined,'gb');
    assert.equal(byId.results[0].title,result.results[0].title);
  }finally{globalThis.fetch=original;}
});

test('Apple Books ISBN-13 and ISBN-10 input resolve to exact ISBN-13 lookups',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    requested.push(new URL(typeof input==='string'?input:input.url||input));
    return Response.json({results:[{trackId:597944491,trackName:'Dune',artistName:'Frank Herbert',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Publication122/v4/book.jpg/100x100bb.jpg',trackViewUrl:'https://books.apple.com/us/book/dune/id597944491'}]});
  };
  try{
    for(const isbn of ['978-0-441-17271-9','0-441-17271-7']){
      const result=await searchArtwork(isbn,'books',undefined,undefined,'us');
      assert.equal(result.results[0].title,'Dune');
    }
    assert.equal(requested.length,2);
    assert.ok(requested.every(url=>url.pathname==='/lookup'));
    assert.ok(requested.every(url=>url.searchParams.get('isbn')==='9780441172719'));
    assert.ok(requested.every(url=>url.searchParams.get('country')==='us'));
  }finally{globalThis.fetch=original;}
});

test('Music album search falls back to album art returned for an exact song title',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url||input);requested.push(url);
    if(url.searchParams.get('entity')==='album')return Response.json({results:[]});
    return Response.json({results:[{wrapperType:'track',kind:'song',collectionId:1234,trackId:5678,collectionName:'Meteora',trackName:'Numb',artistName:'LINKIN PARK',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/song.jpg/100x100bb.jpg',collectionViewUrl:'https://music.apple.com/us/album/meteora/1234'}]});
  };
  try{
    const result=await searchArtwork('Numb song artwork unique','music');
    assert.equal(requested.length,2);
    assert.equal(requested[0].searchParams.get('entity'),'album');
    assert.equal(requested[1].searchParams.get('entity'),'song');
    assert.equal(result.results[0].title,'Meteora');
    assert.equal(result.results[0].sourceUrl,'https://music.apple.com/us/album/meteora/1234');
  }finally{globalThis.fetch=original;}
});

test('multi-source categories explain that the Worker is required when it is not configured',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('Worker-backed search must stay disabled without a Worker URL');};
  try{
    for(const category of ['all']){
      const response=await searchArtwork('not open unique '+category,category);
      assert.deepEqual(response.results,[]);
      assert.match(response.warnings[0],/RUPA Worker/);
    }
    assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});

test('Apple motion lookup only returns Apple-hosted HLS playlists',async()=>{
  const original=globalThis.fetch;let requested;
  globalThis.fetch=async input=>{
    requested=new URL(typeof input==='string'?input:input.url||input);
    return Response.json({url:'https://mvod.itunes.apple.com/itunes-assets/art.m3u8',url_tall:'https://mvod.itunes.apple.com/itunes-assets/tall.m3u8'});
  };
  try{
    const item={id:'music:motion:test',category:'music',title:'Test',subtitle:'Artist',artist:'Artist',source:'Apple Music',sourceUrl:'https://music.apple.com/id/album/test/884466228',imageUrl:'https://is1-ssl.mzstatic.com/image/test.jpg',previewUrl:'https://is1-ssl.mzstatic.com/image/test.jpg'};
    const result=await getAppleMotionArtwork(item);
    assert.equal(requested.hostname,'artwork.m8tec.top');
    assert.equal(requested.pathname,'/api/v1/artwork/url');
    assert.equal(requested.searchParams.get('url'),item.sourceUrl);
    assert.deepEqual(result,{url:'https://mvod.itunes.apple.com/itunes-assets/art.m3u8',tallUrl:'https://mvod.itunes.apple.com/itunes-assets/tall.m3u8'});
  }finally{globalThis.fetch=original;}
});

test('Apple artwork URL transformations accept verified size bounds and reject unrelated hosts',()=>{
  const url='https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/cover.jpg/100x100bb.jpg';
  assert.equal(appleArtworkSizedUrl(url,600),'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/cover.jpg/600x600bb.jpg');
  assert.equal(appleArtworkSizedUrl(url,10000),'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/cover.jpg/10000x10000bb.jpg');
  assert.equal(appleArtworkSizedUrl(url,10001),undefined);
  assert.equal(appleArtworkSizedUrl('https://images.example.com/image/thumb/Music/v4/aa/bb/cc/cover.jpg/100x100bb.jpg',600),undefined);
  assert.equal(appleOriginalArtworkUrl('https://is3-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/cover.100x100-75.jpg'),'https://a5.mzstatic.com/us/r1000/0/Music/v4/aa/bb/cc/cover.jpg');
  assert.equal(appleOriginalArtworkUrl('http://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/cover.jpg/100x100bb.jpg'),undefined);
});

test('Apple Books zero-width RSS covers are resized to valid artwork URLs',()=>{
  const url='https://is1-ssl.mzstatic.com/image/thumb/Publication211/v4/aa/bb/cc/book-cover.png/0x170bb.png';
  assert.equal(appleArtworkSizedUrl(url,600),'https://is1-ssl.mzstatic.com/image/thumb/Publication211/v4/aa/bb/cc/book-cover.png/600x600bb.png');
  assert.equal(appleOriginalArtworkUrl(url),'https://a5.mzstatic.com/us/r1000/0/Publication211/v4/aa/bb/cc/book-cover.png');
});

test('Apple film and TV charts use their iTunes feeds and retain poster artwork',async()=>{
  const original=globalThis.fetch,requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(input);requested.push(url);
    return Response.json({feed:{entry:[{
      id:{attributes:{'im:id':'12345'}},'im:name':{label:'Chart title'},'im:artist':{label:'Studio'},
      'im:image':[{label:'https://is1-ssl.mzstatic.com/image/thumb/Video/v4/aa/bb/cc/poster.jpg/170x170bb.jpg',attributes:{height:'170'}}],
      link:{attributes:{rel:'alternate',href:`https://itunes.apple.com/${url.pathname.split('/')[1]}/title/12345`}},
    }]}});
  };
  try{
    for(const [category,kind,feed] of [['movies','movies','topmovies'],['tv','tv-seasons','toptvseasons'],['tv','tv-episodes','toptvepisodes']]){
      const item=(await fetchAppleTrendArtwork(category,kind,'us'))[0];
      assert.equal(requested.at(-1).pathname,`/us/rss/${feed}/limit=10/json`);
      assert.equal(item.source,'Apple TV');
      assert.equal(item.kind,'poster');
      assert.equal(item.title,'Chart title');
    }
  }finally{globalThis.fetch=original;}
});

test('Apple charts use the published local snapshot without contacting Apple feeds',async()=>{
  const original=globalThis.fetch,originalDocument=globalThis.document;let calls=0;
  globalThis.document={};
  globalThis.fetch=async input=>{
    calls++;
    assert.match(String(input),/data\/apple-trends\.json$/);
    return Response.json({schemaVersion:1,generatedAt:'2026-10-22T00:00:00Z',feeds:{
      'id/music/albums':{entries:[{id:{attributes:{'im:id':'881122'}},'im:name':{label:'Snapshot Album'},'im:artist':{label:'Snapshot Artist'},'im:image':[{label:'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/snapshot.jpg/600x600bb.jpg',attributes:{height:'600'}}],link:{attributes:{rel:'alternate',href:'https://music.apple.com/id/album/snapshot-album/881122'}}}]},
      'us/music/albums':{entries:[{id:{attributes:{'im:id':'881123'}},'im:name':{label:'US Snapshot Album'},'im:image':[{label:'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/us-snapshot.jpg/600x600bb.jpg',attributes:{height:'600'}}],link:{attributes:{rel:'alternate',href:'https://music.apple.com/us/album/us-snapshot-album/881123'}}}]}
    }});
  };
  try{
    const result=await fetchAppleTrendArtworkWithAvailability('music','albums','id');
    assert.equal(calls,1);
    assert.equal(result.storefront,'id');
    assert.deepEqual(result.availableStorefronts,['id','us']);
    assert.equal(result.items[0].title,'Snapshot Album');
    assert.equal(result.items[0].previewUrl,'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/snapshot.jpg/600x600bb.jpg');
  }finally{
    globalThis.fetch=original;
    if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
  }
});

test('Apple chart fallback checks a bounded number of storefronts when no snapshot exists',async()=>{
  const original=globalThis.fetch;const requested=[];
  globalThis.fetch=async input=>{
    const url=new URL(input),country=url.pathname.split('/')[1];requested.push(country);
    if(country!=='us')return Response.json({feed:{entry:[]}});
    return Response.json({feed:{entry:[{
      id:{attributes:{'im:id':'881122'}},
      'im:name':{label:'Apple Books Region Test'},
      'im:artist':{label:'Test Author'},
      'im:image':[{label:'https://is1-ssl.mzstatic.com/image/thumb/Publication/v4/book.png/0x170bb.png',attributes:{height:'170'}}],
      link:{attributes:{rel:'alternate',href:'https://books.apple.com/us/book/apple-books-region-test/id881122'}},
    }]}});
  };
  try{
    const result=await fetchAppleTrendArtworkWithAvailability('books','top-paid','id');
    assert.equal(result.storefront,'us');
    assert.deepEqual(result.availableStorefronts,[]);
    assert.equal(result.items[0].title,'Apple Books Region Test');
    assert.equal(result.items[0].previewUrl,'https://is1-ssl.mzstatic.com/image/thumb/Publication/v4/book.png/600x600bb.png');
    assert.deepEqual(new Set(requested),new Set(['id','us','gb']));
  }finally{globalThis.fetch=original;}
});

test('browser Apple Search uses a JSONP callback for cross-origin requests',async()=>{
  const originalFetch=globalThis.fetch,originalDocument=globalThis.document,originalWindow=globalThis.window;
  let requestedUrl='';
  const fakeWindow={setTimeout:(callback,delay)=>setTimeout(callback,delay),clearTimeout:id=>clearTimeout(id)};
  const fakeDocument={createElement:()=>({src:'',remove(){}}),head:{appendChild(script){requestedUrl=script.src;const callback=new URL(script.src).searchParams.get('callback');fakeWindow[callback]({results:[{trackId:77,trackName:'JSONP book',kind:'ebook',artworkUrl100:'https://is1-ssl.mzstatic.com/100x100bb.jpg',trackViewUrl:'https://books.apple.com/book/77'}]});}}};
  globalThis.window=fakeWindow;globalThis.document=fakeDocument;globalThis.fetch=async()=>{throw new Error('Browser Apple Search should use JSONP');};
  try{
    const result=await searchArtwork('Apple JSONP book unique','books');
    assert.equal(new URL(requestedUrl).searchParams.get('callback')?.startsWith('__rupaApple'),true);
    assert.equal(result.results[0].title,'JSONP book');
  }finally{
    globalThis.fetch=originalFetch;
    if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
    if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;
  }
});

test('a late Apple JSONP callback after cancellation is harmless and retired on load',async()=>{
  const originalFetch=globalThis.fetch,originalDocument=globalThis.document,originalWindow=globalThis.window;
  let script,callbackName='';
  const fakeWindow={setTimeout:(callback,delay)=>setTimeout(callback,delay),clearTimeout:id=>clearTimeout(id)};
  const fakeDocument={createElement:()=>({src:'',remove(){}}),head:{appendChild(node){script=node;callbackName=new URL(node.src).searchParams.get('callback');}}};
  globalThis.window=fakeWindow;globalThis.document=fakeDocument;globalThis.fetch=async()=>{throw new Error('Browser Apple Search should use JSONP');};
  try{
    const controller=new AbortController();
    const pending=searchArtwork('Apple JSONP cancellation unique','movies',controller.signal);
    controller.abort();
    await pending.catch(()=>undefined);
    assert.equal(typeof fakeWindow[callbackName],'function');
    assert.doesNotThrow(()=>fakeWindow[callbackName]({results:[]}));
    script.onload();
    assert.equal(callbackName in fakeWindow,false);
  }finally{
    globalThis.fetch=originalFetch;
    if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;
    if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;
  }
});

test('a stalled Apple catalog request returns a warning and retries transient failures',async()=>{
  const original=globalThis.fetch;let attempts=0;
  globalThis.fetch=async(input)=>{
    const url=new URL(input);
    if(url.hostname!=='itunes.apple.com')throw new Error('Unexpected host '+url.hostname);
    attempts++;
    if(attempts===1)throw new Error('temporary catalog outage');
    return Response.json({results:[{collectionId:7002,collectionName:'Worker Retry Album',artistName:'Worker Retry Artist',artworkUrl100:'https://is1-ssl.mzstatic.com/image/thumb/100x100bb.jpg'}]});
  };
  try{
    const first=await searchArtwork('retry direct cache unique','music');
    assert.ok(first.warnings.length);
    const second=await searchArtwork('retry direct cache unique','music');
    assert.equal(attempts,2);
    assert.equal(second.results[0].title,'Worker Retry Album');
  }finally{globalThis.fetch=original;}
});
