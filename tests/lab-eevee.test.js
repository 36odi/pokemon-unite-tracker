const fs=require('node:fs'),assert=require('node:assert/strict');
const {S,K}=new Function(fs.readFileSync('lab_data.js','utf8')+';return {S:LAB_STATUS,K:LAB_SKILLS}')();
const {raw,kind}=new Function(fs.readFileSync('js/lab-core.js','utf8')+';return {raw:labRawValue,kind:labEffectKind}')();
let checks=0;const eq=(a,b,n)=>{assert.deepEqual(a,b,n);checks++;};
const find=(p,n,label)=>K[p].find(r=>r.name===n&&r.dmgType===label);
for(const [p,role,dmg,first,last] of [
  ['ブースター','All-Rounder','Physical',[3420,160,88,20,100],[7800,530,440,116,540]],
  ['サンダース','Speedster','Special',[3100,20,70,118,76],[6800,116,280,700,340]]
]){
  eq([S[p].role,S[p].dmg],[role,dmg],p+' role and scaling');
  eq(['hp','atk','def','spatk','spdef'].map(k=>S[p][k][0]),first,p+' Lv1');
  eq(['hp','atk','def','spatk','spdef'].map(k=>S[p][k][14]),last,p+' Lv15');
  for(const k of ['hp','atk','def','spatk','spdef','ms'])eq(S[p][k].length,15,p+' '+k+' levels');
  for(const [name,level] of [[p==='ブースター'?'だいもんじ':'ミサイルばり','4'],[p==='ブースター'?'フレアドライブ':'ボルトチェンジ','6']]){
    eq(K[p].filter(r=>r.name===name).every(r=>r.upg===level),true,name+' learn level');
    eq(K[p].filter(r=>r.name===name+'+').map(r=>r.upg),K[p].filter(r=>r.name===name).map(()=>level==='4'?'10':'12'),name+' upgrade level');
  }
  eq(K[p].filter(r=>r.slot==='ユナイトわざ').every(r=>r.upg==='8'),true,p+' Unite level');
}
const stats={攻撃:530,特攻:700,HP:7800};
for(const [p,name,label,value,hits,effect] of [
  ['ブースター','もらいび','ダメージ（熱波）',426,7,'damage'],
  ['ブースター','スピードスター','ダメージ（星1発あたり）',348,4,'damage'],
  ['ブースター','だいもんじ','ダメージ（命中時）',1627,1,'damage'],
  ['ブースター','だいもんじ','ダメージ（やけど）',106,4,'damage'],
  ['ブースター','フレアドライブ','ダメージ',1328,1,'damage'],
  ['ブースター','フレアドライブ+','ダメージ',1527,1,'damage'],
  ['サンダース','ミサイルばり','ダメージ',720,3,'damage'],
  ['サンダース','ミサイルばり+','ダメージ',720,3,'damage'],
  ['サンダース','通常攻撃','ダメージ（はやあしの特殊強化攻撃）',748,2,'damage'],
  ['サンダース','通常攻撃','回復（はやあしの特殊強化攻撃）',982,1,'heal'],
  ['サンダース','プラズマクインパルス','ダメージ（連続攻撃）',530,4,'damage'],
  ['サンダース','プラズマクインパルス','回復（突進）',982,1,'heal']
]){const r=find(p,name,label);assert.ok(r,p+'/'+name+'/'+label);eq([raw(r,stats,15),r.hits,kind(r)],[value,hits,effect],p+'/'+name+'/'+label);}
eq(find('サンダース','スピードスター','ダメージ（最初の星）').componentNote.includes('30%'),true,'partial same-target star damage explained');
eq(find('ブースター','ガーネットイグニッション','ダメージ（熱波1回あたり）').componentNote.includes('1〜4回'),true,'variable heat waves not assumed as four');
eq(find('サンダース','プラズマクインパルス','回復（突進）').componentNote.includes('4個または5個'),true,'conditional heal not unconditional');
eq(K['ブースター'].filter(r=>r.coeff==null).length,2,'both evolution passive descriptions retained');
eq(K['サンダース'].filter(r=>r.coeff==null).length,2,'both evolution passive descriptions retained');
console.log('ALL PASS — '+checks+' Jolteon/Flareon checks');
