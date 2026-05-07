import { launchQQNT, setEventHandler, setQQNTLogger, isConnected, isOnline, onStatusChange, getQQNTStatus, segment, sendMessage, getLoginInfo } from "./qqnt.js"
import { createClient } from "redis"
import fs from "node:fs"
import path from "node:path"
import yaml from "yaml"
import chokidar from "chokidar"
import { fileURLToPath, pathToFileURL } from "node:url"
import { setLog } from "./logger.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_DIR = path.resolve(__dirname, "../plugins")
const PERMS_FILE = path.resolve(__dirname, "../config/permissions.json")
const CONFIG_DIR = path.resolve(__dirname, "../config/config")
const QQ_YAML = path.join(CONFIG_DIR, "qq.yaml")

let plugins = []
let redisClient = null
let permissions = {}
let isPaused = false
let currentQQ = ""
let currentPlatform = 1
let qqntRef = null

const _statusListeners = []

function _fireStatus() {
  const s = getQQNTStatus()
  s.paused = isPaused
  for (const fn of _statusListeners) fn(s)
}

function loadPerms() {
  try { permissions = JSON.parse(fs.readFileSync(PERMS_FILE, "utf-8")) }
  catch { permissions = {} }
}
function savePerms() {
  try { fs.writeFileSync(PERMS_FILE, JSON.stringify(permissions, null, 2), "utf-8") }
  catch {}
}
function checkPerm(name, userId) {
  const list = permissions[name]
  if (!list || !list.length) return true
  return list.includes(String(userId))
}

async function loadFiles(dir) {
  const results = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) results.push(...await loadFiles(full))
      else if (entry.name.endsWith(".js")) results.push(full)
    }
  } catch {}
  return results
}

async function loadPlugins() {
  plugins.length = 0
  const files = await loadFiles(PLUGIN_DIR)
  for (const file of files) {
    try {
      const url = pathToFileURL(file).href
      const mod = await import(url + "?t=" + Date.now())
      const plug = mod.default || mod
      plug._file = file
      plugins.push(plug)
      logger.debug(`[plugin] ${path.basename(file)}`)
    } catch (err) {
      logger.warn(`[plugin] skip ${path.basename(file)}: ${err.message}`)
    }
  }
  const names = plugins.map(p => p.name || path.basename(p._file || "")).filter(Boolean)
  logger.info(`Loaded ${plugins.length} plugins: ${names.join(", ")}`)
}

function extractMsg(e) {
  let msg = ""
  if (e.message) {
    for (const el of e.message) {
      if (el.type === "text") msg += el.text
    }
    e.msg = msg.replace(/^\s*[＃井#]+\s*/, "#").replace(/^\s*[\\*※＊]+\s*/, "*").trim()
  } else {
    e.msg = ""
  }
  e.user_id = e.user_id || e.sender?.user_id
  e.group_id = e.group_id || e.group?.group_id || 0
}

async function matchRule(e, plug) {
  if (!plug.rule) return false
  for (const rule of plug.rule) {
    if (!rule.reg) continue
    let regex
    try { regex = new RegExp(rule.reg) } catch { continue }
    if (!regex.test(e.msg)) continue
    if (!checkPerm(plug.name, e.user_id)) {
      await e.reply("No permission to use this command")
      return true
    }
    try {
      if (rule.fnc && typeof plug[rule.fnc] === "function") {
        logger.monitor(`[match] plugin="${plug.name}" reg="${rule.reg}" -> fnc="${rule.fnc}"`)
        const result = await plug[rule.fnc](e)
        if (result !== false) return true
      } else if (rule.reply) {
        logger.monitor(`[match] plugin="${plug.name}" reg="${rule.reg}" -> reply`)
        await e.reply(rule.reply)
        return true
      } else if (typeof plug.reply === "string") {
        logger.monitor(`[match] plugin="${plug.name}" -> class-reply`)
        await e.reply(plug.reply)
        return true
      }
    } catch (err) {
      logger.error(`[${plug.name || "?"}] ${err.message}`)
      return true
    }
  }
  return false
}

async function handleMessage(e) {
  if (isPaused) return
  extractMsg(e)
  if (!e.msg) return
  logger.monitor(`[msg] uid=${e.user_id} gid=${e.group_id} len=${e.message?.length || 0} msg="${e.msg}"`)
  for (const plug of plugins) {
    if (plug._isClass) continue
    if (await matchRule(e, plug)) return
  }
  for (const plug of plugins) {
    if (!plug._isClass) continue
    try {
      const inst = new plug(e)
      inst.e = e
      if (await matchRule(e, inst)) return
    } catch (err) {
      logger.error(`[class-plugin] ${err.message}`)
    }
  }
}

async function connectRedis(rc) {
  if (redisClient?.isOpen) return redisClient
  try {
    redisClient = createClient({
      url: `redis://${rc.host}:${rc.port}/${rc.db || 0}`,
      socket: { connectTimeout: 3000 },
    })
    await redisClient.connect()
    logger.info(`Redis ${rc.host}:${rc.port} OK`)
    return redisClient
  } catch (err) {
    logger.warn(`Redis unavailable: ${err.message}`)
    return null
  }
}

function setupHotReload() {
  chokidar.watch(PLUGIN_DIR, {
    ignored: /(^|[\/\\])\../,
    ignoreInitial: true,
  }).on("add", async (file) => {
    if (!file.endsWith(".js")) return
    await new Promise(r => setTimeout(r, 500))
    await loadPlugins()
    logger.mark(`[hot-reload] + ${path.basename(file)}`)
  }).on("change", async (file) => {
    if (!file.endsWith(".js")) return
    await new Promise(r => setTimeout(r, 500))
    await loadPlugins()
    logger.mark(`[hot-reload] ~ ${path.basename(file)}`)
  }).on("unlink", async (file) => {
    await new Promise(r => setTimeout(r, 500))
    await loadPlugins()
    logger.mark(`[hot-reload] - ${path.basename(file)}`)
  })

  chokidar.watch(PERMS_FILE, { ignoreInitial: true }).on("change", () => {
    loadPerms()
    logger.mark("[hot-reload] permissions updated")
  })
}

async function switchAccount(qq, pwd, platform) {
  if (!qq) return { ok: false, error: "QQ number required" }

  const qqContent = `# QQ账号\nqq: ${qq}\n# 密码，为空则用扫码登录\npwd: '${pwd || ""}'\n# 1:安卓手机、 2:aPad 、 3:安卓手表、 4:MacOS 、 5:iPad 、 6:Tim\nplatform: ${platform || 1}\n`
  fs.writeFileSync(QQ_YAML, qqContent, "utf-8")

  currentQQ = String(qq)
  currentPlatform = platform || 1

  logger.mark(`Account updated: ${qq}`)
  logger.mark("Restart required to use new account; first login needs QR scan")

  return { ok: true, uin: qq, note: "Config saved. Restart QQ Bot to apply." }
}

onStatusChange((qqntStatus) => {
  qqntStatus.paused = isPaused
  for (const fn of _statusListeners) fn(qqntStatus)
})

export const bot = {
  plugins,
  redis: () => redisClient,
  permissions: () => permissions,
  loadPerms,
  savePerms,
  checkPerm,
  getStatus() {
    const s = getQQNTStatus()
    s.paused = isPaused
    return s
  },
  setPaused(state) {
    isPaused = !!state
    logger.mark(`Bot ${isPaused ? "paused" : "resumed"}`)
    _fireStatus()
  },
  submitTicket(raw) {
    return { ok: false, error: "NTQQ engine handles verification automatically; no manual ticket needed" }
  },
  switchAccount,
  getAccount() {
    return { qq: currentQQ, platform: currentPlatform }
  },
  onStatusChange: {
    set(fn) { _statusListeners.push(fn) },
    fire() { _fireStatus() },
  },
}

export async function start() {
  setLog()

  const qqCfg = yaml.parse(fs.readFileSync(QQ_YAML, "utf-8"))
  const redisCfg = yaml.parse(fs.readFileSync(path.join(CONFIG_DIR, "redis.yaml"), "utf-8"))
  const botCfg = yaml.parse(fs.readFileSync(path.join(CONFIG_DIR, "bot.yaml"), "utf-8"))

  await connectRedis(redisCfg)

  currentQQ = String(qqCfg.qq)
  currentPlatform = qqCfg.platform || 1

  logger.mark("QQ-Bot starting (NTQQ engine mode)...")
  loadPerms()
  await loadPlugins()

  setQQNTLogger((...args) => logger.monitor ? logger.monitor(...args) : console.log(...args))

  setEventHandler(handleMessage)

  const httpPort = botCfg.napcat_http ? parseInt(new URL(botCfg.napcat_http).port) : 3000
  const wsPort = httpPort

  qqntRef = await launchQQNT({ httpPort, wsPort, disableWebUI: true })

  if (qqntRef.ready) {
    const statusBefore = getQQNTStatus()
    if (!statusBefore.online || !statusBefore.uin) {
      const info = await getLoginInfo()
      if (info.uin) {
        logger.mark(`NTQQ engine started - QQ: ${info.uin} (auto-login)`)
        currentQQ = info.uin
      } else {
        logger.mark("NTQQ engine started - waiting for QR scan...")
        logger.mark("Scan QR code with phone QQ in the popup window; subsequent launches auto-login")
      }
    } else {
      currentQQ = statusBefore.uin
      logger.mark(`NTQQ engine started - QQ: ${currentQQ} (auto-login)`)
    }
    logger.mark(`Dashboard: http://localhost:3456`)
    _fireStatus()
  } else {
    logger.warn("NTQQ engine start timeout, check for QQ login popup")
  }

  setupHotReload()
}
