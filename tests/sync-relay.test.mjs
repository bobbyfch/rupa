import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
class FakeD1 {
  rows=new Map();
  prepare(sql){return { bind:(...args)=>({
    first:async()=>{const row=this.rows.get(args[0]);return row?{...row}:null;},
    run:async()=>{
      if(sql.startsWith('INSERT')){
        const [id,auth_hash,payload,updated_at]=args;
        if(this.rows.has(id))throw new Error('duplicate');
        this.rows.set(id,{auth_hash,payload,version:1,updated_at});return {meta:{changes:1}};
      }
      if(sql.startsWith('UPDATE')){
        const [payload,updated_at,id,version]=args,row=this.rows.get(id);
        if(!row||row.version!==version)return {meta:{changes:0}};
        Object.assign(row,{payload,updated_at,version:version+1});return {meta:{changes:1}};
      }
      throw new Error('Unknown test query');
    }
  })};}
}
const origin='https://bobbyfch.github.io';
function req(path,method,token,body){return new Request(`https://worker.example${path}`,{method,headers:{'content-type':'application/json','origin':origin,...(token?{'authorization':`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});}
test('sync relay creates chain, denies unauthorized reads and enforces version locks',async()=>{
  const db=new FakeD1(),env={ARCHIVE_DB:db,ALLOWED_ORIGINS:origin};
  const id='f2f8daa2-9c36-4e0f-80da-383b35f5aa71',token='t'.repeat(43);
  const payload={iv:'base64-iv',ciphertext:'encrypted-payload-not-plaintext'};
  const created=await worker.fetch(req('/sync/chains','POST',token,{id,payload}),env);
  assert.equal(created.status,201);
  const forbidden=await worker.fetch(req(`/sync/chains/${id}`,'GET','invalid'+token),env);
  assert.equal(forbidden.status,401);
  const record=await worker.fetch(req(`/sync/chains/${id}`,'GET',token),env);
  assert.equal(record.status,200);assert.equal((await record.json()).version,1);
  const stale=await worker.fetch(req(`/sync/chains/${id}`,'PUT',token,{expectedVersion:0,payload}),env);
  assert.equal(stale.status,409);
  const updated=await worker.fetch(req(`/sync/chains/${id}`,'PUT',token,{expectedVersion:1,payload}),env);
  assert.equal(updated.status,200);assert.equal((await updated.json()).version,2);
});
