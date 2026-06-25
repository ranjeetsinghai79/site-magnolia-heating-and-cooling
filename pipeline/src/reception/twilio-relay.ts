import type { WebSocketServer } from 'ws'
import WebSocket from 'ws'
import { GeminiLiveSession } from './gemini-live.js'
import { twilioToGeminiAudio, geminiToTwilioAudio } from './audio-codec.js'
import { getReceptionConfigById } from './db.js'
import { sendSMS } from '../agents/sms-outreach.js'

// Bridges Twilio Media Streams ↔ Gemini Live
// Flow: inbound call → TwiML <Stream> → WebSocket here → Gemini Live → audio back to Twilio

export function attachTwilioRelay(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req) => {
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams
    const configId = params.get('config')

    let gemini: GeminiLiveSession | null = null
    let streamSid: string | null = null
    let callerPhone: string | null = null
    let configData: Awaited<ReturnType<typeof getReceptionConfigById>> = null

    ws.on('message', async (raw: Buffer) => {
      let msg: any
      try { msg = JSON.parse(raw.toString()) } catch { return }

      switch (msg.event) {
        case 'connected':
          console.log(`[Relay] Twilio connected — config: ${configId}`)
          break

        case 'start': {
          streamSid = msg.start?.streamSid ?? null
          callerPhone = msg.start?.customParameters?.caller ?? null

          if (!configId) {
            console.error('[Relay] No configId in WebSocket URL')
            ws.close()
            return
          }

          configData = await getReceptionConfigById(configId)
          if (!configData) {
            console.error(`[Relay] Config ${configId} not found`)
            ws.close()
            return
          }

          console.log(`[Relay] Call started — ${configData.business_name} | caller: ${callerPhone ?? 'unknown'}`)

          gemini = new GeminiLiveSession({
            onReady: () => console.log(`[Relay] Gemini ready — ${configData!.business_name}`),
            onClose: () => console.log(`[Relay] Gemini closed`),
            onError: (e) => console.error(`[Relay] Gemini error: ${e.message}`),

            onAudio: (pcm24Base64) => {
              if (ws.readyState !== WebSocket.OPEN || !streamSid) return
              const mulaw = geminiToTwilioAudio(pcm24Base64)
              ws.send(JSON.stringify({
                event: 'media',
                streamSid,
                media: { payload: mulaw },
              }))
            },

            onToolCall: async (name, args, callId) => {
              console.log(`[Relay] Tool: ${name}`, args)

              if (name === 'escalate_to_human') {
                await notifyOwner('escalation', args as any, configData!, callerPhone)
                gemini?.respondToTool(callId, {
                  success: true,
                  message: 'I\'m connecting you to a team member now. Please hold for just a moment.',
                })
              }

              if (name === 'take_message') {
                await notifyOwner('message', args as any, configData!, callerPhone)
                gemini?.respondToTool(callId, {
                  success: true,
                  message: 'Got it — I\'ve recorded your message. Someone will get back to you shortly.',
                })
              }
            },
          })

          try {
            await gemini.connect(configData.system_prompt)
          } catch (e: any) {
            console.error(`[Relay] Gemini connect failed: ${e.message}`)
            ws.close()
          }
          break
        }

        case 'media': {
          if (!gemini || !msg.media?.payload) break
          const pcm16 = twilioToGeminiAudio(msg.media.payload)
          gemini.sendAudio(pcm16)
          break
        }

        case 'stop': {
          console.log(`[Relay] Call ended`)
          gemini?.close()
          gemini = null
          break
        }
      }
    })

    ws.on('close', () => {
      gemini?.close()
      gemini = null
    })

    ws.on('error', (e) => console.error(`[Relay] Twilio WS error: ${e.message}`))
  })
}

// ─── Owner notifications via SMS ─────────────────────────────────────────────

async function notifyOwner(
  type: 'escalation' | 'message',
  args: { reason?: string; caller_name?: string; caller_phone?: string; message?: string },
  config: NonNullable<Awaited<ReturnType<typeof getReceptionConfigById>>>,
  callerPhone: string | null
) {
  const ownerPhone = config.brain?.owner_phone
  if (!ownerPhone || !process.env.TWILIO_ACCOUNT_SID) return

  const lines = [`[AI Reception] ${config.business_name}`]

  if (type === 'escalation') {
    lines.push(`Caller needs human help.`)
    if (args.reason) lines.push(`Reason: ${args.reason}`)
    if (callerPhone) lines.push(`Caller: ${callerPhone}`)
    lines.push(`Call them back ASAP.`)
  } else {
    lines.push(`New message from ${args.caller_name ?? 'caller'}.`)
    if (args.caller_phone) lines.push(`Callback: ${args.caller_phone}`)
    if (args.message) lines.push(`Message: ${args.message}`)
  }

  try {
    await sendSMS(ownerPhone, lines.join('\n'))
    console.log(`[Relay] Owner notified at ${ownerPhone}`)
  } catch (e: any) {
    console.log(`[Relay] Owner notification failed: ${e.message}`)
  }
}
