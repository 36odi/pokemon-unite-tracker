// ローカルの既存データ・表示関数だけで生成。取得、認証、DB、全データ再生成は行わない。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(ROOT,p),'utf8').replace(/\r\n/g,'\n');
const BASE='https://36odi.github.io/pokemon-unite-tracker/';
const sources=['js/constants.js','js/utils.js','lab_data.js','lab_descriptions.js','js/lab-core.js','ratio-labels.js','ratio.js','index.html'];
function build(){
  const nodes={ratioResult:{innerHTML:''},labPage:{style:{display:'block'}}};
  const sharedUpgrade=read('index.html').match(/function labUpgradeRows\([\s\S]*?\n}\r?\n/)[0]+read('index.html').match(/function labDescribedEffectHtml\(\)[^\r\n]+/)[0];
  const app=new Function('document','usageIntent','usageUsed',sources.filter(p=>p!=='index.html').map(read).join('\n')+sharedUpgrade+
    '\nreturn {names:Object.keys(LAB_STATUS).sort(compareDisplayNames),status:LAB_STATUS,render(p){ratioPokemon=p;ratioRender();},stats(p,lv){return computeStats({poke:p,lv},{status:LAB_STATUS});},icon:iconImg,esc:escapeHtml};')({getElementById:id=>nodes[id]},()=>null,()=>{});
  const files=new Map(),version=read('sw.js').match(/unite-tracker-v(\d+)/)[1];
  const page=(title,description,relative,body,prefix)=>`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${app.esc(title)}｜ユナイトラボ</title>
<meta name="description" content="${app.esc(description)}"><meta name="color-scheme" content="dark light"><link rel="canonical" href="${BASE+relative}">
<link rel="icon" href="${prefix}images/brand-mark.svg" type="image/svg+xml"><link rel="stylesheet" href="${prefix}styles.css?v=${version}">
<script>try{const t=localStorage.getItem('theme');document.documentElement.classList.toggle('light-mode',t?t==='light':matchMedia('(prefers-color-scheme: light)').matches);}catch{}</script>
</head><body><main class="lab-static">${body}<footer class="site-footer"><p>非公式のファンツールです。ゲームの運営・開発元とは関係ありません。</p></footer></main></body></html>\n`.replace(/[ \t]+$/gm,'');
  const link=(href,label)=>`<a href="${href}">${app.esc(label)}</a>`;
  const description='ポケモンユナイトの基礎ステータス・わざ・特性の説明と計算式を、ログインせずに確認できます。';
  files.set('lab/index.html',page('ポケモン別データ',description,'lab/',`<h1>ユナイトラボ</h1><p>${description}</p>
<nav class="lab-static-nav" aria-label="ラボの入口">${link('../index.html?lab=','計算ラボを開く')}${link('../index.html','対戦記録・ログインへ')}</nav>
<h2>ポケモンを選ぶ</h2><label for="labStaticSearch">名前で検索</label><input class="lab-select lab-static-search" type="search" id="labStaticSearch"><p id="labStaticCount" role="status">${app.names.length}件</p>
<ul class="lab-static-list">${app.names.map(p=>`<li data-name="${app.esc(p)}">${link('pokemon/'+encodeURIComponent(p)+'/index.html',p).replace('>'+app.esc(p), '>'+app.icon(p,'',28).replaceAll('src="images/','src="../images/')+app.esc(p))}</li>`).join('')}</ul>
<script src="../js/lab-static.js?v=${version}"></script>`, '../'));
  for(const p of app.names){
    app.render(p);
    let rendered=nodes.ratioResult.innerHTML.replaceAll('src="images/','src="../../../images/');
    rendered=rendered.replace(/<p><a class="lab-data-link"[\s\S]*?<\/p>/,'');
    rendered=rendered.replace(/<button type="button" onclick="document.getElementById\('ratioSlot(\d)'\).scrollIntoView\(\)">([^<]+)<\/button>/g,'<a href="#ratioSlot$1">$2</a>');
    const columns=Object.keys(app.stats(p,1)),rows=Array.from({length:15},(_,i)=>{const stats=app.stats(p,i+1);return `<tr><th scope="row">${i+1}</th>${columns.map(k=>`<td>${app.esc(stats[k]??'未収録')}</td>`).join('')}</tr>`;}).join('');
    const toolLinks=[['ratio','レシオ一覧'],['calc','ステータス計算'],['dmg','ダメージ計算']].map(([tool,label])=>link('../../../index.html?lab='+encodeURIComponent(p)+'&amp;tool='+tool,label)).join('');
    files.set('lab/pokemon/'+p+'/index.html',page(p+'のデータ',p+'の'+description,'lab/pokemon/'+encodeURIComponent(p)+'/',`<nav class="lab-static-nav" aria-label="ラボの入口">${link('../../index.html','ポケモン一覧')}${link('../../../index.html','対戦記録・ログインへ')}</nav><h1>${app.esc(p)}のデータ</h1>
<nav class="lab-static-nav" aria-label="このポケモンで計算">${toolLinks}</nav>
<h2>基本ステータス</h2><p>もちもの・メダル・条件付き効果なし。割合の値は％です。待ち時間は短縮率、移動速度はゲーム内の値です。</p>
<div class="lab-static-table" tabindex="0" role="region" aria-label="レベル別基本ステータス。横にスクロールできます"><table><caption>Lv1〜15の基本値</caption><thead><tr><th scope="col">Lv</th>${columns.map(k=>`<th scope="col">${app.esc(k)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${rendered}`, '../../../'));
  }
  files.set('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+['','lab/',...app.names.map(p=>'lab/pokemon/'+encodeURIComponent(p)+'/')].map(p=>'<url><loc>'+BASE+p+'</loc></url>').join('')+'</urlset>\n');
  files.set('robots.txt','User-agent: *\nAllow: /\nSitemap: '+BASE+'sitemap.xml\n');
  files.set('data/lab-pages-manifest.json',JSON.stringify({baseUrl:BASE,assetVersion:version,pokemon:app.names,sources:Object.fromEntries(sources.map(p=>[p,crypto.createHash('sha256').update(read(p)).digest('hex')]))},null,2)+'\n');
  return files;
}
if(require.main===module){const check=process.argv.includes('--check'),files=build();for(const [p,body]of files){const full=path.join(ROOT,p);if(check){if(!fs.existsSync(full)||read(p)!==body)throw Error('静的ページを再生成してください: '+p);}else{fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,body);}}console.log((check?'Verified ':'Generated ')+files.size+' static artifacts');}
module.exports={build};
