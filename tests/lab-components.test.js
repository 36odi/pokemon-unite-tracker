// 数値が一致するだけでなく、正本にある全成分が存在することを独立に確認する。
const fs=require('node:fs'),assert=require('node:assert/strict');
const text=fs.readFileSync('data/unitedb_ratios.csv','utf8');let q=false,f='',row=[],rows=[];
for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(q&&text[i+1]==='"'){f+='"';i++;}else q=!q;}else if(!q&&(c===','||c==='\n')){row.push(f);f='';if(c==='\n'){rows.push(row);row=[];}}else if(c!=='\r')f+=c;}
if(f||row.length){row.push(f);rows.push(row);}const header=rows.shift(),source=rows.map(r=>Object.fromEntries(header.map((h,i)=>[h,r[i]])));
const {K,raw,unit}=new Function(fs.readFileSync('lab_data.js','utf8')+fs.readFileSync('js/lab-core.js','utf8')+';return {K:LAB_SKILLS,raw:labRawValue,unit:labEffectUnit}')();
const num=v=>Number(String(v||0).replaceAll(',','')),numeric=s=>['ratio_percent','base_value','level_scaling'].some(k=>s[k]!==''),key=s=>[s.pokemon_en,s.skill_slot,s.move_en,s.source_object,s.ratio_component].join('|');
const norm=s=>s.normalize('NFKC').replace(/[+＋]$/,'').replace('大顎クラッシュバイド','大顎クラッシュバイト'),poke=s=>s.replace('ミュウツー(X)','ミュウツーX').replace('ミュウツー(Y)','ミュウツーY');
const slots={'Passive':'特性','Basic':'通常攻撃','Move 1':'わざ1','Move 2':'わざ2','Unite Move':'ユナイトわざ'};
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const tuple=s=>[s.stat_type==='SpAtk'?'特攻':s.stat_type==='Atk'?'攻撃':s.stat_type,num(s.ratio_percent),num(s.level_scaling),num(s.base_value)];
for(const s of source.filter(numeric)){
 const p=poke(s.pokemon_ja),slot=p==='レシラム'&&/^Move [12]$/.test(s.skill_slot)?slots[s.skill_slot==='Move 1'?'Move 2':'Move 1']:slots[s.skill_slot];
 const peers=K[p].filter(r=>r.slot===slot&&(['Basic','Unite Move'].includes(s.skill_slot)||norm(r.name)===norm(s.move_ja))&&!r.derivedFrom);
 eq(peers.some(r=>r.sourceKey===key(s)||JSON.stringify([r.stat,r.coeff,r.lvScale||0,r.fixed||0])===JSON.stringify(tuple(s))),true,'source component exists: '+key(s));
}
const supplements=Object.values(K).flat().filter(r=>r.supplement),derived=supplements.filter(r=>r.derivedFrom);
eq(supplements.filter(r=>r.supplement==='numeric').length,99,'98 basic components including same-formula conditions plus Yveltal upgrade');
eq(derived.length,79,'reviewed conditional formulas expanded to base and plus');
eq(supplements.filter(r=>r.supplement==='conditional').length,21,'reviewed conditional formula notes');
for(const [p,m] of [['イワパレス','ステルスロック'],['ネギガナイト','れんぞくぎり']])for(const r of K[p].filter(r=>r.name.startsWith(m)&&r.coeff!=null&&r.componentNote))eq(r.hits,1,'do not multiply first-hit value into a false total');
for(const r of derived){const s=source.find(s=>key(s)===r.derivedFrom.sourceKey&&numeric(s)),factor=r.derivedFrom.factor;eq([r.coeff,r.lvScale,r.fixed],tuple(s).slice(1).map(v=>Math.round(v*factor*1e8)/1e8),'derived formula: '+r.derivedKey);eq(r.hits,1,'alternative hit formula is not automatically multiplied');}
const syl=K['ニンフィア'].filter(r=>r.derivedFrom&&r.name.startsWith('マジカルフレイム'));
eq(syl.map(r=>r.name),['マジカルフレイム','マジカルフレイム+'],'both Sylveon variants');eq(syl.map(r=>[r.coeff,r.lvScale,r.fixed]),[[22.4,3.64,134.96],[22.4,3.64,134.96]],'28 percent of initial formula');eq(raw(syl[0],{特攻:400},10),257,'hand calculation per later flame');
eq(K['ハッサム'].some(r=>/ダブルウイング|グリーンスターダイブ/.test(r.name)),false,'Scizor old names removed');eq(K['ハッサム'].some(r=>r.name==='バレットパンチ'&&r.derivedFrom),true,'Scizor subsequent punch');eq(K['ハッサム'].some(r=>r.name==='レッドスターダイブ'),true,'Scizor correct unite name');
eq(K['イベルタル'].find(r=>r.name==='デスウイング+').upg,'11','Yveltal actual upgrade level');
const up=new Function('LAB_SKILLS',fs.readFileSync('index.html','utf8').match(/function labUpgradeRows\([\s\S]*?\n}\r?\n/)[0]+';return labUpgradeRows')(K);
const petal=up('メガニウム','はなふぶき+','13').filter(r=>r.derivedFrom&&r.dmgType.startsWith('回復'));
eq(petal.map(r=>[r.coeff,r.fixed]),[[10.65,11]],'upgraded repeated healing replaces old healing instead of inheriting both');
eq(unit(K['ガブリアス'].find(r=>r.supplement&&r.effectKind==='stat')),'%','attack speed unit');
const original=JSON.stringify(K),apply=(K,S)=>{require('../tools/lab_component_supplements')(K,S);require('../tools/lab_reference_updates')(K,S,{additions:true});};apply(K,source);eq(JSON.stringify(K),original,'supplement generation is idempotent');
const missing=JSON.parse(original);for(const p of Object.keys(missing))missing[p]=missing[p].filter(r=>!r.supplement);apply(missing,source);eq(JSON.stringify(missing),original,'regeneration restores all missing components');
const changed=source.map(s=>s.pokemon_en==='Sylveon'&&s.move_en==='Mystical Fire'&&s.ratio_component==='base'?{...s,true_description:'Source changed'}:s);assert.throws(()=>apply(JSON.parse(original),changed),/要再確認/);checks++;
console.log('ALL PASS — '+checks+' component coverage and derivation checks');
