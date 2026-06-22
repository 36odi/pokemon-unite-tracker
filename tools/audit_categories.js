// 監査専用(読み取りのみ): build_skills_from_unitedb.js と同じ対応づけで、
// 各ツール行の「分類(ダメージ/回復/シールド)」と「ステータス種別」を unite-db と突き合わせ、
// 係数一致の簡易照合ではなく正確な対応で不整合を検出する。書き込みは一切しない。
const fs=require('fs'); const path=require('path');
const ROOT=path.join(__dirname,'..');
function parseCSV(text){const rows=[];let i=0,f='',row=[],q=false;for(;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}else{if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c==='\r'){}else f+=c;}}if(f.length||row.length){row.push(f);rows.push(row);}return rows;}
const num=v=>{if(v===''||v==null)return 0;const n=parseFloat(v);return isNaN(n)?0:n;};
const ALIAS={'ミュウツー(X)':'ミュウツーX','ミュウツー(Y)':'ミュウツーY'};
const norm=p=>ALIAS[p]||p;
const SLOT_T2U={'通常攻撃':'Basic','わざ1':'Move 1','わざ2':'Move 2','ユナイトわざ':'Unite Move'};
const KEEP_ENH=new Set(['メガニウム|はなふぶき']);

const csv=parseCSV(fs.readFileSync(path.join(ROOT,'data','unitedb_ratios.csv'),'utf8'));
const head=csv[0];const col={};head.forEach((h,i)=>col[h]=i);
const udb={};
for(let r=1;r<csv.length;r++){
  const row=csv[r];
  const rp=row[col['ratio_percent']],bv=row[col['base_value']],ls=row[col['level_scaling']];
  if(rp===''&&bv===''&&ls==='')continue;
  const p=norm(row[col['pokemon_ja']]);
  const slot=row[col['skill_slot']];const move=row[col['move_ja']];const comp=row[col['ratio_component']]||'';
  const label=row[col['effect_label']]||'';const stat=row[col['stat_type']]||'';
  udb[p]=udb[p]||{};udb[p][slot]=udb[p][slot]||[];
  let arr=udb[p][slot];let mv=arr.length?arr[arr.length-1]:null;
  if(!mv||mv.move!==move){mv={move,normal:[],enhanced:[]};arr.push(mv);}
  (comp.startsWith('enhanced')?mv.enhanced:mv.normal).push({coeff:num(rp),lv:num(ls),fix:num(bv),label,stat});
}
for(const p of Object.keys(udb)){const um=udb[p]['Unite Move'];if(um&&um.length>1){const flat={move:'(flat)',normal:[],enhanced:[]};for(const m of um){flat.normal.push(...m.normal);flat.enhanced.push(...m.enhanced);}udb[p]['Unite Move']=[flat];}}

const labSrc=fs.readFileSync(path.join(ROOT,'lab_data.js'),'utf8');
eval(labSrc.replace(/const LAB_/g,'globalThis.LAB_'));
const SK=globalThis.LAB_SKILLS;
function toolMoves(rows){const bySlot={};rows.forEach((row,idx)=>{if(row.coeff==null)return;const enh=/[+＋]$/.test(row.name);const base=row.name.replace(/[+＋]$/,'');bySlot[row.slot]=bySlot[row.slot]||[];let arr=bySlot[row.slot];let mv=arr.length?arr[arr.length-1]:null;if(!mv||mv.base!==base){mv={base,normalRows:[],enhRows:[]};arr.push(mv);}(enh?mv.enhRows:mv.normalRows).push(idx);});return bySlot;}

// unite-db effect_label -> 分類
function udbCat(label){ if(/Heal/i.test(label))return '回復'; if(/Shield/i.test(label))return 'シールド'; if(/Damage/i.test(label))return 'ダメージ'; return null; }
// lab dmgType -> 分類
function labCat(dt){ dt=dt||''; if(/回復/.test(dt))return '回復'; if(/シールド/.test(dt))return 'シールド'; if(/ダメージ/.test(dt))return 'ダメージ'; return null; }
// stat 正規化
function nstat(s){ s=(s||'').trim(); if(/特攻|Sp\.?\s*Atk|sp_?atk/i.test(s))return '特攻'; if(/特防|Sp\.?\s*Def/i.test(s))return '特防'; if(/^攻撃$|^Atk$/i.test(s))return '攻撃'; if(/防御|^Def$/i.test(s))return '防御'; if(/HP/i.test(s))return 'HP'; return s; }

const catMis=[],statMis=[];
for(const p of Object.keys(SK)){
  const tm=toolMoves(SK[p]);
  for(const tslot of Object.keys(tm)){
    const umoves=udb[p]?.[SLOT_T2U[tslot]]||[];
    tm[tslot].forEach((tmv,mi)=>{
      const umv=umoves[mi];const keepEnh=KEEP_ENH.has(p+'|'+tmv.base);
      const handle=(list,kind)=>{
        list.forEach((ri,ci)=>{
          const row=SK[p][ri];
          let comp=null;
          if(umv&&!(kind==='enh'&&keepEnh)) comp = kind==='enh' ? (umv.enhanced[ci]||umv.normal[ci]||null) : (umv.normal[ci]||null);
          if(!comp) return; // 対応先なしは判定不可
          const uc=udbCat(comp.label), lc=labCat(row.dmgType);
          if(uc && lc && uc!==lc) catMis.push(`${p} / ${row.name} / coeff${row.coeff} : lab分類「${lc}」(${row.dmgType}) ↔ unite-db「${uc}」(${comp.label})`);
          const us=nstat(comp.stat), lsst=nstat(row.stat);
          if(us && lsst && us!==lsst && comp.coeff>0) statMis.push(`${p} / ${row.name} / coeff${row.coeff} : lab stat「${lsst}」↔ unite-db「${us}」(${comp.stat})`);
        });
      };
      handle(tmv.normalRows,'norm'); handle(tmv.enhRows,'enh');
    });
  }
}
console.log('=== 分類(ダメージ/回復/シールド)不整合: '+catMis.length+'件 ===');
catMis.forEach(x=>console.log('  '+x));
console.log('\n=== ステータス種別 不整合: '+statMis.length+'件 ===');
statMis.forEach(x=>console.log('  '+x));
