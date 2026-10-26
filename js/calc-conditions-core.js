// 計算条件だけを保存・共有する形式。名前・メモ・所有者・対戦記録は含めない。
const CalcConditionCodec=(()=>{
  const clone=v=>JSON.parse(JSON.stringify(v));
  const text=(v,max=80)=>typeof v==='string'&&v.length<=max;
  const number=(v,min,max,integer=false)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max&&(!integer||Number.isInteger(v));
  function equipment(e){
    if(!e||!Array.isArray(e.items)||e.items.length!==3||!e.items.every(i=>i&&text(i.name)&&number(i.grade,1,40,true)))throw Error('もちものの条件が不正です。');
    if(!Array.isArray(e.activeEffects)||e.activeEffects.length>15||!e.activeEffects.every(n=>text(n)))throw Error('発動条件が不正です。');
    if(!number(e.goalCount,0,6,true)||!number(e.koStack,0,20,true)||!number(e.dmgStack,0,4,true)||!['self','ally'].includes(e.healTarget))throw Error('スタック・回復対象が不正です。');
    if(!e.proc||!['TargetPct','SelfPct','HPDamage'].every(k=>e.proc[k]===null||number(e.proc[k],0,k==='HPDamage'?1e8:100)))throw Error('追加効果の入力が不正です。');
    return {items:e.items.map(i=>({name:i.name,grade:i.grade})),activeEffects:[...new Set(e.activeEffects)],goalCount:e.goalCount,koStack:e.koStack,dmgStack:e.dmgStack,healTarget:e.healTarget,proc:{TargetPct:e.proc.TargetPct,SelfPct:e.proc.SelfPct,HPDamage:e.proc.HPDamage}};
  }
  function sanitize(c){
    if(!c||c.schema!==1||!text(c.dataVersion,80)||!text(c.attacker)||!c.attacker||!text(c.defender)||!c.defender||!number(c.attackLevel,1,15,true)||!number(c.defendLevel,1,15,true))throw Error('未対応・破損した計算条件です。');
    if(!Array.isArray(c.skills)||c.skills.length!==2||!c.skills.every(s=>s&&text(s.name)&&text(s.upgrade,10)))throw Error('わざの条件が不正です。');
    const readMedal=m=>{
      if(m===null)return null;
      if(!m||!Array.isArray(m.slots)||m.slots.length!==10||!m.slots.every(n=>n===null||text(n))||!Array.isArray(m.rarities)||m.rarities.length!==10||!m.rarities.every(r=>['gold','silver','bronze','platinum'].includes(r)))throw Error('メダルの条件が不正です。');
      return {slots:[...m.slots],rarities:m.slots.map((name,i)=>typeof medalRarity==='function'?medalRarity(name,m.rarities[i]):m.rarities[i])};
    };
    const medal=readMedal(c.medal),defenseMedal=readMedal(c.defenseMedal===undefined?null:c.defenseMedal);
    return {schema:1,dataVersion:c.dataVersion,attacker:c.attacker,defender:c.defender,attackLevel:c.attackLevel,defendLevel:c.defendLevel,skills:c.skills.map(s=>({name:c.attacker==='ハッサム'?s.name.replace('ダブルウイング','バレットパンチ'):s.name,upgrade:s.upgrade})),medal,defenseMedal,attack:equipment(c.attack),defense:equipment(c.defense),baseline:c.baseline===null?null:equipment(c.baseline)};
  }
  function encode(c){const bytes=new TextEncoder().encode(JSON.stringify(sanitize(c)));if(bytes.length>12000)throw Error('共有する条件が大きすぎます。');return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
  function decode(s){if(typeof s!=='string'||s.length>16000||!/^[-_A-Za-z0-9]+$/.test(s))throw Error('共有リンクの形式が不正です。');return sanitize(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)))));}
  function fingerprint(data){let h=2166136261;for(const ch of JSON.stringify(data)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return 'data-'+(h>>>0).toString(16);}
  return {sanitize,equipment,encode,decode,fingerprint,clone};
})();
