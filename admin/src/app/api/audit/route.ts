import { NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"
import path from "path"

/**
 * POST /api/audit
 * Triggers audit-agent.ts for a given URL.
 * Spawns a background process so the response returns immediately.
 *
 * Body: { url, businessName?, niche?, city?, sendOutreach? }
 *
 * For sync small audits (< 30s) we run inline.
 * For outreach, we spawn detached.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, businessName, niche, city, sendOutreach } = body

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 })
    }

    // Normalize URL
    let normalizedUrl = url.trim()
    if (!normalizedUrl.startsWith("http")) normalizedUrl = `https://${normalizedUrl}`

    // Spawn audit script as background process
    const pipelineDir = path.resolve(process.cwd(), "../pipeline")
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      AUDIT_URL:           normalizedUrl,
      AUDIT_BUSINESS_NAME: businessName ?? "",
      AUDIT_NICHE:         niche ?? "",
      AUDIT_CITY:          city ?? "",
      AUDIT_SEND_OUTREACH: sendOutreach ? "true" : "false",
    }

    const child = spawn(
      "npx",
      ["tsx", "src/scripts/run-audit.ts"],
      { cwd: pipelineDir, env, detached: true, stdio: "ignore" }
    )
    child.unref()

    return NextResponse.json({
      ok: true,
      message: `Audit started for ${normalizedUrl}. Check Audits page in ~60s.`,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET() {
  // Return recent audits for the admin UI
  try {
    const { default: pg } = await import("pg")
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
    const { rows } = await pool.query(
      `SELECT id, website_url, business_name, niche, overall_score, created_at, report_viewed, outreach_sent
       FROM audits ORDER BY created_at DESC LIMIT 50`
    )
    await pool.end()
    return NextResponse.json({ audits: rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
