// 原文・人が確認した日本語・計算対象を別々に保持する。
const fs=require('node:fs'),{csv,key,pokemon,hasEvidence}=require('./lab-data-utils');
const file=process.argv[process.argv.indexOf('--source')+1];if(!process.argv.includes('--source')||!fs.existsSync(file))throw Error('--source に文章成分の再照合CSVを指定');
const source=csv(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')),S=csv(fs.readFileSync('data/unitedb_ratios.csv','utf8'));
const map=new Map(source.map(r=>[r['再照合ID'],r]));
const implemented=new Set(['T000','T005','T018','T032','T035','T053','T054','T055','T082']);
const result=[];
for(const line of fs.readFileSync('data/lab-narrative-formulas.txt','utf8').split(/\r?\n/).filter(x=>x&&!x.startsWith('#'))){
 const [id,label,formula,numeric]=line.split('|'),r=map.get(id);if(!r)throw Error('再照合した原文なし: '+id);
 const sk=r['出典キー'],s=S.find(s=>key(s)===sk);if(!s)throw Error('正本の成分なし: '+sk);
 const evidence=r['原文の式・条件'];if(!hasEvidence(s,evidence))throw Error('原文の再確認が必要: '+sk);
 const parsed=numeric?numeric.split(','):null;
 result.push({id,pokemon:pokemon(s.pokemon_ja),move:s.move_ja,sourceKey:sk,label,formula,evidence,implementedElsewhere:implemented.has(id),...(parsed?{numeric:{coeff:Number(parsed[0]),lvScale:Number(parsed[1]),fixed:Number(parsed[2]),kind:parsed[3],target:parsed[4],unit:parsed[5]||''}}:{})});
}
if(result.length!==128||new Set(result.map(r=>r.id)).size!==128)throw Error('128成分の重複・不足');
const target='data/lab-reviewed-narratives.json',text=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--apply'))fs.writeFileSync(target,text);else if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text){console.error('条件式に差分があります。--apply で保存');process.exitCode=1;}
console.log(JSON.stringify({reviewed:result.length,existing:result.filter(r=>r.implementedElsewhere).length,executable:result.filter(r=>r.numeric).length}));
