export default {
  name: "#天气",
  dsc: "高德天气查询, 用法: #天气 北京",
  rule: [{ reg: "^#天气 (.+)$", fnc: "run" }],

  async run(e) {
    const city = e.msg.match(/^#天气 (.+)/)?.[1]?.trim()
    if (!city) return e.reply("用法: #天气 城市名\n例如: #天气 广州")

    try {
      // Step 1: city name -> adcode
      const geoUrl = `https://restapi.amap.com/v3/config/district?key=d82a8e5632cace3bc594681016edae94&keywords=${encodeURIComponent(city)}&subdistrict=0`
      const geoResp = await fetch(geoUrl, { signal: AbortSignal.timeout(5000) })
      const geoData = await geoResp.json()
      if (geoData.status !== "1" || !geoData.districts?.length) {
        return e.reply(`未找到城市: ${city}`)
      }
      const adcode = geoData.districts[0].adcode
      const cityName = geoData.districts[0].name

      // Step 2: adcode -> weather (all = current + 7-day forecast)
      const weatherUrl = `https://restapi.amap.com/v3/weather/weatherInfo?key=d82a8e5632cace3bc594681016edae94&city=${adcode}&extensions=all`
      const wResp = await fetch(weatherUrl, { signal: AbortSignal.timeout(5000) })
      const wData = await wResp.json()
      if (wData.status !== "1" || !wData.forecasts?.length) {
        return e.reply(`天气查询失败: ${cityName}`)
      }
      const f = wData.forecasts[0]
      const today = f.casts[0]

      const lines = [
        `${cityName} 天气  |  ${f.reporttime?.slice(0, 10) || ""}`,
        `━━━━━━━━━━━━━━━`,
        `今天: ${today.dayweather} / ${today.nightweather}`,
        `温度：${today.nighttemp}°C ~ ${today.daytemp}°C`,
        `风向：${today.daywind}风 ${today.daypower}级`,
        ``,
        `未来预报`,
      ]

      for (const c of f.casts.slice(1, 8)) {
        const d = c.date?.slice(5) || c.date
        const icon = c.dayweather.includes("雨") ? "🌧" : c.dayweather.includes("云") ? "⛅" : "☀"
        lines.push(`${icon} ${d}  ${c.dayweather}  ${c.nighttemp}~${c.daytemp}°C`)
      }

      await e.reply(lines.join("\n"))
    } catch (err) {
      await e.reply("天气查询超时, 请稍后重试")
    }
    return true
  }
}
