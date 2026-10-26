// 原本を変更せず、確認済みのセルだけをアプリの単位へそろえる。
// 根拠と取得物: docs/lab-medal-calculation.md / work/.../stage2。
'use strict';
function applyMedalCorrections(medals,sets){
  for(const name of ['ニャース','ペルシアン','カモネギ']){
    const m=medals.find(m=>m.name===name);
    if(!m||m.upStat!=='急所率'||![0.006,0.6].includes(m.gUp))throw Error('金の急所率の原本が変わっています: '+name);
    m.gUp=0.6;
  }
  const navy=sets['ネイビー'];
  if(!navy||navy.length!==3)throw Error('ネイビーの原本が変わっています');
  navy.forEach((tier,i)=>{
    const expected=[1,2,4][i];
    if(tier.target!=='ユナイトわざゲージの溜まりやすさ'||tier.count!==[3,5,7][i]||!tier.isPct||Math.abs(tier.val)!==expected)throw Error('ネイビーの原本が変わっています');
    tier.val=expected;
  });
}
module.exports={applyMedalCorrections};
