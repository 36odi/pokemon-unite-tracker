const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../js/attack-speed-core'),rules=require('../data/attack-speed-rules.json'),{profiles}=require('../data/attack-speed-profiles.json');
const fixture=require('./fixtures/attack-speed-calculator-20261026.json');
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
eq(fs.readFileSync(require.resolve('../js/attack-speed-data.js'),'utf8').replace(/\r\n/g,'\n'),require('../tools/build_attack_speed_data').build(),'file-compatible bundle matches both editable JSON sources');
const ref=profiles['アブソル'],calc=bonus=>core.calculate({bonus,profile:ref},rules);
// 原資料の明示例と公開計算表の比較演算子。段階表自身を期待値へ転用しない。
eq(calc(28.45).frames,48,'Mathcord prose example: 28.45% = 48F');
eq(calc(42.63).frames,44,'approved example, shared bonus 42.63%');
eq(calc(42.63).next.deltaMin,8.66,'51.29 - 42.63 = 8.66 percentage points');
eq(calc(42.63).seconds,44/60,'seconds at 60fps convention');
eq(calc(42.63).attacksPerSecond,60/44,'reference rate excludes boosted cycles');
eq(fixture.formulas.B23.includes('B18 > 37.56, 44'),true,'independent source uses strict >');
eq(calc(37.55999999).frames,48,'just below exact boundary');
eq(calc(37.56).frames,48,'exact equality stays in prior bucket');
eq(calc(37.56000001).frames,44,'unrounded input crosses boundary');
eq(calc(51.29).next.deltaMin,0,'zero distance still requires strict crossing');
eq(calc(0).frames,60,'zero is valid, not absent');
eq(calc(-.01).state,'outside','negative range not clamped to valid speed');
eq(calc(285.01).state,'outside','last row not assumed to be game cap');
for(const value of [8.1,8.105,8.11])eq(calc(value).candidates,[60,56],'uncertain first threshold including endpoints');
eq(calc(8.11000001).frames,56,'past full uncertainty band');
eq(calc(68.06).candidates,[40,36],'uncertainty preserved instead of sheet point estimate');
eq(calc(202.4).state,'boundary','sheet 202.4 does not erase original 202.04–202.50 range');
eq(calc(280).candidates,[20,16],'last boundary preserves wide uncertainty');
for(const bad of [undefined,null,NaN,Infinity,'42.63'])eq(calc(bad).state,'invalid','reject nonnumeric or missing bonus');
eq(core.calculate({bonus:42.63,profile:profiles['リザードン']},rules).state,'fixed','fixed animation not given generic model');
eq(core.calculate({bonus:42.63,profile:null},rules).state,'unsupported','unknown profile has no fallback');
eq(core.graph(calc(-1),rules),null,'no misleading plot outside source range');
for(const value of [0,8.1,10,16.42,28.45,42.63,68.06,70,120,160,210,280]){
  const chart=core.graph(calc(value),rules);
  eq(chart.fill>=0&&chart.fill<=100,true,'current marker inside visible axis');
  eq(Math.abs(chart.fill-100*(value-chart.min)/(chart.max-chart.min))<1e-8,true,'bar uses the true linear ratio');
  eq(chart.segments.length<=6,true,'bounded label density');
}
const context={};vm.runInNewContext(fs.readFileSync(require.resolve('../lab_data.js'),'utf8')+';globalThis.status=LAB_STATUS;',context);
eq(Object.keys(profiles).sort(),Object.keys(context.status).sort(),'all 103 Pokémon explicitly classified');
eq(Object.values(profiles).filter(p=>p.status==='reference').length,98,'individually reviewed reference scope');
eq(Object.values(profiles).filter(p=>p.status==='fixed').length,3,'fixed animation scope');
eq(Object.values(profiles).filter(p=>p.status==='unconfirmed').length,2,'two individual applications remain unconfirmed');
const dragonite=core.calculate({bonus:57.99,profile:profiles['カイリュー']},rules);
eq(dragonite.frames,40,'Dragonite Lv13 + Muscle/Scarf G40: 40F reference');
eq(dragonite.next.deltaMin,10.06,'Dragonite next boundary range, lower distance');
eq(dragonite.next.deltaMax,10.09,'Dragonite next boundary range, upper distance');
eq(core.calculate({bonus:82.99,profile:profiles['カイリュー']},rules).frames,36,'Scarf proc reference uses same verified stage rule');
let sourceDifferences=[];
for(const [name,p] of Object.entries(profiles))if(p.status==='reference'){
  const latest=require('./fixtures/attack-speed-all-20261027.json');
  eq(latest.base[p.sourceName].length,15,name+' is present in fetched source sheet');
  for(let lv=0;lv<15;lv++){
    const current=context.status[name].attackSpeed[lv];
    eq(Number.isFinite(current),true,name+' source input exists');
    if(current!==latest.base[p.sourceName][lv])sourceDifferences.push({name,level:lv+1,current,source:latest.base[p.sourceName][lv]});
  }
}
// 原資料の古い基礎値へ現行データを巻き戻さない。差分は可視の検証記録に残す。
fs.mkdirSync('work/attack-speed-implementation-20261026',{recursive:true});
fs.writeFileSync('work/attack-speed-implementation-20261026/source-comparison.json',JSON.stringify({sourceVersion:fixture.sourceVersion,currentBaseDifferences:sourceDifferences},null,2));
console.log(`ALL PASS — ${checks} attack speed core checks; ${sourceDifferences.length} source base differences recorded`);
