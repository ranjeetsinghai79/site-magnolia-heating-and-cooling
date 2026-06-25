import { GoogleGenerativeAI } from '@google/generative-ai'
import { listReviews, replyToReview } from '../tools/google-my-business.js'
import type { Lead, AgentResult } from '../types.js'

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { maxOutputTokens: 250 } })

export async function runReviewsAgent(
  lead: Lead
): Promise<AgentResult<{ replied: number; skipped: number }>> {
  console.log(`[Reviews] Processing reviews for ${lead.name}`)

  if (!process.env.GBP_ACCOUNT_ID || !process.env.GBP_LOCATION_ID) {
    return { success: false, error: 'GBP credentials not set' }
  }

  try {
    const reviews = await listReviews({
      accountId: process.env.GBP_ACCOUNT_ID,
      locationId: process.env.GBP_LOCATION_ID,
    })

    // Only process reviews without existing replies
    const unanswered = reviews.filter((r: any) => !r.reviewReply)
    let replied = 0
    let skipped = 0

    for (const review of unanswered.slice(0, 10)) {
      const rating = review.starRating // ONE through FIVE
      const text = review.comment || ''
      const reviewer = review.reviewer?.displayName || 'Customer'

      const result = await model.generateContent(
        `Write a professional Google review reply for ${lead.name} (${lead.niche} business).
Reviewer: ${reviewer}
Rating: ${rating}
Review: "${text}"

2-3 sentences. Thank them, address their specific feedback, invite them back. If negative, apologize and offer to make it right. No emojis.`
      )

      const replyText = result.response.text()

      const success = await replyToReview({
        accountId: process.env.GBP_ACCOUNT_ID!,
        locationId: process.env.GBP_LOCATION_ID!,
        reviewId: review.reviewId,
        replyText,
      })

      if (success) replied++
      else skipped++
    }

    return { success: true, data: { replied, skipped } }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
