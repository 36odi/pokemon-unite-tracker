// No network. Verify counting, privacy boundaries, retries and JST rollover.
const assert=require('node:assert/strict');
const {create,jstDay,KEYS}=require('../js/usage-analytics');
const id='00000000-0000-4000-8000-000000000001';
let checks=0;
function equal(a,b,label){assert.deepEqual(a,b,label);checks++;}
function setup(extra={}){
  const values=new Map(),calls=[];
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const options={url:'https://example.invalid',key:'public-test-key',storage,now:()=>Date.parse('2026-10-05T14:59:59Z'),uuid:()=>id,isProduction:()=>true,isOnline:()=>true,
    fetch:async(url,init)=>{calls.push({url,init});return {ok:true,status:201};},...extra};
  return {tracker:create(options),values,calls,options};
}
(async()=>{
  equal(jstDay(Date.parse('2026-10-05T14:59:59Z')),'2026-10-05','before JST midnight');
  equal(jstDay(Date.parse('2026-10-05T15:00:00Z')),'2026-10-06','after JST midnight');
  const a=setup();
  await a.tracker.record();await a.tracker.record();
  equal(a.calls.length,1,'same day deduplicated');
  const init=a.calls[0].init;
  equal(JSON.parse(init.body),{browser_id:id},'only random browser ID sent');
  equal(init.headers,{apikey:'public-test-key','Content-Type':'application/json',Prefer:'return=minimal'},'no account bearer token or select');
  equal([init.credentials,init.referrerPolicy,init.cache],['omit','no-referrer','no-store'],'no cookies/referrer/cache');
  let time=Date.parse('2026-10-05T14:59:59Z'),resolve;
  const boundary=setup({now:()=>time,fetch:()=>new Promise(r=>{resolve=r;})});
  const pending=boundary.tracker.record();
  equal(await boundary.tracker.record(),false,'concurrent call suppressed');
  time+=2000;resolve({ok:true,status:201});await pending;
  equal(boundary.values.get(KEYS.day),'2026-10-05','response across midnight retains start day');
  const next=boundary.tracker.record();resolve({ok:true,status:201});await next;
  equal(boundary.values.get(KEYS.day),'2026-10-06','next day still sent');
  equal(boundary.values.get(KEYS.id),id,'identity retained across days');
  for(const [status,code,success] of [[409,'23505',true],[409,'23503',false],[401,'42501',false],[403,'42501',false],[500,'XX000',false]]){
    const b=setup({fetch:async()=>({ok:false,status,json:async()=>({code})})});
    equal(await b.tracker.record(),success,`${status}/${code} success classification`);
    equal(b.values.has(KEYS.day),success,`${status}/${code} saved-day classification`);
  }
  for(const key of [KEYS.off,KEYS.exclude]){
    const b=setup();b.values.set(key,'1');await b.tracker.record();equal(b.calls.length,0,key+' suppresses send');
  }
  for(const extra of [{isProduction:()=>false},{isOnline:()=>false},{storage:{getItem(){throw Error('blocked');}}},{storage:{getItem:()=>null,setItem:()=>{}}}]){
    const b=setup(extra);await b.tracker.record();equal(b.calls.length,0,'unavailable/excluded does not send');
  }
  let attempts=0;
  const retry=setup({fetch:async()=>{if(++attempts===1)throw Error('offline');return {ok:true};}});
  equal(await retry.tracker.record(),false,'network failure does not escape');
  equal(retry.values.has(KEYS.day),false,'failure does not mark success');
  equal(await retry.tracker.record(),true,'next action retries');
  let finish;
  const stop=setup({fetch:()=>new Promise(r=>finish=r)});
  const flight=stop.tracker.record();stop.tracker.stop(true);finish({ok:true});await flight;
  equal(stop.values.has(KEYS.day),false,'stopped in-flight result does not mark day');
  equal(await stop.tracker.record(),false,'stop persists');
  stop.tracker.stop(false);
  equal(stop.values.get(KEYS.id),id,'stop/re-enable does not rotate identity');
  console.log(`ALL PASS — ${checks} usage core checks; network requests: 0`);
})().catch(e=>{console.error(e);process.exitCode=1;});
