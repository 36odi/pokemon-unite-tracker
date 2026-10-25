// 保存した原文を明示して、詳細仕様の根拠文・参照先を検証する。通信・書込みなし。
const fs=require('node:fs'),crypto=require('node:crypto');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function verify(detail,raw,foreign){
  if(sha(raw)!==detail.meta.referenceSha256)throw Error('原文の版が異なります。詳細仕様を再確認してください。');
  const source=JSON.parse(raw),pointer=p=>p.split('/').slice(1).reduce((v,k)=>v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],source);
  let fields=0,references=0;
  const check=(p,hash,label)=>{const value=pointer(p);if(typeof value!=='string'||sha(value)!==hash)throw Error('原文の根拠不一致: '+label+' '+p);fields++;};
  for(const r of detail.rules){
    for(const p of r.proofs)if(p.kind==='unitedb-text')check(p.pointer,p.textSha256,r.id);
    if(foreign)for(const ref of r.foreignReferences){
      const page=foreign.find(p=>p.url===ref.url&&p.sha256===ref.pageSha256);
      if(!page)throw Error('照合資料がありません: '+r.id+' '+ref.url);
      for(const entry of ref.entries){if(!page.entries.some(e=>e.name===entry.name&&sha(e.text)===entry.textSha256))throw Error('照合資料の参照不一致: '+r.id+' '+entry.name);references++;}
    }
  }
  for(const [name,c]of Object.entries(detail.combat))check(c.sourcePointer.replace(/^pokemon\.json#/,''),c.sourceNotesSha256,name);
  return{rawFields:fields,foreignEntryReferences:references,foreignReferenceMeaning:'対応する資料の存在確認。本文の意味の一致を自動判定した件数ではありません。'};
}
module.exports={verify};
if(require.main===module){
  try{
    const args=process.argv.slice(2),value=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];},file=value('--source');
    if(!file)throw Error('Usage: node tools/verify_lab_detail_sources.js --source <pokemon.json> [--foreign-pages <foreign-pages.json>]');
    const foreign=value('--foreign-pages');
    console.log(JSON.stringify(verify(require('../data/lab-detail-notes.json'),fs.readFileSync(file),foreign?JSON.parse(fs.readFileSync(foreign,'utf8')):null),null,2));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
