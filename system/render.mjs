import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {setPngDensity} from './png-density.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH??'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
try{
 const page=await browser.newPage({viewport:{width:2480,height:3508},deviceScaleFactor:1});
 await page.goto(pathToFileURL(path.resolve('public/report.html')).href);
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
 await page.evaluate(()=>{document.body.style.width='2480px';document.body.style.height='3508px';const el=document.querySelector('.page');el.style.transformOrigin='top left';el.style.transform='scale('+2480/1080+')'});
 await page.screenshot({path:'public/report.png',fullPage:false});
 setPngDensity('public/report.png',300);
 const png=fs.readFileSync('public/report.png');if(png.readUInt32BE(16)!==2480||png.readUInt32BE(20)!==3508)throw Error('A4 image size check failed');
 for(const quality of [60,40,25]){await page.screenshot({path:'public/preview.jpg',type:'jpeg',quality,fullPage:false});if(fs.statSync('public/preview.jpg').size<=1_000_000)break}
 if(png.length>10_000_000||fs.statSync('public/preview.jpg').size>1_000_000)throw Error('LINE image size limit exceeded');
 await page.evaluate(()=>{document.body.style.width='';document.body.style.height='';document.querySelector('.page').style.transform=''});
 await page.pdf({path:'public/report.pdf',width:'210mm',height:'297mm',printBackground:true,preferCSSPageSize:true});
 const meta=JSON.parse(fs.readFileSync('public/report.json','utf8'));
 const id=process.env.GITHUB_RUN_ID??'manual';
 const archive=`reports/${meta.date}/${id}`;fs.mkdirSync('public/'+archive,{recursive:true});
 for(const f of ['report.html','report.png','preview.jpg','report.pdf','report.json','background.png','index.html'])fs.copyFileSync('public/'+f,'public/'+archive+'/'+f);
 fs.writeFileSync('public/delivery.json',JSON.stringify({date:meta.date,image:archive+'/report.png',preview:archive+'/preview.jpg',page:archive+'/index.html'}));
 const cutoff=new Date(Date.parse(meta.date+'T12:00:00+07:00')-60*864e5).toISOString().slice(0,10);
 for(const name of fs.readdirSync('public/reports'))if(/^\d{4}-\d{2}-\d{2}$/.test(name)&&name<cutoff)fs.rmSync(path.join('public/reports',name),{recursive:true});
 console.log('Rendered daily report and dated archive.');
}finally{await browser.close()}
