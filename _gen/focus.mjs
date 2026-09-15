import { newTab, closeTab, Session, sleep } from "./cdp.mjs";
const tab = await newTab(); const s = await Session.connect(tab.webSocketDebuggerUrl);
await s.send("Page.enable"); await s.send("Runtime.enable");
await s.send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
const l = s.once("Page.loadEventFired");
await s.send("Page.navigate",{url:"http://127.0.0.1:8765/"}); await l; await sleep(800);
await s.eval(`document.body.focus(); window.scrollTo(0,0); 1`);
const rows = [];
for (let i = 0; i < 12; i++) {
  for (const type of ["rawKeyDown","keyUp"])
    await s.send("Input.dispatchKeyEvent",{type,key:"Tab",code:"Tab",windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
  await sleep(140);
  rows.push(await s.eval(`(()=>{const e=document.activeElement;if(!e||e===document.body)return {el:"body"};
    const c=getComputedStyle(e);
    return {el:(e.tagName.toLowerCase()+"."+String(e.className||"").split(" ")[0]).slice(0,34),
      text:(e.textContent||"").replace(/\s+/g," ").trim().slice(0,26),
      outline:c.outlineStyle+" "+c.outlineWidth+" "+c.outlineColor, offset:c.outlineOffset,
      visible: e.getBoundingClientRect().top >= -5}})()`));
}
rows.forEach((r,i)=>console.log(String(i+1).padStart(2), (r.el||"").padEnd(34), (r.text||"").padEnd(28), "outline:", r.outline||"-", "| offset", r.offset||"-", "| inView", r.visible));
s.close(); await closeTab(tab.id);
