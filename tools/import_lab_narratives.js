// 原文・人が確認した日本語・計算対象を別々に保持する。
const fs=require('node:fs'),{csv,key,pokemon,hasEvidence}=require('./lab-data-utils');
const file=process.argv[process.argv.indexOf('--source')+1];if(!process.argv.includes('--source')||!fs.existsSync(file))throw Error('--source に文章成分の再照合CSVを指定');
const source=csv(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')),S=csv(fs.readFileSync('data/unitedb_ratios.csv','utf8'));
const map=new Map(source.map(r=>[r['再照合ID'],r]));
const implemented=new Set(['T000','T005','T018','T032','T035','T053','T054','T055','T082']);
const result=[];
const extraReviews=require('../data/lab-detail-notes.json').formulaReviews||[];
const sha=s=>require('node:crypto').createHash('sha256').update(s).digest('hex');
for(const line of fs.readFileSync('data/lab-narrative-formulas.txt','utf8').split(/\r?\n/).filter(x=>x&&!x.startsWith('#'))){
 const [id,label,formula,numeric,publicationStatus]=line.split('|'),r=map.get(id);if(!r)throw Error('再照合した原文なし: '+id);
 if(publicationStatus&&!['documented','single_source','needs_review','conflict'].includes(publicationStatus))throw Error('公開状態が不正: '+id);
 const sk=r['出典キー'],s=S.find(s=>key(s)===sk);if(!s)throw Error('正本の成分なし: '+sk);
 const evidence=r['原文の式・条件'];if(!hasEvidence(s,evidence))throw Error('原文の再確認が必要: '+sk);
 const parsed=numeric?numeric.split(','):null;
 if(parsed&&(parsed.length<5||parsed.length>7||parsed.slice(0,3).some(v=>v.trim()===''||!Number.isFinite(Number(v)))||!parsed[3]||!parsed[4]||(parsed.length===7&&(parsed[6].trim()===''||!Number.isFinite(Number(parsed[6]))))))throw Error('文章式の数値欄が不正: '+id);
 const numericValue=parsed?{coeff:Number(parsed[0]),lvScale:Number(parsed[1]),fixed:Number(parsed[2]),kind:parsed[3],target:parsed[4],unit:parsed[5]||'',...(parsed.length===7?{coeffPerLevel:Number(parsed[6])}:{})}:null;
 const review=extraReviews.find(x=>x.narrativeId===id);
 if(review&&(review.sourceKey!==sk||review.textSha256!==sha(label+'|'+formula)||JSON.stringify(review.numeric??null)!==JSON.stringify(numericValue)))throw Error('追加の出典で確認した文章式を再確認してください: '+id);
 if(review?.additionalTerm&&(!review.affectedSourceKeys?.length||review.affectedSourceKeys.some(k=>!S.some(x=>key(x)===k&&x.pokemon_en===s.pokemon_en&&x.move_en===s.move_en))))throw Error('追加項の対象成分を再確認してください: '+id);
 result.push({id,...(publicationStatus?{publicationStatus}:{}),pokemon:pokemon(s.pokemon_ja),move:s.move_ja,sourceKey:sk,sourceLabel:s.effect_label,label,formula,evidence,implementedElsewhere:implemented.has(id),...(numericValue?{numeric:numericValue}:{}),...(review?.additionalTerm?{additionalTerm:true,affectedSourceKeys:review.affectedSourceKeys}:{})});
}
if(result.length!==128||new Set(result.map(r=>r.id)).size!==128)throw Error('128成分の重複・不足');
// 再点検で新たに確認した本文中の式。取得済み128成分を置き換えず追加する。
for(const rule of require('../data/lab-narrative-additions.json')){
 const s=S.find(s=>key(s)===rule.sourceKey);
 if(!/^N\d{3}$/.test(rule.id)||result.some(r=>r.id===rule.id)||!s||s.effect_label!==rule.sourceLabel||!hasEvidence(s,rule.evidence))throw Error('追加の文章式の根拠を再確認してください: '+rule.id);
 if(rule.versionScope&&!['base','plus','both'].includes(rule.versionScope))throw Error('追加式の適用版を再確認してください: '+rule.id);
 const review=extraReviews.find(x=>x.narrativeId===rule.id);
 if(review&&(review.sourceKey!==rule.sourceKey||review.textSha256!==sha(rule.label+'|'+rule.formula)||JSON.stringify(review.numeric??null)!==JSON.stringify(rule.numeric??null)))throw Error('追加の出典で確認した文章式を再確認してください: '+rule.id);
 if(rule.numeric?.stat&&(!['攻撃','特攻','HP'].includes(rule.numeric.stat)||!review))throw Error('追加の参照能力を再確認してください: '+rule.id);
 if(rule.numeric?.hpPercent!==undefined&&(!Number.isFinite(rule.numeric.hpPercent)||rule.numeric.hpPercent<0||!review))throw Error('追加HP項の根拠を再確認してください: '+rule.id);
 for(const k of rule.affectedSourceKeys||[])if(!S.some(x=>key(x)===k&&x.pokemon_en===s.pokemon_en&&x.move_en===s.move_en))throw Error('追加式の対象成分を再確認してください: '+k);
 result.push({...rule,pokemon:pokemon(s.pokemon_ja),move:s.move_ja,implementedElsewhere:false});
}
const target='data/lab-reviewed-narratives.json',text=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--apply'))fs.writeFileSync(target,text);else if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text){console.error('条件式に差分があります。--apply で保存');process.exitCode=1;}
console.log(JSON.stringify({reviewed:result.length,existing:result.filter(r=>r.implementedElsewhere).length,executable:result.filter(r=>r.numeric).length}));
