const semantics=require('../data/lab-cooldown-semantics.json');
module.exports=function(cd,reduction,plusLevel){
 if(semantics.rule!=='positive-upgrade-reduction-otherwise-base')throw Error('出典の待ち時間の表示規則を再確認してください');
 if(cd!==null&&!Number.isFinite(cd)||reduction!==null&&!Number.isFinite(reduction))throw Error('待ち時間の数値を確認してください');
 if(cd===null||plusLevel===null)return{plusCD:null,plusCDMode:null};
 return{plusCD:cd-(reduction>0?reduction:0),plusCDMode:reduction>0?'reduced':'source-base'};
};
