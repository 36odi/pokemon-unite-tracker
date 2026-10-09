// 計算例は出典の式から手計算。ブラウザに依存せず補正の順序・端数・対象を検証。
const fs=require('node:fs'),assert=require('node:assert/strict');
const core=fs.readFileSync('js/lab-core.js','utf8');
const F=new Function(core+';return {computeStats,labRawValue,labSupportMultiplier,labItemDamageMultiplier,dcCalcActual}')();
const items=JSON.parse(fs.readFileSync('data/held-item-stats.json','utf8')).items;
const deps={status:{fixture:{hp:[1000],atk:[100],def:[100],spatk:[200],spdef:[200],ms:[4000]}},itemStats:items,
  pctItems:{'ものしりメガネ':{stat:'特攻',tiers:[3,5,7]}},
  dmgStackItems:{'じゃくてんほけん':{stat:'攻撃',tiers:[1.5,2,2.5],maxStacks:4}},
  goalItems:{'もうこうダンベル':{stat:'攻撃',tiers:[6,9,12]}}};
const calc=(equipment,extra={})=>F.computeStats({poke:'fixture',lv:1,items:equipment.map(([name,grade])=>({name,grade})),...extra},deps);
let checks=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
for(const [grade,flat,pct] of [[1,2,12],[9,10,12],[10,10,20],[19,20,20],[20,20,28],[30,30,28],[40,35,28]]){
  eq(calc([['ふんばりベルト',grade]]).防御,100+flat,'OFF keeps flat bonus G'+grade);
  eq(calc([['ふんばりベルト',grade]],{activeEffects:['ふんばりベルト']}).防御,Math.round((100+flat)*(1+pct/100)*1e8)/1e8,'ON includes item flat G'+grade);
}
eq(calc([],{activeEffects:['ふんばりベルト']}).防御,100,'unequipped effect ignored');
eq(calc([['ふんばりベルト',30],['ふんばりベルト',30]],{activeEffects:['ふんばりベルト']}).防御,166.4,'duplicate does not stack');
eq(calc([['ものしりメガネ',30]]).特攻,255.73,'wise glasses multiplies flat bonus');
eq(calc([['じゃくてんほけん',30],['もうこうダンベル',30]],{dmgStack:4,goalCount:6}).攻撃,225.5,'weakness includes flat goal bonuses: (100+15+18+72)*1.1');
eq(calc([['じゃくてんほけん',30],['もうこうダンベル',30]],{dmgStack:99,goalCount:99}).攻撃,225.5,'stack limits');
deps.medalBonus=(i,b)=>({防御:20+(b.防御||0)*.08});
eq(calc([['ふんばりベルト',30]],{activeEffects:['ふんばりベルト'],medalPresetIdx:0}).防御,200,'(100+30+20)*1.28+100*.08');
eq(calc([['れんだスカーフ',40]],{activeEffects:['れんだスカーフ']})['通常攻撃の速さ'],35.5,'attack speed adds percentage points');
eq(F.labRawValue({stat:'攻撃',coeff:125,fixed:0},{攻撃:101},1),126,'raw damage floors 126.25');
eq(F.dcCalcActual(300,250),211,'Unite-DB defense example');
eq(F.dcCalcActual(300,250,0,0,.35),137,'Unite-DB reduction example');
eq(F.labSupportMultiplier([{name:'レスキューフード',grade:20}],true,'self'),1,'hood excludes self');
eq(F.labSupportMultiplier([{name:'レスキューフード',grade:20}],true,'ally'),1.23,'hood current ally recovery');
eq(F.labSupportMultiplier([{name:'レスキューフード',grade:20}],false,'ally'),1.23,'hood ally shield');
eq(F.labSupportMultiplier([{name:'おおきなねっこ',grade:20}],false,'self'),1,'root excludes shields');
eq(F.labSupportMultiplier([{name:'おおきなねっこ',grade:20}],true,'ally'),1,'root excludes ally');
eq(F.labSupportMultiplier([{name:'おおきなねっこ',grade:20}],true,'self'),1.2,'root self healing');
eq(F.labItemDamageMultiplier([{name:'エナジーアンプ',grade:20}],[]),1,'amp OFF');
eq(F.labItemDamageMultiplier([{name:'エナジーアンプ',grade:20}],['エナジーアンプ']),1.21,'amp ON');
const actual=new Function(fs.readFileSync('lab_data.js','utf8')+';return LAB_ITEMS')();
eq(actual,items,'production item data equals audited source data');
eq(items['がくしゅうそうち'][29].HP,360,'Exp Share current G30 HP');
eq(items['エナジーアンプ'][39]['待ち時間'],-5.25,'G40 precision');
eq(items['するどいツメ'][39]['急所率'],2.35,'G40 crit precision');
console.log('ALL PASS — '+checks+' lab effect checks');
