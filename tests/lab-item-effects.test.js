// 発動式から手計算した値。時間シミュレーションや画面の実装をコピーしない。
const fs=require('node:fs'),assert=require('node:assert/strict');
const F=new Function(fs.readFileSync('js/lab-core.js','utf8')+';return {labItemProcValues,LAB_PROC_ITEM_EFFECTS}')();
const stats={HP:10000,攻撃:400,特攻:600},targetStats={HP:20000,防御:600,特防:600};
const calc=(name,grade=20,extra={})=>F.labItemProcValues({items:[{name,grade}],activeEffects:[name],stats,lv:9,targetStats,targetHP:10000,selfHP:2000,hpDamage:1000,...extra});
let checks=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
// G1 / G10 / G20の発動量。防御・特防600でダメージは半減して切り捨て。
const expected={
  'ちからのハチマキ':[100,200,300], 'こだわりメガネ':[220,260,300],
  'するどいツメ':[170,195,220], 'じゅうてんチャーム':[220,270,320],
  'ピントレンズ':[180,240,300], 'ゴツゴツメット':[190,220,250],
  'かいがらのすず':[290,365,440], 'きあいのハチマキ':[480,720,960],
  'たべのこし':[200,300,400], 'いやしのかんむり':[90,120,150],
  'さきがけベル':[600,800,1000], 'とつげきチョッキ':[1000,1500,2000],
  'おたすけバリア':[1500,2000,2500], 'きょうめいガード':[460,580,700],
  'ゴールサポーター':[635,948,1270],
};
eq(Object.keys(F.LAB_PROC_ITEM_EFFECTS).length,15,'15 supported proc items');
for(const [name,tiers] of Object.entries(expected))for(const [grade,tier] of [[1,0],[9,0],[10,1],[19,1],[20,2],[30,2],[40,2]]){
  const r=calc(name,grade)[0];eq(r.value,tiers[tier],name+' G'+grade);
  if(r.kind==='damage')eq(r.actual,Math.floor(tiers[tier]/2),'defense: '+name+' G'+grade);
  if(r.ally!==undefined)eq(r.ally,r.value,'same HP reference for ally: '+name);
}
eq(calc('ちからのハチマキ',1,{targetHP:20000})[0].value,120,'G1 enemy player cap');
eq(calc('ちからのハチマキ',10,{targetHP:20000})[0].value,240,'G10 cap');
eq(calc('ちからのハチマキ',20,{targetHP:20000})[0].value,360,'G20 cap');
eq(calc('ちからのハチマキ',20,{targetHP:0})[0].actual,0,'zero is not minimum 1 damage');
eq(calc('ちからのハチマキ',20,{targetHP:null})[0].value,undefined,'missing target HP is unknown');
eq(calc('ちからのハチマキ',20,{targetHP:-1})[0].value,undefined,'invalid target HP');
eq(calc('いやしのかんむり',20,{hpDamage:null})[0].value,undefined,'no guessed damage');
eq(calc('いやしのかんむり',20,{hpDamage:1001})[0].value,150,'crown rounding');
eq(calc('きあいのハチマキ',20,{selfHP:2500})[0].value,undefined,'25 percent does not trigger');
eq(calc('きあいのハチマキ',20,{selfHP:2499})[0].value,900,'missing HP at proc moment');
eq(calc('きあいのハチマキ',20,{selfHP:null})[0].value,undefined,'missing self HP');
eq(calc('きあいのハチマキ',20,{selfHP:0})[0].value,undefined,'KO cannot trigger recovery');
eq(calc('ゴールサポーター',20,{lv:1})[0].value,1030,'Lv1 shield');
eq(calc('ゴールサポーター',20,{lv:15})[0].value,1450,'Lv15 shield');
eq(calc('こだわりメガネ',20,{stats:{...stats,特攻:603}})[0].value,301,'raw floors fractional scaling');
eq(calc('たべのこし',20,{activeEffects:[]}),[],'OFF omits proc');
eq(calc('たべのこし',20,{items:[]}),[],'unequipped ignored');
eq(calc('たべのこし',20,{items:[{name:'たべのこし',grade:1},{name:'たべのこし',grade:40}]})[0].value,200,'duplicate first slot only');
const equip=(name,bonus)=>[{name,grade:20},{name:bonus,grade:20}];
eq(calc('かいがらのすず',20,{items:equip('かいがらのすず','おおきなねっこ')})[0].value,528,'root self recovery');
eq(calc('おたすけバリア',20,{items:equip('おたすけバリア','レスキューフード')})[0].ally,3075,'hood ally shield');
eq(calc('おたすけバリア',20,{items:equip('おたすけバリア','レスキューフード')})[0].value,2500,'hood excludes self');
eq(calc('とつげきチョッキ',20,{items:equip('とつげきチョッキ','おおきなねっこ')})[0].value,2000,'root excludes shield');
eq(calc('かいがらのすず',20,{items:equip('かいがらのすず','レスキューフード')})[0].value,440,'item healing is self even with hood');
eq(calc('こだわりメガネ',20,{items:equip('こだわりメガネ','すりぬけスプーン')})[0].actual,162,'spoon only special procs: floor(300*600/1110)');
eq(calc('するどいツメ',20,{items:equip('するどいツメ','すりぬけスプーン')})[0].actual,110,'spoon excludes physical');
eq(calc('するどいツメ',20,{items:equip('するどいツメ','エナジーアンプ'),activeEffects:['するどいツメ','エナジーアンプ']})[0].actual,133,'amp after mitigation');
eq(calc('かいがらのすず',20,{items:equip('かいがらのすず','エナジーアンプ'),activeEffects:['かいがらのすず','エナジーアンプ']})[0].value,440,'amp excludes healing');
eq(calc('こだわりメガネ',20,{targetStats:null})[0].actual,undefined,'stats screen no invented mitigation');
console.log('ALL PASS — '+checks+' item proc checks');
