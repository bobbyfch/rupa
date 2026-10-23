import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSonySerial, sonySerialCovers, libretroExactCover } from '../worker/src/expanded-sources.js';

test('Sony serial parsing validates canonical serial before fetching',()=>{
  assert.equal(parseSonySerial('SLUS-20963'), 'SLUS-20963');
  assert.equal(parseSonySerial('SLUS_20963'), 'SLUS-20963');
  assert.equal(parseSonySerial('some game title'), null);
});
test('PS1/PS2 adapters verify files and do not invent missing images',async()=>{
  const old=globalThis.fetch;let checked=0;
  globalThis.fetch=async (url,opts)=>{checked++;assert.equal(opts.method,'HEAD');return new Response(null,{status:String(url).includes('ps2-covers/main/covers/default')?200:404,headers:{'content-type':'image/jpeg'}});};
  try {const items=await sonySerialCovers('SLUS-20963');assert.equal(items.length,1);assert.equal(items[0].provider,'xlenore/ps2-covers');assert.equal(items[0].rights,'source-only');assert.equal(checked,4);} finally {globalThis.fetch=old;}
});
test('Libretro requires platform and exact title and URL encodes image',async()=>{
  const old=globalThis.fetch;let fetched='';
  globalThis.fetch=async (url,opts)=>{fetched=String(url);assert.equal(opts.method,'HEAD');return new Response(null,{status:200,headers:{'content-type':'image/png'}});};
  try {assert.deepEqual(await libretroExactCover('Super Mario Bros.'),[]);const items=await libretroExactCover('NES | Super Mario Bros. (USA)');assert.equal(items.length,1);assert.ok(fetched.includes('Named_Boxarts/Super%20Mario%20Bros.%20(USA).png'));assert.equal(items[0].rights,'source-only');}finally{globalThis.fetch=old;}
});
