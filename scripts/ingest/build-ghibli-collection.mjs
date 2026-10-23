import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const worksUrl='https://www.ghibli.jp/works/';
const outPath=resolve(root,'public/collections/ghibli.json');
const fireflies={id:'hotarunohaka',sourceUrl:'https://www.ghibli.jp/works/hotarunohaka/',title:'火垂るの墓',englishTitle:'Grave of the Fireflies',year:1988,releaseDate:'1988-04-16',sourceCredit:'© 野坂昭如/新潮社, 1988',posterUrl:'https://www.ghibli.jp/images/hotarunohaka.jpg',stills:[]};
const POSTER_EDITION_SOURCES={
  totoro:[
    {id:'china-2018-theatrical',label:'China · theatrical poster',region:'China',year:2018,artist:'Huang Hai',imageUrl:'https://www.ghibli.jp/images/main%20poster_final.jpg',sourceUrl:'https://www.ghibli.jp/info/012939/',sourceName:'Studio Ghibli'},
    {id:'china-2018-support',label:'China · official support poster',region:'China',year:2018,artist:'Huang Hai',imageUrl:'https://www.ghibli.jp/images/Huanghai_final.jpg',sourceUrl:'https://www.ghibli.jp/info/012939/',sourceName:'Studio Ghibli'}
  ],
  chihiro:[
    {id:'china-2019-huang-hai-01',label:'China · theatrical poster 01',region:'China',year:2019,artist:'Huang Hai',imageUrl:'https://file.adquan.com/uploads_img/g9pxv1560763173.jpg',sourceUrl:'https://m.adquan.com/creative/detail/285233',sourceName:'Adquan'},
    {id:'china-2019-huang-hai-02',label:'China · theatrical poster 02',region:'China',year:2019,artist:'Huang Hai',imageUrl:'https://file.adquan.com/uploads_img/1saqw1560764089.jpg',sourceUrl:'https://m.adquan.com/creative/detail/285233',sourceName:'Adquan'},
    {id:'china-2019-huang-hai-03',label:'China · theatrical poster 03',region:'China',year:2019,artist:'Huang Hai',imageUrl:'https://file.adquan.com/uploads_img/w5s1n1560764089.jpg',sourceUrl:'https://m.adquan.com/creative/detail/285233',sourceName:'Adquan'},
    {id:'china-2019-zao-dao-01',label:'China · illustrated poster 01',region:'China',year:2019,artist:'Zao Dao',imageUrl:'https://file.adquan.com/uploads_img/etk4z1560765471.jpg',sourceUrl:'https://m.adquan.com/creative/detail/285233',sourceName:'Adquan'},
    {id:'china-2019-zao-dao-02',label:'China · illustrated poster 02',region:'China',year:2019,artist:'Zao Dao',imageUrl:'https://file.adquan.com/uploads_img/okyxz1560765472.jpg',sourceUrl:'https://m.adquan.com/creative/detail/285233',sourceName:'Adquan'},
    {id:'china-2019-zao-dao-03',label:'China · illustrated poster 03',region:'China',year:2019,artist:'Zao Dao',imageUrl:'https://file.adquan.com/uploads_img/b4uhc1560765472.jpg',sourceUrl:'https://m.adquan.com/creative/detail/285233',sourceName:'Adquan'},
    {id:'china-2019-zao-dao-04',label:'China · illustrated poster 04',region:'China',year:2019,artist:'Zao Dao',imageUrl:'https://file.adquan.com/uploads_img/7n6hc1560765473.jpg',sourceUrl:'https://m.adquan.com/creative/detail/285233',sourceName:'Adquan'}
  ],
  kimitachi:[
    {id:'japan-2023-second-poster',label:'Japan · second theatrical poster',region:'Japan',year:2023,artist:'Studio Ghibli',imageUrl:'https://www.ghibli.jp/images/poster02.jpg',sourceUrl:'https://www.ghibli.jp/info/013791/',sourceName:'Studio Ghibli'},
    {id:'china-2024-release-visual',label:'China · release visual',region:'China',year:2024,artist:'Huang Hai',imageUrl:'https://comicbook.com/wp-content/uploads/sites/4/2024/03/74cafc5a-dfec-4579-8bc7-16bc54a5fc44.jpg?w=1200',sourceUrl:'https://comicbook.com/anime/news/the-boy-and-the-heron-studio-ghibli-china-poster/',sourceName:'ComicBook.com'}
  ],
  howl:[
    {id:'china-2024-theatrical',label:'China · theatrical poster',region:'China',year:2024,imageUrl:'https://assets.recordchina.co.jp/newRc/m1200/20240430/565e986a8ee7cb5793fded75fe092204.jpg',sourceUrl:'https://www.recordchina.co.jp/b932793-s25-c30-d0201.html',sourceName:'Record China'},
    {id:'china-2024-release',label:'China · release poster',region:'China',year:2024,imageUrl:'https://p2.cri.cn/M00/84/63/rBABDGYvaQuAQw_yAAAAAAAAAAA332.5167x7234.jpg',sourceUrl:'https://ent.cri.cn/20240429/d0a4a8af-92af-67b9-285a-4a6a8a4a2c23.html',sourceName:'CRI Online'},
    {id:'china-2024-imax',label:'China · IMAX special poster',region:'China',year:2024,imageUrl:'https://www.ifensi.com/uploads/allimg/20240416/3-2404161330441J.jpg',sourceUrl:'https://www.ifensi.com/index.php?a=index&aid=3995&c=View&m=home',sourceName:'iFensi'}
  ],
  ponyo:[
    {id:'china-2020-theatrical',label:'China · theatrical poster',region:'China',year:2020,imageUrl:'https://p3.itc.cn/q_70/images03/20201225/1a4775ebd3414b44a92d86243d20a171.jpeg',sourceUrl:'https://www.sohu.com/a/440401503_745022',sourceName:'Sohu'},
    {id:'china-2020-family-edition',label:'China · family edition',region:'China',year:2020,imageUrl:'https://p9.itc.cn/q_70/images03/20201218/a95ca2cb161c4830974c10b63bce8f9f.jpeg',sourceUrl:'https://www.sohu.com/a/439031962_157635',sourceName:'Sohu'},
    {id:'china-2020-commissioned-art',label:'China · release poster',region:'China',year:2020,imageUrl:'https://mir-s3-cdn-cf.behance.net/project_modules/1400_opt_1/2812fe110008831.5fe175237144d.jpg',sourceUrl:'https://www.behance.net/gallery/110008831/-Poster-of-Ponyo-on-the-Cliff',sourceName:'Behance'}
  ],
  laputa:[
    {id:'china-2023-restored-release',label:'China · restored release visual',region:'China',year:2023,imageUrl:'https://obj.shine.cn/files/2023/05/22/c840957b-1d29-455d-a0fa-5a5fb2deed73_0.jpg',sourceUrl:'https://www.citynewsservice.cn/articles/cns/city-news/digitally-restored-castle-in-the-sky-to-be-released-in-china-zmzqxjm8',sourceName:'City News Service'}
  ],
  mononoke:[
    {id:'china-2025-4k-theatrical',label:'China · 4K theatrical poster',region:'China',year:2025,imageUrl:'https://images.shobserver.com/img/2025/04/23/l_CB20250423124634549054.jpg',sourceUrl:'https://japanese.shanghai.gov.cn/ja-EditorsPick-travelinshanghai/20250427/808ff7f8078a4455a74786088692fc28.html',sourceName:'Shanghai Municipal Government'}
  ]
};

function decode(value){return value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/gi,(_,code)=>String.fromCodePoint(parseInt(code,16)));}
function strip(value){return decode(value.replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim();}
function absolute(value,base){try{return new URL(decode(value),base).toString();}catch{return undefined;}}
async function page(url){const response=await fetch(url,{headers:{'user-agent':'Rupa-Ghibli-Index/1.0 (metadata index refresh)'}});if(!response.ok)throw new Error(`GET ${url}: HTTP ${response.status}`);return response.text();}
function extractFilm(html,url){
  const id=new URL(url).pathname.split('/').filter(Boolean).at(-1);
  const heading=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'';
  const small=heading.match(/<small[^>]*>([\s\S]*?)<\/small>/i)?.[1]||'';
  const metadata=strip(small),year=Number(metadata.match(/[（(](\d{4})[）)]/)?.[1])||null,releaseDate=metadata.match(/\d{4}-\d{2}-\d{2}/)?.[0]||null;
  const title=strip(heading.replace(/<small[\s\S]*?<\/small>/i,''));
  const after=html.slice((html.match(/<\/h1>/i)?.index||0)+5);
  const englishTitle=strip(after.match(/^\s*<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]||'')||null;
  const sourceCredit=strip(html.match(/©\s*[^<\n]+/i)?.[0]||'')||null;
  const posterCandidates=[...html.matchAll(/<(?:img|source)\b[^>]*(?:src|data-src|data-original)=["']([^"']*\/images\/[^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["'][^>]*>/gi),...html.matchAll(/<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi)].map(match=>absolute(match[1],url)).filter(Boolean);
  const posterUrl=posterCandidates.find(image=>{try{return new URL(image).pathname.toLowerCase()==='/images/'+id.toLowerCase()+'.jpg';}catch{return false;}})||`https://www.ghibli.jp/images/${id}.jpg`;
  const fullUrls=[...html.matchAll(/<a\b[^>]*href=["']([^"']*\/gallery\/(?!thumb-)[^"']+\.jpe?g(?:\?[^"']*)?)["'][^>]*>/gi)].map(match=>absolute(match[1],url)).filter(Boolean);
  const thumbUrls=[...html.matchAll(/<(?:img|source)\b[^>]*(?:src|data-src|data-original)=["']([^"']*\/gallery\/thumb-[^"']+\.png(?:\?[^"']*)?)["'][^>]*>/gi)].map(match=>absolute(match[1],url)).filter(Boolean);
  const byKey=new Map();
  for(const thumbnailUrl of thumbUrls){const match=thumbnailUrl.match(/\/gallery\/thumb-(.+)\.png(?:\?|$)/i);if(match)byKey.set(match[1],{key:match[1],thumbnailUrl,sourceUrl:null});}
  for(const sourceUrl of fullUrls){const match=sourceUrl.match(/\/gallery\/([^/?#]+)\.jpe?g(?:\?|$)/i);if(!match)continue;const row=byKey.get(match[1])||{key:match[1],thumbnailUrl:null,sourceUrl:null};row.sourceUrl=sourceUrl;byKey.set(match[1],row);}
  const stills=[...byKey.values()].filter(still=>still.sourceUrl).sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));
  return {id,sourceUrl:url,title,englishTitle,year,releaseDate,sourceCredit,posterUrl,stills};
}

const existingFilms=JSON.parse(await readFile(outPath,'utf8'));
const existingById=new Map(existingFilms.map(film=>[film.id,film]));
const index=await page(worksUrl);
const workUrls=[];
for(const match of index.matchAll(/<a\b[^>]*href=["']([^"']*\/works\/([^/"'#]+)\/?(?:#[^"']*)?)["'][^>]*>/gi)){
  const url=absolute(match[1],worksUrl);
  if(url&&!url.includes('#')&&!workUrls.includes(url))workUrls.push(url.replace(/\/$/,'/') );
}
if(!workUrls.some(url=>url.includes('/works/hotarunohaka/')))workUrls.push(fireflies.sourceUrl);
const films=[];
for(let offset=0;offset<workUrls.length;offset+=5){
  const batch=workUrls.slice(offset,offset+5);
  const fetched=await Promise.all(batch.map(async url=>{
    if(url.includes('/works/hotarunohaka/'))return fireflies;
    const html=await page(url);
    const scraped=extractFilm(html,url),previous=existingById.get(scraped.id);
    return {
      ...previous,
      ...scraped,
      title:scraped.title==='スタジオジブリの作品'?(previous?.title||scraped.title):scraped.title,
      englishTitle:scraped.englishTitle||previous?.englishTitle||null,
      year:scraped.year||previous?.year||null,
      releaseDate:scraped.releaseDate||previous?.releaseDate||null,
      sourceCredit:scraped.sourceCredit||previous?.sourceCredit||null,
      posterUrl:scraped.posterUrl||previous?.posterUrl||null,
    };
  }));
  films.push(...fetched);
}
for(const film of films)film.posterEditions=POSTER_EDITION_SOURCES[film.id]||[];
if(films.length!==27)throw new Error('Expected 27 official film pages; found '+films.length+'. No output written.');
if(films.some(film=>!film.posterUrl))throw new Error('An official key visual was not found for: '+films.filter(film=>!film.posterUrl).map(film=>film.id).join(', ')+'. No output written.');
const stillCount=films.reduce((count,film)=>count+film.stills.length,0);
if(stillCount<1200)throw new Error(`The official still index unexpectedly returned only ${stillCount} images. No output written.`);
await mkdir(dirname(outPath),{recursive:true});
await writeFile(outPath,`${JSON.stringify(films,null,2)}\n`,'utf8');
console.log(`Wrote ${films.length} films and ${stillCount} source-linked stills to ${outPath}`);
