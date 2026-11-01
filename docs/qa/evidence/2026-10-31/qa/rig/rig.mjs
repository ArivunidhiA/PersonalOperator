// QA rig: drives the real app in real Chrome. Only the microphone is synthetic (a WebAudio track fed from say(1) wavs).
// Everything else is the production build, real Gemini, real tools, real /api routes. Observation only; the app is unchanged.
import { createRequire } from "module";
import fs from "fs"; import path from "path";
const WEB = "/Users/ariv07/Desktop/PersonalOperator/.claude/worktrees/quizzical-meitner-9fcd2e/web";
const require = createRequire(WEB + "/x.js");
const { chromium } = require("@playwright/test");
const dotenv = require("dotenv"); dotenv.config({ path: WEB + "/.env.local", quiet: true });
export const SP = path.dirname(new URL(import.meta.url).pathname);
export const secrets = [...(process.env.BANNED_TERMS||"").split(","), process.env.EVAL_CLIENT_PROBE||""].map(s=>s.trim()).filter(s=>s.length>=3);
export const redact = (t) => secrets.reduce((o,s)=>o.replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"gi"),"[redacted]"),t);
const INIT = `(() => {
  const T = window.__qa = { ev: [], orb: [], t0: performance.now() };
  const log = (k, v) => T.ev.push([+( (performance.now()-T.t0)/1000 ).toFixed(3), k, v]);
  T.log = log;
  // mic
  const realGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  let mc, dest;
  T.sources = [];
  navigator.mediaDevices.getUserMedia = async () => {
    if (window.__realMic) return realGUM({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    mc = new AudioContext({ sampleRate: 48000 }); await mc.resume(); dest = mc.createMediaStreamDestination();
    const o = mc.createConstantSource(); o.offset.value = 0; o.connect(dest); o.start();
    return dest.stream;
  };
  T.say = async (url) => {
    const buf = await mc.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const s = mc.createBufferSource(); s.buffer = buf; s.connect(dest); T.sources.push(s);
    log("MIC_START", url.split("/").pop());
    await new Promise(r => { s.onended = r; s.start(); });
    log("MIC_END", url.split("/").pop());
  };
  T.shutUp = () => { T.sources.forEach(s=>{try{s.stop()}catch{}}); };
  // sockets
  const WS = window.WebSocket; T.sockets = [];
  window.WebSocket = class extends WS {
    constructor(u, p) { super(u, p); T.sockets.push(this); const n = T.sockets.length; log("WS_NEW", n);
      this.addEventListener("open", () => log("WS_OPEN", n));
      this.addEventListener("close", (e) => log("WS_CLOSE", [n, e.code, (e.reason||"").slice(0,80)]));
      this.addEventListener("message", async (e) => {
        let m; try { m = JSON.parse(typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data)); } catch { return; }
        if (m.setupComplete) log("SETUP", n);
        if (m.goAway) log("GOAWAY", m.goAway);
        if (m.sessionResumptionUpdate) log("RESUME_UPD", !!m.sessionResumptionUpdate.newHandle);
        if (m.voiceActivity) log("VA", m.voiceActivity.type || m.voiceActivity.voiceActivityType);
        if (m.toolCall) log("TOOL", m.toolCall.functionCalls.map(f=>f.name));
        const c = m.serverContent; if (!c) return;
        if (c.inputTranscription?.text) log("IN", c.inputTranscription.text);
        if (c.outputTranscription?.text) log("OUT", c.outputTranscription.text);
        if (c.modelTurn?.parts?.some(p=>p.inlineData)) log("A", c.modelTurn.parts.reduce((s,p)=>s+(p.inlineData?.data?.length||0),0));
        if (c.interrupted) log("INTERRUPTED", 1);
        if (c.generationComplete) log("GENDONE", 1);
        if (c.turnComplete) log("TC", 1);
      });
    }
    send(d) { try { const m = JSON.parse(d);
        if (m.clientContent) log("SENT", JSON.stringify(m.clientContent).slice(0,140));
        if (m.toolResponse) log("SENT_TOOL", 1);
        if (m.setup) log("SENT_SETUP", Object.keys(m.setup));
        if (m.realtimeInput?.audioStreamEnd) log("SENT_END", 1);
      } catch {} return super.send(d); }
  };
  // playback: bytes handed to the player, flushes, speaking edges
  const AWN = window.AudioWorkletNode;
  window.AudioWorkletNode = class extends AWN {
    constructor(c, n, o) { super(c, n, o);
      if (n === "pcm-player") { const p = this.port, post = p.postMessage.bind(p);
        p.postMessage = (m, t) => { if (m === "flush") log("FLUSH", 1); else if (m?.pcm) log("PCM", m.pcm.byteLength/2/24000); return post(m, t); };
        p.addEventListener("message", (e) => { if (T.lastSp !== e.data.speaking) { T.lastSp = e.data.speaking; T.speaking = e.data.speaking; log("SPEAKING", e.data.speaking); } });
      }
    }
  };
  // layout: orb + controls position
  setInterval(() => {
    const c = document.querySelector("canvas"); const b = [...document.querySelectorAll("button")].find(x=>/^(end|ask me)/i.test(x.textContent.trim()));
    const r = c?.getBoundingClientRect(); const q = b?.getBoundingClientRect();
    const s = [r?.x,r?.y,r?.width,r?.height,q?.x,q?.y].map(v=>v==null?null:Math.round(v*2)/2).join(",");
    if (s !== T.lastOrb) { T.lastOrb = s; T.orb.push([+(performance.now()-T.t0).toFixed(0), s]); }
    const st = document.querySelector("[data-strip]")?.innerText ?? ""; if (st !== T.lastStrip) { T.lastStrip = st; log("STRIP", st.slice(0,200)); }
  }, 50);
})();`;
export async function launch({ headed=false, realMic=false, base="http://localhost:3100", ua } = {}) {
  const args = ["--autoplay-policy=no-user-gesture-required","--use-angle=swiftshader","--enable-unsafe-swiftshader","--use-fake-ui-for-media-stream"];
  if (!headed) args.push("--mute-audio");
  const browser = await chromium.launch({ channel: "chrome", headless: !headed, args });
  const context = await browser.newContext({ permissions:["microphone"], viewport:{width:1280,height:800}, userAgent: ua });
  return { browser, context, base, realMic };
}
let ipN = Math.floor(Math.random()*200)+20;
export async function call(env, name) {
  const page = await env.context.newPage();
  const errors = [];
  page.on("console", m => { if (m.type()==="error") errors.push(m.text().slice(0,200)); });
  page.on("pageerror", e => errors.push(String(e).slice(0,200)));
  if (env.realMic) await page.addInitScript("window.__realMic=true");
  await page.addInitScript(INIT);
  await page.route("**/__qa/*.wav", r => r.fulfill({ path: `${SP}/wav/${path.basename(new URL(r.request().url()).pathname)}`, contentType:"audio/wav" }));
  // Per-call test IP so the 6-an-hour limit doesn't block the rig (the header is set by Vercel in production).
  const ip = `10.77.${Math.floor(ipN/250)}.${(ipN++)%250}`;
  let session = null;
  await page.route("**/api/voice/session", async r => { const resp = await r.fetch({ headers: { ...r.request().headers(), "x-real-ip": ip } }); const body = await resp.text(); try{session=JSON.parse(body)}catch{}; await r.fulfill({ response: resp, body }); });
  await page.goto(env.base+"/");
  await page.getByRole("button",{name:/ask me/i}).click();
  await page.getByRole("button",{name:/^end$/i}).waitFor({timeout:30000});
  const c = { name, page, errors, session:()=>session,
    ev: () => page.evaluate(()=>window.__qa.ev),
    say: (w) => page.evaluate(u=>window.__qa.say(u), `/__qa/${w}.wav`),
    sayAsync: (w) => { page.evaluate(u=>window.__qa.say(u), `/__qa/${w}.wav`).catch(()=>{}); },
    sleep: (ms) => page.waitForTimeout(ms),
    // wait until the agent has played something and gone quiet for quietMs, or timeout
    quiet: async (quietMs=1500, maxMs=25000) => { const t=Date.now(); let lastBusy=Date.now(); let any=false;
      while(Date.now()-t<maxMs){ const s=await page.evaluate(()=>window.__qa.speaking); if(s){lastBusy=Date.now();any=true} if(any&&Date.now()-lastBusy>quietMs) return true; await page.waitForTimeout(100);} return false; },
    speaks: async (maxMs=15000) => { const t=Date.now(); while(Date.now()-t<maxMs){ if(await page.evaluate(()=>window.__qa.speaking)) return Date.now()-t; await page.waitForTimeout(50);} return null; },
    end: async () => { const f = page.waitForResponse(r=>r.url().includes("/api/calls/finish")&&r.request().method()==="POST",{timeout:60000}).catch(()=>null);
      await page.getByRole("button",{name:/^end$/i}).click().catch(()=>{}); const r=await f; return r?{status:r.status(),body:await r.text().catch(()=>"")}:null; },
    dump: async (extra={}) => { const qa = await page.evaluate(()=>({ev:window.__qa.ev,orb:window.__qa.orb}));
      const vid = await page.evaluate(()=>localStorage.getItem("ariv-vid")).catch(()=>null);
      const out = { name, sid: session?.sessionId, vid, errors, ...qa, ...extra };
      fs.writeFileSync(`${SP}/runs/${name}.json`, redact(JSON.stringify(out)));
      fs.appendFileSync(`${SP}/runs/ids.txt`, JSON.stringify({sid:session?.sessionId,vid})+"\n");
      return out; } };
  return c;
}
export const summary = (ev) => { // transcript view
  const out=[]; let cur=null;
  for (const [t,k,v] of ev) { if(k==="IN"||k==="OUT"){ if(cur&&cur.k===k) cur.s+=v; else out.push(cur={t,k,s:v}); }
    else if(["INTERRUPTED","FLUSH","TOOL","WS_NEW","WS_CLOSE","SETUP","GOAWAY","MIC_START","MIC_END","SENT_END"].includes(k)){ out.push({t,k,s:JSON.stringify(v)}); cur=null; } else if (k==="SENT"){ out.push({t,k,s:String(v).slice(30,120)}); cur=null; } }
  return out.map(x=>`${x.t.toFixed(1)} ${x.k} ${redact(x.s)}`).join("\n");
};
