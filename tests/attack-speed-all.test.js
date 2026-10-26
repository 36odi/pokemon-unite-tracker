// 取得時点の資料を期待値とし、全収録ポケモン・各レベル・選べる状態を検査する。
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../js/attack-speed-core'),rules=require('../data/attack-speed-rules.json'),data=require('../data/attack-speed-profiles.json'),review=require('../data/attack-speed-review.json'),fixture=require('./fixtures/attack-speed-all-20261027.json');
const x={};vm.runInNewContext(fs.readFileSync('lab_data.js','utf8')+';globalThis.status=LAB_STATUS',x);
let checks=0,cases=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const calc=(name,lv,bonus,stateId,effects)=>core.calculate({profile:data.profiles[name],lv,bonus,stateId,effects},rules);
eq(fs.readFileSync('data/attack-speed-profiles.json','utf8').replace(/\r\n/g,'\n'),require('../tools/build_attack_speed_profiles').build(),'profiles are reproducible');
eq(data.counts,{reference:98,fixed:3,unconfirmed:2},'scope is explicit');
eq(Object.keys(x.status).sort(),review.reviews.map(p=>p.name).sort(),'every name has an individual review');
for(const p of review.reviews){
 eq(p.sourceBase,fixture.currentBase[p.sourceName],p.name+' retained latest acquired base');
 eq(Array.from(x.status[p.name].attackSpeed),p.sourceBase,p.name+' all 15 levels match source');
 eq(p.evidence.basicSha256.length,64,p.name+' per-basic evidence fingerprint');
 eq(Boolean(p.review),true,p.name+' explicit exception review');
}
const value=(n,lv,state,effects,expected)=>eq(calc(n,lv,10,state,effects).modelExtra,expected,n+' selected bonuses');
value('ギルガルド',7,'sword',{change:'on'},30);value('ギルガルド',7,'shield',{change:'on'},-5);
value('バシャーモ',1,null,{},40);value('バシャーモ',5,null,{},0);value('バシャーモ',8,'punch',{},40);
eq(calc('ギャラドス',4,10).state,'fixed','actual Magikarp state fixed');
value('ギャラドス',4,'gyarados',{breath:'three'},90);
value('メガギャラドス',9,'mega',{breath:'one'},70);
value('ミュウツーY',9,'mega',{pressure:'10'},65);
value('ストリンダー',9,'poison',{punk:'5',gear:'on'},65);
value('ストリンダー',9,'electric',{punk:'5',gear:'on'},40);
value('アマージョ',5,null,{axel:'3'},30);value('アマージョ',15,null,{axel:'3'},75);
value('マッシブーン',9,null,{beast:'ko',lunge:'on'},80);
value('ウッウ',4,null,{hurricane:'on'},40);
value('カイリュー',13,null,{dance:'on',unite:'on'},115);
value('エースバーン',10,null,{kick:'on',unite:'on'},35);
value('エースバーン',11,null,{kick:'on',unite:'on',blaze:'on'},85);
value('ソウブレイズ',7,null,{second:'flame-charge'},30);
value('ドラパルト',9,'normal',{second:'phantom'},85);
value('オーダイル',9,null,{crunch:'on'},140);
for(const n of ['リザードン','メガリザードンX','メガリザードンY']){
 const r=calc(n,15,250);eq(r.state,'fixed',n+' fixed');eq(r.frames,undefined,n+' no invented fixed F');eq(core.graph(r,rules),null,n+' no threshold graph');
}
for(const [n,state,lv]of [['カイリュー','outrage',13],['カイリキー','bulk',4],['ジュラルドン','cannon',9],['ジュナイパー','razor',9],['アローラライチュウ','stored',9],['マリルリ','tail',9],['カメックス','spin',9],['ガブリアス','boosted',9],['ザシアン','sword',9]]){
 const r=calc(n,lv,100,state,{unite:'on'});eq(r.state,'excluded',n+' altered attack excluded');eq(r.frames,undefined,'no invented timing');eq(r.modelExtra,0,'no unavailable bonus ledger');
}
for(const n of ['サンダース','ブースター']){eq(calc(n,9,20).state,'unsupported','no automatic shared model');eq(calc(n,9,20,'shared-model').hypothetical,true,'explicit choice remains hypothetical');eq(calc(n,9,20,'shared-model').frames,52,'hypothetical worksheet result');}
eq(calc('アブソル',9,37.560000001).frames,44,'comparison does not round before crossing');
eq(calc('アブソル',9,37.559999999).frames,48,'comparison does not round before crossing');
eq(x.status['シャンデラ'].attackSpeed[5],13.14,'keep actual stats rather than worksheet zero');
eq(fixture.base.Chandelure[5],0,'known source disagreement recorded, not hidden');
eq(fixture.boosts[84].C85.value,'15.0','Machamp conflicting worksheet evidence');
// IFS値は独立した取得済みの原資料から。未確定帯の中は一致判定しない。
const f=require('./fixtures/attack-speed-calculator-20261026.json').formulas.B23;
const sheetStages=[...f.matchAll(/B18\s*>\s*([\d.]+),\s*(\d+)/g)].map(m=>[+m[1],+m[2]]);
assert(sheetStages.length>8,'independent workbook threshold expression');
for(const [name,p]of Object.entries(data.profiles))for(let lv=1;lv<=15;lv++){
 const r=core.resolve(p,lv);assert(r,name+' available default state at '+lv);
 for(const s of r.states){
  const valid=core.resolve(p,lv,s.id);const selections=[{},Object.fromEntries(valid.effects.map(e=>[e.id,e.options.at(-1).id]))];
  for(const e of valid.effects)for(const o of e.options)selections.push({[e.id]:o.id});
  for(const effects of selections){
   const base=x.status[name].attackSpeed[lv-1],v=calc(name,lv,base,s.id,effects);cases++;
   eq(Number.isFinite(v.bonus),true,name+' finite input');
   eq(v.resolved.state.id,s.id,'valid state retained');
   if(['common','model'].includes(s.kind)){
    eq(Math.abs(v.bonus-base-v.modelExtra)<1e-7,true,'selected bonus added exactly once');
    for(const e of v.resolved.effects)eq(Boolean(e.selected),true,'sanitized option exists');
   }else eq(v.frames,undefined,'excluded/fixed/unconfirmed no guessed frames');
   if(['reference','model'].includes(v.state)){
    const expected=sheetStages.find(([threshold])=>v.bonus>threshold)?.[1]??60;
    eq(v.frames,expected,'outside uncertain bands: matches acquired IFS sheet');
    eq(core.graph(v,rules).segments.length<=6,true,'bounded axis labels');
   }
  }
 }
}
console.log(`ALL PASS — ${checks} checks; ${cases} level/state/effect cases; source snapshots 103 × 15`);
