import { start, bot } from "./lib/bot.js"
import { isConnected } from "./lib/qqnt.js"
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

process.on("uncaughtException", (err) => { console.error(`UE: ${err.message}`) })
process.on("unhandledRejection", (r) => { console.error(`UR: ${r}`) })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "./plugins")
const LOG_DIR = path.resolve(__dirname, "./logs")
const PORT = 3456
const SSE = new Set()

setInterval(() => {
  const m = process.memoryUsage()
  const d = JSON.stringify({ uptime: Math.floor(process.uptime()), mem: Math.round(m.rss / 1048576), heap: Math.round(m.heapUsed / 1048576) })
  for (const r of SSE) try { r.write(`event:system\ndata:${d}\n\n`) } catch {}
}, 3000)

function body(req) {
  return new Promise(r => { const c = []; req.on("data", d => c.push(d)); req.on("end", () => r(Buffer.concat(c).toString("utf-8"))) })
}
function tail(f, n = 80) { try { return fs.readFileSync(f, "utf-8").split("\n").filter(Boolean).slice(-n).join("\n") } catch { return "" } }
function latestLog() { try { const f = fs.readdirSync(LOG_DIR).filter(x => x.startsWith("command.") && x.endsWith(".log")); f.sort(); return f[f.length - 1] || "command.log" } catch { return "command.log" } }
function latestMonitorLog() { try { const f = fs.readdirSync(LOG_DIR).filter(x => x.startsWith("monitor.") && x.endsWith(".log")); f.sort(); return f[f.length - 1] || "monitor.log" } catch { return "monitor.log" } }

function scan() {
  const r = []
  let dirs; try { dirs = fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) } catch { return r }
  for (const d of dirs) { const dp = path.join(ROOT, d); try { for (const f of fs.readdirSync(dp)) { if (!f.endsWith(".js")) continue; const fp = path.join(dp, f); const c = fs.readFileSync(fp, "utf-8"); r.push({ file: f, dir: d, code: c, ...pp(c) }) } } catch {} }
  return r
}
function pp(c) {
  const n = (c.match(/name:\s*"([^"]+)"/) || [])[1] || ""
  const tp = /\{\s*reg:\s*".+?"\s*,\s*reply:\s*"/.test(c) ? "fixed" : /Math\.random|随机/.test(c) ? "random" : /fetch\s*\(/.test(c) ? "api" : "fixed"
  const fr = /\{\s*reg:\s*"((?:[^"\\]|\\.)*)"\s*,\s*reply:\s*"((?:[^"\\]|\\.)*)"\s*\}/g; let m
  while ((m = fr.exec(c))) { const t = m[1].replace(/^\\?\^/, "").replace(/\\?\$$/, "").replace(/\\([.*+?^${}()|[\]\\])/g, "$1"); return { name: n, type: tp, trigger: t, reply: m[2] } }
  const nr = /\{\s*reg:\s*"((?:[^"\\]|\\.)*)"\s*,\s*fnc:\s*"([^"]+)"/g; const rs = []
  while ((m = nr.exec(c))) rs.push({ trigger: m[1].replace(/^\\?\^/, "").replace(/\\?\$$/, "").replace(/\\([.*+?^${}()|[\]\\])/g, "$1"), fnc: m[2] })
  const rr = /^\s*(?:await\s+)?e\.reply\("((?:[^"\\]|\\.)*)"/gm; const rps = []; while ((m = rr.exec(c))) rps.push(m[1])
  return { name: n, type: tp, trigger: rs[0]?.trigger || "?", reply: tp === "random" ? "[Random]" : tp === "api" ? "[API]" : rps[0] || "?" }
}
function hs(s) { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36) }
function es(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }
function eq(s) { return s.replace(/"/g, '\\"').replace(/\\/g, "\\\\") }
function gf(t, r) { return `export default {\n  name: "${t}",\n  dsc: "fixed",\n  rule: [{ reg: "^${es(t)}$", reply: "${eq(r)}" }]\n}\n` }
function ga(t, u) { const p = /\\\.\+/.test(es(t)); return `export default {\n  name: "${t}",\n  dsc: "api",\n  rule: [{ reg: "^${es(t)}$", fnc: "run" }],\n  async run(e) {\n    try {\n      ${p ? `const parts = e.msg.split(/\\s+/); const param = parts.slice(1).join(" "); if (!param) return e.reply("用法: ${t}"); const url = \`${u}\`.replace(/\\{param\\}/g, encodeURIComponent(param))` : `const url = "${u}"`}\n      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })\n      if (!resp.ok) return e.reply("接口错误: " + resp.status)\n      let text = await resp.text()\n      if (text.length > 500) text = text.slice(0, 500) + "..."\n      await e.reply(text.trim() || "(空)")\n    } catch (err) { await e.reply("错误: " + err.message) }\n    return true\n  }\n}\n` }
function gi(t, d) { return `import fs from "node:fs"\nimport path from "node:path"\nimport { segment } from "icqq"\nconst DIR = "${d.replace(/\\/g, "\\\\")}"\nexport default {\n  name: "${t}",\n  dsc: "random image",\n  rule: [{ reg: "^${es(t)}$", fnc: "run" }],\n  async run(e) {\n    try {\n      const files = fs.readdirSync(DIR).filter(f => /\\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f))\n      if (!files.length) return e.reply("目录为空: " + DIR)\n      const pick = files[Math.floor(Math.random() * files.length)]\n      await e.reply(segment.image(fs.readFileSync(path.join(DIR, pick))))\n    } catch (err) { await e.reply("错误: " + err.message) }\n    return true\n  }\n}\n` }
function gn(t, mn, mx) { return `export default {\n  name: "${t}",\n  dsc: "random ${mn}-${mx}",\n  rule: [{ reg: "^${es(t)}$", fnc: "run" }],\n  async run(e) {\n    const n = Math.floor(Math.random() * (${mx} - ${mn} + 1)) + ${mn}\n    await e.reply("随机: " + n)\n    return true\n  }\n}\n` }

const H = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QQ Bot Dashboard</title><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f2f2f7;--s:#fff;--b:#e0e0e5;--t:#1c1c1e;--t2:#6e6e73;--t3:#aeaeb2;--blue:#007aff;--green:#34c759;--red:#ff3b30;--orange:#ff9500}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--t);-webkit-font-smoothing:antialiased;font-size:15px}
.topbar{background:rgba(255,255,255,.82);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border-bottom:1px solid var(--b);position:sticky;top:0;z-index:100;animation:sd .35s ease}
@keyframes sd{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}
.ti{max-width:1024px;margin:0 auto;display:flex;align-items:center;height:52px;padding:0 28px;gap:6px}
.ti .logo{font-size:19px;font-weight:700;color:var(--t);margin-right:28px;transition:transform .2s}
.ti .logo:hover{transform:scale(1.05)}
.ti a{font-size:15px;color:var(--t2);text-decoration:none;padding:10px 18px;border-radius:10px;transition:all .2s;font-weight:450}
.ti a:hover{color:var(--t);background:rgba(0,0,0,.05);transform:translateY(-1px)}
.ti a.on{color:var(--blue);background:rgba(0,122,255,.1);font-weight:600}
.ti .dot{width:9px;height:9px;border-radius:50%;background:var(--green);display:inline-block;margin-right:6px;box-shadow:0 0 0 4px rgba(52,199,89,.18);animation:pl 2s infinite}
@keyframes pl{0%,100%{box-shadow:0 0 0 4px rgba(52,199,89,.18)}50%{box-shadow:0 0 0 8px rgba(52,199,89,.06)}}
main{max-width:1024px;margin:0 auto;padding:28px}
.tab{display:none;animation:ti .3s ease}.tab.active{display:block}
@keyframes ti{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
h2{font-size:24px;font-weight:700;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px;margin-bottom:32px}
.card{background:var(--s);border:1px solid var(--b);border-radius:16px;padding:22px 24px;transition:all .25s;animation:cu .4s ease backwards;cursor:default}
.card:hover{transform:translateY(-3px);box-shadow:0 6px 20px rgba(0,0,0,.06);border-color:rgba(0,122,255,.15)}
.card:nth-child(1){animation-delay:0s}.card:nth-child(2){animation-delay:.06s}.card:nth-child(3){animation-delay:.12s}.card:nth-child(4){animation-delay:.18s}
@keyframes cu{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.card .l{font-size:13px;color:var(--t3);margin-bottom:6px;font-weight:600;text-transform:uppercase}
.card .v{font-size:28px;font-weight:700}.card .v.on{color:var(--green)}.card .v.off{color:var(--red)}
.card .sub{font-size:13px;color:var(--t2);margin-top:3px}
.panel{background:var(--s);border:1px solid var(--b);border-radius:16px;padding:24px;margin-bottom:16px;animation:cu .4s ease backwards;transition:box-shadow .25s}
.panel:hover{box-shadow:0 2px 12px rgba(0,0,0,.04)}
.panel h3{font-size:17px;font-weight:700;margin-bottom:16px}
.tt{display:flex;gap:5px;margin-bottom:20px;background:var(--bg);border-radius:12px;padding:5px;width:fit-content}
.ttb{border:none;padding:9px 20px;border-radius:10px;background:transparent;color:var(--t2);cursor:pointer;font-size:14px;font-weight:550;font-family:inherit;transition:all .2s;white-space:nowrap}
.ttb:hover{color:var(--t);transform:translateY(-1px)}
.ttb.on{background:var(--s);color:var(--t);font-weight:650;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.row{display:flex;gap:12px;margin-bottom:12px;align-items:flex-end}
.row input{flex:1;padding:11px 15px;border:1px solid var(--b);border-radius:11px;background:var(--bg);color:var(--t);font-size:15px;outline:none;font-family:inherit;transition:all .2s}
.row input:focus{border-color:var(--blue);background:var(--s);box-shadow:0 0 0 3px rgba(0,122,255,.1)}
.btn{padding:11px 23px;border:1px solid var(--b);border-radius:11px;font-size:15px;cursor:pointer;background:var(--s);color:var(--t);transition:all .2s;font-family:inherit;font-weight:550;white-space:nowrap}
.btn:hover{background:var(--bg);transform:translateY(-1px)}
.btn:active{transform:scale(.97)}
.btn-pri{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:650}
.btn-pri:hover{background:#0069d9;border-color:#0069d9;box-shadow:0 3px 12px rgba(0,122,255,.25)}
.btn-warn{background:var(--orange);border-color:var(--orange);color:#fff;font-weight:650}
.btn-warn:hover{background:#e68600;box-shadow:0 3px 12px rgba(255,149,0,.25)}
.btn-edit{background:transparent;color:var(--blue);border:1px solid rgba(0,122,255,.3);padding:5px 13px;font-size:13px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:550;transition:all .2s}
.btn-edit:hover{background:rgba(0,122,255,.1);transform:translateY(-1px)}
.btn-perm{background:transparent;color:var(--orange);border:1px solid rgba(255,149,0,.3);padding:5px 13px;font-size:13px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:550;transition:all .2s}
.btn-perm:hover{background:rgba(255,149,0,.1);transform:translateY(-1px)}
.btn-del{background:transparent;color:var(--red);border:1px solid rgba(255,59,48,.3);padding:5px 13px;font-size:13px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:550;transition:all .2s}
.btn-del:hover{background:rgba(255,59,48,.1);transform:translateY(-1px)}
.ir{display:flex;gap:10px;align-items:center}
.ir span{font-size:14px;color:var(--t2);font-weight:550}
.ir input[type=number]{width:80px;padding:11px 10px;border:1px solid var(--b);border-radius:10px;background:var(--bg);color:var(--t);font-size:15px;text-align:center;font-family:inherit;outline:none;transition:all .2s}
.ir input[type=number]:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(0,122,255,.1)}
.badge{font-size:11px;padding:3px 9px;border-radius:6px;margin:0 7px;font-weight:650}
.badge-f{background:rgba(52,199,89,.12);color:var(--green)}
.badge-a{background:rgba(0,122,255,.12);color:var(--blue)}
.badge-r{background:rgba(255,149,0,.12);color:var(--orange)}
.cmd-row{display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--b);font-size:15px;gap:12px;transition:background .15s}
.cmd-row:hover{background:rgba(0,0,0,.01)}
.cmd-row:last-child{border-bottom:none}
.cmd-tag{background:var(--bg);color:var(--t);padding:5px 13px;border-radius:8px;font-size:14px;font-family:"SF Mono","Cascadia Code","Fira Code",monospace;font-weight:550}
.cmd-text{color:var(--t2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:14px}
.cmd-actions{display:flex;gap:7px;flex-shrink:0}
.tip{color:var(--t3);font-size:13px;margin-top:10px;line-height:1.6}
.tip code{color:var(--t2);background:var(--bg);padding:3px 8px;border-radius:6px;font-family:"SF Mono","Cascadia Code","Fira Code",monospace;font-size:12px}
.empty{color:var(--t3);text-align:center;padding:30px;font-size:15px}
.toast{position:fixed;top:24px;right:24px;padding:13px 24px;border-radius:12px;font-size:14px;z-index:9999;animation:to .35s ease;font-weight:600;backdrop-filter:blur(16px);box-shadow:0 4px 16px rgba(0,0,0,.1)}
.toast-ok{background:rgba(52,199,89,.12);color:var(--green);border:1px solid rgba(52,199,89,.2)}
.toast-err{background:rgba(255,59,48,.12);color:var(--red);border:1px solid rgba(255,59,48,.2)}
@keyframes to{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}
.log-area{background:var(--bg);border:1px solid var(--b);border-radius:12px;padding:14px 16px;font-family:"SF Mono","Cascadia Code","Fira Code",monospace;font-size:13px;line-height:1.7;max-height:380px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;color:var(--t2)}
.log-area::-webkit-scrollbar{width:5px}.log-area::-webkit-scrollbar-thumb{background:var(--b);border-radius:3px}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:999;display:flex;align-items:center;justify-content:center;animation:mi .25s ease}
.modal-overlay.hidden{display:none}
@keyframes mi{from{opacity:0}to{opacity:1}}
.modal{background:var(--s);border:1px solid var(--b);border-radius:16px;padding:28px;width:500px;max-width:92vw;box-shadow:0 12px 48px rgba(0,0,0,.15);animation:mz .3s ease}
@keyframes mz{from{transform:scale(.95);opacity:0}to{transform:scale(1);opacity:1}}
.modal h3{font-size:18px;font-weight:700;margin-bottom:18px}
.modal textarea{width:100%;min-height:180px;padding:12px 15px;border:1px solid var(--b);border-radius:11px;background:var(--bg);color:var(--t);font-size:14px;font-family:"SF Mono","Cascadia Code","Fira Code",monospace;line-height:1.6;outline:none;resize:vertical;margin-bottom:14px;transition:border .2s}
.modal textarea:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(0,122,255,.1)}
.modal .actions{display:flex;justify-content:flex-end;gap:10px}
.bot-ctrl{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.napcat-note{animation:cu .4s .2s ease backwards;display:flex;flex-direction:column;gap:10px;margin-top:16px;padding:16px;background:linear-gradient(135deg,rgba(0,122,255,.04),rgba(0,122,255,.01));border:1px solid rgba(0,122,255,.15);border-radius:12px}
.napcat-note .sub{font-size:14px;color:var(--t2);line-height:1.6}
.napcat-note a{color:var(--blue);text-decoration:none;font-weight:650}
.acct-grid{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:6px}
.acct-grid input{flex:1 1 140px;min-width:120px;padding:11px 15px;border:1px solid var(--b);border-radius:11px;background:var(--bg);color:var(--t);font-size:15px;outline:none;font-family:inherit;transition:all .2s}
.acct-grid input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(0,122,255,.1)}
.acct-grid .sel{flex:0 0 auto}
.acct-grid .btn{flex:0 0 auto}
.sel{padding:11px 15px;border:1px solid var(--b);border-radius:11px;background:var(--bg);color:var(--t);font-size:15px;outline:none;font-family:inherit;cursor:pointer;transition:all .2s}
.sel:focus{border-color:var(--blue)}
.split-layout{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}
.split-left{flex:1 1 480px;min-width:350px}
.split-right{flex:1 1 380px;min-width:320px}
.split-right h2{margin-bottom:14px}
.split-right .log-area{max-height:calc(100vh - 170px);overflow-y:auto;scroll-behavior:smooth}
</style></head><body>
<div class="topbar"><div class="ti"><span class="logo">QQ Bot</span><a href="#" class="on" onclick="st('status')"><span class="dot" id="nd"></span>Status</a><a href="#" onclick="st('commands')">Commands</a><a href="#" onclick="st('logs')">Logs</a></div></div>
<main>
<div id="tab-status" class="tab active">
<div class="split-layout">
<div class="split-left">
<h2>System Status</h2>
<div class="grid">
<div class="card"><div class="l">Uptime</div><div class="v" id="su">--</div><div class="sub">seconds</div></div>
<div class="card"><div class="l">Memory</div><div class="v" id="sm">--</div><div class="sub">MB RSS</div></div>
<div class="card"><div class="l">Heap</div><div class="v" id="sh">--</div><div class="sub">MB</div></div>
<div class="card"><div class="l">Node.js</div><div class="v" id="sn">--</div><div class="sub">runtime</div></div>
</div>
<h2>Service Status</h2>
<div class="grid" id="svc"></div>
<div class="panel">
<h3>Bot Control</h3>
<div class="bot-ctrl">
<div class="btn" id="pb" onclick="tp()">Pause</div>
<span class="sub" id="bs" style="margin-left:10px;font-size:15px;font-weight:600">Status: --</span>
</div>
<div class="napcat-note">
<span class="sub"><strong>NTQQ Engine</strong> connects directly to QQ servers via local NTQQ client. First launch opens a QQ login window - scan with phone QQ. Subsequent launches auto-login.</span>
</div>
</div>
<div class="panel">
<h3>Account Config (restart required)</h3>
<div class="tip" style="margin-bottom:14px">Updates local config only. Restart QQ Bot after switching accounts. First login will show QR scan window.</div>
<div class="acct-grid">
<input id="nq" placeholder="QQ number" autocomplete="off" type="number">
<input id="np" placeholder="Password (empty = QR)" autocomplete="off" type="password">
<select class="sel" id="npl">
<option value="1">Android</option><option value="2">aPad</option><option value="3">Watch</option><option value="4">iMac</option><option value="5">iPad</option><option value="6">Tim</option>
</select>
<button class="btn btn-pri" onclick="sq()">Update</button>
</div>
</div>
</div>
<div class="split-right">
<h2>Message Monitor</h2>
<div class="log-area" id="monitor-live" style="max-height:calc(100vh - 160px)">Loading...</div>
</div>
</div>
</div>
<div id="tab-commands" class="tab">
<div class="panel">
<h3>New Command</h3>
<div class="tt">
<button class="ttb on" onclick="sy('fixed',this)">Fixed Reply</button>
<button class="ttb" onclick="sy('api',this)">API Call</button>
<button class="ttb" onclick="sy('random-img',this)">Random Image</button>
<button class="ttb" onclick="sy('random-num',this)">Random Number</button>
</div>
<div id="form-fixed"><div class="row"><input id="ft" placeholder="Trigger, e.g. #hello" autocomplete="off"><input id="fr" placeholder="Reply text" autocomplete="off"><button class="btn btn-pri" onclick="af()">Add</button></div><div class="tip"><code>#hello</code> — Fixed text reply, ~1s hot reload</div></div>
<div id="form-api" style="display:none"><div class="row"><input id="at" placeholder="Trigger, e.g. #check (.+)" autocomplete="off"><button class="btn btn-pri" onclick="aa()">Add</button></div><div class="row"><input id="au" placeholder="API URL, {param} = captured group" autocomplete="off" style="flex:2"></div><div class="tip"><code>(.+)</code> captured content replaces <code>{param}</code></div></div>
<div id="form-random-img" style="display:none"><div class="row"><input id="rt" placeholder="Trigger, e.g. #randomimg" autocomplete="off"><input id="rd" placeholder="Image folder path" autocomplete="off" style="flex:2"><button class="btn btn-pri" onclick="ar()">Add</button></div><div class="tip">Randomly sends .png/.jpg/.gif from folder</div></div>
<div id="form-random-num" style="display:none"><div class="row"><input id="rn" placeholder="Trigger, e.g. #dice" autocomplete="off"><div class="ir"><span>Min</span><input type="number" id="rmin" value="1"><span>Max</span><input type="number" id="rmax" value="100"></div><button class="btn btn-pri" onclick="ar2()">Add</button></div><div class="tip">Generates random integer in range</div></div>
</div>
<div class="panel">
<h3>Command List (<span id="cc">0</span>)</h3>
<div class="tt">
<button class="ttb on" onclick="sf('all',this)">All</button>
<button class="ttb" onclick="sf('fixed',this)">Fixed Reply</button>
<button class="ttb" onclick="sf('api',this)">API Call</button>
<button class="ttb" onclick="sf('random',this)">Random</button>
</div>
<div id="cl"></div><div id="ce" class="empty" style="display:none">No commands yet. Add one above!</div>
</div>
</div>
<div id="tab-logs" class="tab">
<div class="panel"><h3>Engine Log</h3><div class="log-area" id="lc">Loading...</div></div>
<div class="panel"><h3>Message Log</h3><div class="log-area" id="lm">Loading...</div></div>
<div class="panel"><h3>Error Log</h3><div class="log-area" id="le">Loading...</div></div>
</div>
</main>
<div class="modal-overlay hidden" id="mo" onclick="if(event.target===this)cm()"><div class="modal"><h3>Edit: <span id="mt"></span></h3><textarea id="mc" spellcheck="false"></textarea><div class="actions"><button class="btn" onclick="cm()">Cancel</button><button class="btn btn-pri" onclick="sm2()">Save</button></div></div></div>
<div class="modal-overlay hidden" id="mp" onclick="if(event.target===this)cp()"><div class="modal"><h3>Permissions: <span id="pt"></span></h3><div class="tip" style="margin-bottom:12px">QQ numbers, one per line. Leave empty = everyone can use.</div><textarea id="pc" spellcheck="false" placeholder="123456&#10;789012"></textarea><div class="actions"><button class="btn" onclick="cp()">Cancel</button><button class="btn btn-pri" onclick="sp()">Save</button></div></div></div>
<script src="/dashboard.js"></script></body></html>`

const S = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end() }
  const u = new URL(req.url, "http://localhost")

  if (u.pathname === "/api/sse") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" })
    res.write("event:connected\ndata:{}\n\n"); SSE.add(res); req.on("close", () => SSE.delete(res)); return
  }
  if (u.pathname === "/" || u.pathname === "/index.html") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(H) }
  if (u.pathname === "/dashboard.js") { res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" }); return res.end(fs.readFileSync(path.join(__dirname, "dashboard.js"), "utf-8")) }
  if (u.pathname === "/api/status") {
    try {
      let engOk = false
      try { engOk = isConnected() } catch {}
      const bs = bot.getStatus ? bot.getStatus() : { online: false, paused: false, uin: 0 }
      res.writeHead(200, { "Content-Type": "application/json" })
      return res.end(JSON.stringify({ node: process.version, services: [{ name: "NTQQ Engine", ok: engOk, info: engOk ? "HTTP:3000 / WS:3001" : "starting..." }, { name: "QQ Bot", ok: bs.online, info: bs.uin ? `QQ: ${bs.uin}` : "waiting login" }], bot: bs }))
    } catch { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ node: process.version, services: [{ name: "NTQQ Engine", ok: false }, { name: "QQ Bot", ok: false }], bot: { online: false, paused: false, uin: 0 } })) }
  }
  if (u.pathname === "/api/bot/toggle" && req.method === "POST") {
    if (bot.setPaused) { const s = bot.getStatus(); bot.setPaused(!s.paused); res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, paused: !s.paused, bot: bot.getStatus() })) }
    res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: "Not ready" }))
  }
  if (u.pathname === "/api/bot/ticket" && req.method === "POST") {
    try { const r = bot.submitTicket ? bot.submitTicket("") : { ok: false, error: "Ticket not needed in NTQQ engine mode" }; res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r)) }
    catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: e.message })) }
  }
  if (u.pathname === "/api/bot/account" && req.method === "POST") {
    try { const { qq, pwd, platform } = JSON.parse(await body(req)); if (!qq) throw new Error("QQ number required"); const r = bot.switchAccount ? await bot.switchAccount(String(qq), String(pwd || ""), platform || 1) : { ok: false, error: "Not ready" }; res.writeHead(r.ok ? 200 : 400, { "Content-Type": "application/json" }); return res.end(JSON.stringify(r)) }
    catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: e.message })) }
  }
  if (u.pathname === "/api/logs") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ command: tail(path.join(LOG_DIR, latestLog()), 80), monitor: tail(path.join(LOG_DIR, latestMonitorLog()), 80), error: tail(path.join(LOG_DIR, "error.log"), 80) })) }
  if (u.pathname === "/api/list") { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); return res.end(JSON.stringify(scan())) }
  if (u.pathname === "/api/edit" && req.method === "POST") {
    try { const { file, dir, code } = JSON.parse(await body(req)); if (!file || !code || file.includes("..")) throw new Error("Invalid"); const fp = path.join(ROOT, dir || "system", file); if (!fs.existsSync(fp)) throw new Error("Not found"); fs.writeFileSync(fp, code, "utf-8"); res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true })) }
    catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: e.message })) }
  }
  if (u.pathname === "/api/add" && req.method === "POST") {
    try {
      const b = JSON.parse(await body(req)); const { type, trigger, reply, apiUrl, folder, min, max } = b
      if (!trigger || !trigger.startsWith("#")) throw new Error("Must start with #")
      const k = hs(trigger); let c, fn
      if (type === "fixed") { if (!reply) throw new Error("Reply text required"); fn = "fx_" + k + ".js"; c = gf(trigger, reply) }
      else if (type === "api") { if (!apiUrl) throw new Error("API URL required"); fn = "ap_" + k + ".js"; c = ga(trigger, apiUrl) }
      else if (type === "random-img") { if (!folder) throw new Error("Image folder required"); fn = "ri_" + k + ".js"; c = gi(trigger, folder) }
      else if (type === "random-num") { fn = "rn_" + k + ".js"; c = gn(trigger, min ?? 1, max ?? 100) }
      else throw new Error("Unknown type")
      fs.writeFileSync(path.join(ROOT, "system", fn), c, "utf-8")
      res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, file: fn }))
    } catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: e.message })) }
  }
  if (u.pathname === "/api/del" && req.method === "POST") {
    try {
      const { file, dir } = JSON.parse(await body(req)); if (!file || file.includes("..")) throw new Error("Invalid")
      const PP = path.resolve(__dirname, "./config/permissions.json")
      const cd = scan().find(x => x.file === file && x.dir === (dir || "system"))
      if (cd?.name) { try { const p = JSON.parse(fs.readFileSync(PP, "utf-8")); delete p[cd.name]; fs.writeFileSync(PP, JSON.stringify(p, null, 2), "utf-8") } catch {} }
      const fp = path.join(ROOT, dir || "system", file); if (!fs.existsSync(fp)) throw new Error("Not found"); fs.unlinkSync(fp)
      res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true }))
    } catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: e.message })) }
  }
  if (u.pathname === "/api/perms") {
    const PP = path.resolve(__dirname, "./config/permissions.json")
    if (req.method === "GET") { try { const p = JSON.parse(fs.readFileSync(PP, "utf-8")); res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ qq: p[u.searchParams.get("name")] || [] })) } catch { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ qq: [] })) } }
    if (req.method === "POST") {
      try { const { name, qq } = JSON.parse(await body(req)); let p = {}; try { p = JSON.parse(fs.readFileSync(PP, "utf-8")) } catch {}; if (qq && qq.length) p[name] = qq; else delete p[name]; fs.writeFileSync(PP, JSON.stringify(p, null, 2), "utf-8"); res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true })) }
      catch (e) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: e.message })) }
    }
    return
  }
  res.writeHead(404); res.end("Not Found")
})

bot.onStatusChange?.set((status) => {
  const d = JSON.stringify(status)
  for (const r of SSE) try { r.write(`event:bot\ndata:${d}\n\n`) } catch {}
})

S.listen(PORT, async () => { const t = Date.now(); console.log(`Dashboard -> http://localhost:${PORT}`); try { await start() } catch (err) { console.error(`Bot error: ${err.message}`) } })
