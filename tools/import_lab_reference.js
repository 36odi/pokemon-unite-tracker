// 再取得した原文のメタデータを保存。原文の空欄は未確認のまま保持する。
const fs=require('node:fs'),crypto=require('node:crypto');
const {csv,pokemon}=require('./lab-data-utils');
const sourcePath=process.argv[process.argv.indexOf('--source')+1];
if(!process.argv.includes('--source')||!fs.existsSync(sourcePath))throw Error('--source に pokemon.json を指定してください');
const raw=fs.readFileSync(sourcePath),source=JSON.parse(raw),S=csv(fs.readFileSync('data/unitedb_ratios.csv','utf8'));
if(!process.argv.includes('--checked-at'))throw Error('--checked-at に原文を取得・確認した日（YYYY-MM-DD）を指定してください');
const date=process.argv[process.argv.indexOf('--checked-at')+1];if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('確認日の形式が不正');
const out={meta:{checkedAt:date,source:'https://unite-db.com/pokemon.json',sha256:crypto.createHash('sha256').update(raw).digest('hex'),ratioSha256:crypto.createHash('sha256').update(fs.readFileSync('data/unitedb_ratios.csv')).digest('hex'),gameVersion:null},pokemon:{}};
const str=v=>v==null?'':String(v),number=v=>str(v).trim()===''?null:Number(v);
for(const p of source){
 const jp=pokemon(S.find(r=>r.pokemon_en===p.name)?.pokemon_ja||'');if(!jp)throw Error('日本語名なし: '+p.name);
 const entry={sourceName:p.name,sourceId:p.id,lastUpdated:p.last_updated||null,basicOriginals:[],moves:[]};
 for(const [si,s]of p.skills.entries()){
  if(s.ability==='Basic'){
   for(const [name,text]of [[s.name,s.rsb?.true_desc||s.description],...['basic2','basic3','basic4'].map(k=>[s[k+'_name'],s[k+'_description']])])if(text)entry.basicOriginals.push({name,text});
  }
  function move(m,ptr,parent=''){
   const ss=S.find(r=>r.pokemon_en===p.name&&r.skill_slot===s.ability&&r.move_en===m.name);
   const cd=number(m.cd1??m.cd),reduction=number(m.rsb?.enhanced_cdr);
   entry.moves.push({slot:s.ability,sourceName:m.name,name:ss?.move_ja||m.name,parent,sourcePointer:'pokemon.json#/'+si+'/'+ptr,level:number(m.level??m.level1),plusLevel:number(m.level2),cd,plusReduction:reduction,plusCD:cd!==null&&reduction!==null?cd-reduction:null,stage:parent?'upgrade':'base',...(s.ability==='Unite Move'?{energy:number(m.energy),buffs:m.buffs||'',buffDuration:number(m.buff_duration)}:{})});
  }
  move(s,'skills/'+si);
  for(const [i,m]of (s.upgrades||[]).entries())move(m,'skills/'+si+'/upgrades/'+i,s.name);
 }
 out.pokemon[jp]=entry;
}
if(Object.keys(out.pokemon).length!==source.length)throw Error('識別子の重複');
// 配列位置は原文スナップショット内の参照にのみ用い、恒久的なわざIDにはしない。
source.forEach((p,pi)=>{const e=Object.values(out.pokemon).find(e=>e.sourceName===p.name);for(const m of e.moves)m.sourcePointer=m.sourcePointer.replace(/^pokemon\.json#\/\d+\//,'pokemon.json#/'+pi+'/');});
const target='data/lab-reference-metadata.json',text=JSON.stringify(out,null,2)+'\n';
if(process.argv.includes('--apply'))fs.writeFileSync(target,text);
else if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text){console.error('メタデータに差分があります。--apply で保存');process.exitCode=1;}
console.log(JSON.stringify({pokemon:source.length,moves:Object.values(out.pokemon).reduce((n,p)=>n+p.moves.length,0),sha256:out.meta.sha256,apply:process.argv.includes('--apply')}));
