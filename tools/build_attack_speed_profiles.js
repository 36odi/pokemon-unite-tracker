// 個別レビューを必須にし、新しい名前へモデルを自動適用しない。
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
function build(){
 const review=require('../data/attack-speed-review.json'),conditions=require('../data/attack-speed-conditions.json').profiles,ctx={};
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'lab_data.js'),'utf8')+';globalThis.status=LAB_STATUS;',ctx);
 const names=Object.keys(ctx.status),profiles={};
 if(review.reviews.length!==names.length||new Set(review.reviews.map(p=>p.name)).size!==names.length)throw Error('個別レビューの件数・重複を確認してください');
 for(const name of Object.keys(conditions))if(!names.includes(name))throw Error('不明な条件対象: '+name);
 for(const p of review.reviews){
  if(!ctx.status[p.name]||!p.review||!p.evidence?.basicFields.length)throw Error('個別根拠なし: '+p.name);
  if(JSON.stringify(ctx.status[p.name].attackSpeed)!==JSON.stringify(p.sourceBase))throw Error('基礎補正の出典を再確認: '+p.name);
  if(p.status==='reference'&&!p.calculator)throw Error('個別の表がありません: '+p.name);
  const c=conditions[p.name]||{},states=c.states||(p.status==='fixed'?[{id:'fixed',label:'固定アニメーション',kind:'fixed',bonus:0}]:p.status==='unconfirmed'?[{id:'unconfirmed',label:'適用未確認（補正値のみ）',kind:'unconfirmed'},{id:'shared-model',label:'共通段階表で仮の参考計算',kind:'model',bonus:0}]:[{id:'normal',label:'非強化攻撃・わざの速度強化なし',kind:'common',bonus:0}]);
  for(const item of [...states,...(c.effects||[]),...(c.effects||[]).flatMap(e=>e.options||[])])for(const key of ['minLevel','maxLevel'])if(key in item&&(!Number.isInteger(item[key])||item[key]<1||item[key]>15))throw Error('条件レベル不正: '+p.name+'/'+item.id+'/'+key);
  for(const s of states)if(['common','model'].includes(s.kind)&&!Number.isFinite(s.bonus))throw Error('状態の補正欠損: '+p.name);
  for(const e of c.effects||[]){if((e.count!=null&&(!e.source||!Number.isFinite(e.perStack)))||(!e.source&&e.options?.some(o=>o.bonus!==0&&!o.source))||e.options?.some(o=>!Number.isFinite(o.bonus)))throw Error('効果の出典・補正欠損: '+p.name+'/'+e.id);}
  profiles[p.name]={status:p.status,sourceName:p.sourceName,review:p.review,evidence:p.evidence,...(p.calculator?{calculatorRange:p.calculator.range}:{}),states,effects:c.effects||[],...(c.note||p.note?{note:c.note||p.note}:{}),...(p.status==='unconfirmed'?{reason:'基礎補正と通常攻撃の説明は確認済みですが、公開計算表に個別行がなく、段階表の適用は未確認です。仮の共通モデルは状態欄から選べます。'}:{})};
 }
 const counts=Object.fromEntries(['reference','fixed','unconfirmed'].map(s=>[s,Object.values(profiles).filter(p=>p.status===s).length]));
 return JSON.stringify({version:review.version,checkedAt:review.checkedAt,counts,profiles},null,2)+'\n';
}
if(require.main===module){const file=path.join(ROOT,'data/attack-speed-profiles.json'),s=build();if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==s)throw Error('適用表を再生成してください');console.log('All profiles match individual reviews');}else{fs.writeFileSync(file,s);console.log('Generated reviewed profiles:',JSON.parse(s).counts);}}
module.exports={build};
