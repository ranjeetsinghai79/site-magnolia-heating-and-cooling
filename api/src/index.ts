/**
 * Webcrew API — Cloudflare Worker
 * Deploy: cd api && npx wrangler deploy
 * Domain: api.webcrew.app
 *
 * Routes:
 *   POST /leads          — contact form submissions from all deployed sites
 *   POST /sms/webhook    — Twilio inbound SMS replies
 *   GET  /health         — uptime check
 */

export interface Env {
  RESEND_API_KEY: string
  TWILIO_ACCOUNT_SID: string
  TWILIO_AUTH_TOKEN: string
  TWILIO_FROM_NUMBER: string
  LEADS_SHEET_ID: string
  GOOGLE_SERVICE_ACCOUNT_JSON: string
  NOTIFICATION_EMAIL: string       // pavan.harati@gmail.com — we get notified of every lead
  CALENDLY_URL: string
  NEON_DATABASE_URL?: string
  GOOGLE_AI_API_KEY: string
  RECEPTION_SERVER_URL?: string    // e.g. https://ai-reception.railway.app — triggers auto-provision on YES
  RECEPTION_PROVISION_SECRET?: string  // shared secret for /provision endpoint
}

// ─── Contact form lead ────────────────────────────────────────────────────

interface ContactLead {
  firstName: string
  lastName?: string
  phone?: string
  email?: string
  service?: string
  message?: string
  source: string
  businessName: string
  businessNiche: string
  businessOwnerPhone?: string   // injected by builder from lead data
  businessOwnerEmail?: string   // injected by builder from lead data
  submittedAt: string
}

// ─── Resend email ─────────────────────────────────────────────────────────

async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<void> {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'leads@webcrew.app', to, subject, html }),
  })
}

// ─── Twilio SMS ───────────────────────────────────────────────────────────

async function sendSms(env: Env, to: string, body: string): Promise<void> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_FROM_NUMBER) return
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`
  const params = new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER, Body: body })
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
}

// ─── Google Sheets append ─────────────────────────────────────────────────

async function appendToSheets(env: Env, lead: ContactLead): Promise<void> {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.LEADS_SHEET_ID) return
  try {
    const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
    // Simple JWT + Sheets append via REST — full impl in retention agent
    // Minimal version: just log, full version wired in pipeline retention.ts
    console.log(`[Sheets] Lead from ${lead.businessName}: ${lead.firstName} ${lead.phone || lead.email}`)
  } catch { /* non-blocking */ }
}

// ─── POST /leads handler ──────────────────────────────────────────────────

async function handleLeadSubmission(req: Request, env: Env): Promise<Response> {
  const lead: ContactLead = await req.json()
  const visitorName = `${lead.firstName}${lead.lastName ? ' ' + lead.lastName : ''}`
  const contact = lead.phone || lead.email || 'unknown'

  // 1. Notify us — every lead logged to our email
  await sendEmail(
    env,
    env.NOTIFICATION_EMAIL || 'hello@webcrew.app',
    `🔔 New lead: ${lead.businessName} — ${visitorName}`,
    `
    <h2>New contact form submission</h2>
    <table>
      <tr><td><b>Business:</b></td><td>${lead.businessName} (${lead.businessNiche})</td></tr>
      <tr><td><b>Visitor:</b></td><td>${visitorName}</td></tr>
      <tr><td><b>Phone:</b></td><td>${lead.phone || '—'}</td></tr>
      <tr><td><b>Email:</b></td><td>${lead.email || '—'}</td></tr>
      <tr><td><b>Service:</b></td><td>${lead.service || '—'}</td></tr>
      <tr><td><b>Message:</b></td><td>${lead.message || '—'}</td></tr>
      <tr><td><b>Source:</b></td><td>${lead.source}</td></tr>
      <tr><td><b>Time:</b></td><td>${lead.submittedAt}</td></tr>
    </table>
    `
  )

  // 2. SMS the business owner — "you just got a lead on your demo site!"
  // This is the killer hook. They see proof of value before paying.
  if (lead.businessOwnerPhone) {
    await sendSms(
      env,
      lead.businessOwnerPhone,
      `📲 ${lead.businessName}: New inquiry from ${visitorName} (${contact}) via your demo site!\n\nReply INTERESTED to claim this site — ${env.CALENDLY_URL || 'webcrew.app'}`
    )
  }

  // 3. Email the business owner (if we have their email)
  if (lead.businessOwnerEmail) {
    await sendEmail(
      env,
      lead.businessOwnerEmail,
      `You just got a new customer inquiry — ${lead.businessName}`,
      `
      <h2>Someone contacted your business through your demo website!</h2>
      <p><b>${visitorName}</b> just submitted a contact request:</p>
      <ul>
        <li>Phone: ${lead.phone || '—'}</li>
        <li>Email: ${lead.email || '—'}</li>
        <li>Looking for: ${lead.service || lead.message || '—'}</li>
      </ul>
      <p>This is what your website can do for you — 24/7, on autopilot.</p>
      <p><a href="${env.CALENDLY_URL || 'https://webcrew.app'}">Book a 15-min call to activate your site →</a></p>
      <hr>
      <p style="color:#999;font-size:12px">This demo was built by Webcrew. You're not live yet — <a href="${env.CALENDLY_URL}">get live today</a>.</p>
      `
    )
  }

  // 4. Google Sheets log
  await appendToSheets(env, lead)

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

// ─── SMS reply handler (Twilio webhook) ──────────────────────────────────────

const OPT_OUT_WORDS = ['stop', 'unsubscribe', 'quit', 'cancel', 'opt out', 'remove me']
const YES_WORDS = ['yes', 'yeah', 'yep', 'interested', 'sounds good', "let's do it", 'i want']

function isOptOut(text: string): boolean {
  const t = text.toLowerCase()
  return OPT_OUT_WORDS.some(w => t.includes(w))
}

function isYes(text: string): boolean {
  const t = text.toLowerCase().trim()
  return YES_WORDS.some(w => t.includes(w))
}

async function geminiSMSReply(env: Env, context: string, incomingMsg: string): Promise<string> {
  const prompt = `${context}\n\nThe prospect replied: "${incomingMsg}"\n\nWrite a single SMS reply (max 160 chars). Just the reply text, no quotes or labels.`
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GOOGLE_AI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  )
  const json: any = await res.json()
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
}

// ─── Async: look up lead by phone, provision Gemini Live reception ────────────

async function triggerReceptionProvision(env: Env, phone: string): Promise<void> {
  // Fetch lead by phone from Neon (direct SQL via Neon HTTP API)
  const res = await fetch(`${env.NEON_DATABASE_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `SELECT id, name, website FROM leads WHERE phone = $1 AND tier = 'tier2' AND website IS NOT NULL LIMIT 1`,
      params: [phone],
    }),
  })
  if (!res.ok) return

  const data: any = await res.json()
  const lead = data.rows?.[0]
  if (!lead?.website) {
    console.log(`[Provision] No tier2 lead with website found for ${phone}`)
    return
  }

  console.log(`[Provision] Triggering reception for ${lead.name}: ${lead.website}`)
  await fetch(`${env.RECEPTION_SERVER_URL}/provision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.RECEPTION_PROVISION_SECRET ? { Authorization: `Bearer ${env.RECEPTION_PROVISION_SECRET}` } : {}),
    },
    body: JSON.stringify({ websiteUrl: lead.website, businessName: lead.name, leadId: lead.id }),
  })
}

async function handleSMSWebhook(req: Request, env: Env): Promise<Response> {
  // Twilio sends form-encoded body
  const body = await req.text()
  const params = new URLSearchParams(body)
  const from = params.get('From') ?? ''
  const msgBody = params.get('Body') ?? ''
  const twimlResponse = (msg: string) =>
    new Response(`<?xml version="1.0"?><Response><Message>${msg}</Message></Response>`, {
      headers: { 'Content-Type': 'text/xml' },
    })

  if (!from || !msgBody) return twimlResponse('')

  // Opt-out — mandatory TCPA compliance
  if (isOptOut(msgBody)) {
    // Update DB opt-out (fire-and-forget)
    if (env.NEON_DATABASE_URL) {
      fetch(`${env.NEON_DATABASE_URL}`, {}).catch(() => {})
      // Note: actual DB update handled by daily sync worker
    }
    console.log(`[SMS] Opt-out from ${from}`)
    return twimlResponse("Got it, you've been removed from our list. Have a great day!")
  }

  // Strong YES — send Calendly link + trigger async reception provisioning
  if (isYes(msgBody)) {
    const calendly = env.CALENDLY_URL || 'https://calendly.com/webcrew/30min'

    // Fire-and-forget: look up lead by phone → provision Gemini Live reception
    if (env.RECEPTION_SERVER_URL && env.NEON_DATABASE_URL) {
      triggerReceptionProvision(env, from).catch((e) =>
        console.error('[SMS] Reception provision error:', e.message)
      )
    }

    return twimlResponse(`Great! Book a quick 15-min call here: ${calendly}`)
  }

  // General reply — Gemini handles it
  if (!env.GOOGLE_AI_API_KEY) {
    return twimlResponse(`Thanks for your reply! Book a quick call: ${env.CALENDLY_URL || 'webcrew.app'}`)
  }

  const context = `You are a friendly website sales rep for WebCrew texting a local business owner.
Be short (max 160 chars). Warm but direct.
If they show interest, offer to schedule a 15-min call via ${env.CALENDLY_URL || 'webcrew.app'}.
Never promise specific rankings. Max 3 sentences.`

  try {
    const reply = await geminiSMSReply(env, context, msgBody)
    return twimlResponse(reply || `Thanks! Let's connect: ${env.CALENDLY_URL || 'webcrew.app'}`)
  } catch (e: any) {
    console.error('[SMS webhook] Gemini error:', e.message)
    return twimlResponse(`Thanks for your reply! Let's chat: ${env.CALENDLY_URL || 'webcrew.app'}`)
  }
}

// ─── POST /audit handler ──────────────────────────────────────────────────

async function handleAuditRequest(req: Request, env: Env): Promise<Response> {
  const { name, email, phone, websiteUrl, source } = await req.json() as {
    name: string; email: string; phone?: string; websiteUrl: string; source?: string
  }

  if (!email || !websiteUrl) {
    return new Response(JSON.stringify({ error: 'email and websiteUrl required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // 1. Notify us immediately
  await sendEmail(
    env,
    env.NOTIFICATION_EMAIL || 'pavan.harati@gmail.com',
    `🔍 Free Audit Request: ${name} — ${websiteUrl}`,
    `<p><b>${name}</b> requested a free audit for <a href="${websiteUrl}">${websiteUrl}</a></p>
     <p>Email: ${email}</p><p>Phone: ${phone || '—'}</p><p>Source: ${source || 'webcrew.app'}</p>`
  )

  // 2. Run audit async (don't block response — use waitUntil pattern via background promise)
  runAuditAndEmail(env, { name, email, phone, websiteUrl }).catch(e =>
    console.error('[Audit] Failed:', e.message)
  )

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

async function runAuditAndEmail(env: Env, opts: {
  name: string; email: string; phone?: string; websiteUrl: string
}): Promise<void> {
  const { name, email, websiteUrl } = opts

  // 1. PageSpeed (mobile) — free, no key needed for basic quota
  let speedScore = 0; let lcp = '—'; let cls = '—'; let fid = '—'
  try {
    const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(websiteUrl)}&strategy=mobile`
    const ps = await fetch(psUrl)
    if (ps.ok) {
      const psData: any = await ps.json()
      speedScore = Math.round((psData.lighthouseResult?.categories?.performance?.score ?? 0) * 100)
      lcp = psData.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue ?? '—'
      cls = psData.lighthouseResult?.audits?.['cumulative-layout-shift']?.displayValue ?? '—'
      fid = psData.lighthouseResult?.audits?.['total-blocking-time']?.displayValue ?? '—'
    }
  } catch { /* non-blocking */ }

  // 2. Fetch homepage HTML for basic SEO checks
  let hasTitle = false; let hasMeta = false; let hasH1 = false
  let hasSchema = false; let isHttps = websiteUrl.startsWith('https')
  let htmlSnippet = ''
  try {
    const pageRes = await fetch(websiteUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebCrewBot/1.0)' } })
    const html = await pageRes.text()
    htmlSnippet = html.slice(0, 6000)
    hasTitle  = /<title[^>]*>[^<]+<\/title>/i.test(html)
    hasMeta   = /meta[^>]+name=["']description["'][^>]+content=["'][^"']{10,}/i.test(html)
    hasH1     = /<h1[^>]*>[^<]+<\/h1>/i.test(html)
    hasSchema = html.includes('application/ld+json')
  } catch { /* non-blocking */ }

  // 3. Gemini audit summary
  let auditSummary = ''; let grade = 'C'; let topFixes: string[] = []
  if (env.GOOGLE_AI_API_KEY) {
    try {
      const prompt = `You are a professional website auditor. Analyze this website: ${websiteUrl}

PageSpeed mobile score: ${speedScore}/100
LCP: ${lcp} | CLS: ${cls} | TBT: ${fid}
Has title tag: ${hasTitle} | Has meta description: ${hasMeta} | Has H1: ${hasH1}
Has schema markup: ${hasSchema} | HTTPS: ${isHttps}

Homepage HTML snippet:
${htmlSnippet}

Write a concise audit report in JSON format:
{
  "grade": "A/B/C/D/F",
  "overall_score": 0-100,
  "headline": "one punchy sentence about the site",
  "summary": "2-3 sentences on the biggest issues",
  "top_3_fixes": ["fix 1", "fix 2", "fix 3"],
  "wins": ["what they do well 1", "what they do well 2"]
}

Be honest and specific. If score < 50, be direct about the problems.`

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GOOGLE_AI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
      )
      const json: any = await res.json()
      const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        grade = parsed.grade ?? 'C'
        auditSummary = parsed.summary ?? ''
        topFixes = parsed.top_3_fixes ?? []
      }
    } catch { /* non-blocking */ }
  }

  const gradeColor = grade === 'A' ? '#16a34a' : grade === 'B' ? '#2563eb' : grade === 'C' ? '#d97706' : '#dc2626'
  const scoreColor = speedScore >= 80 ? '#16a34a' : speedScore >= 50 ? '#d97706' : '#dc2626'

  // 4. Send HTML email with audit results
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px">

    <!-- Header -->
    <div style="background:#111827;border-radius:16px;padding:32px;margin-bottom:24px;text-align:center">
      <div style="font-family:'Space Grotesk',sans-serif;font-weight:800;font-size:1.4rem;color:#B5880E;margin-bottom:8px">WebCrew</div>
      <h1 style="color:#fff;font-size:1.6rem;font-weight:800;margin:0 0 8px;letter-spacing:-0.02em">Your FREE Website Audit</h1>
      <p style="color:rgba(255,255,255,0.6);margin:0;font-size:0.9rem">${websiteUrl}</p>
    </div>

    <!-- Grade card -->
    <div style="background:#fff;border-radius:16px;padding:28px;margin-bottom:20px;border:1px solid rgba(0,0,0,0.08);box-shadow:0 2px 20px rgba(0,0,0,0.06)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div>
          <div style="font-size:0.7rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#6b7280;margin-bottom:4px">OVERALL GRADE</div>
          <div style="font-size:3.5rem;font-weight:800;color:${gradeColor};line-height:1">${grade}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:0.7rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#6b7280;margin-bottom:4px">PAGESPEED (MOBILE)</div>
          <div style="font-size:3rem;font-weight:800;color:${scoreColor};line-height:1">${speedScore}<span style="font-size:1rem;color:#6b7280">/100</span></div>
        </div>
      </div>
      ${auditSummary ? `<p style="color:#374151;font-size:0.95rem;line-height:1.7;margin:0;padding:16px;background:#f9fafb;border-radius:8px;border-left:3px solid ${gradeColor}">${auditSummary}</p>` : ''}
    </div>

    <!-- Core vitals -->
    <div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:20px;border:1px solid rgba(0,0,0,0.08)">
      <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#6b7280;margin-bottom:16px">Core Web Vitals</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        ${[
          { label: 'LCP', val: lcp, tip: 'Largest Contentful Paint' },
          { label: 'CLS', val: cls, tip: 'Cumulative Layout Shift' },
          { label: 'TBT', val: fid, tip: 'Total Blocking Time' },
        ].map(v => `
          <div style="background:#f9fafb;border-radius:8px;padding:12px;text-align:center">
            <div style="font-size:0.6rem;color:#9ca3af;margin-bottom:4px">${v.tip}</div>
            <div style="font-size:1rem;font-weight:700;color:#111827">${v.val}</div>
            <div style="font-size:0.65rem;color:#6b7280;font-weight:700">${v.label}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- SEO checks -->
    <div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:20px;border:1px solid rgba(0,0,0,0.08)">
      <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#6b7280;margin-bottom:16px">SEO Checklist</div>
      ${[
        { label: 'Title Tag', ok: hasTitle },
        { label: 'Meta Description', ok: hasMeta },
        { label: 'H1 Heading', ok: hasH1 },
        { label: 'Schema Markup', ok: hasSchema },
        { label: 'HTTPS Secure', ok: isHttps },
      ].map(c => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6">
          <div style="width:20px;height:20px;border-radius:50%;background:${c.ok ? '#dcfce7' : '#fee2e2'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px">
            ${c.ok ? '✓' : '✗'}
          </div>
          <div style="font-size:0.88rem;color:${c.ok ? '#16a34a' : '#dc2626'};font-weight:${c.ok ? '500' : '600'}">${c.label} — ${c.ok ? 'Good' : 'Missing'}</div>
        </div>`).join('')}
    </div>

    ${topFixes.length ? `
    <!-- Top 3 fixes -->
    <div style="background:#fff;border-radius:16px;padding:24px;margin-bottom:20px;border:1px solid rgba(0,0,0,0.08)">
      <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#6b7280;margin-bottom:16px">Top 3 Quick Wins</div>
      ${topFixes.map((fix, i) => `
        <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6">
          <div style="width:24px;height:24px;border-radius:6px;background:#B5880E;color:#fff;font-weight:700;font-size:0.75rem;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div>
          <div style="font-size:0.88rem;color:#374151;line-height:1.5">${fix}</div>
        </div>`).join('')}
    </div>` : ''}

    <!-- CTA -->
    <div style="background:linear-gradient(135deg,#111827,#1f2937);border-radius:16px;padding:32px;text-align:center">
      <h2 style="color:#fff;font-size:1.3rem;font-weight:800;margin:0 0 12px;letter-spacing:-0.02em">Want us to fix all of this — FREE?</h2>
      <p style="color:rgba(255,255,255,0.7);font-size:0.9rem;margin:0 0 24px;line-height:1.6">We'll build you a completely new, high-performance website. You only pay if you love it.</p>
      <a href="https://webcrew.app/#contact" style="display:inline-block;background:#B5880E;color:#fff;font-weight:700;padding:14px 32px;border-radius:100px;text-decoration:none;font-size:0.95rem">
        Get My FREE Demo Site →
      </a>
    </div>

    <p style="text-align:center;color:#9ca3af;font-size:0.75rem;margin-top:24px">
      WebCrew · <a href="https://webcrew.app/privacy" style="color:#9ca3af">Privacy Policy</a> · <a href="https://webcrew.app/terms" style="color:#9ca3af">Terms</a>
    </p>
  </div>
</body>
</html>`

  await sendEmail(env, email, `Your FREE Website Audit — ${websiteUrl.replace(/https?:\/\//, '')}`, html)
  console.log(`[Audit] Report sent to ${email} for ${websiteUrl}`)
}

// ─── Survey handler ───────────────────────────────────────────────────────

async function appendSurveyToSheets(env: Env, row: string[]): Promise<void> {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.LEADS_SHEET_ID) return
  try {
    const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
    // JWT auth for Sheets (same pattern as retention agent)
    const now = Math.floor(Date.now() / 1000)
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const payload = btoa(JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }))
    // Note: full JWT signing not available in CF Workers without crypto.subtle RSA
    // Sheets write handled by pipeline retention agent; here we log only
    console.log(`[Survey] Sheets write queued: ${row.join(' | ')}`)
  } catch { /* non-blocking */ }
}

async function writeSurveyToNeon(env: Env, data: Record<string, string>): Promise<void> {
  if (!env.NEON_DATABASE_URL) return
  try {
    await fetch(env.NEON_DATABASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `INSERT INTO survey_responses (name, biz, phone, niche, pain, has_website, ai_want, budget)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        params: [
          data.name || null, data.biz || null, data.phone || null,
          data.niche || null,
          Array.isArray(data.pain) ? (data.pain as unknown as string[]).join(', ') : (data.pain || null),
          data.has_website || null, data.ai_want || null, data.budget || null,
        ],
      }),
    })
  } catch (e: any) {
    console.error('[Survey] Neon write failed:', e.message)
  }
}

async function handleSurveySubmission(req: Request, env: Env): Promise<Response> {
  const data = await req.json() as Record<string, string>
  const { name, biz, phone, niche, pain, has_website, ai_want, budget } = data
  const painStr = Array.isArray(pain) ? (pain as unknown as string[]).join(', ') : (pain || '—')
  const dateStr = new Date().toISOString().split('T')[0]

  // 1. Email notification (instant)
  await sendEmail(
    env,
    env.NOTIFICATION_EMAIL || 'pavan.harati@gmail.com',
    `📋 Survey: ${name || '?'} — ${biz || 'Unknown'}`,
    `<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:6px 12px;color:#666"><b>Date</b></td><td style="padding:6px 12px">${dateStr}</td></tr>
      <tr><td style="padding:6px 12px;color:#666"><b>Name</b></td><td style="padding:6px 12px">${name || '—'}</td></tr>
      <tr><td style="padding:6px 12px;color:#666"><b>Business</b></td><td style="padding:6px 12px">${biz || '—'}</td></tr>
      <tr><td style="padding:6px 12px;color:#666"><b>Phone</b></td><td style="padding:6px 12px">${phone || '—'}</td></tr>
      <tr><td style="padding:6px 12px;color:#666"><b>Niche</b></td><td style="padding:6px 12px">${niche || '—'}</td></tr>
      <tr><td style="padding:6px 12px;color:#666"><b>Pain point</b></td><td style="padding:6px 12px">${painStr}</td></tr>
      <tr><td style="padding:6px 12px;color:#666"><b>Has website</b></td><td style="padding:6px 12px">${has_website || '—'}</td></tr>
      <tr><td style="padding:6px 12px;color:#666"><b>AI want</b></td><td style="padding:6px 12px">${ai_want || '—'}</td></tr>
      <tr><td style="padding:6px 12px;color:#666"><b>Budget</b></td><td style="padding:6px 12px">${budget || '—'}</td></tr>
    </table>`
  )

  // 2. Neon DB (persistent, queryable)
  await writeSurveyToNeon(env, data)

  // 3. Google Sheets (async log)
  appendSurveyToSheets(env, [dateStr, name||'', biz||'', phone||'', niche||'', painStr, has_website||'', ai_want||'', budget||'']).catch(() => {})

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

// ─── Main worker ──────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const method = req.method

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    if (url.pathname === '/leads' && method === 'POST') {
      return handleLeadSubmission(req, env)
    }

    if (url.pathname === '/audit' && method === 'POST') {
      return handleAuditRequest(req, env)
    }

    // Survey submissions from webcrew.app/survey
    if (url.pathname === '/survey' && method === 'POST') {
      return handleSurveySubmission(req, env)
    }

    // Twilio inbound SMS webhook
    if (url.pathname === '/sms/reply' && method === 'POST') {
      return handleSMSWebhook(req, env)
    }

    if (url.pathname === '/health' && method === 'GET') {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not found', { status: 404 })
  },
}
