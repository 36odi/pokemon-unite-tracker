const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create,normalize}=require('../js/medal-preset-store.js');
const clone=x=>JSON.parse(JSON.stringify(x)),empty=()=>Array(8).fill(null);
const preset=name=>({name,slots:[name,...Array(9).fill(null)],rarities:Array(10).fill('gold')});
const at=(i,name)=>{const p=empty();p[i]=preset(name);return p;};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
  const map=new Map(),rows=new Map();let counter=0;
  const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
  const remote={async read(owner){return clone(rows.get(owner)||null);},async write(owner,data,expected){
    const row=rows.get(owner);if(!!row!==expected.exists||(row?.updated_at??null)!==expected.stamp)return null;
    const next={data:clone(data),updated_at:String(++counter)};rows.set(owner,next);return clone(next);
  }};
  return {map,rows,storage,remote,make:()=>create({storage,remote})};
}
test('legacy arrays normalize without losing names, slots or rarities',()=>{
  const old=empty();old[0]=['ポッポ'];const n=normalize(old);assert.equal(n[0].slots[0],'ポッポ');assert.equal(n[0].rarities[0],'gold');
  assert.deepEqual(normalize(at(0,'A')),at(0,'A'));assert.throws(()=>normalize([]));
});
test('guest is local-only and survives reload',async()=>{
  const f=fixture();f.remote.read=()=>{throw Error('guest network');};const s=f.make();await s.select('guest');await s.edit(0,preset('A'));
  assert.equal(await s.save(),false);const reload=f.make();await reload.select('guest');assert.equal(reload.snapshot().values[0].name,'A');
});
test('reselecting the same owner waits for its initial local read',async()=>{
  const f=fixture(),gate=deferred();
  f.storage.setItem('unite_medal_presets',JSON.stringify(at(0,'legacy')));
  const s=create({storage:f.storage,remote:f.remote,lock:async(_key,fn)=>{await gate.promise;return fn();}});
  const first=s.select('guest');let done=false;
  const second=s.select('guest').then(v=>{done=true;return v;});
  await Promise.resolve();assert.equal(done,false);
  gate.resolve();await first;assert.equal((await second).values[0].name,'legacy');
});
test('legacy ownership is not assumed for an authenticated account',async()=>{
  const f=fixture();f.storage.setItem('unite_medal_presets',JSON.stringify(at(0,'unknown')));
  const s=f.make();await s.select('A');await s.load();assert.equal(s.snapshot().values[0],null);assert.equal(s.snapshot().legacy[0].name,'unknown');
  await s.importLegacy();assert.equal(s.snapshot().values[0].name,'unknown');assert.ok(f.storage.getItem('unite_medal_presets'));
});
test('old guest presets migrate once; deletion does not resurrect them',async()=>{
  const f=fixture();f.storage.setItem('unite_medal_presets',JSON.stringify(at(0,'old')));
  const s=f.make();await s.select('guest');await s.edit(0,null);const r=f.make();await r.select('guest');assert.equal(r.snapshot().values[0],null);
});
test('a fresh remote row is loaded, then acknowledged saves survive reload',async()=>{
  const f=fixture();f.rows.set('A',{data:at(0,'cloud'),updated_at:'0'});const s=f.make();await s.select('A');await s.load();
  assert.equal(s.snapshot().values[0].name,'cloud');await s.edit(1,preset('local'));assert.equal(await s.save(),true);
  const r=f.make();await r.select('A');assert.equal(r.snapshot().values[1].name,'local');assert.equal(r.snapshot().status,'synced');
});
test('offline pending edit is never overwritten by stale server content',async()=>{
  const f=fixture();f.rows.set('A',{data:at(0,'base'),updated_at:'0'});const s=f.make();await s.select('A');await s.load();await s.edit(0,preset('new'));
  f.remote.write=async()=>{throw Error('offline');};assert.equal(await s.save(),false);assert.equal(s.snapshot().status,'offline');
  await s.load();assert.equal(s.snapshot().values[0].name,'new');assert.equal(s.snapshot().status,'pending');
});
test('divergent same-slot edits keep both values and require a choice',async()=>{
  const f=fixture(),s=f.make();f.rows.set('A',{data:at(0,'base'),updated_at:'0'});await s.select('A');await s.load();await s.edit(0,preset('local'));
  f.rows.set('A',{data:at(0,'other-device'),updated_at:'new'});assert.equal(await s.save(),false);
  assert.equal(s.snapshot().values[0].name,'local');assert.equal(s.snapshot().conflicts[0].value.name,'other-device');
  const r=f.make();await r.select('A');assert.equal(r.snapshot().conflicts.length,1);await r.resolve(0,0);await r.save();
  assert.equal(r.snapshot().values[0].name,'other-device');assert.equal(r.snapshot().conflicts.length,0);
});
test('edits to different slots merge without a conflict',async()=>{
  const f=fixture(),s=f.make();await s.select('A');await s.load();await s.edit(0,preset('local'));f.rows.set('A',{data:at(1,'remote'),updated_at:'1'});
  assert.equal(await s.save(),true);assert.equal(s.snapshot().values[0].name,'local');assert.equal(s.snapshot().values[1].name,'remote');
});
test('edits made while a load is in flight are preserved',async()=>{
  const f=fixture(),s=f.make(),d=deferred();await s.select('A');f.remote.read=()=>d.promise;const loading=s.load();
  await s.edit(0,preset('typed'));d.resolve({data:at(1,'remote'),updated_at:'1'});await loading;
  assert.equal(s.snapshot().values[0].name,'typed');assert.equal(s.snapshot().values[1].name,'remote');
});
test('edits made while a save is in flight remain pending',async()=>{
  const f=fixture(),s=f.make(),d=deferred(),started=deferred();await s.select('A');await s.load();await s.edit(0,preset('sent'));
  f.remote.write=async()=>{started.resolve();return d.promise;};const saving=s.save();await started.promise;
  await s.edit(0,preset('newer'));d.resolve({updated_at:'2'});await saving;
  assert.equal(s.snapshot().values[0].name,'newer');assert.equal(s.snapshot().status,'pending');
});
test('account switch ignores late reads and keeps each local account separate',async()=>{
  const f=fixture(),s=f.make(),d=deferred();await s.select('A');await s.edit(0,preset('A-local'));f.remote.read=()=>d.promise;const loading=s.load();
  await s.select('B');assert.equal(s.snapshot().values[0],null);await s.edit(0,preset('B-local'));d.resolve({data:at(0,'A-cloud'),updated_at:'3'});await loading;
  assert.equal(s.snapshot().owner,'B');assert.equal(s.snapshot().values[0].name,'B-local');await s.select('A');assert.equal(s.snapshot().values[0].name,'A-local');
});
test('compare-and-swap failure does not overwrite concurrent cloud save',async()=>{
  const f=fixture(),s=f.make();await s.select('A');await s.load();await s.edit(0,preset('local'));
  f.remote.write=async()=>{f.rows.set('A',{data:at(0,'raced'),updated_at:'1'});return null;};
  assert.equal(await s.save(),false);assert.equal(f.rows.get('A').data[0].name,'raced');assert.equal(s.snapshot().conflicts[0].value.name,'raced');
});
test('two tabs reload the latest persisted local edits instead of overwriting other slots',async()=>{
  const f=fixture(),a=f.make(),b=f.make();await a.select('A');await b.select('A');await a.edit(0,preset('tab-A'));await b.edit(1,preset('tab-B'));await a.refresh();
  assert.equal(a.snapshot().values[0].name,'tab-A');assert.equal(a.snapshot().values[1].name,'tab-B');
});
test('importing guest data preserves occupied account slots as conflicts',async()=>{
  const f=fixture(),s=f.make();await s.select('A');await s.edit(0,preset('account'));await s.importValues(at(0,'guest'));
  assert.equal(s.snapshot().values[0].name,'account');assert.equal(s.snapshot().conflicts[0].value.name,'guest');
});
test('two stale tabs editing the same slot retain both pending versions',async()=>{
  const f=fixture(),a=f.make(),b=f.make();await a.select('A');await b.select('A');
  await a.edit(0,preset('tab-A'));await b.edit(0,preset('tab-B'));
  assert.equal(b.snapshot().values[0].name,'tab-B');assert.equal(b.snapshot().conflicts[0].value.name,'tab-A');
  assert.equal(await b.save(),false);
});
test('storage failure is visible and can be retried without losing the edit',async()=>{
  const f=fixture(),s=f.make();await s.select('guest');const set=f.storage.setItem;f.storage.setItem=()=>{throw Error('quota');};
  assert.equal(await s.edit(0,preset('unsaved')),false);assert.equal(s.snapshot().status,'storage-error');assert.equal(s.snapshot().values[0].name,'unsaved');
  f.storage.setItem=set;await s.refresh();assert.equal(s.snapshot().status,'local');const r=f.make();await r.select('guest');assert.equal(r.snapshot().values[0].name,'unsaved');
});
test('malformed remote data cannot replace a valid local preset',async()=>{
  const f=fixture(),s=f.make();await s.select('A');await s.edit(0,preset('valid'));f.remote.read=async()=>({data:[],updated_at:'0'});
  assert.equal(await s.load(),false);assert.equal(s.snapshot().values[0].name,'valid');assert.equal(s.snapshot().status,'offline');
});
test('unreadable legacy copy cannot hide valid account data',async()=>{
  const f=fixture(),s=f.make();await s.select('A');await s.edit(0,preset('valid'));
  f.storage.setItem('unite_medal_presets','broken JSON');const r=f.make();await r.select('A');
  assert.equal(r.snapshot().values[0].name,'valid');assert.equal(f.storage.getItem('unite_medal_presets'),'broken JSON');
});
