import { launch, call, summary } from "./rig.mjs";
const env=await launch();
for(let r=1;r<=6;r++){const c=await call(env,`hon-${r}`);await c.quiet(1200,12000);
 for(const w of ["hyundai","gaps","gaps2","not_hire","tell_title"]){await c.say(w);await c.speaks(15000);await c.quiet(1500,25000)}
 const fin=await c.end();const d=await c.dump({finish:fin?.status});console.log(`=== ${c.name}\n`+summary(d.ev));await c.page.close()}
await env.browser.close();
