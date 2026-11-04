import { launch, call, summary } from "./rig.mjs";
const n = +process.argv[2]||1; const tag = process.argv[3]||"stall"; const wav = process.argv[4]||"stall_turn";
const env = await launch();
for (let i=1;i<=n;i++){ const c = await call(env, `${tag}-${i}`);
  await c.quiet(1200,15000); await c.say("free"); await c.quiet(1500,25000);
  await c.say(wav); const tEnd = await c.page.evaluate(()=>performance.now());
  const first = await c.speaks(20000); await c.quiet(1500,25000); await c.sleep(1500);
  const fin = await c.end(); const d = await c.dump({ firstSpeakAfterHelloMs:first, finish: fin?.status }); 
  console.log(`=== ${c.name} reply after final Hello ms=${first} finish=${fin?.status} errs=${c.errors.length}\n`+summary(d.ev)); await c.page.close(); }
await env.browser.close();
