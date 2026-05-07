# QQ Bot

A custom QQ bot powered by a local NTQQ engine (NapCat Shell), with a built-in web dashboard for monitoring and management.

## Architecture

```
start_all.bat
    ├── watch.bat         (monitor terminal - message log)
    └── node app.js       (dashboard server + bot engine)
            ├── dashboard.js           (browser-side UI)
            ├── lib/qqnt.js            (NTQQ engine lifecycle + OneBot API)
            ├── lib/bot.js             (message handler + plugin engine)
            ├── lib/logger.js          (logging - terminal + file)
            └── plugins/system/*.js    (command plugins)
                     │
    NapCat/QQ/NapCat.*.Shell/QQ.exe  (local QQ client)
                     │
               QQ Servers
```

## Quick Start

### Prerequisites

- Node.js >= 18
- npm dependencies: `npm install`

### First Launch

1. Run `start_all.bat` (or `node app.js`)
2. A QQ login window pops up — scan QR code with phone QQ
3. Dashboard: open http://localhost:3456
4. A separate monitor window shows message logs

Subsequent launches auto-login (no QR scan needed).

## Features

### Chat Commands (QQ Group / Friend)

| Trigger | Description |
|---|---|
| `#早上好` | Fixed reply |
| `#你是谁` | Fixed reply |
| `#随机数字` | Random number |
| `#自定义文件夹` | Random image from local folder |
| `#天气 广州` | Weather query (AMap API) |

New commands can be added via the dashboard Commands page.

### Dashboard (http://localhost:3456)

- **Status** — System stats, engine status, bot pause/resume, live message monitor
- **Commands** — Visual command editor, add/edit/delete commands, permission whitelist
- **Logs** — Engine log, message log, error log

## Project Structure

```
QQBotFinal/
├── app.js                  HTTP server + dashboard HTML
├── dashboard.js            Browser-side JavaScript
├── start_all.bat           Launcher (kill old → start engine → open monitor → run bot)
├── watch.bat               Monitor terminal (tails monitor log)
├── editor.bat              Opens dashboard in browser
├── package.json
│
├── lib/
│   ├── qqnt.js             NTQQ engine process manager + OneBot v11 API
│   ├── bot.js              Message routing, plugin loading, permission checks
│   └── logger.js           Log4js config (command + monitor categories)
│
├── plugins/system/         Command plugins (js files, hot-reload supported)
│
├── config/
│   ├── config/             Runtime config (bot.yaml, qq.yaml, etc.)
│   ├── default_config/     Default config templates
│   └── permissions.json    Per-command permission whitelist
│
├── NapCat/
│   └── QQ/NapCat.*.Shell/  NTQQ engine (NapCat Shell)
│
├── 自定义文件夹/                   Image pool for 自定义文件夹 plugin
├
│
└── logs/                   Log files (generated at runtime)
```

## Config

### QQ Account (`config/config/qq.yaml`)

```yaml
qq: 123456789
pwd: ''              # empty = QR login
platform: 1          # 1=Android, 2=aPad, 3=Watch, 4=MacOS, 5=iPad, 6=Tim
```

### Permissions (`config/permissions.json`)

```json
{ "#hello": ["123456", "789012"] }
```

An empty array means everyone can use the command.

## Plugin Format

```js
export default {
  name: "#hello",
  dsc: "Say hello",
  rule: [
    { reg: "^#hello$", reply: "Hello!" },
    { reg: "^#ping$", fnc: "pong" }
  ],
  async pong(e) {
    await e.reply("Pong!")
    return true
  }
}
```

- `reply` — static text reply
- `fnc` — dynamic handler, receives event object `e`
- `e.reply(msg)` — send message, supports `segment.image()`, `segment.at()`, etc.
- `e.user_id`, `e.group_id`, `e.msg` — event metadata
- Plugins hot-reload on file change (~1s delay)

## Notes

- NTQQ engine handles all QQ protocol communication locally — no third-party signing server needed
- First launch requires QR scan; subsequent launches auto-login
- Dashboard is local-only (localhost:3456)
- Engine stdout/stderr appears in both main terminal and monitor terminal
"# QQBOT" 
