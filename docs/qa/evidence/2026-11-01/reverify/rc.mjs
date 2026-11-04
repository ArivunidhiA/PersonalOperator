// rc-offline frozen steps, plain: ask, wait, watch for slow or lost turns. Repeats because the condition was 1 in 107 turns.
import { launch, call, summary } from "./rig.mjs";
const env=await launch(); const n=+process.argv[2]||6;
for(let i=1;i<=n;i++){const c=await call(env,`rc2-${i}`);await c.quiet(1200,12000);
 for(const w of ["work","human","recall"]){await c.say(w);await c.speaks(16000);await c.quiet(1500,20000)}
 const fin=await c.end();const d=await c.dump({finish:fin?.status});console.log(`=== ${c.name}\n`+summary(d.ev));await c.page.close()}
await env.browser.close();
