const fs=require('node:fs'),assert=require('node:assert/strict'),{csv,key,norm}=require('../tools/lab-data-utils');
const F=new Function(fs.readFileSync('lab_data.js','utf8')+fs.readFileSync('lab_descriptions.js','utf8')+fs.readFileSync('js/lab-core.js','utf8')+';return {K:LAB_SKILLS,D:LAB_DESCRIPTIONS,known:labEffectDescriptionKnown,description:labMoveDescription};')();
const source=csv(fs.readFileSync('data/unitedb_ratios.csv','utf8')),byKey=new Map(source.map(s=>[key(s),s])),reviewed=require('../data/lab-described-effects.json');
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const blanks=Object.entries(F.K).flatMap(([p,rows])=>rows.filter(r=>r.coeff==null&&!r.description).map(r=>[p,r]));
eq(blanks.length,75,'all existing empty components reviewed');eq(reviewed.rules.length,75,'every review has evidence');
for(const [p,r]of blanks){eq(F.known(p,r),true,p+'/'+r.name+' is a sourced explanation');eq(r.descriptionSources.length>0,true,'proof references are preserved');}
for(const rule of reviewed.rules){
 const r=F.K[rule.pokemon].find(r=>r.slot===rule.slot&&r.name===rule.name&&r.coeff==null&&!r.description);
 eq(r.descriptionSources,rule.sources.map(s=>s.key),'reviewed identity is preserved');
 for(const proof of rule.sources){const s=byKey.get(proof.key);eq(!!s,true,'original source exists');eq([s.true_description,s.notes,s.rsb_info],[proof.trueDescription,proof.notes,proof.info],'original wording is unchanged');}
 eq(F.description(rule.pokemon,rule.name).length>0,true,'known effects have a visible summary');
}
for(const [p,n,parts]of [
 ['ニンフィア','めいそう',['30%','40%','10%','3秒']],
 ['ダークライ','めいそう',['30%','3秒','50%','0.5秒','10%']],
 ['ハピナス','てだすけ',['4秒','30%']],['ハピナス','てだすけ+',['15%','4秒']],
 ['カイリキー','ビルドアップ',['3秒','15%','40%','30%']],
 ['プクリン','うたう',['15%','2秒','4回','1.5秒','25%']],
 ['カビゴン','とおせんぼう',['3.5秒','17.4%','1560','0.45秒']],
 ['ヤドラン','ドわすれ',['250','4秒','17.5%']],
 ['ミュウツーY','テレポート',['2秒','15%','20%','50%']],
 ['エースバーン','フェイント',['0.73秒','2秒','40%']],
 ['ヌメルゴン','あめあめふれふれ',['4.6%','回復間隔の記載がない']]
])for(const text of parts)eq(F.description(p,n).includes(text),true,p+'/'+n+' independently checked effect '+text);
eq(F.known('ニンフィア',{name:'めいそう',coeff:null}),false,'a new unknown row must not be silently classified');
eq(F.known('ニンフィア',{name:'未登録',coeff:null,effectStatus:'described'}),false,'missing summary stays unknown');
eq(F.known('ニンフィア',{name:'めいそう',coeff:90,effectStatus:'described'}),false,'a numeric formula is never hidden');
const altered=source.map(s=>key(s)===reviewed.rules[0].sources[0].key?{...s,true_description:'changed source'}:s);
assert.throws(()=>require('../tools/lab_described_effects')(JSON.parse(JSON.stringify(F.K)),altered),/原文を再確認/);checks++;
eq(F.K['ニンフィア'].find(r=>r.name==='めいそう+').coeff,90,'Calm Mind+ shield formula retained');
eq(F.K['ニンフィア'].find(r=>r.name==='めいそう+').cdStatus,'unconfirmed','independent plus cooldown remains unknown');
console.log('ALL PASS — '+checks+' described-effect checks');
