const identities=require('../data/lab-source-identities.json').rows;
module.exports=function(SK){
 const counts=new Map();
 for(const [p,rows]of Object.entries(SK))for(const r of rows.filter(r=>r.coeff!=null&&!r.supplement)){
  if(p==='ハッサム'){r.name=r.name.replace('ダブルウイング','バレットパンチ').replace('グリーンスターダイブ','レッドスターダイブ');}
  const stem=JSON.stringify([p,r.slot,r.name,r.dmgType]),n=(counts.get(stem)||0)+1;counts.set(stem,n);
  if(r.sourceKey)continue;
  const k=identities[JSON.stringify([p,r.slot,r.name,r.dmgType,n])];
  if(!k)throw Error('出典の対応を確認してください（数値・配列全体の順序では推測しません）: '+stem+' / '+n);
  r.sourceKey=k;
 }
};
