// ツールのレシオ行を unite-db CSV と照合し、不一致を種類別に分類
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function parseCSV(text){
  const rows=[]; let i=0,f='',row=[],q=false;
  for(;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
    else { if(c==='"')q=true; else if(c===','){row.push(f);f='';} else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';} else if(c==='\r'){} else f+=c; }
  }
  if(f.length||row.length){row.push(f);rows.push(row);}
  return rows;
}

const csv=parseCSV(fs.readFileSync(path.join(ROOT,'data','unitedb_ratios.csv'),'utf8'));
const head=csv[0]; const col={}; head.forEach((h,i)=>col[h]=i);
const ALIAS={'ミュウツー(X)':'ミュウツーX','ミュウツー(Y)':'ミュウツーY'};
const norm=p=>ALIAS[p]||p;
const STAT={'Atk':'攻撃','SpAtk':'特攻'};
// シートの数値エクスポートが「1,040.」形式(カンマ区切り+末尾ドット)になることがあるためカンマを除去してから解釈
const num=v=>{ if(v===''||v==null) return 0; const n=parseFloat(String(v).replace(/,/g,'')); return isNaN(n)?0:n; };

// CSV候補: pokemon -> [{stat,coeff,lv,fix,move}]
const db={},sourceComponents={};
for(let r=1;r<csv.length;r++){
  const row=csv[r];
  const rp=row[col['ratio_percent']], bv=row[col['base_value']], ls=row[col['level_scaling']];
  if(rp==='' && bv==='' && ls==='') continue;
  const p=norm(row[col['pokemon_ja']]);
  sourceComponents[['pokemon_en','skill_slot','move_en','source_object','ratio_component'].map(k=>row[col[k]]).join('|')]={stat:STAT[row[col['stat_type']]]||row[col['stat_type']]||'',coeff:num(rp),lv:num(ls),fix:num(bv)};
  (db[p]=db[p]||[]).push({stat:STAT[row[col['stat_type']]]||row[col['stat_type']]||'', coeff:num(rp), lv:num(ls), fix:num(bv), move:row[col['move_ja']]});
}

const lab=fs.readFileSync(path.join(ROOT,'lab_data.js'),'utf8').replace(/const LAB_/g,'globalThis.LAB_');
eval(lab);

let okN=0, total=0,derivedN=0;
const narrativeRules=new Map(require('../data/lab-reviewed-narratives.json').map(r=>[r.sourceKey,r]));
const {csv:parseRecords,key:sourceKey,hasEvidence}=require('./lab-data-utils');
const sourceRecords=new Map(parseRecords(fs.readFileSync(path.join(ROOT,'data','unitedb_ratios.csv'),'utf8')).map(s=>[sourceKey(s),s]));
const catB=[], catC=[], catBC=[], catE=[]; // B=lvScaleのみ, C=fixedのみ, BC=lv&fix, E=不明
const seen=new Set();
for(const p of Object.keys(globalThis.LAB_SKILLS)){
  const cand=db[p]||[];
  for(const r of (globalThis.LAB_SKILLS[p]||[])){
    if(r.coeff==null) continue;
    total++;
    const tc=num(r.coeff), tl=num(r.lvScale), tf=num(r.fixed), ts=r.stat||'';
    if(r.narrativeKey){
      const sk=r.narrativeKey.split('|').slice(0,5).join('|'),rule=narrativeRules.get(sk),s=sourceRecords.get(sk),n=rule?.numeric;
      if(n&&s&&hasEvidence(s,rule.evidence)&&JSON.stringify([tc,tl,tf,ts])===JSON.stringify([n.coeff,n.lvScale,n.fixed,n.coeff?'HP':''])){okN++;derivedN++;continue;}
      catE.push({p,name:r.name,key:'文章中の式・原文との不一致'});continue;
    }
    if(r.derivedFrom){
      const s=sourceComponents[r.derivedFrom.sourceKey],f=r.derivedFrom.factor;
      if(s&&ts===s.stat&&[tc-s.coeff*f,tl-s.lv*f,tf-s.fix*f].every(n=>Math.abs(n)<1e-7)){okN++;derivedN++;continue;}
      catE.push({p,name:r.name,key:'導出元・倍率との不一致'});continue;
    }
    if(cand.some(c=>c.stat===ts&&c.coeff===tc&&c.lv===tl&&c.fix===tf)){ okN++; continue; }
    // 重複(+)を集約: ポケ+わざ名(末尾+除去)+coeff+fixed
    const baseName=r.name.replace(/\+$/,'');
    const dk=p+'|'+baseName+'|'+tc+'|'+tf+'|'+tl;
    if(seen.has(dk)) continue; seen.add(dk);
    // coeff一致候補
    const cc=cand.filter(c=>c.coeff===tc&&c.stat===ts);
    const lvOnly=cc.find(c=>c.fix===tf&&c.lv!==tl);
    const fixOnly=cc.find(c=>c.lv===tl&&c.fix!==tf);
    const both=cc.find(c=>c.lv!==tl&&c.fix!==tf);
    if(lvOnly) catB.push({p,name:baseName,coeff:tc,fix:tf,toolLv:tl,dbLv:lvOnly.lv});
    else if(fixOnly) catC.push({p,name:baseName,coeff:tc,lv:tl,toolFix:tf,dbFix:fixOnly.fix});
    else if(both) catBC.push({p,name:baseName,coeff:tc,toolLv:tl,toolFix:tf,dbLv:both.lv,dbFix:both.fix});
    else catE.push({p,name:baseName,key:ts+'|'+tc+'|'+tl+'|'+tf});
  }
}

console.log('ツール側レシオ行(ダメージ系): '+total+' / 完全一致: '+okN);
console.log('うち出典の式と明記倍率からの導出: '+derivedN);
console.log('--- 不一致の分類（+重複は集約） ---');
console.log('B: lvScaleのみ違い  = '+catB.length);
console.log('C: fixedのみ違い    = '+catC.length);
console.log('BC: lv&fix両方違い  = '+catBC.length);
console.log('E: 同coeff候補なし  = '+catE.length);
console.log('\n=== B: lvScaleのみ違い（'+catB.length+'）===');
for(const x of catB) console.log(`  ${x.p} / ${x.name} (coeff=${x.coeff},fixed=${x.fix})  tool lvScale=${x.toolLv} -> db=${x.dbLv}`);
console.log('\n=== C: fixedのみ違い（'+catC.length+'）===');
for(const x of catC) console.log(`  ${x.p} / ${x.name} (coeff=${x.coeff},lv=${x.lv})  tool fixed=${x.toolFix} -> db=${x.dbFix}`);
console.log('\n=== BC: lv&fix両方（'+catBC.length+'）===');
for(const x of catBC) console.log(`  ${x.p} / ${x.name} (coeff=${x.coeff})  tool(lv${x.toolLv},fix${x.toolFix}) -> db(lv${x.dbLv},fix${x.dbFix})`);
console.log('\n=== E: 同coeff候補なし（'+catE.length+'）===');
for(const x of catE) console.log(`  ${x.p} / ${x.name}  tool=${x.key}`);
if(catB.length||catC.length||catBC.length||catE.length)process.exitCode=1;
