import { newTab, closeTab, Session, sleep } from "./cdp.mjs";
import { writeFileSync } from "node:fs";
const variants = [["home","og-home"],["insights","og-insights"],["agentic","og-agentic-ai-revenue"]];
for (const [v, name] of variants) {
  const tab = await newTab(); const s = await Session.connect(tab.webSocketDebuggerUrl);
  await s.send("Page.enable"); await s.send("Runtime.enable");
  await s.send("Emulation.setDeviceMetricsOverride",{width:1200,height:630,deviceScaleFactor:1,mobile:false});
  const l = s.once("Page.loadEventFired");
  await s.send("Page.navigate",{url:"http://127.0.0.1:8765/_gen/og.html?v="+v});
  await l; await sleep(1200);
  await s.eval(`document.fonts.ready.then(()=>1)`);
  await sleep(400);
  const shot = await s.send("Page.captureScreenshot",{format:"jpeg",quality:92,
    clip:{x:0,y:0,width:1200,height:630,scale:1}});
  const buf = Buffer.from(shot.data,"base64");
  writeFileSync(`./assets/img/${name}.jpg`, buf);
  console.log(name+".jpg", Math.round(buf.length/1024)+" KB");
  s.close(); await closeTab(tab.id);
}
