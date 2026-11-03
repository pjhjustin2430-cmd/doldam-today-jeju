import { getWeather } from '../server/weather.js'

export default async function handler(req, res) {
  try {
    const data = await getWeather({ place: req.query.place, day: ['tomorrow', 'hours'].includes(req.query.day) ? req.query.day : 'today' })
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600') // 성공했을 때만 CDN 에 저장
    res.status(200).json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
}
