import { NextRequest } from "next/server"
import pg from "pg"
import { spawn } from "child_process"
import path from "path"
import fs from "fs"

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const MONOREPO_ROOT = path.resolve(process.cwd(), "..")
const FIRECRAWL_URL = process.env.FIRECRAWL_URL ?? "https://api.firecrawl.dev"
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY ?? ""
const TSX_BIN       = path.join(MONOREPO_ROOT, "node_modules/.bin/tsx")

function loadPipelineEnv(): Record<string, string> {
  try {
    const content = fs.readFileSync(path.join(MONOREPO_ROOT, "pipeline/.env"), "utf-8")
    const env: Record<string, string> = {}
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
    return env
  } catch { return {} }
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sse(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

function stepEvent(id: string, label: string, status: "pending" | "working" | "done" | "error", detail?: string) {
  return sse({ type: "step", id, label, status, detail })
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    mode:          "url" | "new"
    url?:          string
    niche?:        string
    businessName?: string
    city?:         string
    text?:         string
    leadId?:       string
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(chunk: string) {
        controller.enqueue(encoder.encode(chunk))
      }

      try {
        let leadId  = body.leadId ?? null
        let website = body.url    ?? null
        let niche   = body.niche  ?? null

        // ── Workflow A: existing URL via Firecrawl ────────────────────────
        if (body.mode === "url" && body.url) {
          // 1. Scrape
          send(stepEvent("scrape", "Scraping website", "working"))
          const scraped = await scrapeWebsite(body.url)
          send(stepEvent("scrape", "Scraping website", "done", `${scraped.pageCount} pages · ${scraped.imageCount} images`))

          // 2. Save knowledge base
          send(stepEvent("kb", "Saving knowledge base", "working"))
          await saveKnowledge(body.url, scraped, leadId)
          send(stepEvent("kb", "Saving knowledge base", "done"))

          // 3. Detect niche if not provided
          if (!niche) {
            send(stepEvent("niche", "Detecting niche", "working"))
            niche = detectNiche(scraped.allText)
            send(stepEvent("niche", "Detecting niche", "done", niche ?? "auto"))
          }

          // 4. Upsert lead
          send(stepEvent("lead", "Preparing lead record", "working"))
          leadId = await upsertLeadFromUrl(body.url, scraped, niche ?? "hvac")
          send(stepEvent("lead", "Preparing lead record", "done"))

        // ── Workflow B: new business from text dump ───────────────────────
        } else if (body.mode === "new" && body.businessName) {
          send(stepEvent("parse", "Parsing business information", "working"))
          if (body.text) {
            await saveKnowledgeFromText(body.businessName, body.text)
            // Auto-detect niche from text if not explicitly selected
            if (!niche) niche = detectNiche(body.text)
          }
          // Auto-detect from business name if still unknown
          if (!niche) niche = detectNiche(body.businessName)
          // Final fallback
          if (!niche) niche = "hvac"
          send(stepEvent("parse", "Parsing business information", "done", `niche: ${niche}`))

          send(stepEvent("lead", "Creating lead record", "working"))
          leadId = await createLeadFromText({
            name:  body.businessName,
            city:  body.city ?? "",
            niche,
            text:  body.text ?? "",
          })
          send(stepEvent("lead", "Creating lead record", "done"))
        } else {
          throw new Error("Invalid request: provide url or businessName")
        }

        if (!leadId) throw new Error("Failed to create lead")

        // ── Common: run pipeline via child_process ────────────────────────

        send(stepEvent("brand",  "Analyzing brand identity",     "working"))
        send(stepEvent("config", "Generating site config",       "pending"))
        send(stepEvent("build",  "Building website files",       "pending"))
        send(stepEvent("deploy", "Deploying to Cloudflare Pages","pending"))

        const previewUrl = await runPipelineForLead(leadId, {
          niche:    niche ?? "hvac",
          onStep: (marker) => {
            if      (marker === "brand:done")   { send(stepEvent("brand",  "Analyzing brand identity",     "done")); send(stepEvent("config", "Generating site config", "working")) }
            else if (marker === "config:done")  { send(stepEvent("config", "Generating site config",       "done")); send(stepEvent("build",  "Building website files", "working")) }
            else if (marker === "build:start")  { send(stepEvent("build",  "Building website files",       "working")) }
            else if (marker === "build:done")   { send(stepEvent("build",  "Building website files",       "done")); send(stepEvent("deploy", "Deploying to Cloudflare Pages", "working")) }
            else if (marker.startsWith("build:error:")) {
              const detail = marker.replace("build:error:", "")
              const extra  = stderr.split("\n").filter(l => l.trim() && !l.includes("[build-local]")).slice(-4).join(" | ")
              const full   = extra ? `${detail} — ${extra}` : detail
              const msg    = full.includes("rate limit") ? "GitHub rate limit — retry in ~1h" : full
              send(stepEvent("build", "Building website files", "error", msg))
              throw new Error(full.includes("rate limit") ? "GitHub rate limit exceeded. Try again in ~1 hour." : `Build failed: ${msg}`)
            }
            else if (marker === "deploy:start") { send(stepEvent("deploy", "Deploying to Cloudflare Pages", "working")) }
            else if (marker === "deploy:done")  { send(stepEvent("deploy", "Deploying to Cloudflare Pages", "done")) }
            else if (marker.startsWith("deploy:error:")) {
              const detail = marker.replace("deploy:error:", "")
              send(stepEvent("deploy", "Deploying to Cloudflare Pages", "error", detail))
              throw new Error(`Deploy failed: ${detail}`)
            }
          }
        })

        send(sse({ type: "done", previewUrl, leadId }))

      } catch (err: any) {
        send(sse({ type: "error", message: err?.message ?? "Build failed" }))
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

// ── Firecrawl scraping ────────────────────────────────────────────────────────

interface ScrapeResult {
  pageCount:  number
  imageCount: number
  allText:    string
  pages:      Array<{ url: string; markdown: string; metadata?: any }>
  imageUrls:  string[]
  phones:     string[]
  emails:     string[]
}

async function scrapeWebsite(url: string): Promise<ScrapeResult> {
  // Crawl the site with Firecrawl
  const crawlRes = await fetch(`${FIRECRAWL_URL}/v1/crawl`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${FIRECRAWL_KEY}`,
    },
    body: JSON.stringify({
      url,
      limit:            20,
      scrapeOptions:    { formats: ["markdown"], onlyMainContent: false },
      excludePaths:     ["/blog/*", "/news/*", "/privacy*", "/terms*"],
    }),
  })

  if (!crawlRes.ok) {
    // Fallback: single-page scrape
    return scrapeSinglePage(url)
  }

  const crawlData = await crawlRes.json() as { id?: string; success?: boolean }
  const jobId = crawlData.id
  if (!jobId) return scrapeSinglePage(url)

  // Poll until done (max 60s)
  for (let i = 0; i < 30; i++) {
    await delay(2000)
    const statusRes = await fetch(`${FIRECRAWL_URL}/v1/crawl/${jobId}`, {
      headers: { "Authorization": `Bearer ${FIRECRAWL_KEY}` },
    })
    const statusData = await statusRes.json() as { status?: string; data?: any[] }
    if (statusData.status === "completed" && statusData.data) {
      return extractResults(statusData.data)
    }
    if (statusData.status === "failed") break
  }

  return scrapeSinglePage(url)
}

async function scrapeSinglePage(url: string): Promise<ScrapeResult> {
  const res = await fetch(`${FIRECRAWL_URL}/v1/scrape`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${FIRECRAWL_KEY}`,
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  })
  if (!res.ok) {
    return { pageCount: 0, imageCount: 0, allText: "", pages: [], imageUrls: [], phones: [], emails: [] }
  }
  const d = await res.json() as { data?: { markdown?: string; metadata?: any } }
  const markdown = d.data?.markdown ?? ""
  return extractResults([{ url, markdown, metadata: d.data?.metadata ?? {} }])
}

function extractResults(pages: any[]): ScrapeResult {
  const allText  = pages.map(p => p.markdown ?? "").join("\n\n")
  const phones   = [...new Set(Array.from(allText.matchAll(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g), m => m[0]))]
  const emails   = [...new Set(Array.from(allText.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g), m => m[0]))]
  const imgUrls  = [...new Set(Array.from(allText.matchAll(/https?:\/\/[^\s"')]+\.(?:jpg|jpeg|png|webp|gif|svg)/gi), m => m[0]))]

  return {
    pageCount:  pages.length,
    imageCount: imgUrls.length,
    allText,
    pages:      pages.map(p => ({ url: p.url ?? "", markdown: p.markdown ?? "", metadata: p.metadata })),
    imageUrls:  imgUrls,
    phones,
    emails,
  }
}

// ── Knowledge base ────────────────────────────────────────────────────────────

async function saveKnowledge(websiteUrl: string, scraped: ScrapeResult, leadId: string | null) {
  await pool.query(`
    INSERT INTO business_knowledge (
      lead_id, website_url, raw_pages, sitemap_urls, page_count,
      image_urls, phone_numbers, email_addresses, homepage_text
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (website_url) DO UPDATE SET
      lead_id       = COALESCE($1, business_knowledge.lead_id),
      raw_pages     = $3,
      sitemap_urls  = $4,
      page_count    = $5,
      image_urls    = $6,
      phone_numbers = $7,
      email_addresses=$8,
      homepage_text = $9,
      scraped_at    = now()
  `, [
    leadId,
    websiteUrl,
    JSON.stringify(scraped.pages),
    JSON.stringify(scraped.pages.map(p => p.url)),
    scraped.pageCount,
    JSON.stringify(scraped.imageUrls),
    JSON.stringify(scraped.phones),
    JSON.stringify(scraped.emails),
    scraped.pages[0]?.markdown?.slice(0, 8000) ?? "",
  ])
}

async function saveKnowledgeFromText(name: string, text: string) {
  const phones = [...new Set(Array.from(text.matchAll(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g), m => m[0]))]
  const emails = [...new Set(Array.from(text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g), m => m[0]))]
  await pool.query(`
    INSERT INTO business_knowledge (website_url, homepage_text, phone_numbers, email_addresses)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (website_url) DO UPDATE SET homepage_text=$2, phone_numbers=$3, email_addresses=$4, scraped_at=now()
  `, [`manual:${name.toLowerCase().replace(/\s+/g, "-")}`, text.slice(0, 8000), JSON.stringify(phones), JSON.stringify(emails)])
}

// ── Lead upsert ───────────────────────────────────────────────────────────────

async function upsertLeadFromUrl(url: string, scraped: ScrapeResult, niche: string): Promise<string> {
  const domain   = new URL(url).hostname.replace(/^www\./, "")
  const bizName  = domain.split(".")[0].replace(/-/g, " ")
  const phone    = scraped.phones[0]
  const email    = scraped.emails[0]
  const placeId  = `manual:${domain}`

  const { rows } = await pool.query(`
    INSERT INTO leads (place_id, name, phone, email, website, niche, status, tier)
    VALUES ($1,$2,$3,$4,$5,$6,'found','tier2')
    ON CONFLICT (place_id) DO UPDATE SET
      name   = COALESCE(EXCLUDED.name, leads.name),
      phone  = COALESCE(EXCLUDED.phone, leads.phone),
      email  = COALESCE(EXCLUDED.email, leads.email),
      niche  = EXCLUDED.niche
    RETURNING id
  `, [placeId, bizName, phone ?? null, email ?? null, url, niche])

  const leadId = rows[0].id
  // Link knowledge base record to this lead
  await pool.query(`UPDATE business_knowledge SET lead_id=$1 WHERE website_url=$2`, [leadId, url])
  return leadId
}

async function createLeadFromText({ name, city, niche, text }: { name: string; city: string; niche: string; text: string }): Promise<string> {
  const placeId = `manual:${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`
  const phones  = Array.from(text.matchAll(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g), m => m[0])
  const emails  = Array.from(text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g), m => m[0])

  const { rows } = await pool.query(`
    INSERT INTO leads (place_id, name, phone, email, city, niche, status, tier)
    VALUES ($1,$2,$3,$4,$5,$6,'found','tier1')
    RETURNING id
  `, [placeId, name, phones[0] ?? null, emails[0] ?? null, city, niche])

  return rows[0].id
}

// ── GitHub rate limit pre-flight ─────────────────────────────────────────────

async function checkGitHubRateLimit(): Promise<{ ok: boolean; remaining: number; resetMin: number; tokenIdx: number }> {
  const pipelineEnv = loadPipelineEnv()
  const tokens: string[] = []
  for (let i = 1; i <= 10; i++) {
    const key = i === 1 ? 'GITHUB_TOKEN' : `GITHUB_TOKEN${i}`
    const val = pipelineEnv[key] ?? process.env[key] ?? ''
    if (val) tokens.push(val)
  }

  for (let i = 0; i < tokens.length; i++) {
    try {
      const r = await fetch('https://api.github.com/rate_limit', {
        headers: { Authorization: `token ${tokens[i]}`, 'User-Agent': 'pipeline' },
      })
      const d = await r.json() as any
      const remaining = d.resources?.core?.remaining ?? 0
      const reset     = d.resources?.core?.reset ?? 0
      const resetMin  = Math.max(0, Math.ceil((reset * 1000 - Date.now()) / 60000))
      if (remaining > 50) return { ok: true, remaining, resetMin, tokenIdx: i + 1 }
    } catch { /* skip */ }
  }
  // All tokens exhausted
  return { ok: false, remaining: 0, resetMin: 35, tokenIdx: 0 }
}

// ── Pipeline runner ───────────────────────────────────────────────────────────

async function runPipelineForLead(
  leadId: string,
  { niche, onStep }: { niche: string; onStep: (s: string) => void }
): Promise<string> {
  const pipelineEnv = loadPipelineEnv()
  const env = {
    ...process.env,
    ...pipelineEnv,
    PIPELINE_LEAD_ID: leadId,
    NICHE:            niche,
    DRY_RUN:          "false",
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      TSX_BIN,
      ["src/scripts/run-single.ts", leadId],
      { cwd: path.join(MONOREPO_ROOT, "pipeline"), env, shell: false }
    )

    let stderr = ""
    let aborted = false

    function handleStep(marker: string) {
      if (aborted) return
      try {
        onStep(marker)
      } catch (e: any) {
        aborted = true
        child.kill()
        reject(e)
      }
    }

    child.stdout?.on("data", (d: Buffer) => {
      const text = d.toString()
      if      (text.includes("[brand] Done"))         handleStep("brand:done")
      else if (text.includes("[brand]"))              handleStep("brand:start")
      else if (text.includes("[config] Done"))        handleStep("config:done")
      else if (text.includes("[config]"))             handleStep("config:start")
      else if (text.includes("[build:done]"))         handleStep("build:done")
      else if (text.includes("[build:error]"))        handleStep("build:error:" + text.split("[build:error]")[1]?.trim())
      else if (text.includes("[build:start]"))        handleStep("build:start")
      else if (text.includes("[deploy:done]"))        handleStep("deploy:done")
      else if (text.includes("[deploy:error]"))       handleStep("deploy:error:" + text.split("[deploy:error]")[1]?.trim())
      else if (text.includes("[deploy:start]"))       handleStep("deploy:start")
    })
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString() })

    child.on("close", async (code) => {
      if (aborted) return
      try {
        const { rows } = await pool.query(
          `SELECT cloudflare_url FROM leads WHERE id=$1`, [leadId]
        )
        const url = rows[0]?.cloudflare_url
        if (url) return resolve(url)
      } catch { /* ignore */ }

      if (code !== 0) {
        const errText = stderr.slice(-1000)
        const msg = errText.includes("rate limit")
          ? "GitHub rate limit exceeded. Try again in ~1 hour."
          : `Pipeline failed: ${errText.split("\n").filter(l => l.trim()).slice(-3).join(" | ")}`
        reject(new Error(msg))
      } else {
        resolve("")
      }
    })

    child.on("error", (err) => reject(new Error(`Spawn error: ${err.message}`)))

    // 10-minute timeout for full build
    setTimeout(() => {
      child.kill()
      reject(new Error("Pipeline timed out after 10 minutes"))
    }, 10 * 60 * 1000)
  })
}

// ── Niche detection ───────────────────────────────────────────────────────────

function detectNiche(text: string): string | null {
  const lower = text.toLowerCase()
  const map: [string, string][] = [
    ["hvac", "hvac|heating|cooling|air condition"],
    ["roofing", "roof|shingle|gutter"],
    ["dentist", "dent|teeth|orthodon|smile"],
    ["medspa", "medspa|med spa|botox|filler|facial|laser"],
    ["lawfirm", "attorney|lawyer|legal|law firm"],
    ["cleaning", "clean|maid|janitorial"],
    ["junk-removal", "junk|removal|haul"],
    ["daycare", "daycare|childcare|preschool|toddler"],
    ["auto-detailing", "detail|car wash|auto"],
    ["restaurant", "restaurant|food|dining|menu|cuisine"],
    ["plumbing", "plumb|pipe|drain|water heater"],
    ["landscaping", "landscap|lawn|garden|mow"],
    ["remodeling", "remodel|renovation|kitchen|bathroom"],
    ["salon", "salon|hair|cut|style|color"],
    ["barbershop", "barber|fade|trim|beard"],
  ]
  for (const [niche, pattern] of map) {
    if (new RegExp(pattern).test(lower)) return niche
  }
  return null
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }
