import { NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"
import path from "path"

export async function POST(req: NextRequest) {
  const { niches, cities, target = 100 } = await req.json()

  if (!niches?.length) {
    return NextResponse.json({ error: "Select at least one niche" }, { status: 400 })
  }

  const pipelineDir = path.resolve(process.cwd(), "../pipeline")

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    SCRAPE_TARGET:      String(target),
    SCRAPE_ALL_NICHES:  "false",
    NICHE_OVERRIDE:     niches[0],        // daily-scrape reads this for single niche
    SCRAPE_HEADLESS:    "true",
  }

  // For multi-niche: pass as comma list — daily-scrape.ts will pick it up
  if (niches.length > 1) {
    env.NICHE_LIST    = niches.join(",")
    delete env.NICHE_OVERRIDE
    env.SCRAPE_ALL_NICHES = "false"
  }

  if (cities?.length) {
    env.CITY_OVERRIDE = cities.join(",")
  }

  const child = spawn("npx", ["tsx", "src/scripts/daily-scrape.ts"], {
    cwd:      pipelineDir,
    env,
    detached: true,
    stdio:    "ignore",
  })
  child.unref()

  return NextResponse.json({
    ok:      true,
    message: `Scraping ${niches.join(", ")} for ${target} leads — running in background`,
    pid:     child.pid,
  })
}
