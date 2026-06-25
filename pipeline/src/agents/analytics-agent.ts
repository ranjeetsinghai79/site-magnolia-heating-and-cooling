import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Lead, AgentResult } from '../types.js'

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { maxOutputTokens: 500 } })

async function getGscData(siteUrl: string): Promise<any> {
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!serviceAccount) return null

  const sa = JSON.parse(serviceAccount)
  const now = Math.floor(Date.now() / 1000)
  const { createSign } = await import('crypto')

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url')

  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(sa.private_key, 'base64url')
  const jwt = `${header}.${payload}.${signature}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json() as any
  const token = tokenData.access_token
  if (!token) return null

  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 10,
        orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
      }),
    }
  )
  return res.ok ? res.json() : null
}

export async function runAnalyticsAgent(
  lead: Lead
): Promise<AgentResult<{ report_sent: boolean }>> {
  console.log(`[Analytics] Generating weekly report for ${lead.name}`)

  if (!lead.vercel_url || !lead.email) {
    return { success: false, error: 'No vercel URL or email' }
  }

  try {
    const gscData = await getGscData(lead.vercel_url)

    const topKeywords = gscData?.rows
      ?.slice(0, 5)
      .map((r: any) => `${r.keys[0]} (${r.clicks} clicks)`)
      .join(', ') || 'Data not yet available'

    const totalClicks = gscData?.rows?.reduce((sum: number, r: any) => sum + r.clicks, 0) || 0
    const totalImpressions = gscData?.rows?.reduce((sum: number, r: any) => sum + r.impressions, 0) || 0

    // Generate AI summary
    const result = await model.generateContent(
      `Write a friendly weekly website performance summary for ${lead.name}. Data: ${totalClicks} clicks, ${totalImpressions} impressions, top keywords: ${topKeywords}. 3-4 sentences. Encouraging tone. Mention what's working and one suggestion. No emojis.`
    )

    const summary = result.response.text()

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.OUTREACH_FROM_EMAIL || 'reports@webcrew.dev',
        to: lead.email,
        subject: `Weekly website report — ${lead.name}`,
        html: `
          <h2>Your Weekly Website Report</h2>
          <p>${summary}</p>
          <table style="border-collapse:collapse;width:100%;margin:20px 0">
            <tr style="background:#f5f5f5">
              <th style="padding:10px;text-align:left;border:1px solid #ddd">Metric</th>
              <th style="padding:10px;text-align:left;border:1px solid #ddd">Last 28 Days</th>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #ddd">Total Clicks</td>
              <td style="padding:10px;border:1px solid #ddd">${totalClicks}</td>
            </tr>
            <tr style="background:#f5f5f5">
              <td style="padding:10px;border:1px solid #ddd">Total Impressions</td>
              <td style="padding:10px;border:1px solid #ddd">${totalImpressions}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #ddd">Top Keywords</td>
              <td style="padding:10px;border:1px solid #ddd">${topKeywords}</td>
            </tr>
          </table>
          <p style="color:#666;font-size:12px">Managed by your AI Website Employee</p>
        `,
      }),
    })

    return { success: true, data: { report_sent: emailRes.ok } }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
