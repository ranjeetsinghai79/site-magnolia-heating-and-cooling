import { GoogleGenerativeAI } from '@google/generative-ai'
import { updateFile } from '../tools/github.js'
import type { Lead, AgentResult } from '../types.js'

const genai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { maxOutputTokens: 3000 } })

export interface SeoPackage {
  sitemap_xml: string
  robots_txt: string
  schema_json: string
  meta_strategy: string
  keywords: string[]
}

export async function runSeoAgent(lead: Lead): Promise<AgentResult<SeoPackage>> {
  console.log(`[SEO] Generating SEO package for ${lead.name}`)

  const bd = lead.brand_data!
  const domain = lead.vercel_url || `https://${lead.name.toLowerCase().replace(/\s+/g, '')}.com`

  try {
    const result = await model.generateContent(
      `Generate a complete SEO package for this local business. Return valid JSON only, no markdown.

Business: ${JSON.stringify({ name: bd.name, address: bd.address, phone: bd.phone, services: bd.services, areas: bd.service_areas }, null, 2)}
Domain: ${domain}
Niche: ${lead.niche}
City: ${lead.city}, ${lead.state}

Return this JSON:
{
  "sitemap_xml": "<?xml version=\\"1.0\\" encoding=\\"UTF-8\\"?>...(full sitemap.xml content)",
  "robots_txt": "User-agent: *\\nAllow: /\\nSitemap: ${domain}/sitemap.xml",
  "schema_json": "{full LocalBusiness schema.org JSON-LD as a string}",
  "meta_strategy": "Title tag formula and description formula for this business",
  "keywords": ["keyword1", "keyword2", "...15 local SEO keywords"]
}`
    )

    const text = result.response.text()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const seoPackage: SeoPackage = JSON.parse(jsonMatch[0])

    // Push SEO files to the client's GitHub repo
    if (lead.github_repo) {
      const repoUrl = new URL(lead.github_repo)
      const [, owner, repo] = repoUrl.pathname.split('/')

      if (owner && repo) {
        await Promise.all([
          updateFile({
            owner, repo,
            path: 'public/sitemap.xml',
            content: seoPackage.sitemap_xml,
            message: 'chore: add SEO sitemap.xml',
          }),
          updateFile({
            owner, repo,
            path: 'public/robots.txt',
            content: seoPackage.robots_txt,
            message: 'chore: add SEO robots.txt',
          }),
          updateFile({
            owner, repo,
            path: 'public/schema.json',
            content: seoPackage.schema_json,
            message: 'chore: add LocalBusiness schema.org JSON-LD',
          }),
        ])
        console.log(`[SEO] Files pushed to ${owner}/${repo}`)
      }
    }

    return { success: true, data: seoPackage }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
