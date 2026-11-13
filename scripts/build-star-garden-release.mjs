// Run after editing app assets, before publishing. --check never writes.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=new URL('../star-garden/',import.meta.url);
const file=new URL('sw.js',base),source=await readFile(file,'utf8');
const paths=['./','./index.html','./growth-app.mjs','./home-companion.mjs','./growth-model.mjs','./growth.css','./growth-interactions.mjs','./growth-interactions.css','./style.css','./app.mjs','./update.mjs','./model.mjs','./art.mjs','./companion-photo.mjs','./photo-decode-worker.mjs','./celebration.mjs','./celebration.css','./manifest.webmanifest','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/apple-touch-icon.png'];
const entries=await Promise.all(paths.map(async path=>[path,'sha256-'+createHash('sha256').update(await readFile(new URL(path==='./'?'./index.html':path,base))).digest('base64')]));
const id=createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0,16);
const block=`// BEGIN GENERATED RELEASE\nconst RELEASE_ID='${id}';\nconst ASSET_ENTRIES=${JSON.stringify(entries)};\n// END GENERATED RELEASE`;
const next=source.replace(/\/\/ BEGIN GENERATED RELEASE[\s\S]*?\/\/ END GENERATED RELEASE/,block);
if(next===source){console.log('Star garden release manifest is current.');}
else if(process.argv.includes('--check')){console.error('Run node scripts/build-star-garden-release.mjs before publishing.');process.exitCode=1;}
else {await writeFile(file,next);console.log('Built star garden release '+id);}
