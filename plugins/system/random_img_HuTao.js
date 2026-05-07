import fs from "node:fs"
import path from "node:path"
import { segment } from "icqq"
const DIR = "D:\\QQBot\\qq-bot\\胡桃"
export default {
  name: "#随机胡桃",
  dsc: "random image",
  rule: [{ reg: "^#随机胡桃$", fnc: "run" }],
  async run(e) {
    try {
      const files = fs.readdirSync(DIR).filter(f => /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f))
      if (!files.length) return e.reply("empty: " + DIR)
      const pick = files[Math.floor(Math.random() * files.length)]
      await e.reply(segment.image(fs.readFileSync(path.join(DIR, pick))))
    } catch (err) { await e.reply("error: " + err.message) }
    return true
  }
}
