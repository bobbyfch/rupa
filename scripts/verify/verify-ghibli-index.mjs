import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const data=JSON.parse(await readFile(resolve(root,'public/collections/ghibli.json'),'utf8'));
const fail=message=>{console.error(`Ghibli index invalid: ${message}`);process.exitCode=1;};
if(!Array.isArray(data)||data.length!==27)fail(`expected 27 films; got ${data?.length}`);
const filmIds=new Set();let count=0,posterEditionCount=0;
for(const film of data||[]){
  if(!film.id||filmIds.has(film.id))fail(`missing or duplicate film id: ${film.id}`);
  filmIds.add(film.id);
  if(!film.title||!film.englishTitle||!film.year||!film.sourceUrl)fail(`incomplete timeline metadata: ${film.id}`);
  try{const page=new URL(film.sourceUrl);if(page.hostname!=='www.ghibli.jp'||page.protocol!=='https:')fail(`non-official source page: ${film.id}`);}catch{fail(`invalid source page URL: ${film.id}`);}
  try{const poster=new URL(film.posterUrl);if(poster.hostname!=='www.ghibli.jp'||poster.protocol!=='https:'||!poster.pathname.startsWith('/images/'))fail(`non-official key visual: ${film.id}`);}catch{fail(`missing or invalid official key visual: ${film.id}`);}
  if(!Array.isArray(film.posterEditions))fail(`missing poster edition list: ${film.id}`);
  const editionIds=new Set();
  for(const edition of film.posterEditions||[]){
    posterEditionCount++;
    if(!edition.id||editionIds.has(edition.id)||!edition.label||!edition.sourceName)fail(`incomplete or duplicate poster edition: ${film.id}/${edition.id}`);
    editionIds.add(edition.id);
    try{const image=new URL(edition.imageUrl),source=new URL(edition.sourceUrl);if(image.protocol!=='https:'||source.protocol!=='https:')fail(`poster edition must use HTTPS: ${film.id}/${edition.id}`);}catch{fail(`invalid poster edition URL: ${film.id}/${edition.id}`);}
  }
  if(!Array.isArray(film.stills))fail(`missing still list: ${film.id}`);
  for(const still of film.stills||[]){
    count++;
    try{const image=new URL(still.sourceUrl),thumb=still.thumbnailUrl?new URL(still.thumbnailUrl):null;if(image.hostname!=='www.ghibli.jp'||image.protocol!=='https:'||!image.pathname.startsWith('/gallery/'))fail(`non-official image: ${film.id}/${still.key}`);if(thumb&&(thumb.hostname!=='www.ghibli.jp'||!thumb.pathname.includes('/gallery/thumb-')))fail(`invalid thumbnail: ${film.id}/${still.key}`);}catch{fail(`invalid still URL: ${film.id}/${still.key}`);}
  }
}
if(count!==1278)fail(`expected 1,278 stills; got ${count}`);
if(posterEditionCount!==20)fail(`expected 20 curated regional/alternate poster visuals; got ${posterEditionCount}`);
const heron=data.find(film=>film.id==='kimitachi');
const chinaRelease=heron?.posterEditions?.find(edition=>edition.id==='china-2024-release-visual');
if(!chinaRelease?.imageUrl?.includes('f29087b8-5213-4b86-904a-21b15dc08139.jpg'))fail('The Boy and the Heron China release visual must use the portrait poster asset');
const waraWara=heron?.posterEditions?.find(edition=>edition.id==='china-2024-wara-wara-poster');
if(!waraWara||waraWara.region!=='China'||!waraWara.imageUrl||!waraWara.sourceUrl)fail('missing sourced China Wara Wara special poster');
const fireflies=data.find(film=>film.id==='hotarunohaka');
if(!fireflies||fireflies.stills.length!==0||fireflies.year!==1988)fail('Grave of the Fireflies should remain in the timeline without a still gallery');
if(!process.exitCode)console.log(`Verified ${data.length} films, ${count} official stills, ${data.length} official key visuals, and ${posterEditionCount} sourced poster editions.`);
