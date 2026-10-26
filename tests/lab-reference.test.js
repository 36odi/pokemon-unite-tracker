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
eq(F.calc(find('イワパレス','砕石旋風塁','シールド'),stats,armor,13).value,3000,'Rubble Rouser adds a self-HP shield: 6000 times 40 percent plus 600');
eq(F.calc(find('ドードリオ','トライアタック+','HP追加回復（＋版で増える分）'),stats,armor,13).value+F.calc(find('ドードリオ','トライアタック+','HP追加回復'),stats,armor,13).value,600,'Tri Attack+ healing combines seven and three percent without treating the extra term as total');
eq(rows('ドードリオ','トライアタック').filter(r=>r.dmgType.includes('＋版で増える分')).length,0,'upgrade-only healing does not leak into the base move');
for(const n of ['シャドーボール','シャドーボール+'])eq(F.calc(find('ドラパルト',n,'HP回復（4つ目のマーク消費）'),stats,armor,13).value,1200,'Shadow Ball fourth-mark healing stays present in both versions');
for(const n of ['はかいこうせん','はかいこうせん+'])ok(rows('カイリュー',n).filter(r=>r.sourceKey&&r.coeff!=null).every(r=>r.componentNote?.includes('追加項')),'all Hyper Beam stages separate the enemy-HP term');
for(const [p,n,label,total]of [
 ['プクリン','ころがる','シールド',1500],['ブラッキー','ムーンライトセレナーデ','非戦闘時の回復（1秒ごと）',60],['オーロット','通常攻撃','回復（強化攻撃命中時）',300],['カビゴン','ばくすいインパクト','回復（ねむり中・1回分）',600]
])eq(F.calc(find(p,n,label),stats,armor,13).value,total,p+' independent self-HP amount');
for(const [p,n,sourceKey,raw]of [
 ['ギルガルド','かげうち','Aegislash|Move 1|Shadow Sneak|rsb|base',1362],
 ['ギルガルド','シャドークロー','Aegislash|Move 1|Shadow Claw|rsb|base',756],
 ['ドードリオ','ドリルくちばし','Dodrio|Move 1|Drill Peck|rsb|base',1326],
 ['ドードリオ','ドリルくちばし','Dodrio|Move 1|Drill Peck|rsb|add1',2210],
 ['サーナイト','フェアリーヴォイド','Gardevoir|Unite Move|Fairy Singularity|rsb|add1',1520],
 ['ヌメルゴン','アシッドボム','Goodra|Move 2|Acid Spray|rsb|add1',764],
 ['バリヤード',"It'sショータイム",'Mr.Mime|Unite Move|Showtime|rsb|base',1788],
 ['オーロット','ウッドホーン','Trevenant|Move 2|Horn Leech|rsb|base',840],
 ['バクフーン','爆炎ヒートヘイズ','Typhlosion|Unite Move|Explosive Heat Haze|rsb|base',4088],
 ['ウーラオス','通常攻撃','Urshifu|Basic|Attack - Kubfu|boosted_rsb|add3',480]
])eq(F.calc(rows(p,n).find(r=>r.sourceKey===sourceKey),stats,zero,13).value,raw,p+' source per-hit formula times full hit count');
for(const n of ['ソルガレオ','ニンフィア','イベルタル'])for(const r of F.K[n].filter(r=>r.supplement==='narrative'&&/与えたダメージ|残っていたシールド/.test(r.description||'')))eq(F.calc(r,stats,armor,13)?.value??null,null,n+' actual dealt damage is not guessed from raw damage');
for(const [n,second,third]of [['つじぎり',141,56],['つじぎり+',166,66]]){eq(F.calc(find('マスカーニャ',n,'回復（通常攻撃の回復周期・2回目）'),stats,armor,13).value,second,'Night Slash second healing uses its own normal/plus formula');eq(F.calc(find('マスカーニャ',n,'回復（通常攻撃の回復周期・3回目）'),stats,armor,13).value,third,'Night Slash third healing uses its own normal/plus formula');}
eq(F.calc(find('モルペコ','スパーク+','シールド（まんぷくもよう・再使用）'),stats,armor,13).value,900,'official 2026-10-13 Spark+ shield: 15 percent of 6000 HP');
eq(rows('モルペコ','スパーク').filter(r=>r.dmgType.includes('まんぷくもよう・再使用')).length,0,'official upgraded shield is not present on normal Spark');
const psy=rows('グレンアルマ','サイコショック').find(r=>r.sourceKey==='Armarouge|Move 2|Psyshock|rsb|base');
eq(F.calc(psy,stats,armor,13).value,429,'Psyshock raw 708 against SpDef 600 with native 35 percent penetration');
eq(F.calc(psy,stats,armor,13,{spdefPen:15}).value,472,'Psyshock and Spoon add to 50 percent penetration: 708 times 600 over 900');
eq(F.calc(psy,stats,zero,13).value,708,'native penetration changes defense mitigation, not the raw formula');
for(const n of ['ねらいうち','ねらいうち+'])for(const [stage,raw,actual,spoon]of [['base',492,265,289],['add1',764,424,463],['add2',1011,577,631]]){
 const r=rows('インテレオン',n).find(r=>r.sourceKey==='Inteleon|Move 2|Snipe Shot|rsb|'+stage);
 eq(F.calc(r,stats,zero,13).value,raw,'Snipe Shot distance formula is unchanged: '+n+'/'+stage);
 eq(F.calc(r,stats,armor,13).value,actual,'Snipe Shot ignores 15/20/25 percent by distance: '+n+'/'+stage);
 eq(F.calc(r,stats,armor,13,{spdefPen:15}).value,spoon,'Snipe Shot adds Spoon penetration to intrinsic penetration: '+n+'/'+stage);
}
const selfHeal=find('ミライドン','パラボラチャージ','HP追加回復');eq(F.calc(selfHeal,stats,zero,13,{items:[{name:'レスキューフード',grade:30}],healTarget:'ally'}).value,360,'known self-healing does not receive ally-only bonus');
eq(rows('ピカチュウ','かみなり+').filter(r=>r.coeff!=null&&!r.narrativeKey).map(r=>r.hits),[7],'Thunder+ seven hits');eq(rows('フリーザー','ふぶき+').filter(r=>r.coeff!=null&&!r.narrativeKey).map(r=>r.hits),[8],'Blizzard+ eight hits');
eq(rows('ニンフィア','ハイパーボイス').filter(r=>r.coeff!=null&&!r.narrativeKey).map(r=>r.hits),[6,6],'Hyper Voice has six near/far waves');
eq(rows('ニンフィア','ハイパーボイス+').filter(r=>r.coeff!=null&&!r.narrativeKey).map(r=>r.hits),[7,7],'Hyper Voice+ adds a seventh wave in both ranges');
ok(F.D.pokemon['ニンフィア'].upgrades['ハイパーボイス'].text.includes('7回'),'Hyper Voice+ wave increase is shown alongside slow');
for(const [p,n,label,hits]of [['フシギバナ','ヘドロばくだん','範囲',10],['ゼラオラ','ほうでん','ヒット毎',6]])for(const suffix of ['', '+']){
 const r=rows(p,n+suffix).find(r=>r.dmgType.includes(label));eq(r.hits,hits,p+' actual generated hit count is retained');ok(!/6 ヒット|13 回 最大/.test(r.dmgType),p+' stale source count is not shown in the component label');
}
for(const [p,ns]of Object.entries({'メガニウム':['くさむすび'],'ミュウ':['エレキボール','コーチング'],'パルキア':['はどうだん','ドラゴンクロー'],'ウェーニバル':['アクアブレイク'],'ラウドボーン':['バークアウト'],'イベルタル':['あくのはどう']}))for(const n of ns){ok(rows(p,n+'+').length,p+'/'+n+' upgrade exists');ok(F.D.pokemon[p].upgrades[n]?.text,p+'/'+n+' upgrade prose');}
eq(rows('サンダース','ボルトチェンジ+').map(r=>r.cd),[6.5],'Jolteon plus cooldown subtracts 1 second');eq(rows('ニンフィア','めいそう+').filter(r=>!r.narrativeKey).map(r=>r.cd),[8],'Calm Mind+ uses the base cooldown under the source display rule');ok(rows('ニンフィア','めいそう+').every(r=>r.cdStatus!=='unconfirmed'),'verified base inheritance is not marked unknown');
for(const [n,lv]of [['アイアンヘッド+',9],['サイコショック+',11],['シャイニングメテオクラッシャー',7]])ok(rows('ソルガレオ',n).every(r=>r.upg===String(lv)),'source-aligned Solgaleo level '+n);
ok(rows('ブラッキー','うそなき').every(r=>r.upg===''),'unconfirmed initial-move level metadata is not promoted');eq(rows('ジュラルドン','メタルクロー+').length,0,'stray enhanced cooldown does not invent an upgrade');
eq(F.K['ファイヤー'].filter(r=>r.slot==='通常攻撃'&&r.coeff===100).map(r=>r.sourceKey).sort(),['Moltres|Basic|Attack|boosted_rsb|base','Moltres|Basic|Attack|rsb|base'].sort(),'equal formulas keep boosted identity');
eq(F.K['ザシアン'].filter(r=>r.slot==='通常攻撃'&&r.sourceKey?.includes('boosted_rsb')&&['base','add1','add2','add3'].some(c=>r.sourceKey.endsWith('|'+c))).length,4,'four Zacian empowered stages retained');
for(const s of S.filter(s=>['ratio_percent','base_value','level_scaling'].some(k=>s[k]!=='')))ok(F.K[pokemon(s.pokemon_ja)].some(r=>r.sourceKey===key(s)),key(s)+' distinct source key preserved');
for(const [p,d]of Object.entries(F.D.pokemon)){ok(F.basic(p).length>0,p+' basic attack explanation');ok(d.unite?.length,p+' Unite reference details');}
ok(F.basic('アブソル').includes('15%')&&F.basic('アブソル').includes('2秒'),'basic debuff amount and duration');ok(F.basic('ニンフィア').includes('75%')&&F.basic('ニンフィア').includes('1秒'),'evolution-specific basic effect');
const cond=F.K['ピカチュウ'].find(r=>r.narrativeKey?.startsWith('Pikachu|Move 1|Electro Ball|rsb|add1'));ok(cond?.description.includes('減少HP×6%'),'enemy missing HP formula exposed');eq(cond.coeff,null,'unknown enemy remaining HP is not calculated using own HP');
const trailShield=find('マスカーニャ','くさわけ+','シールド（使用時）');
eq(F.calc(trailShield,stats,armor,13).value,1560,'Trailblaze+ at level 13 gives 26 percent of 6000 HP');
eq(F.calc(trailShield,stats,armor,15).value,1620,'level growth changes the HP percentage to 27 percent, not a flat HP addition');
eq(rows('マスカーニャ','くさわけ').filter(r=>F.kind(r)==='shield').length,0,'Trailblaze shield belongs only to the upgrade');
const rain=find('ヌメルゴン','あめあめふれふれ','回復（雨）');
eq(F.calc(rain,stats,armor,13).value,3588,'Right as Rain restores 276 HP in each of 13 documented ticks');
eq(F.calc(rain,{...stats,HP:6100},armor,13).value,3640,'rain rounds each 4.6 percent tick before multiplying by 13');
eq(F.calc(find('エーフィ','アシストパワー','回復（みらいよち強化・1発分）'),stats,armor,13).value,150,'Future Sight empowered Stored Power restores 150 HP per blast');
for(const[label,value]of [['パンチの回復（1〜2段階）',540],['パンチの回復（3〜4段階）',600],['パンチの回復（5〜6段階）',660],['パンチの回復（7〜8段階）',720]])eq(F.calc(find('メタグロス','コメットパンチ+',label),stats,armor,13).value,value,'all four Meteor Mash+ healing tiers are independently available');
eq(rows('メタグロス','コメットパンチ').some(r=>r.effectKind==='heal'),false,'Meteor Mash healing remains upgrade-only');
for(const[p,n,label,value]of [['ウェーニバル','アクアブレイク+','HP回復（＋版）',720],['ザシアン','こうそくいどう','シールド（エナジー強化）',770],['ヨクバリス','まるくなる','シールド',600],['プクリン','まるくなる','シールド',1500],['カビゴン','ねむる','回復（ねむる）',1440],['ヤドラン','なまける','回復（基本量・0.5秒ごと）',120],['ヤドラン','なまける','回復（休息中・0.5秒ごと）',240],['カイリュー','通常攻撃','回復（水の強化攻撃）',300],['ホウオウ','さいせいりょく','回復（非戦闘時・2秒ごと）',180],['ホウオウ','さいせいりょく','回復（常時・2秒ごと）',18]])eq(F.calc(find(p,n,label),stats,armor,13).value,value,p+'/'+label+' independent manual amount');
const naturalCure=find('オーロット','しぜんかいふく','回復（しぜんかいふく）');
eq(F.calc(naturalCure,stats,armor,13).value,1992,'Natural Cure: floor(6000 times 4.16 percent) times eight ticks');
eq(F.calc(naturalCure,stats,armor,15).value,2168,'Natural Cure level growth changes the percentage, not a flat HP term');
const rules=require('../data/lab-reviewed-narratives.json');eq(rules.filter(r=>!r.id.startsWith('N')).length,128,'108 prose components and 20 additional terms retained');eq(rules.length,128+require('../data/lab-narrative-additions.json').length,'new independently reviewed prose formulas added');for(const r of rules.filter(r=>!r.implementedElsewhere))eq(F.K[r.pokemon].some(x=>x.narrativeKey?.startsWith(r.sourceKey+'|')),!r.publicationStatus||r.publicationStatus==='documented',r.id+' confirmed-only publication');
for(const[p,n,label,value]of [['ヨクバリス','ほおぶくろ','きのみの追加回復（オボン・カムラ）',83],['カビゴン','くいしんぼう','追加回復（オレンのみ）',83],['バンギラス','だっぴ','シールド（だっぴ）',600],['ヨクバリス','ほおばる','シールド（きのみ1個）',108],['ヤミラミ','はたきおとす+','回復（エナジー取得）',540],['ヤミラミ','かげうち+','回復（ステルス中・0.5秒ごと）',60]])eq(F.calc(find(p,n,label),stats,armor,13).value,value,p+'/'+label+' independent conditional amount');
const oranExtra=F.K['ヨクバリス'].find(r=>r.narrativeKey?.startsWith('Greedent|Passive|Cheek Pouch|rsb|add2|'));eq(F.calc(oranExtra,stats,armor,13).value,119,'Oran/Unite berry includes level scaling, unlike Sitrus/Salac');
for(const id of ['N043','N044','N045','N046','N047','N050','N051']){const rule=rules.find(r=>r.id===id),rs=F.K[rule.pokemon];ok(rs.filter(r=>r.narrativeKey?.startsWith(rule.sourceKey+'|')).every(r=>/[+＋]$/.test(r.name)),id+' HP term is upgrade-only');const touched=rs.filter(r=>rule.affectedSourceKeys.includes(r.sourceKey||r.derivedFrom?.sourceKey));ok(touched.filter(r=>/[+＋]$/.test(r.name)).every(r=>r.componentNote.includes('文章中の追加項')),id+' every upgraded fixed and derived portion is explicitly partial');ok(touched.filter(r=>!/[+＋]$/.test(r.name)).every(r=>!r.componentNote?.includes('文章中の追加項')),id+' base fixed portion never inherits plus-only notice');}
for(const id of ['N044','N045','N046','N047','N048','N049','N050','N051','N052','N055','N059','N060','N061','N062']){const rule=rules.find(r=>r.id===id),r=F.K[rule.pokemon].find(r=>r.narrativeKey?.startsWith(rule.sourceKey+'|'));eq(F.calc(r,stats,armor,13)?.value??null,null,id+' remaining HP/healing/damage conditions are not substituted with maximum HP');}
const html=fs.readFileSync('index.html','utf8');ok(html.includes('v5.76'),'user-facing change log');
for(const[name,values]of [['じたばた',[654,1262,885,1653]],['じたばた+',[808,1416,1116,1884]]])for(const [label,value]of [['通常攻撃（じたばた・HP段階1）',values[0]],['通常攻撃（じたばた・HP段階5）',values[1]],['強化攻撃（じたばた・HP段階1）',values[2]],['強化攻撃（じたばた・HP段階5）',values[3]]])eq(F.calc(find('カビゴン',name,label),stats,zero,13).value,value,'Flail attack plus self HP formula '+name+'/'+label);
eq(F.calc(find('カビゴン','じたばた','通常攻撃（じたばた・HP段階1）'),{...stats,HP:6100,攻撃:401.5},zero,13).value,659,'mixed attack and HP terms retain decimals until final floor');
eq(F.calc(find('カビゴン','じたばた+','強化攻撃（じたばた・HP段階5）'),stats,armor,13).value,942,'mixed-stat Flail damage uses physical defense after combining terms');
for(const suffix of ['', '+'])for(const[label,value]of [['ダメージ（初撃・ためなし）',178],['ダメージ（初撃・ため中）',220],['ダメージ（初撃・最大ため）',268],['ダメージ（マーク追撃・固定部分・ためなし）',246],['ダメージ（マーク追撃・固定部分・ため中）',308],['ダメージ（マーク追撃・固定部分・最大ため）',370],['ダメージ（最後のリング・固定部分・ためなし）',318],['ダメージ（最後のリング・固定部分・ため中）',399],['ダメージ（最後のリング・固定部分・最大ため）',478]])eq(F.calc(find('ジュラルドン','りゅうのはどう'+suffix,label),stats,zero,13).value,value,'renderer-only Dragon Pulse charge formula '+suffix+'/'+label);
for(const suffix of ['', '+'])for(const label of ['追加ダメージ（マーク追撃・1回分）','追加ダメージ（最後のリング）'])eq(F.calc(find('ジュラルドン','りゅうのはどう'+suffix,label),stats,armor,13)?.value??null,null,'Dragon Pulse missing HP terms remain conditional');
eq(rows('カビゴン','じたばた').filter(r=>r.hpPercent).length,10,'five normal and five boosted Flail stages');eq(rows('カビゴン','じたばた+').filter(r=>r.hpPercent).length,10,'Flail+ has independently sourced coefficients');
ok(F.K['ヌメルゴン'].some(r=>r.narrativeKey?.startsWith('Goodra|Basic|Attack|boosted_rsb|add1|')&&r.description.includes('相手の最大HP×3%')),'official patch identifies Goodra additional damage target');
ok(rows('キュワワー','てんしのキッス').some(r=>r.description?.includes('0.2秒＋0.1秒×消費した花')),'official patch resolves stale Sweet Kiss base duration');
const zacianFirst=F.K['ザシアン'].find(r=>r.narrativeKey?.startsWith('Zacian|Basic|Attack|boosted_rsb|base|'));ok(zacianFirst.description.includes('相手の最大HP×1%')&&zacianFirst.description.includes('400'),'first empowered stage includes the supplemental HP term and wild cap');eq(F.calc(zacianFirst,stats,armor,13)?.value??null,null,'enemy HP term is not calculated from Zacian own HP');ok(F.K['ザシアン'].find(r=>r.sourceKey==='Zacian|Basic|Attack|boosted_rsb|base').componentNote.includes('文章中の追加項'),'empowered first fixed portion is explicitly partial');
ok(F.K['フシギバナ'].some(r=>r.narrativeKey?.startsWith('Venusaur|Move 2|Solar Beam|rsb|add1|')&&r.description.includes('5ヒットそれぞれ')),'Solar Beam percent term is identified as per hit, not the whole five-hit total');
console.log('ALL PASS — '+checks+' reviewed reference checks');
