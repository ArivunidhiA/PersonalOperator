import { launch, call, summary } from "./rig.mjs";
const env = await launch();
const kill=(c)=>c.page.evaluate(()=>{const s=window.__qa.sockets.at(-1); s.close(4000); window.__qa.log("QA_KILL",1)});
const out={};
// A: real network loss while idle, then ask what was said
{ const c=await call(env,"rc-offline"); await c.quiet(1200,12000); await c.say("work"); await c.speaks(10000); await c.quiet(1500,20000);
  await env.context.setOffline(true); await c.page.evaluate(()=>window.__qa.log("QA_OFFLINE",1)); await c.sleep(4000); await env.context.setOffline(false); await c.page.evaluate(()=>window.__qa.log("QA_ONLINE",1));
  await c.sleep(4000); await c.say("recall"); const s=await c.speaks(15000); await c.quiet(1500,20000); const alive=await c.page.getByRole("button",{name:/^end$/i}).isVisible().catch(()=>false);
  const fin=alive?await c.end():null; const d=await c.dump({alive,s,finish:fin?.status}); console.log(`=== ${c.name} alive=${alive} s=${s} ${fin?.status}\n`+summary(d.ev)); await c.page.close(); }
// B: socket killed mid agent speech
{ const c=await call(env,"rc-midspeech"); await c.quiet(1200,12000); await c.say("long_q"); await c.speaks(10000); await c.sleep(2500); await kill(c); const s=await c.speaks(12000); await c.quiet(1500,25000);
  await c.say("recall"); await c.speaks(12000); await c.quiet(1500,20000); const fin=await c.end(); const d=await c.dump({s,finish:fin?.status}); console.log(`=== ${c.name} s=${s} ${fin?.status}\n`+summary(d.ev)); await c.page.close(); }
// C: socket killed while a tool runs
{ const c=await call(env,"rc-tool"); await c.quiet(1200,12000); await c.say("free");
  for(let i=0;i<200;i++){ if(await c.page.evaluate(()=>window.__qa.ev.some(e=>e[1]==="TOOL")))break; await c.sleep(50);} await kill(c); const s=await c.speaks(15000); await c.quiet(1500,25000);
  const fin=await c.end(); const d=await c.dump({s,finish:fin?.status}); console.log(`=== ${c.name} s=${s} ${fin?.status}\n`+summary(d.ev)); await c.page.close(); }
// D: exhaust the reconnect budget
{ const c=await call(env,"rc-exhaust"); await c.quiet(1200,12000); await c.say("work"); await c.quiet(1500,15000);
  for(let i=0;i<3;i++){ await kill(c).catch(()=>{}); await c.sleep(5000);} 
  const notice=await c.page.locator("body").innerText(); const ended=!(await c.page.getByRole("button",{name:/^end$/i}).isVisible().catch(()=>false)); await c.sleep(4000);
  const d=await c.dump({ended,notice:/dropped/i.test(notice),saved:/Your transcript/i.test(await c.page.locator("body").innerText())}); console.log(`=== ${c.name} ended=${ended} dropped-notice=${d.notice} savedPanel=${d.saved}\n`+summary(d.ev)); await c.page.close(); }
await env.browser.close();
