// 指定ポケモンの (slot, わざ名) を unite-db と ツールで並べて表記差を可視化
const fs=require('fs');const path=require('path');const ROOT=path.join(__dirname,'..');
function parseCSV(t){const rows=[];let i=0,f='',row=[],q=false;for(;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;}else{if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c==='\r'){}else f+=c;}}if(f.length||row.length){row.push(f);rows.push(row);}return rows;}
const ALIAS={'ミュウツー(X)':'ミュウツーX','ミュウツー(Y)':'ミュウツーY'};const norm=p=>ALIAS[p]||p;
const csv=parseCSV(fs.readFileSync(path.join(ROOT,'data','unitedb_ratios.csv'),'utf8'));
const head=csv[0];const col={};head.forEach((h,i)=>col[h]=i);
const SLOT_U2T={'Basic':'通常攻撃','Move 1':'わざ1','Move 2':'わざ2','Unite Move':'ユナイトわざ','Passive':'(passive)'};
const lab=fs.readFileSync(path.join(ROOT,'lab_data.js'),'utf8').replace(/const LAB_/g,'globalThis.LAB_');eval(lab);
const targets=process.argv.slice(2);
for(const p of targets){
  console.log('\n###### '+p+' ######');
  const u={};
  for(let r=1;r<csv.length;r++){const row=csv[r];if(norm(row[col['pokemon_ja']])!==p)continue;const rp=row[col['ratio_percent']],bv=row[col['base_value']],ls=row[col['level_scaling']];if(rp===''&&bv===''&&ls==='')continue;const slot=SLOT_U2T[row[col['skill_slot']]]||row[col['skill_slot']];const mv=row[col['move_ja']];const comp=row[col['ratio_component']];(u[slot]=u[slot]||[]).push(mv+'['+comp+'] '+rp+'/'+ls+'/'+bv);}
  console.log('-- unite-db --');
  for(const s of Object.keys(u)) console.log('  '+s+': '+u[s].join('  ,  '));
  const t={};
  for(const row of (globalThis.LAB_SKILLS[p]||[])){ if(row.coeff==null)continue; (t[row.slot]=t[row.slot]||[]).push(row.name+' '+row.coeff+'/'+(row.lvScale||0)+'/'+(row.fixed||0)); }
  console.log('-- tool --');
  for(const s of Object.keys(t)) console.log('  '+s+': '+t[s].join('  ,  '));
}
