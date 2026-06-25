import { GoogleGenerativeAI } from '@google/generative-ai'
import { createPost } from '../tools/google-my-business.js'
import type { Lead, AgentResult } from '../types.js'

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { maxOutputTokens: 400 } })

export async function runGbpAgent(lead: Lead): Promise<AgentResult<{ post_created: boolean }>> {
  console.log(`[GBP] Creating GBP post for ${lead.name}`)

  if (!process.env.GBP_ACCOUNT_ID || !process.env.GBP_LOCATION_ID) {
    return { success: false, error: 'GBP_ACCOUNT_ID or GBP_LOCATION_ID not set' }
  }

  const bd = lead.brand_data!

  try {
    // Generate weekly post content
    const result = await model.generateContent(
      `Write a Google Business Profile post for ${bd.name}, a ${lead.niche} business in ${lead.city}. 150 words max. Promote their services: ${bd.services?.slice(0, 3).join(', ')}. Include a call to action. Sound professional and local. No emojis.`
    )

    const postText = result.response.text()

    const posted = await createPost({
      accountId: process.env.GBP_ACCOUNT_ID,
      locationId: process.env.GBP_LOCATION_ID,
      summary: postText,
      callToActionUrl: lead.vercel_url,
    })

    return { success: true, data: { post_created: posted } }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
