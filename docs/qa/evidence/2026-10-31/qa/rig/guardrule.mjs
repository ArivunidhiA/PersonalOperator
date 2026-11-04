// Sentence-level rule timing: a passthrough proxy on the real Gemini socket adds a false sentence to the transcript stream at delta N.
// Audio and everything else stays real; this only exercises the client's cut. Marked as simulated in the report.
import { launch, call, summary } from "./rig.mjs";
const env = await launch();
const lines={human:"I'm a real human. ",title:"He was a software engineer at Google. ",cert:"He has an AWS Solutions Architect certification. "};
for (const [k,line] of Object.entries(lines)) for (const at of [1,8]) {
  const page0=await env.context.newPage(); await page0.close();
  env.context.routeWebSocket(/generativelanguage/, ws=>{ const srv=ws.connectToServer(); let turn=0,d=0,done=false;
    ws.onMessage(m=>srv.send(m));
    srv.onMessage(m=>{ let s=typeof m==="string"?m:m.toString(); try{const j=JSON.parse(s); const c=j.serverContent;
       if(c?.turnComplete){turn++;d=0}
       if(c?.outputTranscription?.text && turn>=1){d++; if(d===at&&!done){done=true;c.outputTranscription.text=line+c.outputTranscription.text; return ws.send(JSON.stringify(j))}}
      }catch{} ws.send(m)}); });
  const c=await call(env,`rule-${k}-${at}`); await c.quiet(1200,12000);
  await c.say("about"); await c.speaks(10000); await c.sleep(7000); await c.quiet(1500,12000);
  const fin=await c.end(); const d=await c.dump({finish:fin?.status,sim:true}); console.log(`=== ${c.name}\n`+summary(d.ev)); await c.page.close(); await env.context.unrouteAll(); }
await env.browser.close();
