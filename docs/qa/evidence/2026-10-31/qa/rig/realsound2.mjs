// Real sound: MacBook speakers play the agent, MacBook mic hears the room, real Chrome echo canceller. Caller is `say` through the same speakers.
import { launch, call, summary } from "./rig.mjs";
import { spawn } from "child_process";
const speak=(t,v="Samantha")=>new Promise(r=>spawn("say",["-v",v,t]).on("exit",r));
const UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Playwright";
const env=await launch({headed:true,realMic:true,ua:UA});
for (const i of [4,5,6,7,8,9]) { const c=await call(env,`real-${i}`);
  await c.quiet(1500,15000);
  await c.page.evaluate(()=>window.__qa.log("QA_ECHO_START",1));
  await speak("Tell me about Ariv's projects, one by one, and what each one does.");
  const s=await c.speaks(12000);
  await c.sleep(4000);                   // agent alone on the speakers: echo window
  await c.page.evaluate(()=>window.__qa.log("QA_BARGE_SAY",1));
  await speak("Hold on, hold on, stop there for a second, I want to ask you something else. What is his GitHub?");   // real barge-in
  await c.sleep(1000); await c.quiet(1800,25000); 
  await speak("Where does he work right now?"); await c.speaks(10000); await c.quiet(1800,20000);
  const fin=await c.end(); const d=await c.dump({s,finish:fin?.status}); console.log(`=== ${c.name} s=${s}\n`+summary(d.ev)); await c.page.close(); }
await env.browser.close();
