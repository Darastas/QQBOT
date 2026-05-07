import { request } from "node:http"
import { spawn, execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import _ws from "ws"

const WebSocket = _ws.WebSocket || _ws.default?.WebSocket || _ws

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

function findEngineDir() {
  const base = path.join(ROOT, "NapCat", "QQ")
  try {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith("NapCat.") && entry.name.endsWith(".Shell")) {
        const d = path.join(base, entry.name)
        if (fs.existsSync(path.join(d, "QQ.exe")) && fs.existsSync(path.join(d, "NapCatWinBootMain.exe"))) {
          return d
        }
      }
    }
  } catch {}
  const fallback = path.join(base, "NapCat.44498.Shell")
  if (fs.existsSync(path.join(fallback, "QQ.exe")) && fs.existsSync(path.join(fallback, "NapCatWinBootMain.exe"))) {
    return fallback
  }
  return null
}

let NC_BASE = null
let QQ_EXE = null
let BOOT_EXE = null
let HOOK_DLL = null
let CFG_DIR = null

function resolvePaths() {
  if (NC_BASE) return true
  NC_BASE = findEngineDir()
  if (!NC_BASE) return false
  QQ_EXE = path.join(NC_BASE, "QQ.exe")
  BOOT_EXE = path.join(NC_BASE, "NapCatWinBootMain.exe")
  HOOK_DLL = path.join(NC_BASE, "NapCatWinBootHook.dll")

  try {
    const verDir = path.join(NC_BASE, "versions")
    for (const v of fs.readdirSync(verDir, { withFileTypes: true })) {
      if (v.isDirectory()) {
        const np = path.join(verDir, v.name, "resources", "app", "napcat")
        if (fs.existsSync(path.join(np, "napcat.mjs"))) {
          CFG_DIR = path.join(np, "config")
          break
        }
      }
    }
  } catch {}
  if (!CFG_DIR) CFG_DIR = path.join(NC_BASE, "config")
  return true
}

let childProc = null
let ws = null
let _eventHandler = null
let _logger = null
let _connected = false
let _uin = ""
let _nick = ""
let _reconnectTimer = null
let _httpBase = "http://127.0.0.1:3000"
let _wsUrl = "ws://127.0.0.1:3001"
let _statusListeners = []
let _launched = false
let _httpPort = 3000
let _wsPort = 3001

function log(...args) {
  if (_logger) _logger(...args)
}

function systemLog(msg) {
  const ts = new Date().toTimeString().slice(0, 8)
  console.log("[QQBot][" + ts + "] " + msg)
  log(msg)
}

function ensureConfig(httpPort, wsPort) {
  if (!CFG_DIR) return
  for (const fp of [
    path.join(CFG_DIR, "onebot11.json"),
    path.join(CFG_DIR, "onebot11_2309963091.json"),
  ]) {
    if (fs.existsSync(fp)) return
  }
  const wsServers = []
  if (wsPort !== httpPort) {
    wsServers.push({
      name: "WsServer", enable: true,
      host: "0.0.0.0", port: wsPort,
      messagePostFormat: "array", reportSelfMessage: false,
      token: "", enableForcePushEvent: true,
      debug: false, heartInterval: 30000,
    })
  }
  const cfg = {
    network: {
      httpServers: [{
        name: "httpServer", enable: true,
        port: httpPort, host: "0.0.0.0", enableCors: true,
        enableWebsocket: true, messagePostFormat: "array",
        token: "", debug: false,
      }],
      httpClients: [],
      websocketServers: wsServers,
      websocketClients: [],
    },
    musicSignUrl: "",
    enableLocalFile2Url: false,
    parseMultMsg: false,
  }
  if (!fs.existsSync(CFG_DIR)) fs.mkdirSync(CFG_DIR, { recursive: true })
  fs.writeFileSync(path.join(CFG_DIR, "onebot11.json"), JSON.stringify(cfg, null, 2), "utf-8")
  log("Engine config written: HTTP=%d WS=%d", httpPort, wsPort)
}

function writeWebUI(disable) {
  if (!CFG_DIR) return
  const p = path.join(CFG_DIR, "webui.json")
  let data = {}
  try { data = JSON.parse(fs.readFileSync(p, "utf-8")) } catch {}
  data.disableWebUI = disable
  if (!fs.existsSync(path.dirname(p))) fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8")
}

async function waitForHTTP(port, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const body = JSON.stringify({})
        const u = new URL("/get_login_info", `http://127.0.0.1:${port}`)
        const req = request(u, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
          timeout: 2000,
        }, (res) => {
          if (res.statusCode === 200) resolve(true)
          else reject(new Error("HTTP " + res.statusCode))
        })
        req.on("error", reject)
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")) })
        req.write(body)
        req.end()
      })
      return true
    } catch {
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  return false
}

function onebotApi(action, params = {}) {
  return new Promise((resolve) => {
    const body = JSON.stringify(params)
    const u = new URL("/" + action, _httpBase)
    const opts = {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 15000,
    }
    const req = request(u, opts, (res) => {
      let data = ""
      res.on("data", c => data += c)
      res.on("end", () => {
        let obj
        try { obj = JSON.parse(data) } catch { obj = { status: "failed", msg: "parse error" } }
        if (action !== "get_login_info") {
          const ok = obj && obj.status === "ok"
          log("[API] %s → %s %s", action, ok ? "ok" : "FAIL", ok && obj.data ? JSON.stringify(obj.data).slice(0, 80) : (obj.msg || obj.wording || JSON.stringify(obj).slice(0, 80)))
        }
        resolve(obj)
      })
    })
    req.on("error", (e) => {
      log("[API:err] %s → %s", action, e.message)
      resolve({ status: "failed", msg: e.message })
    })
    req.on("timeout", () => {
      log("[API:timeout] %s", action)
      req.destroy()
      resolve({ status: "failed", msg: "timeout" })
    })
    req.write(body)
    req.end()
  })
}

function buildSegments(content) {
  if (typeof content === "string") return [{ type: "text", data: { text: content } }]
  const arr = Array.isArray(content) ? content : [content]
  return arr.map(seg => {
    if (typeof seg === "string") return { type: "text", data: { text: seg } }
    const t = seg.type || "text"
    if (t === "text") return { type: "text", data: { text: String(seg.text || "") } }
    if (t === "image") {
      let file = seg.file || seg.url || ""
      if (Buffer.isBuffer(file)) file = "base64://" + file.toString("base64")
      return { type: "image", data: { file: typeof file === "string" ? file : "" } }
    }
    if (t === "at") return { type: "at", data: { qq: String(seg.qq || "") } }
    if (t === "face") return { type: "face", data: { id: String(seg.id || "0") } }
    if (t === "reply") return { type: "reply", data: { id: String(seg.id || "") } }
    if (t === "record") return { type: "record", data: { file: seg.file || "" } }
    if (t === "video") return { type: "video", data: { file: seg.file || "" } }
    return { type: t, data: seg.data || {} }
  })
}

function transform(ob) {
  let msg = ""
  const message = []
  if (Array.isArray(ob.message)) {
    for (const s of ob.message) {
      if (s.type === "text") {
        const t = s.data?.text || ""
        message.push({ type: "text", text: t })
        msg += t
      } else if (s.type === "image") {
        message.push({ type: "image", url: s.data?.url || "", file: s.data?.file || "" })
      } else if (s.type === "at") {
        message.push({ type: "at", qq: s.data?.qq || "" })
      } else {
        message.push({ type: s.type, ...(s.data || {}) })
      }
    }
  }
  msg = msg.replace(/^\s*[＃井#]+\s*/, "#").replace(/^\s*[\\*※＊]+\s*/, "*").trim()

  return {
    message,
    msg,
    user_id: ob.user_id,
    group_id: ob.group_id || 0,
    message_id: ob.message_id,
    message_type: ob.message_type,
    sub_type: ob.sub_type,
    raw_message: ob.raw_message || msg,
    sender: ob.sender || {},
    async reply(content) {
      const r = await onebotApi("send_msg", {
        message_type: ob.message_type,
        ...(ob.message_type === "group" ? { group_id: ob.group_id } : { user_id: ob.user_id }),
        message: buildSegments(content),
      })
      if (r && r.status !== "ok") {
        throw new Error("send_msg failed: " + (r.msg || r.wording || JSON.stringify(r)))
      }
      log("[reply] sent -> mid=%s", r?.data?.message_id || "?")
      return r
    },
  }
}

function fireStatus() {
  const s = getStatus()
  for (const fn of _statusListeners) fn(s)
}

async function connectMessaging(httpPort, wsPort) {
  _httpBase = `http://127.0.0.1:${httpPort}`
  _wsUrl = `ws://127.0.0.1:${wsPort}`

  if (ws) { try { ws.close() } catch {} }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 8000)
    try {
      ws = new WebSocket(_wsUrl)
    } catch {
      clearTimeout(timeout)
      return resolve(false)
    }

    ws.on("open", async () => {
      clearTimeout(timeout)
      _connected = true
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }

      try {
        const r = await onebotApi("get_login_info")
        if (r.status === "ok" && r.data) {
          _uin = String(r.data.user_id || "")
          _nick = r.data.nickname || ""
        }
      } catch {}

      fireStatus()
      systemLog(`Message channel connected ws://0.0.0.0:${wsPort}`)
      resolve(true)
    })

    ws.on("message", (raw) => {
      try {
        const str = raw.toString()
        const ev = JSON.parse(str)
        const postType = ev.post_type || ""

        if (postType === "meta_event" && ev.meta_event_type === "lifecycle") {
          if (ev.sub_type === "connect") {
            _uin = String(ev.self_id || _uin)
            _nick = (ev.user_info || {}).nickname || _nick
            fireStatus()
          }
          return
        }

        if (postType === "message") {
          log("[msg] post_type=%s msg_type=%s user=%s group=%s raw=%s",
            postType, ev.message_type || "?", ev.user_id, ev.group_id || "-",
            (ev.raw_message || "").slice(0, 50))
          if (_eventHandler) {
            const icEv = transform(ev)
            _eventHandler(icEv)
          } else {
            log("[msg] skip - event handler not set")
          }
          return
        }

        if (postType) {
          log("[event] %s %s", postType, ev.notice_type || ev.meta_event_type || "")
        }
      } catch (err) {
        log("[msg:err] " + err.message)
      }
    })

    ws.on("close", () => {
      _connected = false
      fireStatus()
      _reconnectTimer = setTimeout(() => connectMessaging(httpPort, wsPort), 5000)
    })

    ws.on("error", () => {
      _connected = false
      fireStatus()
    })
  })
}

function getStatus() {
  return {
    online: _connected && !!_uin,
    paused: false,
    uin: _uin,
    nick: _nick,
    loginPending: false,
  }
}

export async function launchQQNT({ httpPort = 3000, wsPort = 3001, disableWebUI = true } = {}) {
  if (!resolvePaths()) {
    throw new Error(
      "NTQQ engine not found.\n" +
      "Use NapCat.Shell.Windows.OneKey installer to download NTQQ runtime,\n" +
      "then place the NapCat.xxxxx.Shell folder into NapCat/QQ/ directory.\n" +
      "Download: https://github.com/NapNeko/NapCatQQ/releases/latest"
    )
  }

  _httpPort = httpPort
  _wsPort = wsPort

  writeWebUI(disableWebUI)
  ensureConfig(httpPort, wsPort)

  systemLog(`Starting NTQQ engine (${path.basename(NC_BASE)})...`)

  childProc = spawn(BOOT_EXE, [QQ_EXE, HOOK_DLL], {
    cwd: NC_BASE,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })

  childProc.stdout?.on("data", d => {
    const line = d.toString().trim()
    if (line) { console.log("[engine] " + line); log("[engine] " + line) }
  })
  childProc.stderr?.on("data", d => {
    const line = d.toString().trim()
    if (line) { console.error("[engine:err] " + line); log("[engine:err] " + line) }
  })
  childProc.on("exit", code => {
    systemLog(`NTQQ process exited, code=${code}`)
    _connected = false
    _launched = false
    fireStatus()
  })
  childProc.on("error", err => {
    systemLog(`NTQQ process start failed: ${err.message}`)
    _launched = false
  })

  const ready = await waitForHTTP(httpPort)
  if (ready) {
    systemLog(`NTQQ engine ready - HTTP:${httpPort} WS:${wsPort}`)
    _launched = true
    await connectMessaging(httpPort, wsPort)
  } else {
    systemLog(`Waiting for NTQQ engine timeout (check for QQ login popup)`)
  }

  return {
    ready,
    httpBase: _httpBase,
    wsUrl: _wsUrl,
    stop() {
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
      if (ws) { try { ws.close() } catch {} }
      _connected = false
      if (childProc) {
        try { execSync("taskkill /f /pid " + childProc.pid + " >nul 2>&1") } catch {}
        childProc = null
      }
      _launched = false
      fireStatus()
    },
  }
}

export function setQQNTLogger(fn) { _logger = fn }

export function getQQNTPaths() {
  resolvePaths()
  return { root: NC_BASE, qqExe: QQ_EXE, bootExe: BOOT_EXE, hookDll: HOOK_DLL, cfgDir: CFG_DIR }
}

export function setEventHandler(fn) { _eventHandler = fn }

export function isConnected() { return _connected }
export function isOnline() { return _connected && !!_uin }
export function isLaunched() { return _launched }

export function getQQNTStatus() { return getStatus() }

export function onStatusChange(fn) { _statusListeners.push(fn) }

export function disconnect() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
  if (ws) { try { ws.close() } catch {} }
  _connected = false
  fireStatus()
}

export async function sendMessage(msg) {
  return onebotApi("send_msg", {
    message_type: msg.message_type || "private",
    ...(msg.message_type === "group" ? { group_id: msg.group_id } : { user_id: msg.user_id }),
    message: buildSegments(msg.message || msg.content || msg.msg || ""),
  })
}

export async function getLoginInfo() {
  try {
    const r = await onebotApi("get_login_info")
    if (r.status === "ok" && r.data) {
      _uin = String(r.data.user_id || "")
      _nick = r.data.nickname || ""
      return { uin: _uin, nick: _nick }
    }
  } catch {}
  return { uin: _uin, nick: _nick }
}

export async function checkHealth() {
  try {
    await onebotApi("get_login_info")
    return true
  } catch {
    return false
  }
}

export const segment = {
  text: (t) => ({ type: "text", text: String(t) }),
  image: (f) => ({ type: "image", file: f }),
  at: (q) => ({ type: "at", qq: String(q) }),
  face: (id) => ({ type: "face", id: String(id) }),
  reply: (id) => ({ type: "reply", id: String(id) }),
  record: (f) => ({ type: "record", file: f }),
  video: (f) => ({ type: "video", file: f }),
}
