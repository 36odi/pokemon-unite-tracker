// 正本CSVの全数値特性、計算分類、固定値を検証。空欄の特性を0として追加しない。
const fs=require('node:fs'),assert=require('node:assert/strict');
const F=new Function(fs.readFileSync('js/lab-core.js','utf8')+';return {labEffectKind,labEffectUnit,labRawValue}')();
const K=new Function(fs.readFileSync('lab_data.js','utf8')+';return LAB_SKILLS')();
const text=fs.readFileSync('data/unitedb_ratios.csv','utf8');let rows=[],row=[],field='',q=false;
for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(q&&text[i+1]==='"'){field+='"';i++;}else q=!q;}
  else if(!q&&(c===','||c==='\n')){row.push(field);field='';if(c==='\n'){rows.push(row);row=[];}}
  else if(c!=='\r')field+=c;}
if(field||row.length){row.push(field);rows.push(row);}const header=rows.shift();
const source=rows.map(r=>Object.fromEntries(header.map((k,i)=>[k,r[i]])));
const numeric=r=>['ratio_percent','base_value','level_scaling'].some(k=>r[k]!=='');
const passives=source.filter(r=>r.skill_slot==='Passive'&&numeric(r));
const key=r=>[r.pokemon_en,r.skill_slot,r.move_en,r.source_object,r.ratio_component].join('|');
let checks=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
eq(passives.length,43,'source contains 43 numeric passive rows');
eq(new Set(passives.map(r=>r.pokemon_ja)).size,31,'31 Pokemon have numeric passive ratios in source');
for(const s of passives){
  const matches=K[s.pokemon_ja].filter(r=>r.sourceKey===key(s)&&r.slot==='特性');
  eq(matches.length,1,'exactly one component: '+key(s));const r=matches[0];
  eq([r.coeff,r.fixed,r.lvScale],[s.ratio_percent,s.base_value,s.level_scaling].map(v=>Number(String(v||0).replaceAll(',',''))),'source numbers: '+key(s));
}
const before=JSON.stringify(K);require('../tools/lab_passive_ratios')(K,source);
eq(JSON.stringify(K),before,'regeneration does not duplicate or change existing rows');
const revised=source.map(r=>r.pokemon_en==='Eldegoss'&&r.skill_slot==='Passive'&&r.ratio_component==='add1'?{...r,base_value:'166.'}:r);
const copy=JSON.parse(before);require('../tools/lab_passive_ratios')(copy,revised);
eq(copy['ワタシラガ'].find(r=>r.sourceKey?.endsWith('Cotton Down|rsb|add1')).fixed,166,'source update refreshes added passive numbers');
const stats={HP:6000,攻撃:300,特攻:400};
const pick=(p,n,d)=>K[p].find(r=>r.name===n&&(!d||r.dmgType===d));
const cases=[
  ['ヌメルゴン','りゅうのはどう','回復','heal',94],
  ['ヌメルゴン','ぬめぬめ','継続回復（1回あたり）','heal',74],
  ['ワタシラガ','わたげ','回復（反撃時）','heal',425],
  ['ルカリオ','ふくつのこころ','シールド','shield',1200],
  ['ダダリン','はがねつかい','シールド','shield',1080],
  ['ギルガルド','バトルスイッチ','防御上昇 - シールドフォルム','stat',280],
  ['イワパレス','がんじょう','防御・特防の上昇量（1段階あたり・最大10段階）','stat',22],
  ['マンムー','あついしぼう','防御・特防の上昇量（1段階あたり・最大3段階）','stat',100],
  ['ジュナイパー','はっぱカッター','攻撃速度 - % 増加','stat',48],
  ['パルキア','プレッシャー','回復','heal',245],
  ['パーモット','てつのこぶし','回復','heal',372],
  ['マッシブーン','きゅうけつ','回復 - 与ダメージ割合 (ヒットごと)','rate',80],
  ['マホイップ','ふわふわハッピーシャワー','最大HP増加 - per クリーム','stat',80],
];
for(const [p,n,d,kind,value] of cases){const r=pick(p,n,d);assert.ok(r,p+'/'+n+'/'+d);eq(F.labEffectKind(r),kind,'correct type '+p+'/'+n);eq(F.labRawValue(r,stats,9),value,'hand-calculated value '+p+'/'+n);}
eq(F.labEffectUnit(pick('ジュナイパー','はっぱカッター','攻撃速度 - % 増加')),'%','speed is a percent');
eq(F.labEffectUnit(pick('ギルガルド','バトルスイッチ')),'','flat defense is not percent');
eq(F.labEffectUnit(pick('マッシブーン','きゅうけつ','回復 - 与ダメージ割合 (ヒットごと)')),'%','damage-based recovery is a ratio, not HP');
for(const [p,n,h] of [['サーナイト','シンクロ',4],['ファイヤー','ほのおのからだ',8],['バンギラス','こんじょう',7],['サンダー','せいでんき',5]])eq(pick(p,n).hits,h,'source hit count '+p);
console.log('ALL PASS — '+checks+' ratio effect checks');
