const fs=require('node:fs'),assert=require('node:assert/strict'),{csv,loadData,key}=require('../tools/lab-data-utils');
const {K}=loadData(),S=csv(fs.readFileSync('data/unitedb_ratios.csv','utf8')),identities=require('../tools/lab_source_identities');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;};
const copy=JSON.parse(JSON.stringify(K)),expected=[];
for(const [p,rows]of Object.entries(copy))for(const [i,r]of rows.entries())if(r.coeff!=null&&!r.supplement){expected.push([p,i,r.sourceKey]);delete r.sourceKey;r.coeff=0;r.fixed=0;r.lvScale=0;}
identities(copy);for(const [p,i,k]of expected)eq(copy[p][i].sourceKey,k,'identity survives changes in numeric values');
require('../tools/lab_reference_updates')(copy,S);
for(const [p,i]of expected)eq([copy[p][i].coeff,copy[p][i].lvScale,copy[p][i].fixed],[K[p][i].coeff,K[p][i].lvScale,K[p][i].fixed],'values restored from exact source component');
const before=JSON.stringify(K),apply=(data,source)=>{require('../tools/lab_source_additions')(data,source);require('../tools/lab_passive_ratios')(data,source);identities(data);require('../tools/lab_reference_updates')(data,source);require('../tools/lab_component_supplements')(data,source);require('../tools/lab_reference_updates')(data,source,{additions:true});};
apply(K,S);eq(JSON.stringify(K)===before,true,'complete regeneration is idempotent');apply(K,S);eq(JSON.stringify(K)===before,true,'second regeneration does not accumulate rows or notes');
const withUnknown=JSON.parse(before);withUnknown['ピカチュウ'].push({slot:'わざ1',name:'未知のわざ',dmgType:'ダメージ',coeff:0,fixed:0,lvScale:0});assert.throws(()=>identities(withUnknown),/出典の対応を確認/);n++;
const changed=S.map(s=>key(s)==='Pikachu|Move 1|Electro Ball|rsb|base'?{...s,ratio_percent:'123'}:s),revised=JSON.parse(before);require('../tools/lab_reference_updates')(revised,changed);
eq(revised['ピカチュウ'].find(r=>r.name==='エレキボール'&&r.sourceKey==='Pikachu|Move 1|Electro Ball|rsb|base').coeff,123,'patch follows source key, not old tuple or neighboring row');
eq(JSON.stringify(S)===JSON.stringify(csv(fs.readFileSync('data/unitedb_ratios.csv','utf8'))),true,'source table never mutated');
const solgaleoMetadata=require('../data/lab-reference-metadata.json').pokemon['ソルガレオ'];
for(const name of ['アイアンヘッド','サイコショック']){
 const move=solgaleoMetadata.moves.find(m=>m.name===name),oldLevel=move.plusLevel;
 try{move.plusLevel=oldLevel+1;const future=JSON.parse(before);require('../tools/lab_reference_updates')(future,S);eq(future['ソルガレオ'].filter(r=>r.name===name+'+').map(r=>r.upg),[String(move.plusLevel)],'Solgaleo upgrade follows future source metadata '+name);}
 finally{move.plusLevel=oldLevel;}
}
console.log('ALL PASS — '+n+' source identity regeneration checks');
