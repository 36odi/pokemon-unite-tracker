/* Minimal daily browser counting. Never use the authenticated Supabase client. */
(function(root){
  'use strict';
  const KEYS={id:'usage_browser_id',day:'usage_sent_day',off:'usage_disabled',exclude:'usage_excluded'};
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function jstDay(time){
    const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));
    return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
  }
  function create(options){
    const {storage,fetch:send,now,uuid,isProduction,isOnline}=options;
    let pending=null,controller=null,generation=0;
    function allowed(){
      try{return isProduction()&&storage.getItem(KEYS.off)!=='1'&&storage.getItem(KEYS.exclude)!=='1';}catch{return false;}
    }
    function stop(disabled){
      generation++;
      if(controller) controller.abort();
      try{storage.setItem(KEYS.off,disabled?'1':'0');return true;}catch{return false;}
    }
    async function record(){
      try{
        if(!allowed()||!isOnline())return false;
        const day=jstDay(now());
        if(storage.getItem(KEYS.day)===day)return true;
        if(pending)return false;
        let id=storage.getItem(KEYS.id);
        if(!UUID.test(id||'')){
          id=uuid();
          if(!UUID.test(id))return false;
          storage.setItem(KEYS.id,id);
        }
        // If storage cannot retain the identity, do not create new visitors on every load.
        if(storage.getItem(KEYS.id)!==id)return false;
        const ownGeneration=generation;
        controller=new AbortController();
        const signal=controller.signal;
        const timeout=setTimeout(()=>controller?.abort(),10000);
        pending=(async()=>{
          try{
            const response=await send(options.url+'/rest/v1/usage_browser_days',{
              method:'POST',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal,
              headers:{apikey:options.key,'Content-Type':'application/json',Prefer:'return=minimal'},
              body:JSON.stringify({browser_id:id})
            });
            let success=response.ok;
            if(!success&&response.status===409){
              const error=await response.json();
              success=error.code==='23505';
            }
            if(success&&generation===ownGeneration&&allowed())storage.setItem(KEYS.day,day);
            return success;
          }catch{return false;}
          finally{clearTimeout(timeout);}
        })();
        return await pending;
      }catch{return false;}
    }
    // Serialize attempts without letting a concurrent call clear the in-flight request.
    let busy=false;
    async function startRecord(){
      if(busy)return false;
      busy=true;
      try{return await record();}finally{pending=null;controller=null;busy=false;}
    }
    return {record:startRecord,stop,allowed};
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={create,jstDay,KEYS};return;}
  let tracker=null,active=null,epoch=0;
  const signatures=new Map(),rangeChanges=new WeakMap();
  function enabled(){try{return localStorage.getItem(KEYS.off)!=='1';}catch{return false;}}
  function intent(scope){
    if(!active||active.failed||!enabled())return null;
    if(scope&&!active.path.includes(document.getElementById(scope)))return null;
    return active;
  }
  function used(ticket){if(ticket&&!ticket.failed&&ticket.epoch===epoch&&enabled())void tracker?.record();}
  ['click','change','input'].forEach(type=>document.addEventListener(type,event=>{
    if(!event.isTrusted)return;
    const ticket={target:event.target,path:event.composedPath(),type,failed:false,epoch};active=ticket;
    setTimeout(()=>{if(active===ticket)active=null;},0);
  },true));
  window.addEventListener('error',()=>{if(active)active.failed=true;});
  document.addEventListener('change',event=>{
    if(event.isTrusted&&rangeChanges.get(event.target)){rangeChanges.delete(event.target);used(intent());}
  });
  window.addEventListener('storage',event=>{
    if(event.key===KEYS.off||event.key===KEYS.exclude){
      epoch++;
      if(!enabled()||event.newValue==='1')tracker?.stop(!enabled());
      root.UniteUsage.syncSettings();
    }
  });
  root.UniteUsage={
    start(url,key){
      tracker=create({url,key,storage:localStorage,fetch:window.fetch.bind(window),now:()=>Date.now(),uuid:()=>crypto.randomUUID(),
        isProduction:()=>location.origin==='https://36odi.github.io'&&location.pathname.startsWith('/pokemon-unite-tracker/'),
        isOnline:()=>navigator.onLine!==false});
    },
    intent,used,
    result(scope,signature,key=scope){
      const changed=signatures.get(key)!==signature;signatures.set(key,signature);
      const ticket=intent(scope);
      if(!changed||!ticket)return;
      if(ticket.type==='input'){
        if(ticket.target.type==='range')rangeChanges.set(ticket.target,true);
      }else used(ticket);
    },
    setEnabled(value){
      epoch++;
      const saved=tracker?.stop(!value);
      this.syncSettings();
      const message=document.getElementById('usageSettingsMessage');
      if(message)message.textContent=saved?'設定を保存しました。': '設定を保存できませんでした。このブラウザの保存設定をご確認ください。';
    },
    syncSettings(){
      const checkbox=document.getElementById('usageEnabled');if(checkbox)checkbox.checked=enabled();
    }
  };
})(globalThis);
