// 배포 주소로 가는 QR 코드를 새로 만든다 (흰 바탕 + 검은 QR, PNG). 사용: node scripts/makeQr.mjs [주소]
import QRCode from 'qrcode'
const URL_ = process.argv[2] ?? 'https://doldam-today-jeju-project.vercel.app'
await QRCode.toFile('public/images/qr.png', URL_, { type: 'png', width: 800, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
console.log('QR 생성:', URL_, '→ public/images/qr.png')
