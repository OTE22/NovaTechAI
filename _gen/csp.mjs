import { newTab, closeTab, Session, sleep } from "./cdp.mjs";
const PAGES = ["/","/solutions/","/platforms/","/work/","/training/","/research/","/contact/","/blogs/","/blogs/agentic-ai-revenue.html","/404.html"];
let violations = [], other = [];
for (const path of PAGES) {
  const tab = await newTab();
  const s = await Session.connect(tab.webSocketDebuggerUrl);
  await s.send("Page.enable"); await s.send("Runtime.enable"); await s.send("Log.enable"); await s.send("Network.enable");
  s.on("Log.entryAdded", (p) => {
    const t = p.entry.text || "";
    if (/Content Security Policy|Refused to/i.test(t)) violations.push({ path, text: t.slice(0,180) });
    else if (p.entry.level === "error") other.push({ path, text: t.slice(0,160) });
  });
  s.on("Runtime.exceptionThrown", (p) => other.push({ path, text: p.exceptionDetails?.text }));
  s.on("Network.loadingFailed", (p) => other.push({ path, text: "loadingFailed " + p.errorText }));
  await s.send("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  const l = s.once("Page.loadEventFired");
  await s.send("Page.navigate", { url: "http://127.0.0.1:8766" + path });
  await l; await sleep(900);
  // exercise the JS paths that touch the CSSOM and the DOM
  await s.eval(`window.scrollTo(0, 600); document.querySelector(".nav-toggle") && null; 1`);
  await sleep(400);
  const fontsOk = await s.eval(`document.fonts.check("16px 'NovaTech Serif Display'")`);
  const jsRan = await s.eval(`document.querySelector("[data-year]") ? document.querySelector("[data-year]").textContent : "n/a"`);
  console.log(path.padEnd(32), "fontsLoaded=" + fontsOk, "jsRan(year)=" + jsRan);
  s.close(); await closeTab(tab.id);
}
console.log("\nCSP violations:", violations.length);
violations.forEach(v => console.log("  ", v.path, v.text));
console.log("Other errors:", other.length);
other.forEach(v => console.log("  ", v.path, v.text));
