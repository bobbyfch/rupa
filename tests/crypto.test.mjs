import test from 'node:test';
import assert from 'node:assert/strict';
import { newChain, encodeChain, parseChain, encryptJson, decryptJson, credentials, exportEncrypted, importEncrypted } from '../src/lib/crypto.ts';

test('chain codes round-trip without changing the secret', async()=>{
  const first=newChain();const code=encodeChain(first);const parsed=parseChain(code);
  assert.equal(parsed.id,first.id);assert.deepEqual(parsed.master,first.master);
  assert.equal(await credentials(first).then(x=>x.token),await credentials(parsed).then(x=>x.token));
});
test('chain code rejects invalid key material',()=>assert.throws(()=>parseChain('CA1.not-a-uuid.foo'),/Invalid/));
test('client encrypts and decrypts structured archive snapshots',async()=>{
  const c=newChain();const body={schema:1,name:'My Archive',favorites:[{id:'a'}]};const encrypted=await encryptJson(c.master,body);
  assert.equal(typeof encrypted.ciphertext,'string');assert.equal(JSON.stringify(encrypted).includes('My Archive'),false);
  assert.deepEqual(await decryptJson(c.master,encrypted),body);
});
test('tampered ciphertext never decrypts',async()=>{
  const c=newChain(),encrypted=await encryptJson(c.master,{message:'private'});
  const first=encrypted.ciphertext[0];encrypted.ciphertext=(first==='A'?'B':'A')+encrypted.ciphertext.slice(1);
  await assert.rejects(decryptJson(c.master,encrypted));
});
test('encrypted backups reject incorrect passwords and accept correct ones',async()=>{
  const data={schema:1,profile:{name:'Art'}};const encrypted=await exportEncrypted(data,'very-secret-pass');
  await assert.rejects(importEncrypted(encrypted,'incorrect-pass'));
  assert.deepEqual(await importEncrypted(encrypted,'very-secret-pass'),data);
});

test('new encrypted backup format uses RUPA identity',async()=>{
  const encrypted=await exportEncrypted({a:1},'a-strong-password');
  assert.equal(encrypted.format,'RUPA Encrypted Backup');
});
test('legacy CoverAtlas encrypted backups remain importable after rename',async()=>{
  const encrypted=await exportEncrypted({legacy:true},'migration-password');
  encrypted.format='CoverAtlas Encrypted Backup';
  assert.deepEqual(await importEncrypted(encrypted,'migration-password'),{legacy:true});
});
