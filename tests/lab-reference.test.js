// 保存済みの正本と手計算を使い、今回見つかった取りこぼしを検査する。
const fs=require('node:fs'),assert=require('node:assert/strict');
const {csv,key,num,pokemon}=require('../tools/lab-data-utils');
const S=csv(fs.readFileSync('data/unitedb_ratios.csv','utf8')),T=csv(fs.readFileSync('data/unitedb_stats.csv','utf8'));
const F=new Function(fs.readFileSync('lab_data.js','utf8')+fs.readFileSync('lab_descriptions.js','utf8')+fs.readFileSync('js/lab-core.js','utf8')+';return {K:LAB_SKILLS,P:LAB_STATUS,D:LAB_DESCRIPTIONS,kind:labEffectKind,calc:labEvaluateComponent,stats:computeStatsDetailed,basic:labBasicDescription};')();
let checks=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;},ok=(v,msg)=>{assert.ok(v,msg);checks++;};
const names=new Map(S.map(s=>[s.pokemon_en,pokemon(s.pokemon_ja)]));
const statMap={hp:'hp',atk:'attack',def:'defense',spatk:'sp_attack',spdef:'sp_defense',ms:'move_speed',crit:'crit_percent',cdr:'cdr_percent',lifesteal:'lifesteal_percent',attackSpeed:'attack_speed_percent',penetration:'penetration'};
for(const s of T){const p=names.get(s.pokemon_name);for(const [dest,col]of Object.entries(statMap))eq(F.P[p][dest][num(s.level)-1],num(s[col]),p+'/'+s.level+'/'+dest);}
const char=F.stats({poke:'リザードン',lv:15,items:[{name:'ピントレンズ',grade:30}]},{status:F.P,itemStats:{'ピントレンズ':Array(30).fill({'急所率':6})}});eq(char.base['急所率'],30,'Charizard intrinsic critical rate');eq(char.totals['急所率'],36,'critical rate is base plus item');
eq(F.stats({poke:'ニンフィア',lv:15},{status:F.P}).base['待ち時間'],10,'Sylveon intrinsic CDR');
const stats={HP:6000,攻撃:400,特攻:400},zero={HP:10000,防御:0,特防:0},armor={HP:10000,防御:600,特防:600};
const rows=(p,n)=>F.K[p].filter(r=>r.name===n),find=(p,n,label)=>rows(p,n).find(r=>r.dmgType===label);
for(const [p,n,v]of [['アブソル','フェイント',478],['ソウブレイズ','ゴーストダイブ',982]]){const r=rows(p,n)[0];eq(F.calc(r,stats,zero,13).value,v,p+' raw hand calculation');eq(F.calc(r,stats,armor,13).value,v,p+' defense must be ignored');}
const shields=Object.values(F.K).flat().filter(r=>!r.narrativeKey&&/追加シールド|過回復シールド/.test(r.dmgType)&&r.coeff!=null);eq(shields.length,10,'known shield classification cases');for(const r of shields)eq(F.kind(r),'shield',r.name+' shield is not damage/healing');
const over=shields.find(r=>/過回復/.test(r.dmgType));eq(F.calc(over,stats,armor,13).value,null,'overheal cannot be reported as unconditional shield');ok(F.calc(over,stats,armor,13).pending,'overheal missing conditions exposed');
eq(F.kind(F.K['ギルガルド'].find(r=>r.dmgType.includes('強化 (シールドフォーム)'))),'damage','shield-form attack stays damage');
for(const [p,n,label,value]of [['ギルガルド','ワイドガード','シールドのHP追加分',561],['カビゴン','とおせんぼう','シールド',2604],['ピクシー','とおせんぼう','シールド',1700],['ミライドン','パラボラチャージ','HP追加回復',360],['キュワワー','ヒーリングシフト','とりつき中の継続回復',60]]){
 const r=find(p,n,label);ok(r,p+'/'+n+'/'+label+' present');eq(F.calc(r,stats,armor,13).value,value,p+'/'+n+' independent manual amount');
}
const selfHeal=find('ミライドン','パラボラチャージ','HP追加回復');eq(F.calc(selfHeal,stats,zero,13,{items:[{name:'レスキューフード',grade:30}],healTarget:'ally'}).value,360,'known self-healing does not receive ally-only bonus');
eq(rows('ピカチュウ','かみなり+').filter(r=>r.coeff!=null&&!r.narrativeKey).map(r=>r.hits),[7],'Thunder+ seven hits');eq(rows('フリーザー','ふぶき+').filter(r=>r.coeff!=null&&!r.narrativeKey).map(r=>r.hits),[8],'Blizzard+ eight hits');
for(const [p,ns]of Object.entries({'メガニウム':['くさむすび'],'ミュウ':['エレキボール','コーチング'],'パルキア':['はどうだん','ドラゴンクロー'],'ウェーニバル':['アクアブレイク'],'ラウドボーン':['バークアウト'],'イベルタル':['あくのはどう']}))for(const n of ns){ok(rows(p,n+'+').length,p+'/'+n+' upgrade exists');ok(F.D.pokemon[p].upgrades[n]?.text,p+'/'+n+' upgrade prose');}
eq(rows('サンダース','ボルトチェンジ+').map(r=>r.cd),[6.5],'Jolteon plus cooldown subtracts 1 second');eq(rows('ニンフィア','めいそう+').filter(r=>!r.narrativeKey).map(r=>r.cd),[null],'missing independent plus CD is not a guessed number');ok(rows('ニンフィア','めいそう+').every(r=>r.cdStatus==='unconfirmed'),'unknown CD state preserved');
for(const [n,lv]of [['アイアンヘッド+',9],['サイコショック+',11],['シャイニングメテオクラッシャー',7]])ok(rows('ソルガレオ',n).every(r=>r.upg===String(lv)),'source-aligned Solgaleo level '+n);
ok(rows('ブラッキー','うそなき').every(r=>r.upg===''),'unconfirmed initial-move level metadata is not promoted');eq(rows('ジュラルドン','メタルクロー+').length,0,'stray enhanced cooldown does not invent an upgrade');
eq(F.K['ファイヤー'].filter(r=>r.slot==='通常攻撃'&&r.coeff===100).map(r=>r.sourceKey).sort(),['Moltres|Basic|Attack|boosted_rsb|base','Moltres|Basic|Attack|rsb|base'].sort(),'equal formulas keep boosted identity');
eq(F.K['ザシアン'].filter(r=>r.slot==='通常攻撃'&&r.sourceKey?.includes('boosted_rsb')&&['base','add1','add2','add3'].some(c=>r.sourceKey.endsWith('|'+c))).length,4,'four Zacian empowered stages retained');
for(const s of S.filter(s=>['ratio_percent','base_value','level_scaling'].some(k=>s[k]!=='')))ok(F.K[pokemon(s.pokemon_ja)].some(r=>r.sourceKey===key(s)),key(s)+' distinct source key preserved');
for(const [p,d]of Object.entries(F.D.pokemon)){ok(F.basic(p).length>0,p+' basic attack explanation');ok(d.unite?.length,p+' Unite reference details');}
ok(F.basic('アブソル').includes('15%')&&F.basic('アブソル').includes('2秒'),'basic debuff amount and duration');ok(F.basic('ニンフィア').includes('75%')&&F.basic('ニンフィア').includes('1秒'),'evolution-specific basic effect');
const cond=F.K['ピカチュウ'].find(r=>r.narrativeKey?.startsWith('Pikachu|Move 1|Electro Ball|rsb|add1'));ok(cond?.description.includes('減少HP×6%'),'enemy missing HP formula exposed');eq(cond.coeff,null,'unknown enemy remaining HP is not calculated using own HP');
ok(F.K['マスカーニャ'].some(r=>r.narrativeKey&&r.description?.includes('量は出典に数値がありません')),'unknown shield is visibly unknown');
const rules=require('../data/lab-reviewed-narratives.json');eq(rules.length,128,'108 prose components and 20 additional terms retained');for(const r of rules.filter(r=>!r.implementedElsewhere))ok(F.K[r.pokemon].some(x=>x.narrativeKey?.startsWith(r.sourceKey+'|')),r.id+' represented');
const html=fs.readFileSync('index.html','utf8');ok(html.includes('v5.76'),'user-facing change log');
console.log('ALL PASS — '+checks+' reviewed reference checks');
