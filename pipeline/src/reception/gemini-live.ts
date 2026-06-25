import WebSocket from 'ws'

// Gemini Multimodal Live API — raw WebSocket (bidirectional audio/text streaming)
// Model: gemini-2.0-flash-live-001 (stable) or gemini-2.5-flash-preview-native-audio-dialog (preview)
// Endpoint: wss://generativelanguage.googleapis.com/ws/...BidiGenerateContent?key=API_KEY

const MODEL = process.env.GEMINI_LIVE_MODEL ?? 'models/gemini-2.0-flash-live-001'
const WS_ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.BidiGenerateContent'

export interface GeminiLiveCallbacks {
  onReady: () => void
  onAudio: (base64Pcm24kHz: string) => void
  onToolCall: (name: string, args: Record<string, unknown>, callId: string) => void
  onError: (err: Error) => void
  onClose: () => void
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null
  private ready = false
  private callbacks: GeminiLiveCallbacks

  constructor(callbacks: GeminiLiveCallbacks) {
    this.callbacks = callbacks
  }

  async connect(systemPrompt: string): Promise<void> {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not set')

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_ENDPOINT}?key=${apiKey}`)

      this.ws.on('open', () => {
        // Send setup — must be first message
        this.ws!.send(JSON.stringify({
          setup: {
            model: MODEL,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Puck' },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            tools: [{
              functionDeclarations: [
                {
                  name: 'escalate_to_human',
                  description: 'Transfer the call to a human when caller requests it or AI cannot resolve the issue',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      reason: { type: 'STRING', description: 'Brief reason for escalation' },
                    },
                    required: ['reason'],
                  },
                },
                {
                  name: 'take_message',
                  description: 'Record a callback message from the caller',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      caller_name:  { type: 'STRING', description: "Caller's name" },
                      caller_phone: { type: 'STRING', description: "Caller's callback number" },
                      message:      { type: 'STRING', description: 'Message to relay to the business' },
                    },
                    required: ['caller_name', 'message'],
                  },
                },
              ],
            }],
          },
        }))
        resolve()
      })

      this.ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString())
          this.handle(msg)
        } catch {
          // ignore non-JSON frames
        }
      })

      this.ws.on('error', (err) => {
        if (!this.ready) reject(err)
        else this.callbacks.onError(err)
      })

      this.ws.on('close', () => {
        this.ready = false
        this.callbacks.onClose()
      })
    })
  }

  private handle(msg: any) {
    // Setup acknowledged
    if (msg.setupComplete) {
      this.ready = true
      this.callbacks.onReady()
      return
    }

    // Audio response chunks
    const parts = msg.serverContent?.modelTurn?.parts ?? []
    for (const part of parts) {
      const data = part.inlineData?.data
      const mime = part.inlineData?.mimeType ?? ''
      if (data && mime.startsWith('audio/pcm')) {
        this.callbacks.onAudio(data)
      }
    }

    // Tool calls
    const functionCalls = msg.toolCall?.functionCalls ?? []
    for (const fc of functionCalls) {
      this.callbacks.onToolCall(fc.name, fc.args ?? {}, fc.id)
    }
  }

  sendAudio(base64Pcm16kHz: string) {
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'audio/pcm;rate=16000',
          data: base64Pcm16kHz,
        }],
      },
    }))
  }

  respondToTool(callId: string, output: unknown) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({
      toolResponse: {
        functionResponses: [{ id: callId, response: { output } }],
      },
    }))
  }

  close() {
    this.ws?.close()
  }
}
