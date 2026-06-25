/**
 * run-growth-plan.ts
 *
 * Creates an AI Growth OS plan from an existing audit.
 *
 * Usage:
 *   AUDIT_ID=<uuid> npx tsx src/scripts/run-growth-plan.ts
 *   AUDIT_ID=<uuid> GROWTH_PLAN_DRY_RUN=true npx tsx src/scripts/run-growth-plan.ts
 */

import 'dotenv/config'
import { createGrowthPlan, createGrowthWorkspace } from '../growth/brain.js'
import { loadAuditReport, saveGrowthPlanBundle } from '../growth/db.js'

const auditId = process.env.AUDIT_ID
const dryRun = process.env.GROWTH_PLAN_DRY_RUN === 'true'

if (!auditId) {
  console.error('[run-growth-plan] AUDIT_ID env var required')
  process.exit(1)
}

const audit = await loadAuditReport(auditId)
if (!audit) {
  console.error(`[run-growth-plan] Audit not found: ${auditId}`)
  process.exit(1)
}

const workspace = createGrowthWorkspace({ audit })
const plan = createGrowthPlan({ workspace, audit })

console.log(`[run-growth-plan] ${plan.businessName}`)
console.log(`  Website: ${plan.websiteUrl}`)
console.log(`  Priority: ${plan.priority}`)
console.log(`  Summary: ${plan.summary}`)
console.log('\n  Tracks:')
for (const track of plan.tracks) {
  console.log(`  - [${track.priority}] ${track.title} (${track.agentType})`)
}

if (dryRun) {
  console.log('\nDry run only. Plan JSON:')
  console.log(JSON.stringify(plan, null, 2))
  process.exit(0)
}

const saved = await saveGrowthPlanBundle(workspace, plan, audit.id, audit.lead_id)
console.log('\nSaved Growth OS plan:')
console.log(`  Workspace: ${saved.workspaceId}`)
console.log(`  Plan:      ${saved.planId}`)
console.log(`  Tasks:     ${saved.taskIds.length}`)
