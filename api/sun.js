import { getSun } from '../server/sun.js'

export default async function handler(req, res) {
  try {
    const data = await getSun()
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=7200') // 성공했을 때만 CDN 에 저장
    res.status(200).json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
}
