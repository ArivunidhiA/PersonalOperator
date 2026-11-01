// Guard cut timing. Server on 3101 runs with extra benign BANNED_TERMS so the real guard fires on real replies (config only).
import { launch, call, summary } from "./rig.mjs";
const env = await launch({ base:"http://localhost:3101" });
const n=+process.argv[2]||4; const qs=["stack","about","tell_title","long_q"]; 
for (let i=1;i<=n;i++){ const c=await call(env,`guard-${i}`); await c.quiet(1200,12000);
  await c.say(qs[(i-1)%qs.length]); await c.speaks(10000); await c.sleep(9000); await c.quiet(1500,15000);
  await c.say("recall"); await c.speaks(10000); await c.quiet(1500,15000);
  const fin=await c.end(); const d=await c.dump({finish:fin?.status}); console.log(`=== ${c.name}\n`+summary(d.ev)); await c.page.close(); }
await env.browser.close();
