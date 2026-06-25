import http from 'http'
import { WebSocketServer } from 'ws'
import { attachTwilioRelay } from './twilio-relay.js'
import { buildBrain, buildSystemPrompt } from './brain-builder.js'
import { saveReceptionConfig } from './db.js'

// Reception server endpoints:
//   POST /voice/:configId       → TwiML response (Twilio webhook)
//   WS   /ws?config=:id        → Media Streams relay (Twilio → Gemini Live)
//   POST /provision             → Auto-provision reception for a tier2 YES lead
//   GET  /health               → Health check

const PORT = parseInt(process.env.RECEPTION_PORT ?? process.env.PORT ?? '3030')
const BASE_URL = process.env.RECEPTION_BASE_URL ?? `http://localhost:${PORT}`

export function startReceptionServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, service: 'ai-reception', port: PORT }))
      return
    }

    // Twilio webhook: POST /voice/:configId
    // Returns TwiML <Stream> to start bidirectional audio
    if (req.method === 'POST' && url.pathname.startsWith('/voice/')) {
      const configId = url.pathname.slice('/voice/'.length)
      if (!configId) {
        res.writeHead(400)
        res.end('Missing config ID')
        return
      }

      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        const caller = extractFormParam(body, 'From')
        const wsScheme = BASE_URL.startsWith('https') ? 'wss' : 'ws'
        const wsHost = BASE_URL.replace(/^https?:\/\//, '')
        const wsUrl = `${wsScheme}://${wsHost}/ws?config=${configId}`

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}">
      <Parameter name="caller" value="${caller}"/>
    </Stream>
  </Connect>
</Response>`

        console.log(`[Server] Incoming call → config ${configId} | caller ${caller}`)
        res.writeHead(200, { 'Content-Type': 'text/xml' })
        res.end(twiml)
      })
      return
    }

    // POST /provision — tier2 lead said YES, auto-build their reception config
    // Body: { websiteUrl: string, businessName: string, leadId?: string }
    // Auth: Bearer RECEPTION_PROVISION_SECRET
    if (req.method === 'POST' && url.pathname === '/provision') {
      const auth = req.headers.authorization ?? ''
      const secret = process.env.RECEPTION_PROVISION_SECRET
      if (secret && auth !== `Bearer ${secret}`) {
        res.writeHead(401)
        res.end('Unauthorized')
        return
      }

      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', async () => {
        try {
          const { websiteUrl, businessName, leadId } = JSON.parse(body)
          if (!websiteUrl) {
            res.writeHead(400)
            res.end(JSON.stringify({ error: 'websiteUrl required' }))
            return
          }

          console.log(`[Provision] Building reception brain for: ${websiteUrl}`)
          const brain = await buildBrain(websiteUrl)
          const systemPrompt = buildSystemPrompt(brain)
          const config = await saveReceptionConfig(
            websiteUrl,
            businessName ?? brain.name,
            brain,
            systemPrompt,
            leadId
          )

          const webhookUrl = `${BASE_URL}/voice/${config.id}`
          console.log(`[Provision] Done: ${config.business_name} | ${config.id}`)
          console.log(`[Provision] Twilio webhook: ${webhookUrl}`)

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            ok: true,
            configId: config.id,
            businessName: config.business_name,
            twilioWebhook: webhookUrl,
            servicesCount: brain.services.length,
            faqsCount: brain.faqs.length,
          }))
        } catch (e: any) {
          console.error('[Provision] Error:', e.message)
          res.writeHead(500)
          res.end(JSON.stringify({ error: e.message }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  // WebSocket server for Twilio Media Streams (path /ws)
  const wss = new WebSocketServer({ server, path: '/ws' })
  attachTwilioRelay(wss)

  server.listen(PORT, () => {
    console.log(`\n[Reception Server] Running on port ${PORT}`)
    console.log(`  Health:    GET  ${BASE_URL}/health`)
    console.log(`  Twilio:    POST ${BASE_URL}/voice/:configId`)
    console.log(`  Stream:    WS   ${BASE_URL.replace('http', 'ws')}/ws?config=:configId`)
    console.log(`  Provision: POST ${BASE_URL}/provision  (Bearer RECEPTION_PROVISION_SECRET)\n`)
  })

  return server
}

function extractFormParam(body: string, param: string): string {
  try {
    const decoded = decodeURIComponent(body.replace(/\+/g, ' '))
    const match = decoded.match(new RegExp(`(?:^|&)${param}=([^&]*)`, 'i'))
    return match?.[1] ?? ''
  } catch {
    return ''
  }
}
