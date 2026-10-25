// 数式と独立した日本語要約。出典のない名前・未対応のわざを黙って公開しない。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),apply=process.argv.includes('--apply');
const reference=require('../data/lab-reference-metadata.json'),uniteJapanese=require('../data/lab-unite-buffs-ja.json');
const norm=s=>s.normalize('NFKC').replace(/[+＋]$/,'').replace('大顎クラッシュバイド','大顎クラッシュバイト');
const {K}=new Function(fs.readFileSync(path.join(root,'lab_data.js'),'utf8')+';return {K:LAB_SKILLS}')();
function csv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(field);field='';if(c==='\n'){rows.push(row);row=[];}}else if(c!=='\r')field+=c;}
  if(field||row.length){row.push(field);rows.push(row);}const h=rows.shift();return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));
}
const source=csv(fs.readFileSync(path.join(root,'data','unitedb_ratios.csv'),'utf8'));
const pokemonName=p=>p.replace('ミュウツー(X)','ミュウツーX').replace('ミュウツー(Y)','ミュウツーY');
const data={};
for(const [file,kind] of [['lab-passive-descriptions.txt','passives'],['lab-move-descriptions.txt','moves'],['lab-move-upgrades.txt','upgrades'],['lab-basic-descriptions.txt','basics']]){
  for(const line of fs.readFileSync(path.join(root,'data',file),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#'))){
    const fields=line.split('|');if(fields.length!==3)throw Error('説明の区切り不正: '+line);
    const [p,name,text]=fields;if(!K[p])throw Error('説明のポケモン未登録: '+p);
    const entry=data[p]??={passives:{},moves:{},upgrades:{},basics:{}};entry.basics??={};const key=norm(name);
    if(entry[kind][key])throw Error('説明の重複: '+p+'/'+name);
    if(!text||/[<>]/.test(text))throw Error('説明は空でないプレーンテキストで指定: '+p+'/'+name);
    entry[kind][key]={name,text};
  }
}
// 同じ出典のわざを共有する別形態。固有の差がある場合は個別の説明が優先。
for(const [p,base] of Object.entries({'メガリザードンX':'リザードン','メガリザードンY':'リザードン','メガギャラドス':'ギャラドス','メガルカリオ':'ルカリオ'})){
  const names=new Set(K[p].filter(r=>!['特性','通常攻撃'].includes(r.slot)).map(r=>norm(r.name)));
  for(const kind of ['moves','upgrades'])for(const name of names)if(!data[p][kind][name]&&data[base][kind][name])data[p][kind][name]={...data[base][kind][name]};
}
const missing=[];
const invalid=[];
const shared={'メガリザードンX':'リザードン','メガリザードンY':'リザードン','メガギャラドス':'ギャラドス','メガルカリオ':'ルカリオ'};
for(const [p,entry] of Object.entries(data))for(const kind of ['passives','moves','upgrades','basics'])for(const [name,description] of Object.entries(entry[kind])){
  const candidates=source.filter(r=>(pokemonName(r.pokemon_ja)===p||kind!=='passives'&&(pokemonName(r.pokemon_ja)===shared[p]||p==='ハッサム'&&['ダブルウイング','グリーンスターダイブ'].includes(name)&&r.pokemon_ja==='ストライク'))&&(kind==='basics'?r.skill_slot==='Basic':kind==='passives'?r.skill_slot==='Passive':!['Passive','Basic'].includes(r.skill_slot))&&norm(r.move_ja)===name&&(kind!=='upgrades'||r.move_stage==='upgrade'||/^enhanced/.test(r.ratio_component)));
  const texts=candidates.filter(r=>r.true_description||r.notes);
  if(!texts.length&&!(kind==='basics'&&reference.pokemon[p]?.basicOriginals.length))invalid.push(p+'/'+description.name);
  description.sourceKeys=[...new Set((kind==='basics'?candidates:texts).map(r=>[r.pokemon_en,r.skill_slot,r.move_en,r.source_object,r.ratio_component].join('|')))];
}
for(const [p,entry]of Object.entries(data)){
 if(!entry.basics['通常攻撃'])missing.push(p+'/通常攻撃');
 entry.reference={sourceUpdatedAt:reference.pokemon[p].lastUpdated,checkedAt:reference.meta.checkedAt,gameVersion:null};
 entry.unite=reference.pokemon[p].moves.filter(m=>m.slot==='Unite Move').map(m=>{
  if(m.buffs&&!uniteJapanese[m.buffs])throw Error('ユナイト共通効果の日本語を確認してください: '+p+' '+m.buffs);
  return {name:m.name,text:uniteJapanese[m.buffs]||'共通強化の内容は未収録です。',duration:m.buffDuration,energy:m.energy,sourcePointer:m.sourcePointer};
 });
}
for(const [p,skills] of Object.entries(K)){
  if(!data[p]?.passives||!Object.keys(data[p].passives).length)missing.push(p+'/特性');
  for(const name of new Set(skills.filter(r=>!['特性','通常攻撃'].includes(r.slot)).map(r=>norm(r.name))))if(!data[p]?.moves[name])missing.push(p+'/'+name);
  for(const name of new Set(skills.filter(r=>!['特性','通常攻撃'].includes(r.slot)&&/[+＋]$/.test(r.name)).map(r=>norm(r.name))))if(!data[p]?.upgrades[name])missing.push(p+'/'+name+'+');
}
const report={pokemon:Object.keys(K).length,passives:Object.values(data).reduce((n,p)=>n+Object.keys(p.passives).length,0),moves:Object.values(data).reduce((n,p)=>n+Object.keys(p.moves).length,0),upgrades:Object.values(data).reduce((n,p)=>n+Object.keys(p.upgrades).length,0),missing,invalid};
console.log(JSON.stringify(report,null,2));if(missing.length||invalid.length)process.exit(1);
const meta={checkedAt:reference.meta.checkedAt,source:'https://docs.google.com/spreadsheets/d/13m4W2oLU__PPKQrHVPRqBHopQbXBggSJCdse6BXAqys/edit',sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'data','unitedb_ratios.csv'))).digest('hex'),referenceSha256:reference.meta.sha256,gameVersion:null,...report};
const output='// tools/build_lab_descriptions.js で生成。主な効果の日本語要約。数式や発動を自動適用しない。\nconst LAB_DESCRIPTIONS='+JSON.stringify({meta,pokemon:data})+';\n';
const target=path.join(root,'lab_descriptions.js');
if(apply){fs.writeFileSync(target,output);console.log('説明データを生成しました。');}
else if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output){console.error('生成データに差分があります。--apply で更新してください。');process.exitCode=1;}
