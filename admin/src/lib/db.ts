import pg from "pg"
import crypto from "crypto"

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// Auto-create client_tokens table on startup
pool.query(`
  CREATE TABLE IF NOT EXISTS client_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT        NOT NULL,
    token      TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
    used       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {})

// ── Lead ─────────────────────────────────────────────────────────────────────

export interface Lead {
  id: string
  name: string
  niche: string
  city: string
  state: string
  phone?: string
  email?: string
  website?: string
  tier?: string
  client_plan?: string
  status: string
  site_score?: number
  cloudflare_url?: string
  vercel_url?: string
  github_repo?: string
  rating?: number
  review_count?: number
  paid?: boolean
  stripe_payment_link?: string
  location_group_id?: string
  vapi_assistant_id?: string
  vapi_phone_number?: string
  webhook_url?: string
  created_at?: string
}

export async function getLeads(): Promise<Lead[]> {
  const { rows } = await pool.query<Lead>(`
    SELECT id, name, niche, city, state, phone, email, website,
           tier, status, site_score, cloudflare_url, vercel_url,
           github_repo, rating, review_count, paid, created_at
    FROM leads
    ORDER BY created_at DESC
    LIMIT 500
  `)
  return rows
}

export async function getRecentLeads(limit = 8): Promise<Lead[]> {
  const { rows } = await pool.query<Lead>(
    `SELECT id, name, niche, city, state, status, tier, cloudflare_url, vercel_url, created_at
     FROM leads ORDER BY created_at DESC LIMIT $1`,
    [limit]
  )
  return rows
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface FullStats {
  total:      number
  processing: number
  deployed:   number
  paid:       number
  errors:     number
  skipped:    number
}

export async function getFullStats(): Promise<FullStats> {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status IN ('found','scored','analyzed','config_generated','built')) AS processing,
      COUNT(*) FILTER (WHERE status IN ('deployed','outreach_sent','sms_sent','conversation_active','meeting_scheduled','payment_link_sent')) AS deployed,
      COUNT(*) FILTER (WHERE paid = TRUE OR status IN ('paid','handed_off')) AS paid,
      COUNT(*) FILTER (WHERE status = 'error') AS errors,
      COUNT(*) FILTER (WHERE status = 'skipped') AS skipped
    FROM leads
  `)
  const r = rows[0]
  return {
    total:      Number(r.total),
    processing: Number(r.processing),
    deployed:   Number(r.deployed),
    paid:       Number(r.paid),
    errors:     Number(r.errors),
    skipped:    Number(r.skipped),
  }
}

// Legacy compat
export async function getStats() {
  const s = await getFullStats()
  return { total: s.total, deployed: s.deployed, paid: s.paid, errors: s.errors }
}

export interface FunnelStage { group: string; count: number; color: string }

const FUNNEL_ORDER = ["Processing", "Live", "Engaged", "Converted", "Skipped", "Error"]

export async function getFunnelData(): Promise<FunnelStage[]> {
  const { rows } = await pool.query(`
    SELECT
      CASE
        WHEN status IN ('found','scored','analyzed','config_generated','built') THEN 'Processing'
        WHEN status IN ('deployed','outreach_sent','sms_sent') THEN 'Live'
        WHEN status IN ('conversation_active','meeting_scheduled','payment_link_sent') THEN 'Engaged'
        WHEN status IN ('paid','handed_off') THEN 'Converted'
        WHEN status = 'skipped' THEN 'Skipped'
        ELSE 'Error'
      END AS grp,
      COUNT(*) AS count
    FROM leads
    GROUP BY grp
  `)
  const colors: Record<string, string> = {
    Processing: "#6366f1",
    Live:       "#10b981",
    Engaged:    "#3b82f6",
    Converted:  "#22c55e",
    Skipped:    "#475569",
    Error:      "#ef4444",
  }
  const map = Object.fromEntries(rows.map(r => [r.grp, Number(r.count)]))
  return FUNNEL_ORDER.map(g => ({ group: g, count: map[g] ?? 0, color: colors[g] }))
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function setLeadTier(id: string, tier: string): Promise<void> {
  await pool.query(`UPDATE leads SET tier=$1 WHERE id=$2`, [tier, id])
}

export async function setLeadStatus(id: string, status: string): Promise<void> {
  await pool.query(`UPDATE leads SET status=$1 WHERE id=$2`, [status, id])
}

export async function markLeadPaid(id: string): Promise<void> {
  await pool.query(
    `UPDATE leads SET paid=TRUE, status='handed_off' WHERE id=$1`,
    [id]
  )
}

export async function deleteLead(id: string): Promise<void> {
  await pool.query(`DELETE FROM leads WHERE id=$1`, [id])
}

export async function setLeadEmail(id: string, email: string): Promise<void> {
  await pool.query(`UPDATE leads SET email=$1 WHERE id=$2`, [email || null, id])
}

export async function getCallLeads(): Promise<Lead[]> {
  const { rows } = await pool.query<Lead>(`
    SELECT id, name, niche, city, state, phone, email, website,
           tier, status, rating, review_count, cloudflare_url, vercel_url, created_at
    FROM leads
    WHERE phone IS NOT NULL
      AND status IN ('found','scored','called','interested')
    ORDER BY
      CASE WHEN status = 'interested' THEN 0
           WHEN status = 'called' THEN 2
           ELSE 1
      END,
      (website IS NULL) DESC,
      rating DESC NULLS LAST,
      created_at DESC
    LIMIT 200
  `)
  return rows
}

export interface SurveyResponse {
  id: string
  created_at: string
  name: string | null
  biz: string | null
  phone: string | null
  niche: string | null
  pain: string | null
  has_website: string | null
  ai_want: string | null
  budget: string | null
}

export async function getSurveyResponses(): Promise<SurveyResponse[]> {
  try {
    const { rows } = await pool.query<SurveyResponse>(`
      SELECT id, created_at, name, biz, phone, niche, pain, has_website, ai_want, budget
      FROM survey_responses
      ORDER BY created_at DESC
      LIMIT 500
    `)
    return rows
  } catch {
    return []
  }
}

export async function resetLeadForRebuild(id: string): Promise<void> {
  await pool.query(
    `UPDATE leads SET status='analyzed', github_repo=NULL, cloudflare_url=NULL,
     vercel_url=NULL, outreach_sent=NULL, sms_sent=NULL WHERE id=$1`,
    [id]
  )
}

// ── Client auth ───────────────────────────────────────────────────────────────

export async function createMagicToken(email: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex")
  await pool.query(
    `INSERT INTO client_tokens (email, token) VALUES ($1, $2)`,
    [email, token]
  )
  return token
}

export async function validateMagicToken(token: string): Promise<string | null> {
  const { rows } = await pool.query(
    `UPDATE client_tokens
     SET used = TRUE
     WHERE token = $1 AND used = FALSE AND expires_at > NOW()
     RETURNING email`,
    [token]
  )
  return rows[0]?.email ?? null
}

export async function getClientLead(email: string): Promise<Lead | null> {
  const { rows } = await pool.query<Lead>(
    `SELECT id, name, niche, city, state, phone, email, website, tier, client_plan,
            status, site_score, cloudflare_url, vercel_url, github_repo,
            rating, review_count, paid, location_group_id, vapi_assistant_id,
            vapi_phone_number, webhook_url, created_at
     FROM leads WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
    [email]
  )
  return rows[0] ?? null
}

// ── Multi-location (Scale) ─────────────────────────────────────────────────────

export async function getLocationGroup(groupId: string): Promise<Lead[]> {
  const { rows } = await pool.query<Lead>(
    `SELECT id, name, niche, city, state, phone, email, website, tier, client_plan,
            status, site_score, cloudflare_url, vercel_url, rating, review_count,
            paid, location_group_id, vapi_phone_number, created_at
     FROM leads WHERE location_group_id = $1 ORDER BY created_at ASC`,
    [groupId]
  )
  return rows
}

export async function getClientLocations(email: string): Promise<Lead[]> {
  // First find the primary lead
  const primary = await getClientLead(email)
  if (!primary) return []
  // If in a group, return all group members; otherwise just the one
  if (primary.location_group_id) {
    return getLocationGroup(primary.location_group_id)
  }
  return [primary]
}

export async function setLocationGroup(leadIds: string[], groupId: string): Promise<void> {
  await pool.query(
    `UPDATE leads SET location_group_id=$1 WHERE id = ANY($2::uuid[])`,
    [groupId, leadIds]
  )
}

// ── getDb: pool accessor for API routes ───────────────────────────────────────

export async function getDb() {
  return pool
}
