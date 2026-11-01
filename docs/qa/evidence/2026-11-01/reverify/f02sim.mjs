// F-02 condition forced: a proxy on the real socket withholds server messages after ACTIVITY_START, as if the server held the turn open and sent no words.
import { launch, call, summary } from "./rig.mjs";
const env=await launch();
for (const [mode,n] of [["release",3],["never",2]]) for(let i=1;i<=n;i++){
  let hold=false; const held=[]; let cli;
  await env.context.routeWebSocket(/generativelanguage/,ws=>{ cli=ws; const srv=ws.connectToServer();
    ws.onMessage(m=>{ srv.send(m); const s=typeof m==="string"?m:m.toString(); if(hold&&mode==="release"&&s.includes("clientContent")){hold=false;held.splice(0).forEach(x=>ws.send(x))} });
    srv.onMessage(m=>{ if(hold){held.push(m);return} ws.send(m); const s=typeof m==="string"?m:m.toString(); if(s.includes("ACTIVITY_START"))hold=true; });});
  const c=await call(env,`f02-${mode}-${i}`); await c.quiet(1200,12000); await c.say("work");
  const t=Date.now(); await c.sleep(mode==="release"?12000:24000); await c.quiet(1000,3000); const body=await c.page.locator("body").innerText(); const ev=await c.ev();
  const end=ev.find(e=>e[1]==="MIC_END")[0]; const sent=ev.filter(e=>e[1]==="SENT"&&e[0]>end&&/waiting/.test(e[2])).map(e=>+(e[0]-end).toFixed(1)); const sock=ev.filter(e=>e[1]==="WS_NEW"&&e[0]>end).map(e=>+(e[0]-end).toFixed(1)); const sp=ev.filter(e=>e[1]==="PCM"&&e[0]>end)[0]; 
  const fin=await c.end(); const d=await c.dump({mode,sent,sock}); console.log(`=== ${c.name} nudges+${JSON.stringify(sent)} newSocket+${JSON.stringify(sock)} firstAudio+${sp?(sp[0]-end).toFixed(1):"none"} giveUp=${/trouble answering/i.test(body)} savedStatus=${fin?.status}`); await c.page.close(); await env.context.unrouteAll();}
await env.browser.close();
