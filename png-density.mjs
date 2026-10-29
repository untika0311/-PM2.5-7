import fs from 'node:fs';
export function setPngDensity(file,ppi=300){
 const b=fs.readFileSync(file);const parts=[b.subarray(0,8)];
 const crc=data=>{let n=0xffffffff;for(const v of data){n^=v;for(let k=0;k<8;k++)n=(n>>>1)^((n&1)?0xedb88320:0)}return (n^0xffffffff)>>>0};
 const data=Buffer.alloc(9);data.writeUInt32BE(Math.round(ppi/.0254),0);data.writeUInt32BE(Math.round(ppi/.0254),4);data[8]=1;
 const type=Buffer.from('pHYs');const chunk=Buffer.alloc(21);chunk.writeUInt32BE(9);type.copy(chunk,4);data.copy(chunk,8);chunk.writeUInt32BE(crc(Buffer.concat([type,data])),17);
 for(let pos=8;pos<b.length;){const len=b.readUInt32BE(pos),name=b.toString('ascii',pos+4,pos+8);if(name!=='pHYs')parts.push(b.subarray(pos,pos+12+len));if(name==='IHDR')parts.push(chunk);pos+=12+len}
 fs.writeFileSync(file,Buffer.concat(parts));
}
