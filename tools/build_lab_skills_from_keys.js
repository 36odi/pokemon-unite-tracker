// 数値・条件を出典の成分キーで同期。未知の対応や出典の欠落では書き込まない。
const fs=require('node:fs'),path=require('node:path');
const {csv,loadData,replaceObject,key,num}=require('./lab-data-utils');
const root=path.resolve(__dirname,'..');process.chdir(root);
const metadata=require('../data/lab-reference-metadata.json'),crypto=require('node:crypto');
if(metadata.meta.ratioSha256!==crypto.createHash('sha256').update(fs.readFileSync('data/unitedb_ratios.csv')).digest('hex'))throw Error('正本CSVと原文メタデータの取得時点が異なります。メタデータを再取得・確認してから同期してください。');
const source=csv(fs.readFileSync('data/unitedb_ratios.csv','utf8')),byKey=new Map(source.map(s=>[key(s),s]));
const text=fs.readFileSync('lab_data.js','utf8'),{K}=loadData(),before=JSON.stringify(K);
require('./lab_source_additions')(K,source);
require('./lab_passive_ratios')(K,source);
require('./lab_source_identities')(K);
require('./lab_reference_updates')(K,source);
const additions=require('./lab_component_supplements')(K,source);
require('./lab_reference_updates')(K,source,{additions:true});
let numeric=0;
for(const [p,rows]of Object.entries(K))for(const r of rows.filter(r=>r.sourceKey&&r.coeff!=null)){
 const s=byKey.get(r.sourceKey);if(!s)throw Error('出典がない成分: '+r.sourceKey);
 const stat=s.stat_type.trim(),expected=[stat==='Atk'?'攻撃':stat==='SpAtk'?'特攻':stat,num(s.ratio_percent),num(s.level_scaling),num(s.base_value)];
 if(JSON.stringify(expected)!==JSON.stringify([r.stat,r.coeff,r.lvScale||0,r.fixed||0]))throw Error('式の不整合: '+p+'/'+r.name+'/'+r.sourceKey);numeric++;
}
const referenced=new Set(Object.values(K).flat().map(r=>r.sourceKey).filter(Boolean));
const missing=source.filter(s=>['ratio_percent','level_scaling','base_value'].some(k=>s[k]!=='')&&!referenced.has(key(s)));
if(missing.length)throw Error('取り込まれていない数値成分: '+missing.map(key).join(', '));
const after=JSON.stringify(K),changed=before!==after;
console.log(JSON.stringify({pokemon:Object.keys(K).length,sourceLinkedNumeric:numeric,missingSourceComponents:missing.length,...additions,changed},null,2));
if(process.argv.includes('--apply')){
 const result=replaceObject(text,'LAB_SKILLS',K);new Function(result+';return LAB_SKILLS')();
 fs.writeFileSync('lab_data.js',result);console.log('出典キー単位で数値・条件・表示情報を更新しました。');
}else if(changed){console.error('再生成結果に差分があります。内容を確認して --apply で保存してください。');process.exitCode=1;}
