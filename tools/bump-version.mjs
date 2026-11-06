// Run from any directory: node tools/bump-version.mjs 1.2.5
import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const write=(path,data)=>writeFileSync(new URL(path,root),data);
const next=process.argv[2];
const current=JSON.parse(read('release.json')).version;
const valid=v=>/^\d+\.\d+\.\d+$/.test(v||'');
function newer(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;}
if(!valid(next)||!newer(next,current)){console.error(`Use a numeric version newer than ${current}, for example 1.2.5.`);process.exit(1);}
for(const path of ['index.html','app.js','sw.js']){
  let content=read(path).replace(/\?v=\d+(?:\.\d+)*/g,`?v=${next}`);
  if(path.endsWith('index.html')) content=content.replace(/name="app-version" content="[^"]+"/,`name="app-version" content="${next}"`).replace(/id="app-version">版本 [^<]+/,`id="app-version">版本 ${next}`);
  if(path.endsWith('sw.js')) content=content.replace(/const VERSION='[^']+';/,`const VERSION='${next}';`);
  write(path,content);
}
write('release.json',JSON.stringify({version:next,date:new Date().toISOString().slice(0,10)})+'\n');
const pkg=JSON.parse(read('package.json'));pkg.version=next;write('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log(`Prepared ${next}. Run npm test, then upload all changed files together.`);
