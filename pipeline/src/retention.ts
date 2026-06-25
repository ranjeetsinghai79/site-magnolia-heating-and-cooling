import 'dotenv/config'
import { getLeadsByStatus } from './db/supabase.js'
import { runGbpAgent }        from './agents/gbp-agent.js'
import { runReviewsAgent }    from './agents/reviews-agent.js'
import { runAnalyticsAgent }  from './agents/analytics-agent.js'
import { runCompetitorAgent } from './agents/competitor-agent.js'
import type { Lead } from './types.js'

async function getAllActiveClients(): Promise<Lead[]> {
  const statuses = ['deployed','outreach_sent','sms_sent','conversation_active',
                    'meeting_scheduled','payment_link_sent','paid','handed_off']
  const arrays = await Promise.all(statuses.map(s => getLeadsByStatus(s)))
  return arrays.flat()
}

function isGrowOrScale(c: Lead): boolean {
  const plan = (c as any).client_plan ?? 'launch'
  return plan === 'grow' || plan === 'scale'
}

async function runRetention() {
  console.log('\n=== Client Care Run ===')
  console.log(new Date().toISOString())

  const clients = await getAllActiveClients()
  console.log(`${clients.length} active clients\n`)
  if (!clients.length) { console.log('No active clients yet.'); return }

  const summary = { gbp: 0, reviews: 0, analytics: 0, competitor: 0, errors: 0 }

  for (const client of clients) {
    const plan = (client as any).client_plan ?? 'launch'
    console.log(`\n→ ${client.name} [${plan}]`)

    // ALL PLANS: Google review auto-replies
    if (process.env.GBP_ACCOUNT_ID && process.env.GBP_LOCATION_ID) {
      const reviews = await runReviewsAgent(client)
      if (reviews.success) {
        console.log(`  Reviews: ${reviews.data?.replied} replied, ${reviews.data?.skipped} skipped`)
        summary.reviews += reviews.data?.replied ?? 0
      } else console.log(`  [!] Reviews: ${reviews.error}`)
    }

    // ALL PLANS: Monthly analytics + SEO report
    if (client.email) {
      const analytics = await runAnalyticsAgent(client)
      if (analytics.success) { console.log('  Analytics sent'); summary.analytics++ }
      else console.log(`  [!] Analytics: ${analytics.error}`)
    }

    // GROW + SCALE: Monthly GBP post
    if (isGrowOrScale(client) && process.env.GBP_ACCOUNT_ID && process.env.GBP_LOCATION_ID) {
      const gbp = await runGbpAgent(client)
      if (gbp.success) { console.log('  GBP post created'); summary.gbp++ }
      else console.log(`  [!] GBP: ${gbp.error}`)
    }

    // GROW + SCALE: Monthly competitor tracking report
    if (isGrowOrScale(client) && client.email) {
      const comp = await runCompetitorAgent(client)
      if (comp.success) {
        console.log(`  Competitor: ${comp.data?.competitors} found, email ${comp.data?.emailSent ? 'sent' : 'skipped'}`)
        summary.competitor++
      } else console.log(`  [!] Competitor: ${comp.error}`)
    }
  }

  console.log('\n=== Client Care Complete ===')
  console.log(`Review replies:     ${summary.reviews}`)
  console.log(`Analytics reports:  ${summary.analytics}`)
  console.log(`GBP posts (Grow+):  ${summary.gbp}`)
  console.log(`Competitor (Grow+): ${summary.competitor}`)
}

runRetention().catch(console.error)
