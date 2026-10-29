import fs from 'node:fs';import crypto from 'node:crypto';
// Credentials are environment-only. Never place them in generated reports or logs.
const token=process.env.LINE_CHANNEL_ACCESS_TOKEN,to=process.env.LINE_USER_ID,base=process.env.REPORT_BASE_URL;
if(!token||!to||!base)throw Error('Set LINE_CHANNEL_ACCESS_TOKEN, LINE_USER_ID and REPORT_BASE_URL as deployment secrets/config.');
if(!base.startsWith('https://'))throw Error('Image hosting must use HTTPS');
const delivery=JSON.parse(fs.readFileSync('public/delivery.json','utf8'));
const report=JSON.parse(fs.readFileSync('public/report.json','utf8'));
if(report.date!==new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()))throw Error('Refusing to send a report for a different date');
const join=p=>base.replace(/\/$/,'')+'/'+p;
const imageUrl=join(delivery.image),previewUrl=join(delivery.preview),pageUrl=join(delivery.page);
let imageReady=false;for(let i=0;i<12;i++){try{const r=await fetch(imageUrl,{method:'HEAD',signal:AbortSignal.timeout(15000)});if(r.ok&&r.headers.get('content-type')?.includes('image/')){imageReady=true;break}}catch{}await new Promise(r=>setTimeout(r,5000))}
if(!imageReady)throw Error('Public report image not available; LINE send skipped');
const hash=crypto.createHash('sha256').update('than-akat-daily-'+delivery.date).digest('hex');
const retryKey=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
const text=`ทันอากาศ ${delivery.date}\nข้อมูลฝุ่น ณ ${report.air.stamp??'เวลาข้อมูลไม่ตรงกัน'}\nค่าเฉลี่ยเขต 7: ${report.air.mean??'ข้อมูลไม่ครบ'} มคก./ลบ.ม.\nห้องปลอดฝุ่นอาคารสาธารณะ ${report.rooms.total.rooms} รายการ\n${pageUrl}`;
const body=JSON.stringify({to,messages:[{type:'text',text},{type:'image',originalContentUrl:imageUrl,previewImageUrl:previewUrl}]});
for(let i=0;i<3;i++){
 let r;try{r=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Line-Retry-Key':retryKey},body,signal:AbortSignal.timeout(25000)})}catch{if(i===2)throw Error('LINE connection failed');continue}
 if(r.ok||(r.status===409&&r.headers.get('x-line-accepted-request-id'))){console.log(r.ok?'LINE daily report accepted.':'LINE already accepted this day; duplicate avoided.');break}
 if(r.status<500||i===2)throw Error('LINE rejected delivery: HTTP '+r.status);
 await new Promise(r=>setTimeout(r,2000));
}
