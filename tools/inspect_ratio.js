// レシオCSVの構造把握（指定ポケモンのダメージ系コンポーネントを表示）
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
const head=csv[0];
const col={}; head.forEach((h,i)=>col[h]=i);

const target = process.argv[2] || 'ピカチュウ';
// ツール側
const lab=fs.readFileSync(path.join(ROOT,'lab_data.js'),'utf8').replace(/const LAB_/g,'globalThis.LAB_');
eval(lab);

console.log('================ CSV: '+target+' ================');
console.log('slot | move_ja | stage | comp | ratio% | stat | lvScale | base | formula_ja');
for(let r=1;r<csv.length;r++){
  const row=csv[r];
  if(row[col['pokemon_ja']]!==target) continue;
  const rp=row[col['ratio_percent']], bv=row[col['base_value']], ls=row[col['level_scaling']];
  // ダメージ系（ratio% か base が入っている行）だけ
  if(!rp && !bv && !ls) continue;
  console.log([row[col['skill_slot']],row[col['move_ja']],row[col['move_stage']],row[col['ratio_component']],rp,row[col['stat_type']],ls,bv,(row[col['formula_ja']]||'').slice(0,40)].join(' | '));
}

console.log('\n================ ツール LAB_SKILLS: '+target+' ================');
(globalThis.LAB_SKILLS[target]||[]).forEach(r=>{
  console.log([r.slot,r.name,'coeff='+r.coeff,'lvScale='+(r.lvScale||0),'fixed='+(r.fixed||0),'stat='+(r.stat||'')].join(' | '));
});
