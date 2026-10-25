// 数値とは独立して、根拠を確認した仕様・例外・条件を説明データへ付ける。
const fs=require('node:fs'),crypto=require('node:crypto'),detail=require('../data/lab-detail-notes.json'),reference=require('../data/lab-reference-metadata.json');
const {key}=require('./lab-data-utils'),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
module.exports=function(data,source){
 if(detail.meta.referenceSha256!==reference.meta.sha256||detail.meta.ratioSha256!==sha(fs.readFileSync('data/unitedb_ratios.csv')))throw Error('詳細仕様の出典が更新されています。条件・例外を再確認してください。');
 const byKey=new Map(source.map(s=>[key(s),s])),ids=new Set;let bindings=0;
 for(const rule of detail.rules){
  if(ids.has(rule.id)||!rule.text||!['documented','single_source','needs_review','conflict'].includes(rule.status))throw Error('詳細仕様の識別子・状態不正: '+rule.id);ids.add(rule.id);
  for(const proof of rule.proofs){if(proof.kind==='ratio'){const s=byKey.get(proof.key);if(!s||proof.textSha256!==sha([s.true_description,s.notes,s.rsb_info].filter(Boolean).join(' ')))throw Error('詳細仕様の根拠文を再確認してください: '+proof.key);}else if(proof.kind==='unitedb-text'){if(!proof.pointer||!/^[a-f0-9]{64}$/.test(proof.textSha256))throw Error('詳細仕様の原文参照不正: '+rule.id);}else if(proof.kind!=='wiki'||!/^[a-f0-9]{64}$/.test(proof.sha256))throw Error('詳細仕様の出典不正: '+rule.id);}
  for(const target of rule.targets){const entry=data[target.pokemon]?.[target.kind]?.[target.name];if(!entry)throw Error('詳細仕様の対応先なし: '+JSON.stringify(target));entry.details??=[];entry.details.push({id:rule.id,label:rule.label,text:rule.text,status:rule.status});bindings++;}
 }
 for(const [p,c]of Object.entries(detail.combat)){if(!data[p])throw Error('戦闘仕様のポケモン不明: '+p);if(sha(c.sourceNotes)!==c.sourceNotesSha256)throw Error('戦闘仕様の根拠不整合: '+p);data[p].combat={critical:c.critical,additional:c.additional,checkedAt:detail.meta.checkedAt};}
 data['レシラム'].uniteCondition='使用3回目の、強化されたユナイトわざでのみ共通強化が発動します。';
 return{detailsCheckedAt:detail.meta.checkedAt,detailRules:ids.size,detailBindings:bindings,combatPokemon:Object.keys(detail.combat).length};
};
