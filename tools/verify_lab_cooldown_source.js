const fs=require('fs'),crypto=require('crypto'),rule=require('../data/lab-cooldown-semantics.json');
const i=process.argv.indexOf('--source');if(i<0)throw Error('--source に取得した出典の画面表示コードを指定');
const raw=fs.readFileSync(process.argv[i+1]),text=raw.toString('utf8');
if(crypto.createHash('sha256').update(raw).digest('hex')!==rule.sourceSha256||rule.evidence.some(e=>!text.includes(e)))throw Error('出典の待ち時間の表示規則が変わっています。再確認が必要です。');
console.log('PASS — Unite-DB source UI cooldown rule and file hash match');
