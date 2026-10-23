// Encryption is performed entirely in the browser. HKDF legacy salt and CA1 chain format remain unchanged for migration. The relay never receives the encryption key.
const enc = new TextEncoder(), dec = new TextDecoder();
const bytes = (len:number) => crypto.getRandomValues(new Uint8Array(len));
function b64(raw:Uint8Array){let binary='';raw.forEach(n=>binary+=String.fromCharCode(n));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unb64(s:string){const binary=atob(s.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(binary,c=>c.charCodeAt(0));}
async function derived(master:Uint8Array,label:string,usage:KeyUsage[]) {
  const seed=await crypto.subtle.importKey('raw',master as BufferSource,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode('CoverAtlas-sync-v1'),info:enc.encode(label)},seed,{name:'AES-GCM',length:256},false,usage);
}
async function proof(master:Uint8Array){
  const seed=await crypto.subtle.importKey('raw',master as BufferSource,'HKDF',false,['deriveBits']);
  const raw=await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:enc.encode('CoverAtlas-sync-v1'),info:enc.encode('authorization')},seed,256);
  return b64(new Uint8Array(raw));
}
export interface Chain {id:string;master:Uint8Array}
export function newChain():Chain{return {id:crypto.randomUUID(),master:bytes(32)};}
export function encodeChain(c:Chain){return `CA1.${c.id}.${b64(c.master)}`;}
export function parseChain(code:string):Chain {
  const m=/^CA1\.([a-f0-9-]{36})\.([\w-]{42,44})$/i.exec(code.trim());if(!m)throw new Error('Invalid sync chain');
  const master=unb64(m[2]);if(master.length!==32)throw new Error('Invalid sync key');return {id:m[1],master};
}
export async function credentials(c:Chain){return {id:c.id,token:await proof(c.master)};}
export async function encryptJson(master:Uint8Array,data:unknown){
  const key=await derived(master,'encrypted-payload',['encrypt']);const iv=bytes(12);
  const body=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv as BufferSource},key,enc.encode(JSON.stringify(data)));
  return {iv:b64(iv),ciphertext:b64(new Uint8Array(body))};
}
export async function decryptJson<T>(master:Uint8Array,payload:{iv:string;ciphertext:string}):Promise<T>{
  const key=await derived(master,'encrypted-payload',['decrypt']);
  const body=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(payload.iv) as BufferSource},key,unb64(payload.ciphertext) as BufferSource);
  return JSON.parse(dec.decode(body)) as T;
}
export async function exportEncrypted(data:unknown,password:string){
  if(password.length<8)throw new Error('Use at least 8 characters');
  const salt=bytes(16),iv=bytes(12),base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:salt as BufferSource,iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt']);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv as BufferSource},key,enc.encode(JSON.stringify(data)));
  return {format:'RUPA Encrypted Backup',version:1,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};
}
export async function importEncrypted(data:any,password:string){
  if(!['RUPA Encrypted Backup', 'NUNKI Encrypted Backup', 'CoverAtlas Encrypted Backup'].includes(data?.format)) throw new Error('Unknown backup format');
  const base=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:unb64(data.salt) as BufferSource,iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
  const body=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(data.iv) as BufferSource},key,unb64(data.ciphertext) as BufferSource);
  return JSON.parse(dec.decode(body));
}
