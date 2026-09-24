import { newTab, closeTab, Session } from './cdp.mjs';
import { writeFileSync, readFileSync } from 'node:fs';
const t=await newTab(); const s=await Session.connect(t.webSocketDebuggerUrl);
await s.send('Page.enable');await s.send('Runtime.enable');
const loaded=s.once('Page.loadEventFired');await s.send('Page.navigate',{url:'http://127.0.0.1:8765/'});await loaded;
for(const [path,size,ratio] of [['assets/img/favicon-32.png',32,.94],['apple-touch-icon.png',180,.78],['assets/img/icon-192.png',192,.78],['assets/img/icon-512.png',512,.78],['assets/img/icon-maskable-512.png',512,.64]]) {
 const data=await s.eval(`(async()=>{const img=new Image();img.src='/assets/img/novatechai-logo.png';await img.decode();const c=document.createElement('canvas');c.width=c.height=${size};const ctx=c.getContext('2d');ctx.fillStyle='#070d18';ctx.fillRect(0,0,c.width,c.height);const w=c.width*${ratio},h=w*img.naturalHeight/img.naturalWidth;ctx.drawImage(img,(c.width-w)/2,(c.height-h)/2,w,h);return c.toDataURL('image/png').split(',')[1]})()`);
 writeFileSync(path,Buffer.from(data,'base64'));
}
const png=readFileSync('assets/img/favicon-32.png');const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[6]=ico[7]=32;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);writeFileSync('favicon.ico',Buffer.concat([ico,png]));
writeFileSync('favicon.svg',`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32"><image width="32" height="32" xlink:href="data:image/png;base64,${png.toString('base64')}"/></svg>\n`);
for(const width of [375,1440]){
 await s.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
 console.log(width,await s.eval(`({overflow:document.documentElement.scrollWidth>innerWidth,logos:[...document.querySelectorAll('.brand__mark')].map(i=>({loaded:i.complete&&i.naturalWidth>0,width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height}))})`));
 const shot=await s.send('Page.captureScreenshot',{format:'png'});writeFileSync('_gen/logo-preview-'+width+'.png',Buffer.from(shot.data,'base64'));
}
s.close();await closeTab(t.id);
