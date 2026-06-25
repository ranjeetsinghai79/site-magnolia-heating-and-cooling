import { GoogleGenerativeAI } from '@google/generative-ai'
import { crawlBusinessSite, scrapeSite, type BusinessBrain } from '../tools/firecrawl.js'
import type { Lead, BrandData, AgentResult }                  from '../types.js'
import pg                                                      from 'pg'

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' })

const EXTRACTION_PROMPT = `You are a brand intelligence analyst. A business's ENTIRE website content is provided.
Extract comprehensive brand data as JSON. This data builds a hyper-personalized AI-upgraded website for them.

Return ONLY this JSON (no markdown fences, no commentary):
{
  "name": "exact business name",
  "tagline": "their actual slogan or null",
  "phone": "primary phone",
  "email": "business email or null",
  "address": "full address",
  "services": ["service1", "service2"],
  "pricing": [{"name": "package name", "price": "$X or call for quote"}],
  "tone": "professional|friendly|urgent|luxury",
  "unique_selling_points": ["usp1", "usp2"],
  "years_in_business": 0,
  "license": "license number or null",
  "service_areas": ["city1", "city2"],
  "google_rating": "4.8",
  "review_count": "150",
  "team_members": [{"name": "Dr. Smith", "role": "Owner"}],
  "certifications": ["cert1"],
  "colors": {
    "primary": "#hex",
    "secondary": "#hex or null",
    "accent": "#hex or null"
  },
  "testimonials": [{"name": "Customer Name", "text": "exact verbatim quote", "rating": 5}],
  "has_online_booking": false,
  "has_financing": false,
  "emergency_available": false,
  "languages": ["English"],
  "awards": [],
  "pain_points_they_solve": ["problem1"],
  "competitor_advantages": ["why choose them"]
}

Rules: real data only, null for missing, no invented names/prices/quotes.`

export async function runBrandAnalystAgent(lead: Lead): Promise<AgentResult<Lead>> {
  console.log(`[BrandAnalyst] Analyzing: ${lead.name}`)

  try {
    // Tier 1: no website — Google Places data only, no crawl needed
    if (!lead.website) {
      const brandData: BrandData = {
        name:    lead.name,
        phone:   lead.phone,
        address: lead.address,
        services: [],
        tone:    'professional',
      }
      console.log(`[BrandAnalyst] ${lead.name} — no website, Places data only`)
      return { success: true, data: { ...lead, brand_data: brandData, status: 'analyzed' } }
    }

    // Deep-crawl full site → build BusinessBrain (text + media)
    console.log(`[BrandAnalyst] Deep-crawling ${lead.website}`)
    const brain = await crawlBusinessSite(lead.website, {
      name:  lead.name,
      niche: lead.niche,
      city:  lead.city,
      state: lead.state,
    })

    // Fallback to single-page scrape if crawl fails
    const content = brain?.full_text ?? await scrapeSite(lead.website)

    if (!content) {
      const brandData: BrandData = {
        name:    lead.name,
        phone:   lead.phone,
        address: lead.address,
        services: [],
      }
      return { success: true, data: { ...lead, brand_data: brandData, status: 'analyzed' } }
    }

    const pagesInfo = brain
      ? `Pages crawled: ${brain.pages_scraped} (${brain.page_titles.slice(0, 3).join(', ')})`
      : 'Single page fallback'
    console.log(`[BrandAnalyst] ${pagesInfo}`)

    if (brain) {
      const m = brain.media
      console.log(`[BrandAnalyst] Media: ${m.images.length} images, ${m.youtube_embeds.length} YouTube, ${m.before_after.length} before/after`)
    }

    // Gemini extraction from full multi-page content
    const result = await model.generateContent(
      `${EXTRACTION_PROMPT}\n\nBusiness: ${lead.name}\nNiche: ${lead.niche}\n\nFull website:\n${content}`
    )

    const text     = result.response.text()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON from Gemini')

    const brandData: BrandData = JSON.parse(jsonMatch[0])

    // Attach brain metadata for downstream agents
    if (brain) {
      (brandData as any).brain_meta = {
        pages_scraped:  brain.pages_scraped,
        has_pricing:    brain.has_pricing,
        has_team:       brain.has_team,
        has_reviews:    brain.has_reviews,
        has_gallery:    brain.has_gallery,
        has_booking:    brain.has_booking,
        is_luxury:      brain.is_luxury,
        media_summary: {
          images:         brain.media.images.length,
          hero_images:    brain.media.hero_images,
          gallery_images: brain.media.gallery_images.slice(0, 10),
          youtube_embeds: brain.media.youtube_embeds,
          before_after:   brain.media.before_after,
          video_testimonials: brain.media.video_testimonials,
          logo_url:       brain.media.logo_url,
        },
      }
    }

    // Persist brain to DB (non-fatal if fails)
    if (brain && lead.id) {
      await persistBrain(lead.id, brain).catch(e =>
        console.warn('[BrandAnalyst] brain persist failed:', e.message)
      )
    }

    console.log(`[BrandAnalyst] Done: ${brandData.services?.length ?? 0} services, ${brandData.testimonials?.length ?? 0} testimonials`)

    return {
      success: true,
      data: { ...lead, brand_data: brandData, status: 'analyzed' },
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

async function persistBrain(leadId: string, brain: BusinessBrain): Promise<void> {
  if (!process.env.DATABASE_URL) return
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await pool.query(
      `UPDATE leads SET business_brain = $1 WHERE id = $2`,
      [JSON.stringify(brain), leadId]
    )
  } finally {
    await pool.end()
  }
}
