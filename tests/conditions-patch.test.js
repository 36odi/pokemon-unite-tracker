const fs=require('node:fs'),assert=require('node:assert/strict');
const utils=fs.readFileSync('js/utils.js','utf8'),constants=fs.readFileSync('js/constants.js','utf8');
const {codec,core,tierMap}=new Function(constants+utils+fs.readFileSync('js/calc-conditions-core.js','utf8')+fs.readFileSync('js/patch-analysis-core.js','utf8')+';return {codec:CalcConditionCodec,core:PatchAnalysisCore,tierMap:buildPlayedTierMap};')();
let n=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);n++;};const bad=(f,label)=>{assert.throws(f,label);n++;};
const equipment={items:[{name:'こだわりメガネ',grade:1},{name:'すりぬけスプーン',grade:40},{name:'',grade:30}],activeEffects:['こだわりメガネ'],goalCount:6,koStack:20,dmgStack:4,healTarget:'ally',proc:{TargetPct:50.5,SelfPct:null,HPDamage:321}};
const c={schema:1,dataVersion:'test',attacker:'ピカチュウ',defender:'カビゴン',attackLevel:15,defendLevel:1,skills:[{name:'エレキボール',upgrade:'4'},{name:'',upgrade:''}],medal:{label:'秘密の名前',slots:['ピジョン',...Array(9).fill(null)],rarities:Array(10).fill('silver')},attack:equipment,defense:equipment,baseline:equipment,name:'共有しない',note:'共有しない',user_id:'共有しない',battles:[{id:'共有しない'}]};
const clean=codec.sanitize(c);eq(codec.decode(codec.encode(c)),clean,'Japanese fractional inputs and both sides roundtrip');
eq(Object.keys(clean).sort(),['schema','dataVersion','attacker','defender','attackLevel','defendLevel','skills','medal','attack','defense','baseline'].sort(),'only calculation fields');
eq(clean.medal.label,undefined,'medal personal label removed');eq(JSON.stringify(clean).includes('共有しない'),false,'private metadata removed');
for(const [key,value] of [['schema',2],['attackLevel',0],['defendLevel',16],['attackLevel',1.5],['attacker',''],['skills',[]],['medal',{slots:[],rarities:[]}],['baseline',{}]])bad(()=>codec.sanitize({...c,[key]:value}),'reject '+key);
for(const [key,value] of [['goalCount',7],['koStack',21],['dmgStack',5],['healTarget','invalid'],['proc',{TargetPct:101,SelfPct:null,HPDamage:null}],['items',[{name:'x',grade:0}]],['activeEffects',[null]]])bad(()=>codec.sanitize({...c,attack:{...equipment,[key]:value}}),'reject equipment '+key);
bad(()=>codec.decode('!bad'),'malformed URL');bad(()=>codec.decode('A'.repeat(16001)),'oversized URL');
const time=Date.parse('2026-09-03T13:00:00+09:00'),day=86400000;
const b={pokemon:'ピカチュウ',result:'win',match_type:'solo',skill1:'エレキボール',skill2:'ボルテッカー',items:'A,B',battle_item:'だっしゅつボタン',medal_set:null,rank:'レート 990',kills:0,dmg_dealt:1000};
const rows=[{...b,created_at:new Date(time-7*day).toISOString()},{...b,created_at:new Date(time-1).toISOString()},
 {...b,result:'loss',rank:'レート 1005',created_at:new Date(time).toISOString(),kills:10,dmg_dealt:null},
 {...b,result:'loss',played_rank:'レジェンド',created_at:new Date(time+1).toISOString(),kills:100,dmg_dealt:8000,exclude_from_avg_stats:true},
 {...b,is_bot:true,created_at:new Date(time+2).toISOString(),kills:20},
 {...b,created_at:new Date(time+7*day).toISOString()},
 {...b,created_at:new Date(time-7*day-1).toISOString()},
 {...b,created_at:null},{...b,created_at:'invalid'}];
const before=JSON.stringify(rows),map=tierMap(rows);
const o={pokemon:'ピカチュウ',boundary:'2026-09-03T13:00:00+09:00',days:7,now:time+8*day};
const a=core.analyze(rows,o,map);eq([a.a.n,a.b.n,a.a.wins,a.b.wins],[2,2,2,0],'inclusive left, exact boundary after, exclusive right, BOT excluded');eq(a.difference,-100,'rate delta is percentage points');eq(a.unknown,2,'null and invalid dates excluded');
eq(a.b.stats.rows[0].all,10,'average exclusion retained');eq(a.b.stats.rows[0].allN,1,'per-field numerator');eq(a.b.stats.rows[2].all,null,'missing damage not zero');eq(a.b.stats.excludedN,1,'excluded stats count');
eq(core.analyze(rows,{...o,excludeBots:false},map).b.n,3,'BOT included independently');eq(core.analyze(rows,{...o,rank:'レジェンド'},map).b.n,1,'manual actual rank retained');eq(core.analyze(rows,{...o,rank:'マスター'},map).b.n,1,'pre-match rate rank uses previous record');
eq(core.buildKey(b),core.buildKey({...b,items:'B,A'}),'item order normalized');eq(core.analyze(rows,{...o,build:core.buildKey({...b,skill1:'かみなり'})},map).a.n,0,'different builds do not match');eq(core.analyze(rows,{...o,mode:'full'},map).difference,null,'empty side no comparison');
eq(core.analyze(rows,{...o,now:time+1},map).future,1,'future timestamps excluded');eq(core.analyze(rows,{...o,now:time+day},map).incomplete,true,'unfinished post period explicit');eq(JSON.stringify(rows),before,'original records not mutated');
console.log('ALL PASS — '+n+' conditions/patch logic checks');
