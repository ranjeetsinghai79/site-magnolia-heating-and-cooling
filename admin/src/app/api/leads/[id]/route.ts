import { NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"
import path from "path"
import {
  setLeadTier,
  setLeadStatus,
  markLeadPaid,
  resetLeadForRebuild,
  deleteLead,
  setLeadEmail,
} from "@/lib/db"

function spawnOutreach(leadId: string, type: "sms" | "email" | "both") {
  const pipelineDir = path.resolve(process.cwd(), "../pipeline")
  const child = spawn("npx", ["tsx", "src/scripts/outreach-lead.ts"], {
    cwd:      pipelineDir,
    env:      { ...process.env as Record<string, string>, LEAD_ID: leadId, OUTREACH_TYPE: type },
    detached: true,
    stdio:    "ignore",
  })
  child.unref()
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  try {
    if (body.action === "set_tier" && body.tier) {
      await setLeadTier(id, body.tier)
      return NextResponse.json({ ok: true })
    }
    if (body.action === "set_status" && body.status) {
      await setLeadStatus(id, body.status)
      return NextResponse.json({ ok: true })
    }
    if (body.action === "mark_paid") {
      await markLeadPaid(id)
      return NextResponse.json({ ok: true })
    }
    if (body.action === "set_email") {
      await setLeadEmail(id, body.email ?? "")
      return NextResponse.json({ ok: true })
    }
    if (body.action === "rebuild") {
      await resetLeadForRebuild(id)
      return NextResponse.json({ ok: true, message: "Reset to analyzed" })
    }
    if (body.action === "send_sms") {
      spawnOutreach(id, "sms")
      return NextResponse.json({ ok: true, message: "SMS queued" })
    }
    if (body.action === "send_email") {
      spawnOutreach(id, "email")
      return NextResponse.json({ ok: true, message: "Email queued" })
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await deleteLead(id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
