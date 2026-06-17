// 多段わざ追加成分の lvScale を unite-db CSV 準拠に修正
// 既定はドライラン。実適用は: node tools/fix_ratios_lvscale.js --apply
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

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
const num=v=>{ if(v===''||v==null) return 0; const n=parseFloat(v); return isNaN(n)?0:n; };
const STAT={'Atk':'攻撃','SpAtk':'特攻'};
const ALIAS={'ミュウツー(X)':'ミュウツーX','ミュウツー(Y)':'ミュウツーY'};
const norm=p=>ALIAS[p]||p;

// --- CSV: key(pokemon|stat|coeff|fixed) -> Set(lvScale) ---
const csv=parseCSV(fs.readFileSync(path.join(ROOT,'data','unitedb_ratios.csv'),'utf8'));
const head=csv[0]; const col={}; head.forEach((h,i)=>col[h]=i);
const map={};
for(let r=1;r<csv.length;r++){
  const row=csv[r];
  const rp=row[col['ratio_percent']], bv=row[col['base_value']], ls=row[col['level_scaling']];
  if(rp==='' && bv==='' && ls==='') continue;
  const p=norm(row[col['pokemon_ja']]);
  const stat=STAT[row[col['stat_type']]]||row[col['stat_type']]||'';
  const key=p+'|'+stat+'|'+num(rp)+'|'+num(bv);
  (map[key]=map[key]||new Set()).add(num(ls));
}

// --- ツール lab_data.js 読み込み + LAB_SKILLS の境界特定 ---
const file=path.join(ROOT,'lab_data.js');
const src=fs.readFileSync(file,'utf8');
eval(src.replace(/const LAB_/g,'globalThis.LAB_'));
const SK=globalThis.LAB_SKILLS;

// --- 変更計画 ---
const plan=[]; const ambiguous=[]; const noMatch=[];
for(const p of Object.keys(SK)){
  SK[p].forEach((row,idx)=>{
    if(row.coeff==null) return;
    const key=p+'|'+(row.stat||'')+'|'+num(row.coeff)+'|'+num(row.fixed);
    const set=map[key];
    if(!set){ noMatch.push({p,idx,name:row.name,coeff:row.coeff,fixed:row.fixed,lv:row.lvScale}); return; }
    if(set.size>1){ ambiguous.push({p,idx,name:row.name,coeff:row.coeff,fixed:row.fixed,lv:row.lvScale,cands:[...set]}); return; }
    const target=[...set][0];
    if(num(row.lvScale)!==target){ plan.push({p,idx,name:row.name,coeff:row.coeff,fixed:row.fixed,from:row.lvScale,to:target}); }
  });
}

console.log('=== ドライラン結果 ===');
console.log('変更予定: '+plan.length+' 行 / 曖昧(複数候補): '+ambiguous.length+' / CSV非対応: '+noMatch.length);
console.log('');
if(ambiguous.length){
  console.log('--- 曖昧（同一coeff+fixedにlvScale複数。自動修正しない）---');
  for(const a of ambiguous) console.log(`  ${a.p}/${a.name} coeff=${a.coeff} fixed=${a.fixed} 現lv=${a.lv} 候補=${a.cands.join(',')}`);
  console.log('');
}
if(noMatch.length){
  console.log('--- CSV非対応（修正対象外。要確認）---');
  for(const n of noMatch) console.log(`  ${n.p}/${n.name} stat空? coeff=${n.coeff} fixed=${n.fixed} lv=${n.lv}`);
  console.log('');
}
console.log('--- 変更予定の先頭40件 ---');
plan.slice(0,40).forEach(x=>console.log(`  ${x.p}/${x.name} (coeff=${x.coeff},fixed=${x.fixed})  lvScale ${x.from} -> ${x.to}`));
if(plan.length>40) console.log('  ... 他 '+(plan.length-40)+' 件');

// 曖昧ケースのうち、手動で確定したオーバーライド（生データで個別確認済み）
// バンギラス げんしのちから: (74,140)が2行。1つ目=base(lv3で正)、2つ目=add2成分(lv3->0)
const OVERRIDES=[{p:'バンギラス',slot:'わざ2',name:'げんしのちから',coeff:74,fixed:140,occurrence:2,to:0}];
console.log('\n--- 手動オーバーライド '+OVERRIDES.length+'件 ---');
for(const ov of OVERRIDES) console.log(`  ${ov.p}/${ov.name} (coeff=${ov.coeff},fixed=${ov.fixed}) ${ov.occurrence}番目 -> lvScale=${ov.to}`);

if(!APPLY){ console.log('\n(ドライラン。--apply で適用)'); process.exit(0); }

// === 適用 ===
// LAB_SKILLS の文字列範囲を特定（const LAB_SKILLS={ ... }; ）
const decl='const LAB_SKILLS=';
const start=src.indexOf(decl);
let i=src.indexOf('{',start), depth=0, q=null, end=-1;
for(;i<src.length;i++){
  const c=src[i];
  if(q){ if(c==='\\'){i++;} else if(c===q)q=null; continue; }
  if(c==='"'||c==="'"||c==='`'){ q=c; continue; }
  if(c==='{')depth++;
  else if(c==='}'){ depth--; if(depth===0){ end=i+1; break; } }
}
if(end<0){ console.error('ABORT: LAB_SKILLS範囲特定失敗'); process.exit(1); }

// 計画を適用（メモリ上のSK）
for(const x of plan){ SK[x.p][x.idx].lvScale = x.to; }
// オーバーライド適用（occurrence番目の一致行）
let ovApplied=0;
for(const ov of OVERRIDES){
  let seen=0;
  for(const r of (SK[ov.p]||[])){
    if(r.slot===ov.slot && r.name===ov.name && Number(r.coeff)===ov.coeff && Number(r.fixed)===ov.fixed){
      seen++;
      if(seen===ov.occurrence){ if(r.lvScale!==ov.to){ r.lvScale=ov.to; ovApplied++; } break; }
    }
  }
}
const expectChanged=plan.length+ovApplied;
const newJson=JSON.stringify(SK);
const updated=src.slice(0,src.indexOf('{',start))+newJson+src.slice(end);

// 検証: 新ファイルをevalし、lvScale以外が不変か全行比較
const before=JSON.parse(JSON.stringify(SK)); // 適用後の期待値
// 旧オブジェクトを再取得するため元srcを別名前空間でeval
const g2={}; (function(){ const globalThis=g2; eval(src.replace(/const LAB_/g,'globalThis.LAB_')); })();
const g3={}; (function(){ const globalThis=g3; eval(updated.replace(/const LAB_/g,'globalThis.LAB_')); })();
const OLD=g2.LAB_SKILLS, NEW=g3.LAB_SKILLS;
let changed=0, bad=0;
const okPokes=Object.keys(OLD).length===Object.keys(NEW).length;
if(!okPokes){ console.error('ABORT: ポケモン数不一致'); process.exit(1); }
for(const p of Object.keys(OLD)){
  if(OLD[p].length!==NEW[p].length){ console.error('ABORT: 行数不一致 '+p); process.exit(1); }
  for(let k=0;k<OLD[p].length;k++){
    const o=OLD[p][k], n=NEW[p][k];
    for(const key of Object.keys(o)){
      if(key==='lvScale'){ if(o[key]!==n[key]) changed++; continue; }
      if(JSON.stringify(o[key])!==JSON.stringify(n[key])){ bad++; console.error('  BAD field '+p+'['+k+'].'+key+': '+o[key]+' -> '+n[key]); }
    }
  }
}
if(bad>0){ console.error('ABORT: lvScale以外が'+bad+'件変化'); process.exit(1); }
if(changed!==expectChanged){ console.error('ABORT: 変更数不一致 actual='+changed+' 期待='+expectChanged); process.exit(1); }

fs.writeFileSync(file, updated);
console.log('\nOK 適用完了: lvScale '+changed+'件のみ変更（自動'+plan.length+'+手動'+ovApplied+'） / 他フィールド・行数・ポケ数 不変');
