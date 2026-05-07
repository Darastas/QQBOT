import log4js from "log4js"
import chalk from "chalk"
import fs from "node:fs"

export function setLog() {
  if (!fs.existsSync("./logs")) fs.mkdirSync("./logs")

  log4js.configure({
    appenders: {
      console: {
        type: "console",
        layout: { type: "pattern", pattern: "%[[QQBot][%d{hh:mm:ss.SSS}]%] %m" },
      },
      command: {
        type: "dateFile",
        filename: "logs/command",
        pattern: "yyyy-MM-dd.log",
        numBackups: 15,
        alwaysIncludePattern: true,
        layout: { type: "pattern", pattern: "[%d{hh:mm:ss.SSS}] %m" },
      },
      monitorFile: {
        type: "dateFile",
        filename: "logs/monitor",
        pattern: "yyyy-MM-dd.log",
        numBackups: 7,
        alwaysIncludePattern: true,
        layout: { type: "pattern", pattern: "[%d{hh:mm:ss.SSS}] %m" },
      },
      error: {
        type: "file",
        filename: "logs/error.log",
        layout: { type: "pattern", pattern: "[%d{hh:mm:ss.SSS}] %m" },
      },
    },
    categories: {
      default: { appenders: ["console"], level: "debug" },
      command: { appenders: ["console", "command"], level: "debug" },
      error: { appenders: ["console", "command", "error"], level: "debug" },
      monitor: { appenders: ["monitorFile"], level: "debug" },
    },
  })

  const def = log4js.getLogger("default")
  const cmd = log4js.getLogger("command")
  const err = log4js.getLogger("error")
  const mon = log4js.getLogger("monitor")

  global.logger = {
    trace: (...a) => def.trace(...a),
    debug: (...a) => def.debug(...a),
    info: (...a) => def.info(...a),
    warn: (...a) => cmd.warn(...a),
    error: (...a) => err.error(...a),
    fatal: (...a) => err.fatal(...a),
    mark: (...a) => cmd.mark(...a),
    monitor: (...a) => mon.info(...a),
  }

  global.logger.chalk = chalk
  global.logger.red = chalk.red
  global.logger.green = chalk.green
  global.logger.yellow = chalk.yellow
  global.logger.blue = chalk.blue
}
