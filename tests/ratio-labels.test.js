const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const K=new Function(fs.readFileSync(path.join(root,'lab_data.js'),'utf8')+';return LAB_SKILLS')();
const before=JSON.stringify(K);
const {label,name,note,components}=new Function('LAB_SKILLS',fs.readFileSync(path.join(root,'ratio-labels.js'),'utf8')+
  ';return {label:ratioLabel,name:ratioMoveName,note:ratioComponentNote,components:RATIO_COMPONENT_LABELS}')(K);
let checks=0;const eq=(a,b,msg)=>{assert.deepEqual(a,b,msg);checks++;};
for(const [poke,rows] of Object.entries(K)){
  const labels=new Set();
  for(const r of rows){
    const text=label(poke,r),key=[r.slot,name(poke,r),r.upg,text].join('|');
    eq(/[a-z]/i.test(text.replace(/HP|KO/g,'')),false,poke+'/'+r.name+' no mixed English');
    eq(text.includes('要確認'),false,poke+'/'+r.name+' known component structure');
    eq(/[ ：&]|ティック|毎/.test(text),false,poke+'/'+r.name+' consistent Japanese formatting');
    let depth=0;for(const c of text){if(c==='（')depth++;if(c==='）')depth--;assert.ok(depth>=0,text);}
    eq(depth,0,poke+'/'+r.name+' balanced condition parentheses');
    eq(labels.has(key),false,poke+'/'+r.name+' distinguish each condition');labels.add(key);
  }
}
const pick=(p,n,d)=>K[p].filter(r=>r.name===n&&(!d||r.dmgType===d));
eq(pick('カメックス','しおふき').map(r=>label('カメックス',r)),['ダメージ（通常時）','ダメージ（こうそくスピン中）'],'same formula different modes');
eq(pick('ヌメルゴン','りゅうのはどう','ダメージ').map(r=>label('ヌメルゴン',r)),['ダメージ（中心）','ダメージ（周囲）'],'center/side damage');
eq(pick('ヌメルゴン','りゅうのはどう+','回復').map(r=>label('ヌメルゴン',r)),['回復（中心に命中・ぬめぬめなし）','回復（中心に命中・ぬめぬめあり）'],'upgrade healing conditions');
eq(pick('マッシブーン','ウルトラバルクマスキュラー').map(r=>label('マッシブーン',r)),['ダメージ（最初の範囲攻撃）','ダメージ（HP割合が最も低い相手への追撃）'],'identical numeric rows kept');
eq(pick('バシャーモ','爆炎旋風拳').map(r=>name('バシャーモ',r)),['爆炎旋風拳','爆炎旋風脚'],'separate names');
eq(pick('ウーラオス','漆黒の終拳').map(r=>name('ウーラオス',r)),['漆黒の終拳','漆黒の終拳','漆黒の終拳','蒼流の舞踏','蒼流の舞踏','蒼流の舞踏'],'style names preserve all components');
eq(label('ピカチュウ',pick('ピカチュウ','エレキボール')[0]),'範囲ダメージ','remove incorrect copied six-hit annotation');
eq(label('アブソル',pick('アブソル','つじぎり','ダメージ - 初撃')[0]),'ダメージ（2段目）','Second Hit is not first hit');
eq(pick('ギャラドス','じたばた').every(r=>label('ギャラドス',r).includes('自分のHP')),true,'Flail depends on own HP');
eq(note('ヌメルゴン',pick('ヌメルゴン','りゅうのはどう','回復')[0]).includes('含まれません'),true,'incomplete formula clearly noted');
eq(label('マホイップ',pick('マホイップ','ふわふわハッピーシャワー')[0]),'回復（クリーム1個あたり・最大48個）','cream unit and limit retained');
eq(label('サーナイト',pick('サーナイト','フェアリーヴォイド').find(r=>r.dmgType.includes('ティック'))),'継続ダメージ（全4回）','tick wording retains count');
eq(label('ミライドン',pick('ミライドン','チャージビーム').find(r=>r.dmgType==='ダメージ - 通常')),'ダメージ（通常時）','normal move damage is not called basic attack');
eq(label('バシャーモ',pick('バシャーモ','オーバーヒート').find(r=>r.dmgType.includes('中 チャージ'))),'ダメージ（中程度までためたとき）','charge wording');
eq(JSON.stringify(K),before,'display dictionary never changes source data');
console.log('ALL PASS — '+checks+' label checks');
