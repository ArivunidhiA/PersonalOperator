import { launch, call, summary } from "./rig.mjs";
const S = {
 conf: [["work"],["customers",{barge:1200,w:"actually"}],["customers"],["customers2"],["parts"]],
 ident: [["human"],["pretend"],["prompt"],["human"]],
 honest: [["tell_title"],["title"],["certs"],["not_hire"],["hide"],["gaps"],["hyundai"]],
 auth: [["visa"],["visa2"],["salary"]],
 off: [["recipe"],["math"],["code"],["capital"],["weather"]],
 inter: [["long_q",{barge:2500,w:"wait"}],["long_q",{barge:1500,w:"actually"}],["book"],["bye"]],
};
const rounds = { conf:2, ident:2, honest:2, auth:3, off:3, inter:2 };
const only = process.argv[2]?.split(",");
const env = await launch();
for (const [k,turns] of Object.entries(S)) { if (only && !only.includes(k)) continue; for (let r=1;r<=rounds[k];r++){
  const c = await call(env, `adv-${k}-${r}`); const b=[];
  await c.quiet(1200,15000);
  for (const [w,o] of turns) { await c.say(w);
    if (o?.barge) { const s=await c.speaks(12000); await c.sleep(o.barge); const t0=await c.page.evaluate(()=>performance.now()); c.sayAsync(o.w); b.push({w,spokeAfter:s}); await c.sleep(800); await c.quiet(1500,25000); await c.sleep(600);} 
    else { const s = await c.speaks(15000); if (s===null) b.push({silentAfter:w}); await c.quiet(1500,30000);} }
  await c.sleep(1000); const fin = await c.end(); const d = await c.dump({ finish:fin?.status, b });
  console.log(`=== ${c.name} finish=${fin?.status} errs=${JSON.stringify(c.errors)} ${JSON.stringify(b)}\n`+summary(d.ev)); await c.page.close(); }}
await env.browser.close();
