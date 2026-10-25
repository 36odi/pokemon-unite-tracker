// 原文を確認した説明用の空行だけを区別する。未知の空欄を一括で非ダメージと判断しない。
const reviewed=require('../data/lab-described-effects.json');
const {key}=require('./lab-data-utils');
module.exports=function(SK,source){
 const byKey=new Map(source.map(s=>[key(s),s]));
 for(const rule of reviewed.rules){
  for(const proof of rule.sources){
   const s=byKey.get(proof.key);
   if(!s||['trueDescription','notes','info'].some((f,i)=>(proof[f]||'')!==(s[['true_description','notes','rsb_info'][i]]||'')))throw Error('説明効果の原文を再確認してください: '+proof.key);
  }
  const rows=(SK[rule.pokemon]||[]).filter(r=>r.slot===rule.slot&&r.name===rule.name&&r.coeff==null&&!r.description);
  if(rows.length!==1||!rule.sources.length||rule.status!=='described')throw Error('説明効果の対応を再確認してください: '+rule.pokemon+'/'+rule.name);
  Object.assign(rows[0],{effectStatus:'described',descriptionSources:rule.sources.map(s=>s.key)});
 }
 return {describedEffects:reviewed.rules.length};
};
