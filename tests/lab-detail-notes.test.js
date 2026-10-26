const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {csv}=require('../tools/lab-data-utils');
const {D,K,P,get}=new Function(fs.readFileSync('lab_data.js','utf8')+fs.readFileSync('lab_descriptions.js','utf8')+fs.readFileSync('js/lab-core.js','utf8')+';return {D:LAB_DESCRIPTIONS,K:LAB_SKILLS,P:LAB_STATUS,get:labDescriptionDetails}')();
const detail=require('../data/lab-detail-notes.json'),source=csv(fs.readFileSync('data/unitedb_ratios.csv','utf8'));
let count=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);count++;},has=(p,n,text,kind='moves')=>eq(get(p,n,kind).some(r=>r.text.includes(text)),true,p+'/'+n+' '+text);
eq(D.meta.detailRules,detail.rules.length,'all reviewed exceptions and source-field additions');eq(D.meta.combatPokemon,103,'all species have combat notes');
for(const r of detail.rules)for(const t of r.targets){const kind=t.kind==='upgrades'?'moves':t.kind,n=t.name+(t.kind==='upgrades'?'+':'');const rows=get(t.pokemon,n,kind),shown=r.status==='documented';eq(rows.filter(x=>x.id===r.id).length,shown?1:0,r.id+' visibility follows confirmed-only policy');if(shown)eq(rows.find(x=>x.id===r.id).status,r.status,r.id+' source status retained');}
for(const [p,c]of Object.entries(detail.combat)){eq(D.pokemon[p].combat.critical,c.critical,p+' critical eligibility');eq(D.pokemon[p].combat.additional,c.additional,p+' additional mechanics');if(/0% base Critical-Hit rate at all levels/.test(c.sourceNotes))eq(P[p].crit.every(v=>v===0),true,p+' zero intrinsic critical rate independently matches the stat table');}
has('ギルガルド','アイアンヘッド','妨害効果は防ぎません');has('ギルガルド','アイアンヘッド+','妨害効果は防ぎません');
eq(get('ギルガルド','てっぺき'),[],'unconfirmed Iron Defense specification stays hidden');
has('ミミッキュ','ばけのかわ','原則として妨害効果は残ります','passives');has('ブラッキー','ムーンライトセレナーデ','レックウザ');has('ワタシラガ','グラスミキサー+','命中を条件');eq(get('ワタシラガ','グラスミキサー').some(r=>r.text.includes('命中を条件')),false,'plus-only exception never applies to base');
has('ニンフィア','フェアリーハーモニー','シールドへ与えたダメージでは発生しない');has('パーモット','マッハパンチ+','押し出し・行動不能は付きません');
has('リーフィア','通常攻撃','追加ダメージ部分','basics');eq(D.pokemon['メガギャラドス'].basics['通常攻撃'].text.startsWith('3回目が強化'),false,'normal Gyarados rule is not applied to Mega unconditionally');
eq(get('ラティアス','ドラゴンエール').some(r=>r.status==='conflict'),false,'conflicting targeting rules stay hidden');eq(get('ドラパルト','ドラグーンショット').some(r=>r.status==='conflict'),false,'unresolved cooldown specification stays hidden');
eq(detail.rules.find(r=>r.id==='E054').status,'conflict','source conflict is preserved in the research record');eq(/未確定|出典間|出典に/.test(D.pokemon['ラティアス'].moves['ドラゴンエール'].text),false,'summary does not expose unresolved targeting claims');
eq(D.pokemon['レシラム'].uniteCondition.includes('3回目'),true,'Reshiram shared buffs require empowered cast');
for(const [p,english,name]of [['ウーラオス','Flowing Fists','蒼流の舞踏'],['バシャーモ','Spinning Flame Kick','爆炎旋風脚']]){const rows=K[p].filter(r=>r.sourceKey?.split('|')[2]===english);eq(rows.length>0,true,'separate Unite rows exist '+p);eq(rows.every(r=>r.name===name),true,'Unite name follows source component '+p);}
eq(D.pokemon['ダークライ'].combat.critical.includes('急所が発生しません'),true,'critical stat does not imply all moves can crit');eq(D.pokemon['エンペルト'].combat.additional.some(t=>t.includes('HP吸収が適用されません')),true,'lifesteal exception');eq(D.pokemon['ミュウ'].combat.critical.includes('強化攻撃は急所になりません'),true,'ordinary and boosted attacks separated');
const before=JSON.stringify(K);for(const p of Object.keys(D.pokemon))get(p,'不明');eq(JSON.stringify(K),before,'explanation lookups never modify numeric data');eq(get('不明','不明'),[],'no invented unknown explanations');
const apply=require('../tools/lab_detail_notes'),old=detail.meta.referenceSha256;try{detail.meta.referenceSha256='0'.repeat(64);assert.throws(()=>apply({},source),/再確認/);count++;}finally{detail.meta.referenceSha256=old;}
const changed=source.map(s=>s.pokemon_en==='Alcremie'&&s.move_en==='Decorate'&&s.ratio_component==='base'?{...s,notes:'changed evidence'}:s);assert.throws(()=>apply(JSON.parse(JSON.stringify(D.pokemon)),changed),/根拠文を再確認/);count++;
const changedSummary=JSON.parse(JSON.stringify(D.pokemon));changedSummary['バリヤード'].upgrades['バリアー'].text+=' changed';assert.throws(()=>apply(changedSummary,source),/要約の確認記録/);count++;
eq(D.pokemon['ヤドラン'].upgrades['なみのり'].text.includes('2・3回目の波の範囲が広がり'),true,'Surf+ retains area upgrade from description2');
eq(D.pokemon['ヤドラン'].upgrades['なみのり'].text.includes('減速効果はなくなります'),true,'Surf+ loss of slowing is visible');
const {verify}=require('../tools/verify_lab_detail_sources'),sha=s=>crypto.createHash('sha256').update(s).digest('hex'),raw=Buffer.from(JSON.stringify([{notes:'Only auto attacks',description:'verified text'}])),foreign=[{url:'https://example.test/source',sha256:'page-hash',entries:[{name:'Attack',text:'foreign source text'}]}];
const fixture={meta:{referenceSha256:sha(raw)},rules:[{id:'fixture',proofs:[{kind:'unitedb-text',pointer:'/0/description',textSha256:sha('verified text')}],foreignReferences:[{url:foreign[0].url,pageSha256:foreign[0].sha256,entries:[{name:'Attack',textSha256:sha(foreign[0].entries[0].text)}]}]}],combat:{test:{sourcePointer:'pokemon.json#/0/notes',sourceNotesSha256:sha('Only auto attacks')}}};
eq(verify(fixture,raw,foreign).rawFields,2,'raw field verification');eq(verify(fixture,raw,foreign).foreignEntryReferences,1,'foreign reference traceability');
assert.throws(()=>verify(fixture,Buffer.from('[]'),foreign),/版が異なり/);count++;
const wrong=JSON.parse(JSON.stringify(fixture));wrong.rules[0].proofs[0].pointer='/0/missing';assert.throws(()=>verify(wrong,raw,foreign),/根拠不一致/);count++;
const wrongForeign=JSON.parse(JSON.stringify(foreign));wrongForeign[0].entries[0].text='different source';assert.throws(()=>verify(fixture,raw,wrongForeign),/参照不一致/);count++;
has('デカヌチャン','アイスハンマー','攻撃と特攻を、どちらも2.5秒間30%');
eq(D.pokemon['デカヌチャン'].upgrades['アイスハンマー'].text.includes('攻撃と特攻を下げる割合が、どちらも50%'),true,'official patch corrects both debuff stats in upgrade');
has('デカヌチャン','デカハンマー','0.5秒・1秒・1.5秒');
has('ミミッキュ','トリックルーム','50%');
eq(D.pokemon['サーナイト'].moves['テレポート'].text.includes('忘れた後も続きます'),true,'retained damage increase persists after replacement under verified scope');
console.log('ALL PASS — '+count+' detailed mechanics checks');
