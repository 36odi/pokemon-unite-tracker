// 静的本文はJavaScriptなしでも読める。検索だけを補助する。
(()=>{
  const input=document.getElementById('labStaticSearch');if(!input)return;
  const normalize=s=>s.normalize('NFKC').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60)).toLocaleLowerCase('ja');
  input.addEventListener('input',()=>{let count=0;for(const row of document.querySelectorAll('[data-name]')){row.hidden=!normalize(row.dataset.name).includes(normalize(input.value.trim()));if(!row.hidden)count++;}document.getElementById('labStaticCount').textContent=count+'件';});
})();
