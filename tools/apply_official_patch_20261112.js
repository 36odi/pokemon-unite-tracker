#!/usr/bin/env node
// 2026-11-12 公式告知のバランス調整を、正本CSV・説明原稿・詳細補足・攻撃速度データへ直接反映する。
// unite-db／正本シートの更新停止により正確な数値が入手できないための措置（ユーザー許可済み）。
// 内容と根拠は data/lab-official-patch-20261112.json、経緯は docs/lab-patch-20261112.md。
// 既定はドライラン。--apply で書き込む。各項目は「旧値→更新／新値→適用済み／それ以外→全体を中止」。
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const ROOT=path.join(__dirname,'..');
const spec=require('../data/lab-official-patch-20261112.json');
const APPLY=process.argv.includes('--apply');
const p=f=>path.join(ROOT,f);
const conflicts=[];const done=[];const pending=[];

// ---- 正本CSV（往復で同一バイトになる読み書き） ----
function parseCSV(t){const rows=[];const qs=[];let i=0,f='',row=[],rq=[],q=false,quoted=false;
 for(;i<t.length;i++){const c=t[i];
  if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}
  else{if(c==='"'){q=true;quoted=true;}else if(c===','){row.push(f);rq.push(quoted);f='';quoted=false;}
   else if(c==='\n'){row.push(f);rq.push(quoted);rows.push(row);qs.push(rq);row=[];rq=[];f='';quoted=false;}
   else if(c==='\r'){}else f+=c;}}
 if(f.length||row.length){row.push(f);rq.push(quoted);rows.push(row);qs.push(rq);}
 return {rows,qs,crlf:t.includes('\r\n'),trailingNL:t.endsWith('\n')};}
function serCSV({rows,qs,crlf,trailingNL}){const nl=crlf?'\r\n':'\n';
 return rows.map((r,ri)=>r.map((v,ci)=>qs[ri][ci]?'"'+v.replace(/"/g,'""')+'"':v).join(',')).join(nl)+(trailingNL?nl:'');}
const csvPath=p('data/unitedb_ratios.csv');
const csvText=fs.readFileSync(csvPath,'utf8');
const csv=parseCSV(csvText);
if(serCSV(csv)!==csvText)throw Error('正本CSVの往復が一致しません。読み書き処理を確認してください。');
const H=csv.rows[0];const C=Object.fromEntries(H.map((k,i)=>[k,i]));
const num=v=>{if(v===''||v==null)return 0;const n=Number(String(v).replace(/,/g,''));if(!Number.isFinite(n))throw Error('数値でない値: '+v);return n;};
// CSVの表記：整数は「180.」（1000以上は桁区切り）、小数はそのまま
const fmt=n=>Number.isInteger(n)?n.toLocaleString('en-US')+'.':String(n);
const statJa={SpAtk:'特攻',Atk:'攻撃'};
const formulaEn=(r,stat,lv,b)=>`${r}% ${stat}`+(lv?` + ${lv} * (Level - 1)`:'')+(b?` + ${b}`:'');
const formulaJa=(r,stat,lv,b)=>`${statJa[stat]} x ${r}%`+(lv?` + ${lv} x (レベル - 1)`:'')+(b?` + ${b}`:'');
const rowKey=x=>[x[C.pokemon_en],x[C.skill_slot],x[C.move_en],x[C.source_object],x[C.ratio_component]].join('|');
let csvChanged=false;
for(const e of spec.ratioRows){
 const hits=csv.rows.filter((x,i)=>i>0&&rowKey(x)===e.key);
 if(hits.length!==1){conflicts.push(`CSV行が${hits.length}件: ${e.key}`);continue;}
 const x=hits[0];const cur=[num(x[C.ratio_percent]),num(x[C.base_value]),num(x[C.level_scaling])];
 const stat=x[C.stat_type].trim();
 if(JSON.stringify(cur)===JSON.stringify(e.after)){done.push('CSV '+e.key);continue;}
 if(JSON.stringify(cur)!==JSON.stringify(e.before)){conflicts.push(`CSV値が想定外: ${e.key} 現在=${cur}`);continue;}
 const [r0,b0,l0]=e.before;
 if(x[C.formula_en]!==formulaEn(r0,stat,l0,b0)||x[C.formula_ja]!==formulaJa(r0,stat,l0,b0)){conflicts.push(`式テキストの書式が想定外: ${e.key}`);continue;}
 const [r,b,l]=e.after;
 x[C.ratio_percent]=fmt(r);x[C.base_value]=fmt(b);x[C.level_scaling]=fmt(l);
 x[C.formula_en]=formulaEn(r,stat,l,b);x[C.formula_ja]=formulaJa(r,stat,l,b);
 csvChanged=true;pending.push(`CSV ${e.key}: ${e.before} → ${e.after}`);
}
for(const e of spec.cooldowns){
 const hits=csv.rows.filter((x,i)=>i>0&&x[C.pokemon_en]===e.pokemon_en&&x[C.skill_slot]===e.skill_slot&&x[C.move_en]===e.move_en);
 if(!hits.length){conflicts.push('CD対象のCSV行なし: '+e.move_en);continue;}
 const vals=[...new Set(hits.map(x=>x[C.cooldown]))];
 if(vals.length===1&&num(vals[0])===e.after){done.push(`CSV CD ${e.move_en}`);continue;}
 if(vals.length!==1||num(vals[0])!==e.before){conflicts.push(`CSVのCDが想定外: ${e.move_en} 現在=${vals}`);continue;}
 for(const x of hits)x[C.cooldown]=String(e.after);
 csvChanged=true;pending.push(`CSV CD ${e.move_en}(${hits.length}行): ${e.before} → ${e.after}`);
}
const newCsvText=csvChanged?serCSV(csv):csvText;

// ---- JSON（2スペース整形・末尾改行で往復一致を確認して使う） ----
const jsonCache=new Map();
function loadJSON(f){if(!jsonCache.has(f)){const t=fs.readFileSync(p(f),'utf8');const j=JSON.parse(t);
 if(JSON.stringify(j,null,2)+'\n'!==t)throw Error('JSONの整形が想定外: '+f);jsonCache.set(f,{j,changed:false});}return jsonCache.get(f);}
const getIn=(o,dp)=>dp.split('.').reduce((a,k)=>a==null?a:a[k],o);
const setIn=(o,dp,v)=>{const ks=dp.split('.');const last=ks.pop();ks.reduce((a,k)=>a[k],o)[last]=v;};

// 原文メタデータ：ヤドランのCD（＋版は基本CDを表示する出典規則のため同値）
const meta=loadJSON('data/lab-reference-metadata.json');
for(const e of spec.cooldowns){
 const mv=meta.j.pokemon[e.metaPokemon]?.moves.find(m=>m.slot===e.skill_slot&&m.sourceName===e.move_en);
 if(!mv){conflicts.push('メタデータのわざなし: '+e.move_en);continue;}
 if(mv.cd===e.after&&mv.plusCD===e.after){done.push('メタデータCD '+e.move_en);continue;}
 if(mv.cd!==e.before||mv.plusCD!==e.before||mv.plusCDMode!=='source-base'){conflicts.push(`メタデータCDが想定外: ${e.move_en} cd=${mv.cd} plusCD=${mv.plusCD} mode=${mv.plusCDMode}`);continue;}
 mv.cd=e.after;mv.plusCD=e.after;meta.changed=true;pending.push(`メタデータCD ${e.move_en}: ${e.before} → ${e.after}`);
}
for(const e of spec.jsonEdits){
 const doc=loadJSON(e.file);
 const arr=e.array?doc.j[e.array]:e.path?e.path.reduce((a,k)=>a[k],doc.j):doc.j;
 if(!Array.isArray(arr)){conflicts.push('配列でない: '+e.file);continue;}
 const hits=arr.filter(o=>Object.entries(e.match).every(([k,v])=>o[k]===v));
 const label=`${e.file} ${JSON.stringify(e.match)}`;
 if(hits.length!==1){conflicts.push(`${hits.length}件一致: ${label}`);continue;}
 const o=hits[0];let changed=false,ok=true;
 for(const [field,[from,to]] of Object.entries(e.replaceIn||{})){
  const s=getIn(o,field);
  if(typeof s!=='string'){conflicts.push(`文字列でない: ${label}.${field}`);ok=false;continue;}
  const nf=s.split(from).length-1,nt=s.split(to).length-1;
  if(nf===0&&nt>=1)continue;
  if(nf!==1){conflicts.push(`置換元が${nf}件: ${label}.${field}`);ok=false;continue;}
  setIn(o,field,s.replace(from,to));changed=true;
 }
 for(const [field,[from,to]] of Object.entries(e.set||{})){
  const v=getIn(o,field);
  if(v===to)continue;
  if(v!==from){conflicts.push(`値が想定外: ${label}.${field}=${v}`);ok=false;continue;}
  setIn(o,field,to);changed=true;
 }
 if(!ok)continue;
 if(changed){doc.changed=true;pending.push('JSON '+label);}else done.push('JSON '+label);
}
// 正本CSVのハッシュを固定している入力（原文メタデータ・詳細補足）を更新する。
// 直接編集したCSVを生成器が受け付けるため。詳細補足は該当わざの記載を本ツールで更新・確認済み。
const newHash=crypto.createHash('sha256').update(newCsvText).digest('hex');
const oldHash=crypto.createHash('sha256').update(csvText).digest('hex');
for(const f of ['data/lab-reference-metadata.json','data/lab-detail-notes.json']){
 const doc=loadJSON(f);
 if(doc.j.meta.ratioSha256===newHash){done.push(f+' ratioSha256');continue;}
 // 反映前の正本CSV（2026-10-22同期）または今回の読み込み時点のCSVのハッシュなら更新対象
 if(![oldHash,spec.meta.originalRatioSha256].includes(doc.j.meta.ratioSha256)){conflicts.push(f+' のCSVハッシュが反映前・現行のどちらとも一致しません');continue;}
 doc.j.meta.ratioSha256=newHash;doc.changed=true;pending.push(f+' ratioSha256 → '+newHash.slice(0,12)+'…');
}

// ---- テキスト原稿 ----
const textCache=new Map();
for(const e of spec.textEdits){
 if(!textCache.has(e.file))textCache.set(e.file,{t:fs.readFileSync(p(e.file),'utf8'),changed:false});
 const doc=textCache.get(e.file);
 const nf=doc.t.split(e.find).length-1,nt=doc.t.split(e.replace).length-1;
 const appendOnly=e.replace.startsWith(e.find); // 追記型は置換後に置換前が含まれるため、置換後の有無で判定
 if(appendOnly?nt===1:(nf===0&&nt===1)){done.push('TEXT '+e.file+' '+e.find.slice(0,24));continue;}
 if(nf!==1){conflicts.push(`置換元が${nf}件: ${e.file} ${e.find.slice(0,30)}`);continue;}
 doc.t=doc.t.replace(e.find,e.replace);doc.changed=true;pending.push('TEXT '+e.file+' '+e.find.slice(0,24));
}

console.log(JSON.stringify({mode:APPLY?'apply':'dry-run',pending:pending.length,alreadyApplied:done.length,conflicts},null,1));
pending.forEach(s=>console.log('  更新: '+s));
if(conflicts.length){console.error('想定外の状態があるため、何も書き込みません。');process.exit(1);}
if(!APPLY){console.log(pending.length?'（ドライラン。--apply で書き込み）':'変更なし（適用済み）');process.exit(0);}
if(csvChanged)fs.writeFileSync(csvPath,newCsvText);
for(const [f,doc] of jsonCache)if(doc.changed)fs.writeFileSync(p(f),JSON.stringify(doc.j,null,2)+'\n');
for(const [f,doc] of textCache)if(doc.changed)fs.writeFileSync(p(f),doc.t);
console.log('書き込み完了');
