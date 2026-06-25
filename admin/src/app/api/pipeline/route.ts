import { NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"
import path from "path"

export async function POST(req: NextRequest) {
  const { niche, location, count, tier } = await req.json()

  if (!niche || !location) {
    return NextResponse.json({ error: "niche and location required" }, { status: 400 })
  }

  const pipelineDir = path.resolve(process.cwd(), "../pipeline")

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    NICHE:      niche,
    LOCATION:   location,
    COUNT:      String(count ?? 5),
    DRY_RUN:    "false",
    PREMIUM:    tier === "premium" ? "true" : "false",
  }

  // Spawn pipeline as detached background process — returns immediately
  const child = spawn("npx", ["tsx", "src/run.ts"], {
    cwd:      pipelineDir,
    env,
    detached: true,
    stdio:    "ignore",
  })
  child.unref()

  return NextResponse.json({
    ok:      true,
    message: `Pipeline started: ${niche} in ${location} (${count ?? 5} leads, ${tier ?? "regular"})`,
    pid:     child.pid,
  })
}
