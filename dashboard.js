let al = [], fl = "all", ct = "fixed", ed = null, ip = false

function st(t) {
  document.querySelectorAll(".tab").forEach(e => e.classList.remove("active"))
  document.querySelectorAll(".topbar a").forEach(e => e.classList.remove("on"))
  document.getElementById("tab-" + t).classList.add("active")
  document.querySelectorAll(".topbar a").forEach(e => {
    var label = t === "status" ? "Status" : t === "commands" ? "Commands" : "Logs"
    if (e.textContent.includes(label)) e.classList.add("on")
  })
  if (t === "logs") ll()
  if (t === "commands") ld()
  if (t === "status") rl()
}

function sy(t, el) {
  ct = t
  document.querySelectorAll(".panel .tt button").forEach(b => b.classList.remove("on"))
  el.classList.add("on")
  document.querySelectorAll("[id^=\"form-\"]").forEach(e => { e.style.display = "none" })
  var f = document.getElementById("form-" + t)
  if (f) f.style.display = "block"
}

function sf(f, el) {
  fl = f
  document.querySelectorAll(".panel:nth-child(2) .tt button").forEach(b => b.classList.remove("on"))
  el.classList.add("on")
  rd()
}

async function aj(u, o) {
  o = o || {}
  o.headers = o.headers || {}
  o.headers["Content-Type"] = "application/json"
  var resp = await fetch(u, o)
  return resp.json()
}

function eh(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function tk2(m, t) {
  var e = document.createElement("div")
  e.className = "toast toast-" + (t === "err" ? "err" : "ok")
  e.textContent = m
  document.body.appendChild(e)
  setTimeout(function () { e.style.opacity = "0"; setTimeout(function () { e.remove() }, 300) }, 2200)
}

async function ld() { al = await aj("/api/list"); rd() }

function rd() {
  var d = fl === "all" ? al : al.filter(function (c) { return c.type === fl })
  document.getElementById("cc").textContent = d.length
  var l = document.getElementById("cl"), e = document.getElementById("ce")
  l.innerHTML = ""
  if (!d.length) { e.style.display = "block"; return }
  e.style.display = "none"
  d.forEach(function (i) {
    var r = document.createElement("div")
    r.className = "cmd-row"
    var b = i.type === "fixed"
      ? '<span class="badge badge-f">Fixed</span>'
      : i.type === "api"
      ? '<span class="badge badge-a">API</span>'
      : '<span class="badge badge-r">Random</span>'
    var ef = encodeURIComponent(i.file)
    var edir = encodeURIComponent(i.dir)
    var en = encodeURIComponent(i.name || i.trigger)
    r.innerHTML =
      '<span class="cmd-tag">' + eh(i.trigger) + "</span>" + b +
      '<span class="cmd-text">' + eh(i.reply) + "</span>" +
      '<div class="cmd-actions">' +
      '<button class="btn-perm" data-n="' + en + '" onclick="op(this.dataset.n)">Perms</button>' +
      '<button class="btn-edit" data-f="' + ef + '" data-d="' + edir + '" onclick="ec(this.dataset.f,this.dataset.d)">Edit</button>' +
      '<button class="btn-del" data-f="' + ef + '" data-d="' + edir + '" onclick="dc(this.dataset.f,this.dataset.d)">Del</button>' +
      "</div>"
    l.appendChild(r)
  })
}

function ec(f, d) {
  var c = al.find(function (x) { return x.file === decodeURIComponent(f) && x.dir === decodeURIComponent(d) })
  if (!c || !c.code) return
  ed = { file: decodeURIComponent(f), dir: decodeURIComponent(d), code: c.code }
  document.getElementById("mt").textContent = decodeURIComponent(f)
  document.getElementById("mc").value = c.code
  document.getElementById("mo").classList.remove("hidden")
}

function cm() { document.getElementById("mo").classList.add("hidden"); ed = null }

async function sm2() {
  if (!ed) return
  var c = document.getElementById("mc").value
  try {
    var r = await aj("/api/edit", { method: "POST", body: JSON.stringify({ file: ed.file, dir: ed.dir, code: c }) })
    if (r.ok) { tk2("Saved"); cm(); ld() } else tk2(r.error || "Failed", "err")
  } catch (ex) { tk2("Error: " + ex.message, "err") }
}

var pn = ""

async function op(name) {
  pn = decodeURIComponent(name)
  document.getElementById("pt").textContent = pn
  try {
    var r = await aj("/api/perms?name=" + encodeURIComponent(pn))
    document.getElementById("pc").value = (r.qq || []).join("\n")
    document.getElementById("mp").classList.remove("hidden")
  } catch (e) { tk2("Load failed", "err") }
}

function cp() { document.getElementById("mp").classList.add("hidden") }

async function sp() {
  var q = document.getElementById("pc").value.split("\n").map(function (s) { return s.trim() }).filter(Boolean)
  try {
    var r = await aj("/api/perms", { method: "POST", body: JSON.stringify({ name: pn, qq: q }) })
    if (r.ok) { tk2("Saved"); cp() } else tk2(r.error || "Failed", "err")
  } catch (ex) { tk2("Error: " + ex.message, "err") }
}

async function af() {
  var t = document.getElementById("ft").value.trim()
  var r = document.getElementById("fr").value.trim()
  if (!t || !r) return tk2("Fill all fields", "err")
  if (!t.startsWith("#")) return tk2("Must start with #", "err")
  var res = await aj("/api/add", { method: "POST", body: JSON.stringify({ type: "fixed", trigger: t, reply: r }) })
  if (res.ok) { tk2("Added"); document.getElementById("ft").value = ""; document.getElementById("fr").value = ""; ld() }
  else tk2(res.error, "err")
}

async function aa() {
  var t = document.getElementById("at").value.trim()
  var u = document.getElementById("au").value.trim()
  if (!t || !u) return tk2("Fill all fields", "err")
  if (!t.startsWith("#")) return tk2("Must start with #", "err")
  var res = await aj("/api/add", { method: "POST", body: JSON.stringify({ type: "api", trigger: t, apiUrl: u }) })
  if (res.ok) { tk2("Added"); document.getElementById("at").value = ""; document.getElementById("au").value = ""; ld() }
  else tk2(res.error, "err")
}

async function ar() {
  var t = document.getElementById("rt").value.trim()
  var d = document.getElementById("rd").value.trim()
  if (!t || !d) return tk2("Fill all fields", "err")
  if (!t.startsWith("#")) return tk2("Must start with #", "err")
  var res = await aj("/api/add", { method: "POST", body: JSON.stringify({ type: "random-img", trigger: t, folder: d }) })
  if (res.ok) { tk2("Added"); document.getElementById("rt").value = ""; ld() }
  else tk2(res.error, "err")
}

async function ar2() {
  var t = document.getElementById("rn").value.trim()
  var min = parseInt(document.getElementById("rmin").value) || 1
  var max = parseInt(document.getElementById("rmax").value) || 100
  if (!t) return tk2("Enter trigger", "err")
  if (!t.startsWith("#")) return tk2("Trigger must start with #", "err")
  var res = await aj("/api/add", { method: "POST", body: JSON.stringify({ type: "random-num", trigger: t, min: min, max: max }) })
  if (res.ok) { tk2("Added"); document.getElementById("rn").value = ""; ld() }
  else tk2(res.error, "err")
}

async function dc(f, d) {
  if (!confirm("Confirm delete?")) return
  var res = await aj("/api/del", { method: "POST", body: JSON.stringify({ file: decodeURIComponent(f), dir: decodeURIComponent(d) }) })
  if (res.ok) { tk2("Deleted"); ld() } else tk2(res.error, "err")
}

async function ll() {
  var r = await aj("/api/logs")
  document.getElementById("lc").textContent = r.command || "(empty)"
  document.getElementById("lm").textContent = r.monitor || "(empty)"
  document.getElementById("le").textContent = r.error || "(empty)"
}

async function rl() {
  try {
    var r = await aj("/api/logs")
    var el = document.getElementById("monitor-live")
    if (el) { el.textContent = r.monitor || "(waiting...)" }
  } catch (e) {}
}

setInterval(rl, 3000)

async function ls() {
  try {
    var r = await aj("/api/status")
    document.getElementById("sn").textContent = (r.node || "").slice(1) || "--"
    var s = document.getElementById("svc")
    s.innerHTML = ""
    for (var i = 0; i < r.services.length; i++) {
      var v = r.services[i]
      var c = v.ok ? "on" : "off"
      s.innerHTML +=
        '<div class="card"><div class="l">' + v.name + '</div><div class="v ' + c + '">' +
        (v.ok ? "Online" : "Offline") + '</div><div class="sub">' + (v.info || "") + "</div></div>"
    }
    if (r.bot) ub(r.bot)
  } catch (e) {}
}

async function tp() {
  try {
    var r = await aj("/api/bot/toggle", { method: "POST" })
    if (r.ok) { ub(r.bot); tk2(r.paused ? "Paused" : "Resumed") }
    else tk2("Failed", "err")
  } catch (e) { tk2("Error", "err") }
}

function ub(b) {
  ip = b.paused
  document.getElementById("pb").textContent = b.paused ? "Resume" : "Pause"
  document.getElementById("bs").textContent = "Status: " + (b.paused ? "Paused" : b.online ? "Online" : "Offline")
  document.getElementById("nd").style.background = b.paused ? "var(--orange)" : b.online ? "var(--green)" : "var(--red)"
}

async function sq() {
  var q = document.getElementById("nq").value.trim()
  var p = document.getElementById("np").value.trim()
  var pl = parseInt(document.getElementById("npl").value) || 1
  if (!q) return tk2("Enter QQ number", "err")
  try {
    var r = await aj("/api/bot/account", { method: "POST", body: JSON.stringify({ qq: q, pwd: p, platform: pl }) })
    if (r.ok) { tk2("Config saved, restart required"); document.getElementById("nq").value = "" }
    else tk2(r.error || "Failed", "err")
  } catch (ex) { tk2("Error: " + ex.message, "err") }
}

var es2 = null

function cs() {
  es2 = new EventSource("/api/sse")
  es2.addEventListener("system", function (e) {
    try { var d = JSON.parse(e.data); document.getElementById("su").textContent = d.uptime; document.getElementById("sm").textContent = d.mem; document.getElementById("sh").textContent = d.heap } catch (e2) {}
  })
  es2.addEventListener("bot", function (e) {
    try { var d = JSON.parse(e.data); if (d) ub(d) } catch (e2) {}
  })
  es2.onerror = function () { setTimeout(cs, 5000) }
}

document.getElementById("ft").addEventListener("keydown", function (e) { if (e.key === "Enter") document.getElementById("fr").focus() })
document.getElementById("fr").addEventListener("keydown", function (e) { if (e.key === "Enter") af() })
document.getElementById("np").addEventListener("keydown", function (e) { if (e.key === "Enter") sq() })

ls()
setInterval(ls, 3000)
cs()
