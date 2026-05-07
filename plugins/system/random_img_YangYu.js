import fs from "node:fs"
import path from "node:path"
import { segment } from "icqq"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IMG_DIR = "D:\\QQBot\\qq-bot\\杨语"

export default {
  name: "#随机杨语",
  dsc: "随机图片命令",
  rule: [{ reg: "^#随机杨语$", fnc: "run" }],

  async run(e) {
    try {
      const files = fs.readdirSync(IMG_DIR).filter(f => /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(f))
      if (!files.length) return e.reply("图片目录为空: " + IMG_DIR)
      const pick = files[Math.floor(Math.random() * files.length)]
      const buf = fs.readFileSync(path.join(IMG_DIR, pick))
      await e.reply(segment.image(buf))
    } catch (err) {
      await e.reply("图片发送失败: " + err.message)
    }
    return true
  }
}
