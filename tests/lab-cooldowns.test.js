const assert=require('node:assert/strict'),fs=require('fs'),resolve=require('../tools/lab_cooldown_semantics'),meta=require('../data/lab-reference-metadata.json'),{loadData,norm,csv,key}=require('../tools/lab-data-utils');
let n=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);n++;};
eq(resolve(8,null,12),{plusCD:8,plusCDMode:'source-base'},'empty reduction uses base as the source UI does');
eq(resolve(7.5,1,12),{plusCD:6.5,plusCDMode:'reduced'},'positive upgrade reduction');
eq(resolve(8,0,12),{plusCD:8,plusCDMode:'source-base'},'explicit zero reduction');
eq(resolve(null,1,12),{plusCD:null,plusCDMode:null},'missing base cooldown is never zero');
eq(resolve(8,null,null),{plusCD:null,plusCDMode:null},'missing upgrade level does not create an upgrade');
eq(resolve(8,1,null),{plusCD:null,plusCDMode:null},'stray reduction does not establish a missing upgrade');
eq(resolve(8,-1,12),{plusCD:8,plusCDMode:'source-base'},'source UI only subtracts positive reductions');
const {K}=loadData(),S=csv(fs.readFileSync('data/unitedb_ratios.csv','utf8')),byKey=new Map(S.map(s=>[key(s),s]));let checked=0;
for(const[p,rows]of Object.entries(K))for(const r of rows.filter(r=>/[+＋]$/.test(r.name))){const s=byKey.get(r.sourceKey),m=meta.pokemon[p].moves.find(m=>s?m.slot===s.skill_slot&&m.sourceName===s.move_en:norm(m.name)===norm(r.name));if(!m)continue;eq(r.cd,m.plusCD,p+'/'+r.name+' cooldown follows source metadata');if(m.plusCD!==null)eq(r.cdStatus==='unconfirmed',false,p+'/'+r.name+' no false unknown state');checked++;}
eq(checked>300,true,'all upgrade variants covered');
for(const[p,name,expected]of [['ニンフィア','めいそう+',8],['ストリンダー','オーバードライブ+',9],['サンダース','ボルトチェンジ+',6.5]]){const rows=K[p].filter(r=>r.name===name);eq(rows.length>0,true,p+' rows exist');eq(rows.every(r=>r.cd===expected),true,p+' independent checked cooldown');}
console.log('ALL PASS — '+n+' cooldown checks');
