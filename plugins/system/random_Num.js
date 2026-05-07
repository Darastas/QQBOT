export default {
  name: "#随机数字",
  dsc: "随机数字 1~100",
  rule: [{ reg: "^#随机数字$", fnc: "run" }],

  async run(e) {
    const n = Math.floor(Math.random() * 100) + 1
    await e.reply("随机数字: " + n)
    return true
  }
}
