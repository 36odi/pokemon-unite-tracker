const fs=require('node:fs'),vm=require('node:vm');
function csv(text){let q=false,f='',row=[],rows=[];for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(q&&text[i+1]==='"'){f+='"';i++;}else q=!q;}else if(!q&&(c===','||c==='\n')){row.push(f);f='';if(c==='\n'){rows.push(row);row=[];}}else if(c!=='\r')f+=c;}if(f||row.length){row.push(f);rows.push(row);}const h=rows.shift();return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));}
function replaceObject(src,name,value){const start=src.indexOf('const '+name+'=');if(start<0)throw Error('宣言なし: '+name);let i=src.indexOf('{',start),begin=i,depth=0,q=null;for(;i<src.length;i++){const c=src[i];if(q){if(c==='\\')i++;else if(c===q)q=null;continue;}if(c==='"'||c==="'"||c==='`'){q=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return src.slice(0,begin)+JSON.stringify(value)+src.slice(i+1);}throw Error('範囲不明: '+name);}
function loadData(file='lab_data.js'){const c=vm.createContext({});vm.runInContext(fs.readFileSync(file,'utf8')+';this.K=LAB_SKILLS;this.P=LAB_STATUS;',c);return {K:c.K,P:c.P};}
const key=r=>[r.pokemon_en,r.skill_slot,r.move_en,r.source_object,r.ratio_component].join('|');
const num=v=>Number(String(v||0).replaceAll(',',''));
const norm=x=>String(x||'').normalize('NFKC').replace(/[+＋]$/,'').replace('大顎クラッシュバイド','大顎クラッシュバイト');
const pokemon=x=>x.replace('ミュウツー(X)','ミュウツーX').replace('ミュウツー(Y)','ミュウツーY');
const hasEvidence=(s,text)=>[s.true_description,s.notes,s.rsb_info].filter(Boolean).join(' ').replace(/\s+/g,' ').includes(String(text).replace(/\s+/g,' '));
module.exports={csv,replaceObject,loadData,key,num,norm,pokemon,hasEvidence};
