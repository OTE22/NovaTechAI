import { newTab, closeTab, Session, sleep } from "./cdp.mjs";
const PAGES=["/","/solutions/","/platforms/","/work/","/training/","/research/","/contact/","/blogs/","/blogs/agentic-ai-revenue.html","/404.html"];
for (const w of [320, 360]) {
  for (const path of PAGES) {
    const tab=await newTab(); const s=await Session.connect(tab.webSocketDebuggerUrl);
    await s.send("Page.enable"); await s.send("Runtime.enable");
    await s.send("Emulation.setDeviceMetricsOverride",{width:w,height:720,deviceScaleFactor:1,mobile:true});
    const l=s.once("Page.loadEventFired");
    await s.send("Page.navigate",{url:"http://127.0.0.1:8765"+path}); await l; await sleep(500);
    const o=await s.eval(`(()=>{const vw=document.documentElement.clientWidth;const bad=[];
      document.querySelectorAll("body *").forEach(el=>{const r=el.getBoundingClientRect();
        if(!r.width&&!r.height)return;
        if(r.right>vw+1.5||r.left<-1.5){let p=el,c=false;while(p&&p!==document.body){const ov=getComputedStyle(p).overflowX;
          if(ov==="auto"||ov==="scroll"||ov==="hidden"||ov==="clip"){c=true;break}p=p.parentElement}
          if(!c)bad.push(el.tagName.toLowerCase()+"."+String(el.className.baseVal??el.className??"").split(" ")[0])}});
      return {sw:document.documentElement.scrollWidth,cw:vw,bad:[...new Set(bad)].slice(0,5)}})()`);
    if (o.sw > o.cw + 1 || o.bad.length) console.log(w+"px", path, "scrollW="+o.sw, o.bad.join(" | "));
    s.close(); await closeTab(tab.id);
  }
}
console.log("narrow-viewport scan complete");
