export const PROVINCES = [
  {name:'ขอนแก่น',iso:'TH-40',station:'46t',center:[102.55,16.45]},
  {name:'มหาสารคาม',iso:'TH-44',station:'114t',center:[103.12,15.95]},
  {name:'ร้อยเอ็ด',iso:'TH-45',station:'113t',center:[103.85,15.95]},
  {name:'กาฬสินธุ์',iso:'TH-46',station:'107t',center:[103.65,16.65]},
];
export function round1(n){return Math.round((n+Number.EPSILON)*10)/10}
export function valid(n){return n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n))&&Number(n)>=0}
export function level(value){
  if(!valid(value))return {index:-1,color:'#dce7ea',name:'ไม่มีข้อมูล'};
  const n=round1(Number(value));
  const i=n<=15?0:n<=25?1:n<=37.5?2:n<=75?3:4;
  return {index:i,color:['#9edcfa','#97d873','#ffe153','#ffaf68','#f77c87'][i],name:['ดีมาก','ดี','ปานกลาง','เริ่มมีผลกระทบต่อสุขภาพ','มีผลกระทบต่อสุขภาพ'][i]};
}
export const dayShift=(date,days)=>new Date(Date.parse(date+'T12:00:00+07:00')+days*864e5).toISOString().slice(0,10);
export function windowMean(rows,end){
  const endMs=Date.parse(end.replace(' ','T')+'+07:00');
  if(!Number.isFinite(endMs))throw Error('Invalid observation timestamp');
  const byTime=new Map();
  for(const r of rows){const t=Date.parse(r.DATETIMEDATA.replace(' ','T')+'+07:00');if(t>endMs-864e5&&t<=endMs&&valid(r.PM25))byTime.set(t,Number(r.PM25));}
  // Require every one-hour endpoint; gaps are unknown, never zero.
  for(let h=0;h<24;h++)if(!byTime.has(endMs-h*36e5))return {value:null,hours:byTime.size};
  return {value:round1([...byTime.values()].reduce((a,b)=>a+b,0)/24),hours:24};
}
export function consecutive(values,predicate){let n=0;for(const v of values){if(!valid(v)||!predicate(round1(v)))break;n++}return n}
export function airReport(latest,history,date){
  if(!Array.isArray(latest.stations)||history.result!=='OK'||!Array.isArray(history.stations)||!history.stations.some(s=>s.data?.length))throw Error('Air4Thai schema changed or history unavailable');
  const provinces=PROVINCES.map(p=>{
    const stations=latest.stations.filter(s=>s.areaTH?.includes(p.name==='กาฬสินธุ์'?'กาฬสิน':p.name));
    if(!stations.length)throw Error('No registered station for '+p.name);
    const timestamps=[...new Set(stations.map(s=>s.AQILast?.date+' '+s.AQILast?.time))];
    const stamp=timestamps.length===1?timestamps[0]:null;
    const complete=stamp?.startsWith(date)&&stations.every(s=>valid(s.AQILast?.PM25?.value));
    const value=complete?round1(stations.reduce((n,s)=>n+Number(s.AQILast.PM25.value),0)/stations.length):null;
    const past=Array.from({length:7},(_,i)=>{
      const d=dayShift(date,-i);const means=stations.map(s=>windowMean(history.stations.find(h=>h.stationID===s.stationID)?.data??[],d+' 07:00:00'));
      const ok=means.every(x=>x.value!==null);
      return {date:d,value:ok?round1(means.reduce((a,b)=>a+b.value,0)/means.length):null,minHours:Math.min(...means.map(x=>x.hours)),max:ok?Math.max(...means.map(x=>x.value)):null};
    });
    // Display provincial station mean, but retain station maximum for conservative PHEOC screening.
    const highDays=consecutive(past.map(x=>x.max),v=>v>=75.1);
    const lowDays=consecutive(past.map(x=>x.max),v=>v<75.1);
    return {...p,stations:stations.map(s=>({id:s.stationID,name:s.nameTH,time:s.AQILast?.date+' '+s.AQILast?.time,value:valid(s.AQILast?.PM25?.value)?Number(s.AQILast.PM25.value):null})),stamp,value,level:level(value),past,highDays,lowDays,screening:past.slice(0,2).some(x=>x.max===null)?'ข้อมูลไม่ครบ':highDays>=2?'เข้าเกณฑ์เปิด':lowDays>=7?'เข้าเกณฑ์ปิด':'ยังไม่เข้าเกณฑ์เปิด'};
  });
  const stamps=[...new Set(provinces.map(p=>p.stamp))];
  const complete=provinces.every(p=>p.value!==null)&&stamps.length===1;
  const mean=complete?round1(provinces.reduce((a,p)=>a+p.value,0)/4):null;
  return {provinces,mean,level:level(mean),stamp:complete?stamps[0]:null,above:complete?provinces.filter(p=>p.value>37.5).length:null,method:'ค่าเฉลี่ยรายจังหวัดจากสถานีที่มีข้อมูลครบ ณ เวลาเดียวกัน; ค่าเฉลี่ยเขตให้น้ำหนักจังหวัดเท่ากัน; คัดกรอง PHEOC ด้วยค่าสูงสุดสถานีรายจังหวัด ไม่ใช่สถานะเปิดจริง'};
}
export function roomsReport(rows,date){
  if(!Array.isArray(rows)||!rows.length||!('SelfAssessment' in rows[0]))throw Error('Cleanroom schema changed');
  const year=Number(date.slice(0,4))-1;const start=`${year}${date.slice(4)}`;
  const clean=rows.filter(r=>r.HealthZone==='เขตสุขภาพที่ 7'&&r.EvaluationResult==='ผ่าน'&&r.Type&&r.Type!=='ที่พักอาศัย'&&r.SelfAssessment?.slice(0,10)>=start&&r.SelfAssessment?.slice(0,10)<=date&&PROVINCES.some(p=>p.name===r.Province));
  // API has no stable room ID: count source records without merging same-location rooms.
  // Exact duplicate rows are reported for review rather than silently deleting potentially distinct rooms.
  const fingerprints=new Set();let duplicateRows=0;
  for(const r of clean){const key=JSON.stringify(r);if(fingerprints.has(key))duplicateRows++;fingerprints.add(key)}
  const summarize=rs=>({rooms:rs.length,districts:new Set(rs.filter(r=>r.District).map(r=>r.Province+'|'+r.District)).size,subdistricts:new Set(rs.filter(r=>r.Subdistrict&&r.District).map(r=>r.Province+'|'+r.District+'|'+r.Subdistrict)).size});
  return {total:summarize(clean),provinces:PROVINCES.map(p=>({name:p.name,...summarize(clean.filter(r=>r.Province===p.name))})),types:Object.entries(Object.groupBy(clean,r=>r.Type)).map(([name,a])=>({name,count:a.length})),duplicateRows,missingLocation:clean.filter(r=>!r.District||!r.Subdistrict).length,start,date,method:'นับรายการต้นทางอาคารสาธารณะ ประเมินตนเองผ่าน ในช่วงวันครบหนึ่งปีย้อนหลังถึงวันรายงาน รวมวันต้นและวันปลาย; ไม่ใช่ยืนยันเปิดบริการ'};
}
