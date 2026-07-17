// 案A: unite-db レシオCSVを正本に LAB_SKILLS の数値(coeff/fixed/lvScale)を供給する変換器。
// 構造(行・名前・dmgType・hits・cd・「+」)は現行lab_data.jsを土台。
// 対応づけは「スロット内のわざの並び順 × 成分の並び順 × 強化(+)有無」（名前・値に非依存＝パッチ耐性／unite-dbの誤った技名にも非依存）。
//   - ユナイトわざ: unite-db側を平坦化（複数わざ→1ストリーム。ツールが1わざにまとめているため）
//   - 例外(メガニウム はなふぶきの+成分): unite-dbのenhanced構造が非互換のため現行値を保持
// 既定はドライラン（現行=オラクルとの差分検証）。書き込みは --apply。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

function parseCSV(text){
  const rows=[]; let i=0,f='',row=[],q=false;
  for(;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
    else { if(c==='"')q=true; else if(c===','){row.push(f);f='';} else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';} else if(c==='\r'){} else f+=c; } }
  if(f.length||row.length){row.push(f);rows.push(row);}
  return rows;
}
// シートの数値エクスポートが「1,040.」形式(カンマ区切り+末尾ドット)になることがあるためカンマを除去してから解釈
const num=v=>{ if(v===''||v==null) return 0; const n=parseFloat(String(v).replace(/,/g,'')); return isNaN(n)?0:n; };
const ALIAS={'ミュウツー(X)':'ミュウツーX','ミュウツー(Y)':'ミュウツーY'};
const norm=p=>ALIAS[p]||p;
const SLOT_T2U={'通常攻撃':'Basic','わざ1':'Move 1','わざ2':'Move 2','ユナイトわざ':'Unite Move'};
const KEEP_ENH=new Set(['メガニウム|はなふぶき']); // 強化成分は現行保持
// 分類(ダメージ/回復/シールド)の正本判定。unite-dbのeffect_labelを正とする。
const udbCat=l=>/Heal/i.test(l)?'回復':(/Shield/i.test(l)?'シールド':(/Damage/i.test(l)?'ダメージ':null));
const labCat=dt=>{dt=dt||'';return /回復/.test(dt)?'回復':(/シールド/.test(dt)?'シールド':(/ダメージ/.test(dt)?'ダメージ':null));};

// --- unite-db: udb[p][skill_slot] = [ {move,normal[],enhanced[]} ... ]（出現順）---
const csv=parseCSV(fs.readFileSync(path.join(ROOT,'data','unitedb_ratios.csv'),'utf8'));
const head=csv[0]; const col={}; head.forEach((h,i)=>col[h]=i);
const udb={};
for(let r=1;r<csv.length;r++){
  const row=csv[r];
  const rp=row[col['ratio_percent']], bv=row[col['base_value']], ls=row[col['level_scaling']];
  if(rp==='' && bv==='' && ls==='') continue;
  const p=norm(row[col['pokemon_ja']]);
  const slot=row[col['skill_slot']]; const move=row[col['move_ja']]; const comp=row[col['ratio_component']]||'';
  udb[p]=udb[p]||{}; udb[p][slot]=udb[p][slot]||[];
  let arr=udb[p][slot]; let mv=arr.length?arr[arr.length-1]:null;
  if(!mv || mv.move!==move){ mv={move, normal:[], enhanced:[]}; arr.push(mv); }
  (comp.startsWith('enhanced')?mv.enhanced:mv.normal).push({coeff:num(rp), lv:num(ls), fix:num(bv), label:row[col['effect_label']]||''});
}
// ユナイトわざ: 平坦化（全わざの normal/enhanced を1つに連結）
for(const p of Object.keys(udb)){
  const um=udb[p]['Unite Move'];
  if(um && um.length>1){
    const flat={move:'(flat)',normal:[],enhanced:[]};
    for(const m of um){ flat.normal.push(...m.normal); flat.enhanced.push(...m.enhanced); }
    udb[p]['Unite Move']=[flat];
  }
}

// --- ツール ---
const labSrc=fs.readFileSync(path.join(ROOT,'lab_data.js'),'utf8');
eval(labSrc.replace(/const LAB_/g,'globalThis.LAB_'));
const SK=globalThis.LAB_SKILLS;

function toolMoves(rows){
  const bySlot={};
  rows.forEach((row,idx)=>{
    if(row.coeff==null) return;
    const enh=/[+＋]$/.test(row.name); const base=row.name.replace(/[+＋]$/,'');
    bySlot[row.slot]=bySlot[row.slot]||[];
    let arr=bySlot[row.slot]; let mv=arr.length?arr[arr.length-1]:null;
    if(!mv || mv.base!==base){ mv={base, normalRows:[], enhRows:[]}; arr.push(mv); }
    (enh?mv.enhRows:mv.normalRows).push(idx);
  });
  return bySlot;
}

// --- 対応づけ：各ツール行 -> 採用値(udb or 現行保持) ---
let fromUdb=0, kept=0, diffN=0, catFix=0;
const diffs=[]; const catFixes=[];
const newVals={}; // p -> idx -> {coeff,lv,fix}
for(const p of Object.keys(SK)){
  newVals[p]={};
  const tm=toolMoves(SK[p]);
  for(const tslot of Object.keys(tm)){
    const umoves=udb[p]?.[SLOT_T2U[tslot]]||[];
    tm[tslot].forEach((tmv,mi)=>{
      const umv=umoves[mi];
      const keepEnh=KEEP_ENH.has(p+'|'+tmv.base);
      const handle=(list,kind)=>{
        list.forEach((ri,ci)=>{
          const row=SK[p][ri];
          let comp=null;
          if(umv && !(kind==='enh' && keepEnh)){
            comp = kind==='enh' ? (umv.enhanced[ci]||umv.normal[ci]||null) : (umv.normal[ci]||null);
          }
          const chosen = comp ? {coeff:comp.coeff,lv:comp.lv,fix:comp.fix} : {coeff:num(row.coeff),lv:num(row.lvScale),fix:num(row.fixed)};
          if(comp) fromUdb++; else kept++;
          // 分類(回復/シールド)の是正: unite-db効果ラベルがHealing/Shieldなのにlabがダメージのものだけ直す
          let dt=row.dmgType;
          if(comp){ const uc=udbCat(comp.label), lc=labCat(row.dmgType);
            if(uc && lc==='ダメージ' && uc!==lc){ dt=row.dmgType.replace(/ダメージ/, uc); if(dt!==row.dmgType){ catFix++; catFixes.push(`${p}/${row.name}: ${row.dmgType} → ${dt}`); } } }
          chosen.dt=dt;
          newVals[p][ri]=chosen;
          // オラクル比較
          if(!(num(row.coeff)===chosen.coeff && num(row.fixed)===chosen.fix && num(row.lvScale)===chosen.lv)){
            diffN++; diffs.push({p,slot:tslot,name:row.name,tool:[num(row.coeff),num(row.lvScale),num(row.fixed)],new:[chosen.coeff,chosen.lv,chosen.fix]});
          }
        });
      };
      handle(tmv.normalRows,'norm'); handle(tmv.enhRows,'enh');
    });
  }
}

console.log('=== 変換器検証（現行=オラクルと比較）===');
console.log('udb採用: '+fromUdb+' / 現行保持: '+kept+' / オラクルとの不一致: '+diffN+' / 分類是正: '+catFix);
if(diffs.length){ console.log('\n--- 不一致（要確認）---'); diffs.slice(0,60).forEach(d=>console.log(`  ${d.p}/${d.slot}/${d.name}  現=${d.tool.join(',')}  新=${d.new.join(',')}`)); }
if(catFixes.length){ console.log('\n--- 分類是正(回復/シールド) ---'); catFixes.forEach(x=>console.log('  '+x)); }

if(!APPLY){
  // ドライラン＝検証用途: 現行データ(=既知の正)を再現できるか。再生成前後の整合チェックに使う。
  console.log('\n(ドライラン。--apply で lab_data.js に書き込み)');
  process.exit(diffN===0?0:1);
}
// --apply＝再生成時の上書き用途: 値の差分(diffN)は「スプレッドシートのバグをunite-dbで是正」なので正常。
// 構造ドリフト（対応先なしの急増）だけ中止条件にする。
if(kept>10){ console.error('\nABORT: 対応先なしが多すぎ('+kept+')。わざ構造が変わった可能性。手動確認が必要'); process.exit(1); }
console.log('（値差分 '+diffN+' 件を unite-db 値で上書きします）');

// === 適用: coeff/fixed/lvScale を newVals で上書き ===
for(const p of Object.keys(SK)) for(const ri of Object.keys(newVals[p])){ const v=newVals[p][ri]; const row=SK[p][ri]; row.coeff=v.coeff; row.fixed=v.fix; row.lvScale=v.lv; if(v.dt!=null) row.dmgType=v.dt; }
// LAB_SKILLS 範囲を置換
const decl='const LAB_SKILLS='; const start=labSrc.indexOf(decl);
let i=labSrc.indexOf('{',start), depth=0, qq=null, end=-1;
for(;i<labSrc.length;i++){ const c=labSrc[i]; if(qq){ if(c==='\\'){i++;} else if(c===qq)qq=null; continue;} if(c==='"'||c==="'"||c==='`'){qq=c;continue;} if(c==='{')depth++; else if(c==='}'){depth--; if(depth===0){end=i+1;break;}} }
const updated=labSrc.slice(0,labSrc.indexOf('{',start))+JSON.stringify(SK)+labSrc.slice(end);
// 検証: 他フィールド不変
const g2={};(function(){const globalThis=g2;eval(labSrc.replace(/const LAB_/g,'globalThis.LAB_'));})();
const g3={};(function(){const globalThis=g3;eval(updated.replace(/const LAB_/g,'globalThis.LAB_'));})();
let bad=0;
for(const p of Object.keys(g2.LAB_SKILLS)) g2.LAB_SKILLS[p].forEach((o,k)=>{ const n=g3.LAB_SKILLS[p][k]; for(const key of Object.keys(o)){ if(['coeff','fixed','lvScale','dmgType'].includes(key))continue; if(JSON.stringify(o[key])!==JSON.stringify(n[key])){bad++;console.error('BAD '+p+'['+k+'].'+key);} }});
if(bad){ console.error('ABORT: 数値以外が変化'); process.exit(1); }
fs.writeFileSync(path.join(ROOT,'lab_data.js'), updated);
console.log('\nOK 適用完了（冪等チェック: 現行と同値を書き戻し。差分があればgitで確認可）');
