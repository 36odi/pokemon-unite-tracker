/* Account-scoped, three-way preset synchronization. No database access in this module. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MedalPresetStore=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const empty=()=>Array(8).fill(null);
  function normalize(p){
    if(!Array.isArray(p)||p.length!==8)throw new Error('invalid-presets');
    return p.map(v=>{
      if(v==null)return null;
      if(Array.isArray(v))return {slots:copy(v),rarities:Array(10).fill('gold'),name:null};
      if(!Array.isArray(v.slots))throw new Error('invalid-preset');
      return {slots:copy(v.slots),rarities:copy(v.rarities||Array(10).fill('gold')),name:v.name||null};
    });
  }
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function merge(base,local,remote){
    const conflicts=[];
    const values=local.map((v,i)=>{
      if(equal(v,remote[i]))return copy(v);
      if(equal(v,base[i]))return copy(remote[i]);
      if(equal(remote[i],base[i]))return copy(v);
      conflicts.push({index:i,value:copy(remote[i]),source:'remote'});
      return copy(v);
    });
    return {values,conflicts};
  }
  function create({storage,remote,lock=(_key,fn)=>fn(),onChange=()=>{}}){
    let active=null,generation=0;
    const key=owner=>'unite_medal_presets_v2:'+encodeURIComponent(owner);
    const fresh=()=>({version:2,local:empty(),base:empty(),known:false,exists:false,stamp:null,conflicts:[],legacyHandled:false});
    function read(owner){
      const raw=storage.getItem(key(owner));
      if(!raw)return fresh();
      const s=JSON.parse(raw);
      s.local=normalize(s.local);s.base=normalize(s.base);
      if(!Array.isArray(s.conflicts))throw new Error('invalid-conflicts');
      return s;
    }
    function notify(ctx){if(active===ctx)onChange(snapshot());}
    function snapshot(){
      if(!active)return {owner:null,values:empty(),conflicts:[],status:'idle',legacy:null};
      return {owner:active.owner,values:copy(active.state.local),conflicts:copy(active.state.conflicts),
        status:active.status,legacy:copy(active.legacy),dirty:!equal(active.state.local,active.state.base)};
    }
    function persist(ctx,s){
      // Keep memory even when storage is unavailable; never claim it was saved locally.
      ctx.state=s;
      try{storage.setItem(key(ctx.owner),JSON.stringify(s));ctx.storageError=false;}
      catch(e){ctx.storageError=true;ctx.status='storage-error';throw e;}
    }
    function current(ctx){
      if(ctx.storageError)return copy(ctx.state);
      return read(ctx.owner);
    }
    async function transaction(ctx,fn){
      return lock(key(ctx.owner),()=>{
        if(active!==ctx)return false;
        const s=current(ctx);fn(s);persist(ctx,s);notify(ctx);return true;
      });
    }
    function alternatives(s,items){
      for(const item of items){
        if(!s.conflicts.some(c=>c.index===item.index&&equal(c.value,item.value)))s.conflicts.push(copy(item));
      }
    }
    function statusFor(ctx){
      return ctx.state.conflicts.length?'conflict':ctx.owner==='guest'?'local':
        !ctx.state.known?'pending':equal(ctx.state.local,ctx.state.base)?'synced':'pending';
    }
    async function select(owner){
      if(active?.owner===owner){
        if(active.selecting)await active.selecting;
        return snapshot();
      }
      const ctx={owner,state:fresh(),status:'idle',legacy:null,generation:++generation,busy:null};
      active=owner?ctx:null;
      if(!owner){onChange(snapshot());return snapshot();}
      try{
        ctx.selecting=transaction(ctx,s=>{
          const raw=storage.getItem('unite_medal_presets');
          if(raw&&!s.legacyHandled){
            let legacy;
            try{legacy=normalize(JSON.parse(raw));}catch(e){return;} // Preserve an unreadable legacy copy; do not hide valid scoped saves.
            if(legacy.some(Boolean))ctx.legacy=legacy;
            // A guest session identifies guest data. An authenticated session cannot establish ownership.
            if(owner==='guest'){
              const m=merge(empty(),s.local,legacy);s.local=m.values;
              alternatives(s,m.conflicts.map(c=>({...c,source:'legacy'})));
              s.legacyHandled=true;ctx.legacy=null;
            }
          }
        });
        const selected=await ctx.selecting;
        if(!selected)return snapshot();ctx.status=statusFor(ctx);
      }catch(e){ctx.status='storage-error';}
      ctx.selecting=null;notify(ctx);return snapshot();
    }
    async function edit(index,value){
      const ctx=active;if(!ctx)return false;
      if(!Number.isInteger(index)||index<0||index>7)throw new Error('invalid-index');
      try{
        const expected=copy(ctx.state.local[index]);
        const ok=await transaction(ctx,s=>{
          const p=empty();p[index]=value;const next=normalize(p)[index];
          if(!equal(s.local[index],expected)&&!equal(s.local[index],next)){
            alternatives(s,[{index,value:s.local[index],source:'tab'}]);
          }
          s.local[index]=next;
        });
        if(!ok)return false;ctx.status=statusFor(ctx);notify(ctx);return true;
      }catch(e){notify(ctx);return false;}
    }
    async function importLegacy(){
      const ctx=active;if(!ctx?.legacy)return false;
      try{
        const imported=await transaction(ctx,s=>{
          const m=merge(empty(),s.local,ctx.legacy);s.local=m.values;
          alternatives(s,m.conflicts.map(c=>({...c,source:'legacy'})));s.legacyHandled=true;
        });
        if(!imported)return false;ctx.legacy=null;ctx.status=statusFor(ctx);notify(ctx);return true;
      }catch(e){notify(ctx);return false;}
    }
    async function importValues(values,source='guest'){
      const ctx=active;if(!ctx)return false;
      try{
        const incoming=normalize(values);
        const imported=await transaction(ctx,s=>{
          const m=merge(empty(),s.local,incoming);s.local=m.values;
          alternatives(s,m.conflicts.map(c=>({...c,source})));
        });
        if(!imported)return false;ctx.status=statusFor(ctx);notify(ctx);return true;
      }catch(e){notify(ctx);return false;}
    }
    async function resolve(index,alternative){
      const ctx=active;if(!ctx)return false;
      try{
        const resolved=await transaction(ctx,s=>{
          if(alternative>=0){
            const c=s.conflicts[alternative];if(!c||c.index!==index)throw new Error('stale-conflict');
            s.local[index]=copy(c.value);
          }
          s.conflicts=s.conflicts.filter(c=>c.index!==index);
        });
        if(!resolved)return false;ctx.status=statusFor(ctx);notify(ctx);return true;
      }catch(e){notify(ctx);return false;}
    }
    async function acceptRemote(ctx,row){
      const p=row?normalize(row.data):empty();
      return transaction(ctx,s=>{
        const m=merge(s.base,s.local,p);s.local=m.values;alternatives(s,m.conflicts);
        s.base=p;s.known=true;s.exists=!!row;s.stamp=row?.updated_at??null;
      });
    }
    async function sync(write=false){
      const ctx=active;if(!ctx||ctx.owner==='guest')return false;
      // Serialize this tab's fetches, while edits remain available during a network request.
      if(ctx.busy){await ctx.busy;return active===ctx?sync(write):false;}
      ctx.status='syncing';notify(ctx);
      ctx.busy=(async()=>{
        try{
          const row=await remote.read(ctx.owner);
          if(!await acceptRemote(ctx,row))return false;
          if(ctx.state.conflicts.length){ctx.status='conflict';return false;}
          if(write&&!equal(ctx.state.local,ctx.state.base)){
            const sent=copy(ctx.state.local),expected={exists:ctx.state.exists,stamp:ctx.state.stamp};
            const result=await remote.write(ctx.owner,sent,expected);
            if(active!==ctx)return false;
            if(!result){
              await acceptRemote(ctx,await remote.read(ctx.owner));
              ctx.status=ctx.state.conflicts.length?'conflict':'pending';return false;
            }
            await transaction(ctx,s=>{
              // Only this snapshot was acknowledged; edits made during the save stay pending.
              if(s.stamp===expected.stamp){s.base=sent;s.known=true;s.exists=true;s.stamp=result.updated_at;}
            });
          }
          ctx.status=statusFor(ctx);return ctx.status==='synced';
        }catch(e){ctx.status=ctx.storageError?'storage-error':'offline';return false;}
        finally{ctx.busy=null;notify(ctx);}
      })();
      return ctx.busy;
    }
    async function refresh(){
      const ctx=active;if(!ctx)return;
      try{await transaction(ctx,()=>{});ctx.status=statusFor(ctx);}
      catch(e){ctx.status='storage-error';}notify(ctx);
    }
    return {select,edit,importLegacy,importValues,resolve,load:()=>sync(false),save:()=>sync(true),snapshot,refresh,key};
  }
  return {create,normalize,merge};
});
