// 第2段階: 符号・単位・レアリティと、旧保存/共有の互換性。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),gen=read('gen_lab_data.js').replace(/\r\n/g,'\n').replace(/^#![^\n]*\n/,'');
const take=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const map=html.match(/const LAB_STAT_MAP=\{[\s\S]*?\n\};/)[0];
const app=new Function(read('js/constants.js')+read('js/utils.js')+read('lab_data.js')+read('js/lab-core.js')+read('js/calc-conditions-core.js')+map+
  "const LAB_STAT_ORDER=['HP','攻撃','防御','特攻','特防','移動速度'];let labMedalPresets=[];"+
  take('function labMedalGetVal(', '// ---- ステータス計算用メダル補正 ----')+
  take('function labCalcMedalBonus(', '// ステータス計算のメダルセット選択')+
  take('function _presetToObj(', 'function labLoadMedalPresets(')+
  ';return {medals:LAB_MEDALS,sets:LAB_MEDAL_SETS,items:LAB_ITEMS,status:LAB_STATUS,computeStats,computeStatsDetailed,labCalcMedalBonus,labMedalGetVal,labMedalRaritiesFor,parseMedalSet,medalSetDetail,codec:CalcConditionCodec,LAB_STAT_MAP};')();
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const deps={status:app.status,itemStats:app.items,statMap:app.LAB_STAT_MAP,medalBonus:(_idx,base)=>app.labCalcMedalBonus(null,base,preset)};
let preset=null;
const base=app.computeStats({poke:'アブソル',lv:9},deps);
eq(base['待ち時間'],20,'Absol Lv9 base cooldown reduction');
eq(app.computeStats({poke:'アブソル',lv:9,items:[{name:'アクセルリスト',grade:30}]},deps)['待ち時間'],23,'G30 reduction adds 3 percentage points');
eq(app.computeStats({poke:'アブソル',lv:9,items:[{name:'アクセルリスト',grade:40}]},deps)['待ち時間'],23.5,'G40 remains distinct');
for(const [name,grades]of Object.entries(app.items))for(let i=0;i<40;i++){
  const actual=app.computeStats({poke:'アブソル',lv:9,items:[{name,grade:i+1}]},deps);
  for(const [raw,value]of Object.entries(grades[i])){
    const key=app.LAB_STAT_MAP[raw]||raw;
    eq(actual[key==='ユナイトわざゲージ'?key+'（もちもの）':key],Math.round(((base[key]||0)+(key==='待ち時間'?-value:value))*1e8)/1e8,name+' G'+(i+1)+' '+key);
  }
}
for(const m of app.medals)for(const rarity of app.labMedalRaritiesFor(m)){
  const raw=rarity==='bronze'?'b':rarity==='silver'?'s':'g';
  for(const [dir,field]of [['up','Up'],['dn','Dn']])eq(app.labMedalGetVal(m,rarity,dir),m[raw+field],m.name+' '+rarity+' '+dir);
}
for(const name of ['ニャース','ペルシアン','カモネギ'])eq(app.medals.find(m=>m.name===name).gUp,0.6,name+' gold crit percentage points');
const ten=(names,rarity='gold')=>({slots:[...names,...Array(10-names.length).fill(null)],rarities:Array(10).fill(rarity)});
preset=ten(['ミュウツー','ミュウ','セレビィ',...app.medals.filter(m=>m.c1==='ブラック'||m.c2==='ブラック').slice(0,7).map(m=>m.name)]);
const cdr=app.computeStats({poke:'アブソル',lv:9,medalPresetIdx:0,items:[{name:'アクセルリスト',grade:30},{name:'エナジーアンプ',grade:30},{name:'かいがらのすず',grade:30}]},deps);
eq(cdr['待ち時間'],37.8,'base + items + individual medals + seven black; additive');
eq(app.labCalcMedalBonus(null,{HP:5000},ten(['ニャース','ニャース','ニャース'])).HP||0,0,'duplicate colors count only once');
const navyNames=app.medals.filter(m=>m.c1==='ネイビー'||m.c2==='ネイビー').map(m=>m.name);
for(const [count,value]of [[3,1],[5,2],[7,4]])eq(app.labCalcMedalBonus(null,{},ten(navyNames.slice(0,count)))['ユナイトわざゲージ'],value,'navy '+count+' gives positive energy gain');
preset=ten(navyNames.slice(0,5));
const gauge=app.computeStats({poke:'アブソル',lv:9,medalPresetIdx:0,items:[{name:'エナジーアンプ',grade:30}]},deps);
eq(gauge['ユナイトわざゲージ'],undefined,'unverified combined gauge bonus is not calculated');
eq([gauge['ユナイトわざゲージ（もちもの）'],gauge['ユナイトわざゲージ（メダル）']],[6,2],'both independently verified gauge bonuses retained');
const pla=app.medals.filter(m=>m.note?.includes('プラチナのみ'));
eq(pla.length,6,'six confirmed platinum-only emblems');
for(const m of pla){
  eq(app.labMedalRaritiesFor(m),['platinum'],m.name+' available rarity');
  for(const old of ['bronze','silver','gold','platinum']){
    const before=ten([m.name],old),json=JSON.stringify(before),normalized=app.parseMedalSet(before);
    eq(normalized.rarities[0],'platinum',m.name+' legacy '+old+' restored as platinum');
    eq(app.labMedalGetVal(m,old,'up'),m.gUp,'old stat preserved');
    eq(JSON.stringify(before),json,'source save is not mutated');
    eq(app.medalSetDetail(before).includes('プラチナ'),true,'record displays actual rarity');
  }
}
eq(app.labMedalGetVal({name:'不足値',bUp:null,sUp:2,gUp:3},'bronze','up'),null,'no rarity fallback for unknown missing values');
// 生成スクリプトのメダル部分を、保存した原本CSVに対して単独評価。本体は実行しない。
const prelude=gen.slice(0,gen.indexOf('// ========================\n// sheet2'));
const start=gen.indexOf('const medalRows ='),end=gen.indexOf('// ========================\n// JS出力');
const medalSection=gen.slice(start,end).replace('readCSV(`${TMP}/sheet1_medal.csv`)','readCSV(medalCsv)');
const csv=path.join(root,'tests/fixtures/lab-medals-source-20261026.csv');
const rebuilt=new Function('require','__dirname','medalCsv',prelude+medalSection+';return {medals:LAB_MEDALS,sets:LAB_MEDAL_SETS};')(
  require('node:module').createRequire(path.join(root,'gen_lab_data.js')),root,csv);
eq(rebuilt.medals,app.medals,'all 257 medals survive CSV regeneration with corrections');
eq(rebuilt.sets,app.sets,'all set tiers survive CSV regeneration with corrections');
const corrected=JSON.stringify(rebuilt);require('../tools/normalize_lab_medals').applyMedalCorrections(rebuilt.medals,rebuilt.sets);eq(JSON.stringify(rebuilt),corrected,'corrections are idempotent');
const versionFn=read('js/calc-conditions.js').match(/function version\(\)\{.*\}/)[0];
function version(sets,rule){return new Function('CalcConditionCodec','LAB_MEDAL_SETS','LAB_CALCULATION_VERSION',read('lab_data.js').replace(/^const LAB_MEDAL_SETS=.*;$/m,'')+read('js/lab-core.js').replace(/^const LAB_CALCULATION_VERSION=.*;$/m,'')+'let cachedVersion=null;'+versionFn+';return version();')(app.codec,sets,rule);}
const versionNow=version(app.sets,'test-rule-1'),changed=structuredClone(app.sets);changed['ネイビー'][0].val=9;
assert.notEqual(version(changed,'test-rule-1'),versionNow);checks++;
assert.notEqual(version(app.sets,'test-rule-2'),versionNow);checks++;
const equipment={items:Array.from({length:3},()=>({name:'',grade:30})),activeEffects:[],goalCount:0,koStack:0,dmgStack:0,healTarget:'self',proc:{TargetPct:null,SelfPct:null,HPDamage:null}};
for(const rarity of ['bronze','silver','gold','platinum']){
  const condition={schema:1,dataVersion:'old-data-version',attacker:'アブソル',defender:'カビゴン',attackLevel:9,defendLevel:9,skills:[{name:'',upgrade:''},{name:'',upgrade:''}],medal:ten(['ニャオハ'],rarity),attack:equipment,defense:equipment,baseline:null};
  const restored=app.codec.decode(app.codec.encode(condition));eq(restored.medal.rarities[0],'platinum','legacy/new link restored');eq(restored.dataVersion,'old-data-version','old fingerprint retained for mismatch notice');
  const originalOldLink=Buffer.from(JSON.stringify(condition),'utf8').toString('base64url');
  eq(app.codec.decode(originalOldLink).medal.rarities[0],'platinum','actual old payload without new encoder remains readable');
}
console.log('ALL PASS — '+checks+' medal/cooldown/version checks; no full data generation or real DB writes');
