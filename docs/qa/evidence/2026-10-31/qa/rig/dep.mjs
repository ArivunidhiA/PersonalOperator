import { launch, call, summary } from "./rig.mjs";
const env=await launch();
// tool endpoint down
{ const c=await call(env,"dep-toolfail"); await c.page.route("**/api/tools/execute",r=>r.abort()); await c.quiet(1200,12000); await c.say("free"); const s=await c.speaks(15000); await c.quiet(1500,20000); await c.say("book"); const s2=await c.speaks(15000); await c.quiet(1500,20000); const fin=await c.end(); const d=await c.dump({s,s2,finish:fin?.status}); console.log(`=== ${c.name} s=${s} s2=${s2}\n`+summary(d.ev)); await c.page.close(); }
// tab closed mid-call: beacon save
{ const c=await call(env,"dep-tabclose"); await c.quiet(1200,12000); await c.say("work"); await c.speaks(12000); await c.quiet(1500,20000); const d=await c.dump({}); await c.page.close({runBeforeUnload:true}); await new Promise(r=>setTimeout(r,3000)); console.log("=== tabclose",d.sid); }
// reload mid-call, then a new call
{ const c=await call(env,"dep-reload"); await c.quiet(1200,12000); await c.say("work"); await c.speaks(12000); await c.quiet(1500,20000); const d=await c.dump({}); await c.page.reload(); await c.page.waitForTimeout(3000); console.log("=== reload",d.sid, await c.page.getByRole("button",{name:/ask me/i}).isVisible()); await c.page.close(); }
await env.browser.close();
