import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys'
import express from 'express'
import QRCode from 'qrcode'
import qrcodeTerminal from 'qrcode-terminal'

const API_KEY = "4822ee02f444993332d54aeb277532a4d1eccf383e25c013"
const API_URL = "https://docupremium.online/api/1/gsmtheme"
const app = express()
const PORT = process.env.PORT || 3000
let lastQR = null

app.get('/', async (req,res)=>{
  if(!lastQR) return res.send('<h1>Bot OK</h1><p>Vinculado</p>')
  const img = await QRCode.toDataURL(lastQR)
  res.send(`<h1>Escanea QR</h1><img src="${img}" style="width:300px"/><script>setTimeout(()=>location.reload(),15000)</script>`)
})
app.listen(PORT, ()=>console.log('Web en',PORT))

async function callDocu(action, extra=""){
  const url = `${API_URL}?apiaccesskey=${API_KEY}&action=${action}${extra}`
  const r = await fetch(url, {method:'POST'})
  return await r.json()
}
async function placeOrder(serviceId, paramsObj){
  const json = JSON.stringify(paramsObj)
  const base64 = Buffer.from(json).toString('base64')
  return await callDocu('placeimeorder', `&serviceid=${serviceId}&params=${encodeURIComponent(base64)}`)
}
async function getOrder(orderId){
  return await callDocu('getimeorder', `&orderid=${orderId}`)
}
async function startBot(){
  const {state, saveCreds} = await useMultiFileAuthState('./auth')
  const sock = makeWASocket({auth: state, logger: (await import('pino')).default({level:'silent'})})
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async u=>{
    if(u.qr){ lastQR=u.qr; qrcodeTerminal.generate(u.qr,{small:true}) }
    if(u.connection==='open'){ console.log('CONECTADO'); lastQR=null }
    if(u.connection==='close'){ startBot() }
  })
  sock.ev.on('messages.upsert', async ({messages})=>{
    const msg = messages[0]; if(!msg.message || msg.key.fromMe) return
    const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim()
    const jid = msg.key.remoteJid
    const upper = texto.toUpperCase()
    if(upper==='MENU' || upper==='HOLA'){
      await sock.sendMessage(jid,{text:`BOT DOCUPREMIUM\n\nCURP [curp]\nEjemplo: CURP GOME850101HDFRRL09`})
      return
    }
    if(upper.startsWith('CURP ')){
      const curp = texto.split(' ')[1]
      await sock.sendMessage(jid,{text:`Buscando CURP ${curp}...`})
      try{
        const order = await placeOrder(68, {CURP: curp})
        await sock.sendMessage(jid,{text:`Pedido ID: ${order.orderid}\nConsultando en 12s...`})
        setTimeout(async()=>{
          const result = await getOrder(order.orderid)
          await sock.sendMessage(jid,{text:`Resultado: ${JSON.stringify(result).substring(0,1500)}`})
        },12000)
      }catch(e){ await sock.sendMessage(jid,{text:`Error: ${e.message}`}) }
    }
  })
}
startBot()
