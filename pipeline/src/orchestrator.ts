import { runLeadHunterAgent } from './agents/lead-hunter.js'
import { runBrandAnalystAgent } from './agents/brand-analyst.js'
import { runNicheBrain } from './agents/niche-brain.js'
import { runConfigGeneratorAgent } from './agents/config-generator.js'
import { runImageGeneratorAgent } from './agents/image-generator.js'
import { runHeroVideoAgent, uploadImageToFal } from './agents/hero-video-generator.js'
import { runBuilderAgent } from './agents/builder.js'
import { runDeployerAgent } from './agents/deployer.js'
import { runSeoAgent } from './agents/seo-agent.js'
import { runOutreachAgent } from './agents/outreach.js'
import { runSMSOutreachAgent, buildWarmTeaseSMS, sendSMS } from './agents/sms-outreach.js'
import { runSiteScorerAgent } from './agents/site-scorer.js'
import { runStripeAgent } from './agents/stripe-agent.js'
import { runDailyReport } from './agents/report-agent.js'
import { saveLead, updateLead } from './db/supabase.js'
import type { PipelineConfig, Lead } from './types.js'

export async function runPipeline(config: PipelineConfig) {
  console.log(`\n=== AI Pipeline Starting ===`)
  console.log(`Niche: ${config.niche} | Location: ${config.location}`)
  console.log(`Target: ${config.count} leads | Dry run: ${config.dryRun ?? false}\n`)

  // Step 1: Find leads
  const leadResult = await runLeadHunterAgent(config)
  if (!leadResult.success || !leadResult.data?.length) {
    console.error('Lead hunting failed:', leadResult.error)
    return
  }

  const leads = leadResult.data
  console.log(`Found ${leads.length} leads\n`)

  const summary = { processed: 0, skipped: 0, deployed: 0, outreached: 0, errors: 0 }

  for (const rawLead of leads) {
    console.log(`\n→ ${rawLead.name} | ${rawLead.website}`)
    let lead: Lead = rawLead
    summary.processed++

    try {
      // Persist to DB (ON CONFLICT preserves status if already built+)
      const saved = await saveLead(lead)
      if (saved?.id) lead = { ...lead, id: saved.id, status: saved.status }

      // Skip leads already through the expensive build/deploy steps
      const DONE = new Set(['built','deployed','outreach_sent','sms_sent',
        'conversation_active','meeting_scheduled','payment_link_sent','paid','handed_off'])
      if (DONE.has(lead.status)) {
        console.log(`  [skip] Already ${lead.status} — ${lead.vercel_url ?? lead.cloudflare_url ?? ''}`)
        summary.skipped++
        continue
      }

      // Step 2: Score existing website (tier2 leads only)
      // Track A: tier1 (no website) → build from scratch
      // Track B: tier1 + site_broken → build fresh, "site was down" SMS
      // Track C: tier2 (poor quality) → warm tease SMS, build only on YES
      if (lead.tier === 'tier2' && lead.website) {
        const scoreResult = await runSiteScorerAgent(lead)
        if (scoreResult.success && scoreResult.data) {
          lead = scoreResult.data
          await updateLead(lead)
          // Broken site → promote to tier1 so it goes through full build pipeline
          if (lead.site_broken) {
            console.log(`  Site broken → promoting to tier1 build pipeline`)
            lead = { ...lead, tier: 'tier1' }
          }
        }
      }

      // Step 3: Analyze brand
      const analyzeResult = await runBrandAnalystAgent(lead)
      if (!analyzeResult.success) {
        console.log(`  [!] Brand analysis failed: ${analyzeResult.error}`)
        summary.errors++
        continue
      }
      lead = analyzeResult.data!
      // Enrich email from scraped brand data if Places API didn't return one
      if (!lead.email && lead.brand_data?.email) {
        lead = { ...lead, email: lead.brand_data.email }
      }
      // Enrich phone from brand data if Places API missed it
      if (!lead.phone && lead.brand_data?.phone) {
        lead = { ...lead, phone: lead.brand_data.phone }
      }
      await updateLead(lead)
      const contactInfo = [lead.email && `email:${lead.email}`, lead.phone && `phone:${lead.phone}`].filter(Boolean).join(' | ')
      console.log(`  Brand analyzed: ${lead.brand_data?.name} | ${contactInfo || 'NO CONTACT — manual outreach'}`)

      // Tier 2: full luxury rebuild using BusinessBrain from Firecrawl
      // Outreach agent will show before (old site) vs after (new WebCrew URL) + AI Reception pitch
      if (lead.tier === 'tier2') {
        console.log(`  [Tier2] Full luxury rebuild → ${lead.website}`)
        // fall through — no continue
      }

      // Step 3b: Niche Brain — unique visual identity + cinematic prompts per business
      const nicheProfile = await runNicheBrain(lead)
      lead = { ...lead, niche_profile: nicheProfile }
      await updateLead(lead)

      // Step 4: Generate config
      const configResult = await runConfigGeneratorAgent(lead)
      if (!configResult.success) {
        console.log(`  [!] Config generation failed: ${configResult.error}`)
        summary.errors++
        continue
      }
      lead = configResult.data!
      await updateLead(lead)
      console.log(`  Config generated (${lead.config_ts?.length} chars)`)

      if (config.dryRun) {
        console.log(`  [DRY RUN] Skipping build/deploy/outreach`)
        console.log(`  Config preview:\n${lead.config_ts?.slice(0, 300)}...\n`)
        continue
      }

      // Step 5a: Generate 4 hero images (brain-powered unique prompts, all in parallel)
      const imgResult = await runImageGeneratorAgent(lead, lead.niche_profile)
      const heroImages = imgResult.success ? imgResult.data?.images ?? null : null
      if (!imgResult.success) console.log(`  [!] Image gen: ${imgResult.error} — using gradient fallback`)

      // Step 5b: Generate hero background video (brain-powered prompt, non-blocking)
      let heroVideoBuffer: Buffer | null = null
      if (heroImages?.['hero-1'] && process.env.FAL_KEY) {
        const imgUrl = await uploadImageToFal(heroImages['hero-1'])
        if (imgUrl) {
          const vidResult = await runHeroVideoAgent(lead, imgUrl, lead.niche_profile)
          if (vidResult.success && vidResult.data) {
            heroVideoBuffer = vidResult.data.buffer
            lead = { ...lead, hero_video_url: vidResult.data.url }
            console.log(`  Hero video generated ✓`)
          } else {
            console.log(`  [!] Video gen: ${vidResult.error} — hero will use static image`)
          }
        }
      }

      // Step 5c: Build (GitHub fork + update config + upload images + video)
      const buildResult = await runBuilderAgent(lead, config, heroImages, heroVideoBuffer)
      if (!buildResult.success) {
        console.log(`  [!] Build failed: ${buildResult.error}`)
        summary.errors++
        continue
      }
      lead = buildResult.data!
      await updateLead(lead)
      console.log(`  Repo: ${lead.github_repo}`)

      // Step 6: Deploy
      const deployResult = await runDeployerAgent(lead)
      if (!deployResult.success) {
        console.log(`  [!] Deploy failed: ${deployResult.error}`)
        summary.errors++
        continue
      }
      lead = deployResult.data!
      await updateLead(lead)
      console.log(`  LIVE: ${lead.cloudflare_url ?? lead.vercel_url}`)
      summary.deployed++

      // Step 7: SEO package (sitemap, robots.txt, schema — push to GitHub)
      const seoResult = await runSeoAgent(lead)
      if (seoResult.success) {
        console.log(`  SEO: ${seoResult.data?.keywords?.slice(0, 3).join(', ')}...`)
      } else {
        console.log(`  [!] SEO skipped: ${seoResult.error}`)
      }

      // Step 8: Outreach — use whatever contact info available
      const hasEmail = !!lead.email
      const hasPhone = !!lead.phone

      if (!hasEmail && !hasPhone) {
        // No contact info — site is live, add to manual outreach list
        console.log(`  [!] No contact info — site live at ${lead.vercel_url} — MANUAL OUTREACH NEEDED`)
        console.log(`      Search: ${lead.name} on Google Maps, Facebook, Instagram for contact`)
        await updateLead({ ...lead, status: 'outreach_sent' }) // mark done so it doesn't loop
      } else {
        if (hasEmail) {
          const outreachResult = await runOutreachAgent(lead)
          if (outreachResult.success) {
            lead = outreachResult.data!
            await updateLead(lead)
            console.log(`  Email sent to ${lead.email}`)
            summary.outreached++
          } else {
            console.log(`  [!] Email outreach failed: ${outreachResult.error}`)
          }
        }

        // SMS — tier-aware outreach (primary close channel)
        if (hasPhone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_FROM_NUMBER) {
          const smsResult = await runSMSOutreachAgent(lead)
          if (smsResult.success) {
            lead = smsResult.data!
            await updateLead(lead)
            const tierLabel = lead.tier === 'tier1' ? '[$299 pitch]' : '[$599 upgrade]'
            console.log(`  SMS sent to ${lead.phone} ${tierLabel}`)
          } else {
            console.log(`  [!] SMS: ${smsResult.error}`)
          }
        } else if (hasPhone && !process.env.TWILIO_ACCOUNT_SID) {
          console.log(`  Phone: ${lead.phone} — add TWILIO_* to .env to enable SMS`)
        }
      }

      // Step 10: Pre-generate Stripe payment link (ready when lead responds)
      if (process.env.STRIPE_SECRET_KEY) {
        const stripeResult = await runStripeAgent(lead, 'create_link')
        if (stripeResult.success && stripeResult.data) {
          lead = { ...lead, stripe_payment_url: stripeResult.data.paymentUrl }
          await updateLead(lead)
          console.log(`  Stripe payment link ready`)
        }
      }

    } catch (e: any) {
      console.error(`  [ERROR] ${lead.name}:`, e.message)
      console.error(`  [STACK]`, e.stack?.split('\n').slice(0, 4).join('\n  '))
      await updateLead({ ...lead, status: 'error' })
      summary.errors++
    }
  }

  console.log('\n=== Pipeline Complete ===')
  console.log(`Processed: ${summary.processed}`)
  console.log(`Skipped (good sites): ${summary.skipped}`)
  console.log(`Deployed: ${summary.deployed}`)
  console.log(`Emails sent: ${summary.outreached}`)
  console.log(`Errors: ${summary.errors}`)

  // Daily report — append today's results to Google Sheet
  await runDailyReport()
}

// ─── Track C: warm tease for tier2 (poor but loading website) ────────────────

async function sendWarmTeaseOutreach(lead: Lead, config: PipelineConfig) {
  if (!lead.phone) {
    console.log(`  [TrackC] No phone for ${lead.name} — skip`)
    await updateLead({ ...lead, status: 'outreach_sent' })
    return
  }

  if (config.dryRun) {
    console.log(`  [TrackC DRY RUN] Would send warm tease to ${lead.name} (${lead.phone})`)
    return
  }

  const msg = buildWarmTeaseSMS(lead)

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_FROM_NUMBER) {
    try {
      await sendSMS(lead.phone, msg)
      console.log(`  [TrackC] Warm tease SMS → ${lead.phone}`)
    } catch (e: any) {
      console.log(`  [TrackC] SMS error: ${e.message}`)
    }
  } else {
    console.log(`  [TrackC] Would send warm tease to ${lead.phone} — add TWILIO_* to enable`)
    console.log(`  Message: ${msg.slice(0, 100)}...`)
  }

  await updateLead({ ...lead, status: 'outreach_sent', sms_sent: true, sms_sent_at: new Date().toISOString() })
}

