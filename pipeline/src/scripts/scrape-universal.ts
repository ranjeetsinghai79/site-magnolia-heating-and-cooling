/**
 * scrape-universal.ts
 *
 * Universal scraper for ALL 11 sheet tabs. Append-only — never clears.
 * Captures ALL businesses (website or not) with full details.
 *
 * Usage:
 *   SHEET_TAB="Local SMBs"  npx tsx src/scripts/scrape-universal.ts
 *   SHEET_TAB=MEDSPAS        npx tsx src/scripts/scrape-universal.ts
 *   SHEET_TAB=USA_Salons     npx tsx src/scripts/scrape-universal.ts
 *   (no SHEET_TAB)           → runs all 11 tabs sequentially
 *
 * Env:
 *   SHEET_TAB         target tab name (or unset for all)
 *   SCRAPE_TARGET     leads per run, default 100
 *   SCRAPE_HEADLESS   true (default)
 *
 * Tabs → niches → cities:
 *   Local SMBs                       hvac, roofing, plumbing, cleaning, landscaping,
 *                                    auto-detailing, remodeling          US cities
 *   MEDSPAS                          medspa-usa                          US affluent cities
 *   INDIA_MEDSPAS                    india-medspa                        India cities
 *   USA_DentalOffices                dental-office                       US cities
 *   INDIA_DentalOffices              india-dental                        India cities
 *   USA_Salons                       hair-salon, nail-salon              US cities
 *   USA_BarberShops                  barbershop                          US cities
 *   USA_FinancialAdvisorsandInsuranceAgents  financial-advisor, insurance-agent  US cities
 *   USA_RealEstateAgents             real-estate-agent                   US cities
 *   USA_Restaurants                  restaurant                          US cities
 *   India_Restaurants                india-restaurant                    India cities
 */

import 'dotenv/config'
import pg from 'pg'
import { runMapsScraper } from '../agents/maps-scraper.js'
import { appendSheetRow } from '../tools/google-sheets.js'
import type { Lead } from '../types.js'

const TARGET   = parseInt(process.env.SCRAPE_TARGET ?? '100')
const SHEET_ID = process.env.LEADS_SHEET_ID ?? ''
const HEADLESS = process.env.SCRAPE_HEADLESS !== 'false'
const TAB_ARG  = process.env.SHEET_TAB ?? ''
const MAX_RETRY = 3

// ─── Cross-run dedup via Neon DB ──────────────────────────────────────────────

const dbPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null

async function loadScrapedIds(tab: string): Promise<Set<string>> {
  if (!dbPool) return new Set()
  try {
    const r = await dbPool.query<{ place_id: string }>(
      'SELECT place_id FROM scraped_places WHERE tab = $1', [tab]
    )
    return new Set(r.rows.map(row => row.place_id))
  } catch { return new Set() }
}

async function markScraped(placeId: string, tab: string, name: string, city: string): Promise<void> {
  if (!dbPool) return
  try {
    await dbPool.query(
      `INSERT INTO scraped_places (place_id, tab, name, city)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (place_id, tab) DO NOTHING`,
      [placeId, tab, name, city]
    )
  } catch { /* non-fatal */ }
}

// ─── City lists ───────────────────────────────────────────────────────────────

const US_CITIES = [
  // California
  { city: 'Fresno',          state: 'CA' },
  { city: 'Bakersfield',     state: 'CA' },
  { city: 'Modesto',         state: 'CA' },
  { city: 'Stockton',        state: 'CA' },
  { city: 'Visalia',         state: 'CA' },
  { city: 'Turlock',         state: 'CA' },
  { city: 'Riverside',       state: 'CA' },
  { city: 'San Bernardino',  state: 'CA' },
  { city: 'Fontana',         state: 'CA' },
  { city: 'Victorville',     state: 'CA' },
  { city: 'Moreno Valley',   state: 'CA' },
  { city: 'Murrieta',        state: 'CA' },
  { city: 'Tracy',           state: 'CA' },
  { city: 'Antioch',         state: 'CA' },
  { city: 'Vallejo',         state: 'CA' },
  // Texas
  { city: 'Houston',         state: 'TX' },
  { city: 'San Antonio',     state: 'TX' },
  { city: 'Dallas',          state: 'TX' },
  { city: 'Fort Worth',      state: 'TX' },
  { city: 'El Paso',         state: 'TX' },
  { city: 'Arlington',       state: 'TX' },
  { city: 'Corpus Christi',  state: 'TX' },
  { city: 'Lubbock',         state: 'TX' },
  { city: 'Beaumont',        state: 'TX' },
  { city: 'Killeen',         state: 'TX' },
  { city: 'Waco',            state: 'TX' },
  { city: 'Midland',         state: 'TX' },
  { city: 'McAllen',         state: 'TX' },
  { city: 'Brownsville',     state: 'TX' },
  { city: 'McKinney',        state: 'TX' },
  // Florida
  { city: 'Jacksonville',    state: 'FL' },
  { city: 'Tampa',           state: 'FL' },
  { city: 'Orlando',         state: 'FL' },
  { city: 'Hialeah',         state: 'FL' },
  { city: 'Cape Coral',      state: 'FL' },
  { city: 'Fort Lauderdale', state: 'FL' },
  { city: 'Pembroke Pines',  state: 'FL' },
  { city: 'Clearwater',      state: 'FL' },
  { city: 'Lakeland',        state: 'FL' },
  { city: 'West Palm Beach', state: 'FL' },
  { city: 'Kissimmee',       state: 'FL' },
  { city: 'Daytona Beach',   state: 'FL' },
  { city: 'Ocala',           state: 'FL' },
  // Arizona
  { city: 'Phoenix',         state: 'AZ' },
  { city: 'Tucson',          state: 'AZ' },
  { city: 'Mesa',            state: 'AZ' },
  { city: 'Chandler',        state: 'AZ' },
  { city: 'Gilbert',         state: 'AZ' },
  { city: 'Tempe',           state: 'AZ' },
  { city: 'Peoria',          state: 'AZ' },
  { city: 'Surprise',        state: 'AZ' },
  { city: 'Yuma',            state: 'AZ' },
  // Nevada
  { city: 'Las Vegas',       state: 'NV' },
  { city: 'Henderson',       state: 'NV' },
  { city: 'Reno',            state: 'NV' },
  { city: 'North Las Vegas', state: 'NV' },
  // Colorado
  { city: 'Denver',          state: 'CO' },
  { city: 'Colorado Springs',state: 'CO' },
  { city: 'Aurora',          state: 'CO' },
  { city: 'Fort Collins',    state: 'CO' },
  { city: 'Pueblo',          state: 'CO' },
  // Georgia
  { city: 'Atlanta',         state: 'GA' },
  { city: 'Columbus',        state: 'GA' },
  { city: 'Augusta',         state: 'GA' },
  { city: 'Savannah',        state: 'GA' },
  { city: 'Macon',           state: 'GA' },
  // North Carolina
  { city: 'Charlotte',       state: 'NC' },
  { city: 'Raleigh',         state: 'NC' },
  { city: 'Greensboro',      state: 'NC' },
  { city: 'Durham',          state: 'NC' },
  { city: 'Fayetteville',    state: 'NC' },
  { city: 'Winston-Salem',   state: 'NC' },
  // Ohio
  { city: 'Columbus',        state: 'OH' },
  { city: 'Cleveland',       state: 'OH' },
  { city: 'Cincinnati',      state: 'OH' },
  { city: 'Toledo',          state: 'OH' },
  { city: 'Akron',           state: 'OH' },
  // Michigan
  { city: 'Detroit',         state: 'MI' },
  { city: 'Grand Rapids',    state: 'MI' },
  { city: 'Sterling Heights',state: 'MI' },
  { city: 'Lansing',         state: 'MI' },
  // Illinois
  { city: 'Chicago',         state: 'IL' },
  { city: 'Aurora',          state: 'IL' },
  { city: 'Joliet',          state: 'IL' },
  { city: 'Rockford',        state: 'IL' },
  // Pennsylvania
  { city: 'Philadelphia',    state: 'PA' },
  { city: 'Pittsburgh',      state: 'PA' },
  { city: 'Allentown',       state: 'PA' },
  // Tennessee
  { city: 'Nashville',       state: 'TN' },
  { city: 'Memphis',         state: 'TN' },
  { city: 'Knoxville',       state: 'TN' },
  { city: 'Chattanooga',     state: 'TN' },
  // Virginia
  { city: 'Virginia Beach',  state: 'VA' },
  { city: 'Norfolk',         state: 'VA' },
  { city: 'Richmond',        state: 'VA' },
  // More states
  { city: 'Albuquerque',     state: 'NM' },
  { city: 'Oklahoma City',   state: 'OK' },
  { city: 'Tulsa',           state: 'OK' },
  { city: 'Kansas City',     state: 'MO' },
  { city: 'St. Louis',       state: 'MO' },
  { city: 'Louisville',      state: 'KY' },
  { city: 'Lexington',       state: 'KY' },
  { city: 'Indianapolis',    state: 'IN' },
  { city: 'Fort Wayne',      state: 'IN' },
  { city: 'Milwaukee',       state: 'WI' },
  { city: 'Madison',         state: 'WI' },
  { city: 'Minneapolis',     state: 'MN' },
  { city: 'St. Paul',        state: 'MN' },
  { city: 'Omaha',           state: 'NE' },
  { city: 'Little Rock',     state: 'AR' },
  { city: 'Jackson',         state: 'MS' },
  { city: 'Birmingham',      state: 'AL' },
  { city: 'Montgomery',      state: 'AL' },
  { city: 'New Orleans',     state: 'LA' },
  { city: 'Baton Rouge',     state: 'LA' },
  { city: 'Columbia',        state: 'SC' },
  { city: 'Charleston',      state: 'SC' },
  { city: 'Baltimore',       state: 'MD' },
  { city: 'Providence',      state: 'RI' },
  { city: 'Hartford',        state: 'CT' },
  { city: 'Bridgeport',      state: 'CT' },
  { city: 'Buffalo',         state: 'NY' },
  { city: 'Rochester',       state: 'NY' },
  { city: 'Yonkers',         state: 'NY' },
  { city: 'Newark',          state: 'NJ' },
  { city: 'Jersey City',     state: 'NJ' },
  { city: 'Paterson',        state: 'NJ' },
  { city: 'Portland',        state: 'OR' },
  { city: 'Eugene',          state: 'OR' },
  { city: 'Seattle',         state: 'WA' },
  { city: 'Spokane',         state: 'WA' },
  { city: 'Tacoma',          state: 'WA' },
  { city: 'Salt Lake City',  state: 'UT' },
  { city: 'West Valley City',state: 'UT' },
  { city: 'Provo',           state: 'UT' },
  { city: 'Boise',           state: 'ID' },
  { city: 'Billings',        state: 'MT' },
  { city: 'Anchorage',       state: 'AK' },
  { city: 'Honolulu',        state: 'HI' },
]

const US_AFFLUENT_CITIES = [
  { city: 'Scottsdale',         state: 'AZ' },
  { city: 'Beverly Hills',      state: 'CA' },
  { city: 'Boca Raton',         state: 'FL' },
  { city: 'The Woodlands',      state: 'TX' },
  { city: 'Bellevue',           state: 'WA' },
  { city: 'Plano',              state: 'TX' },
  { city: 'Frisco',             state: 'TX' },
  { city: 'Naperville',         state: 'IL' },
  { city: 'Irvine',             state: 'CA' },
  { city: 'San Jose',           state: 'CA' },
  { city: 'San Francisco',      state: 'CA' },
  { city: 'San Diego',          state: 'CA' },
  { city: 'Los Angeles',        state: 'CA' },
  { city: 'Miami',              state: 'FL' },
  { city: 'Fort Lauderdale',    state: 'FL' },
  { city: 'Austin',             state: 'TX' },
  { city: 'Dallas',             state: 'TX' },
  { city: 'Houston',            state: 'TX' },
  { city: 'Chicago',            state: 'IL' },
  { city: 'New York',           state: 'NY' },
  { city: 'Atlanta',            state: 'GA' },
  { city: 'Charlotte',          state: 'NC' },
  { city: 'Raleigh',            state: 'NC' },
  { city: 'Phoenix',            state: 'AZ' },
  { city: 'Denver',             state: 'CO' },
  { city: 'Seattle',            state: 'WA' },
  { city: 'Portland',           state: 'OR' },
  { city: 'Las Vegas',          state: 'NV' },
  { city: 'Henderson',          state: 'NV' },
  { city: 'Nashville',          state: 'TN' },
  { city: 'Tampa',              state: 'FL' },
  { city: 'Orlando',            state: 'FL' },
  { city: 'Jacksonville',       state: 'FL' },
  { city: 'Virginia Beach',     state: 'VA' },
  { city: 'Richmond',           state: 'VA' },
  { city: 'Salt Lake City',     state: 'UT' },
  { city: 'Provo',              state: 'UT' },
  { city: 'Overland Park',      state: 'KS' },
  { city: 'Kansas City',        state: 'MO' },
  { city: 'St. Louis',          state: 'MO' },
  { city: 'Columbus',           state: 'OH' },
  { city: 'Cincinnati',         state: 'OH' },
  { city: 'Indianapolis',       state: 'IN' },
  { city: 'Pittsburgh',         state: 'PA' },
  { city: 'Philadelphia',       state: 'PA' },
  { city: 'Boston',             state: 'MA' },
  { city: 'Hartford',           state: 'CT' },
  { city: 'Providence',         state: 'RI' },
  { city: 'Minneapolis',        state: 'MN' },
  { city: 'Omaha',              state: 'NE' },
]

const INDIA_CITIES = [
  { city: 'Mumbai',       state: 'India' },
  { city: 'Delhi',        state: 'India' },
  { city: 'Bangalore',    state: 'India' },
  { city: 'Hyderabad',    state: 'India' },
  { city: 'Chennai',      state: 'India' },
  { city: 'Kolkata',      state: 'India' },
  { city: 'Pune',         state: 'India' },
  { city: 'Ahmedabad',    state: 'India' },
  { city: 'Jaipur',       state: 'India' },
  { city: 'Surat',        state: 'India' },
  { city: 'Lucknow',      state: 'India' },
  { city: 'Kanpur',       state: 'India' },
  { city: 'Nagpur',       state: 'India' },
  { city: 'Visakhapatnam',state: 'India' },
  { city: 'Bhopal',       state: 'India' },
  { city: 'Patna',        state: 'India' },
  { city: 'Ludhiana',     state: 'India' },
  { city: 'Agra',         state: 'India' },
  { city: 'Nashik',       state: 'India' },
  { city: 'Vadodara',     state: 'India' },
  { city: 'Meerut',       state: 'India' },
  { city: 'Rajkot',       state: 'India' },
  { city: 'Kalyan',       state: 'India' },
  { city: 'Vasai-Virar',  state: 'India' },
  { city: 'Varanasi',     state: 'India' },
  { city: 'Srinagar',     state: 'India' },
  { city: 'Aurangabad',   state: 'India' },
  { city: 'Dhanbad',      state: 'India' },
  { city: 'Amritsar',     state: 'India' },
  { city: 'Allahabad',    state: 'India' },
  { city: 'Ranchi',       state: 'India' },
  { city: 'Howrah',       state: 'India' },
  { city: 'Coimbatore',   state: 'India' },
  { city: 'Jabalpur',     state: 'India' },
  { city: 'Gwalior',      state: 'India' },
  { city: 'Vijayawada',   state: 'India' },
  { city: 'Jodhpur',      state: 'India' },
  { city: 'Madurai',      state: 'India' },
  { city: 'Raipur',       state: 'India' },
  { city: 'Kota',         state: 'India' },
  { city: 'Guwahati',     state: 'India' },
  { city: 'Chandigarh',   state: 'India' },
  { city: 'Solapur',      state: 'India' },
  { city: 'Hugli-Chinsurah', state: 'India' },
  { city: 'Thiruvananthapuram', state: 'India' },
  { city: 'Kochi',        state: 'India' },
  { city: 'Indore',       state: 'India' },
  { city: 'Bhubaneswar',  state: 'India' },
  { city: 'Guntur',       state: 'India' },
  { city: 'Noida',        state: 'India' },
  { city: 'Gurgaon',      state: 'India' },
  { city: 'Faridabad',    state: 'India' },
  { city: 'Ghaziabad',    state: 'India' },
]

// ─── Tab configuration ────────────────────────────────────────────────────────

interface TabConfig {
  tab:          string
  niches:       string[]
  cities:       { city: string; state: string }[]
  noWebsiteOnly: boolean
  tier:         'tier1' | 'tier2' | 'mixed'
}

const TAB_CONFIGS: TabConfig[] = [
  {
    tab:          'Local SMBs',
    niches:       ['hvac', 'roofing', 'plumbing', 'cleaning', 'landscaping', 'auto-detailing', 'remodeling'],
    cities:       US_CITIES,
    noWebsiteOnly: false,
    tier:         'mixed',
  },
  {
    tab:          'MEDSPAS',
    niches:       ['medspa-usa'],
    cities:       US_AFFLUENT_CITIES,
    noWebsiteOnly: false,
    tier:         'tier2',
  },
  {
    tab:          'INDIA_MEDSPAS',
    niches:       ['india-medspa'],
    cities:       INDIA_CITIES,
    noWebsiteOnly: false,
    tier:         'mixed',
  },
  {
    tab:          'USA_DentalOffices',
    niches:       ['dental-office'],
    cities:       US_CITIES,
    noWebsiteOnly: false,
    tier:         'tier2',
  },
  {
    tab:          'INDIA_DentalOffices',
    niches:       ['india-dental'],
    cities:       INDIA_CITIES,
    noWebsiteOnly: false,
    tier:         'mixed',
  },
  {
    tab:          'USA_Salons',
    niches:       ['hair-salon', 'nail-salon'],
    cities:       US_CITIES,
    noWebsiteOnly: false,
    tier:         'mixed',
  },
  {
    tab:          'USA_BarberShops',
    niches:       ['barbershop'],
    cities:       US_CITIES,
    noWebsiteOnly: false,
    tier:         'mixed',
  },
  {
    tab:          'USA_FinancialAdvisorsandInsuranceAgents',
    niches:       ['financial-advisor', 'insurance-agent'],
    cities:       US_CITIES,
    noWebsiteOnly: false,
    tier:         'tier2',
  },
  {
    tab:          'USA_RealEstateAgents',
    niches:       ['real-estate-agent'],
    cities:       US_AFFLUENT_CITIES,
    noWebsiteOnly: false,
    tier:         'tier2',
  },
  {
    tab:          'USA_Restaurants',
    niches:       ['restaurant'],
    cities:       US_CITIES,
    noWebsiteOnly: false,
    tier:         'mixed',
  },
  {
    tab:          'India_Restaurants',
    niches:       ['india-restaurant'],
    cities:       INDIA_CITIES,
    noWebsiteOnly: false,
    tier:         'mixed',
  },
  {
    tab:          'USA_LawFirms',
    niches:       ['lawfirm'],
    cities:       US_CITIES,
    noWebsiteOnly: false,
    tier:         'tier2',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stateTimezone(state: string): string {
  const PT = ['CA','OR','WA','NV','ID']
  const MT = ['MT','WY','CO','UT','NM','AZ']
  const CT = ['TX','OK','KS','NE','SD','ND','MN','IA','MO','AR','LA','WI','IL','MS','AL']
  if (PT.includes(state)) return 'Pacific'
  if (MT.includes(state)) return 'Mountain'
  if (CT.includes(state)) return 'Central'
  if (state === 'India') return 'IST'
  return 'Eastern'
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const copy = [...arr]
  let s = seed
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function daySeed(): number {
  const d = new Date().toISOString().split('T')[0]
  let h = 0
  for (let i = 0; i < d.length; i++) h = ((h << 5) - h) + d.charCodeAt(i)
  return h >>> 0
}

// Full header — all 18 columns
const HEADER = [
  'Date Added', 'Business Name', 'Niche / Category', 'City', 'State / Country',
  'Timezone', 'Phone', 'Email', 'Has Website', 'Website URL', 'Address',
  'Rating', 'Reviews', 'GBP Claimed', 'Open Now', 'Price Level',
  'Tier', 'Maps URL',
]

function leadToRow(lead: Lead, date: string): string[] {
  const tz = stateTimezone((lead.state ?? '').toUpperCase())
  return [
    date,
    lead.name,
    lead.niche,
    lead.city,
    lead.state,
    tz,
    lead.phone ?? '',
    lead.email ?? '',
    lead.website ? 'YES' : 'NO',
    lead.website ?? '',
    lead.address ?? '',
    lead.rating?.toString() ?? '',
    lead.review_count?.toString() ?? '',
    lead.gbp_claimed === true ? 'claimed' : lead.gbp_claimed === false ? 'unclaimed' : '',
    (lead.open_now ?? lead.is_open) === true ? 'open' : (lead.open_now ?? lead.is_open) === false ? 'closed' : '',
    lead.price_level ?? '',
    lead.tier ?? '',
    lead.google_maps_uri ?? '',
  ]
}

// ─── Scrape one tab ───────────────────────────────────────────────────────────

async function scrapeTab(cfg: TabConfig, target: number): Promise<number> {
  const date    = new Date().toISOString().split('T')[0]
  const seed    = daySeed()
  const combos  = shuffle(
    cfg.niches.flatMap(niche =>
      cfg.cities.map(loc => ({ niche, city: loc.city, state: loc.state }))
    ),
    seed + cfg.tab.length
  )

  // Load already-scraped place_ids from DB for this tab (cross-run dedup)
  const seen = await loadScrapedIds(cfg.tab)
  const dbCount = seen.size
  let saved = 0
  let comboIdx = 0

  console.log(`\n  Niches : ${cfg.niches.join(', ')}`)
  console.log(`  Cities : ${cfg.cities.length}  |  Combos: ${combos.length}`)
  console.log(`  Already scraped: ${dbCount} place_ids in DB (will skip)`)

  while (saved < target && comboIdx < combos.length) {
    const combo  = combos[comboIdx++]
    const needed = target - saved
    const perCombo = Math.max(8, Math.ceil(needed / Math.max(1, combos.length - comboIdx + 1)))
    const tierLabel = cfg.tier === 'tier2' ? '[T2]' : cfg.tier === 'tier1' ? '[T1]' : '[MX]'

    console.log(`\n  [${comboIdx}] ${tierLabel} ${combo.niche.toUpperCase()} — ${combo.city}, ${combo.state} (need ${needed})`)

    let leads: Lead[] = []
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      try {
        leads = await runMapsScraper({
          niche:         combo.niche,
          city:          combo.city,
          state:         combo.state,
          maxResults:    perCombo * 4,
          noWebsiteOnly: cfg.noWebsiteOnly,
          headless:      HEADLESS,
        })
        break
      } catch (e: any) {
        console.error(`    ✗ attempt ${attempt}/${MAX_RETRY}: ${e.message}`)
        if (attempt < MAX_RETRY) await new Promise(r => setTimeout(r, 5000 * attempt))
      }
    }

    if (!leads.length) { console.log('    → 0 leads'); continue }

    let fromCombo = 0
    for (const lead of leads.slice(0, perCombo)) {
      if (seen.has(lead.place_id)) continue
      seen.add(lead.place_id)
      lead.tier = lead.website
        ? 'tier2'
        : cfg.tier === 'mixed' ? 'tier1' : cfg.tier

      try {
        await appendSheetRow({
          spreadsheetId: SHEET_ID,
          sheetName:     cfg.tab,
          values:        leadToRow(lead, date),
        })
        // Persist to DB so next run skips this business
        await markScraped(lead.place_id, cfg.tab, lead.name, combo.city)
        saved++
        fromCombo++
        const websiteFlag = lead.website ? '🌐' : '📵'
        console.log(`    ✓ [${saved}/${target}] ${websiteFlag} ${lead.name} | ${lead.phone ?? '—'} | ${combo.city}`)
      } catch (e: any) {
        console.error(`    [Sheet] write failed: ${e.message}`)
      }

      if (saved >= target) break
    }

    console.log(`    → ${fromCombo} saved from ${combo.city}`)
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000))
  }

  return saved
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!SHEET_ID) { console.error('LEADS_SHEET_ID not set'); process.exit(1) }

  const date = new Date().toISOString().split('T')[0]
  const tabs  = TAB_ARG
    ? TAB_CONFIGS.filter(c => c.tab === TAB_ARG)
    : TAB_CONFIGS

  if (!tabs.length) {
    console.error(`Unknown SHEET_TAB="${TAB_ARG}". Valid tabs:\n  ${TAB_CONFIGS.map(c => c.tab).join('\n  ')}`)
    process.exit(1)
  }

  console.log(`\n${'═'.repeat(64)}`)
  console.log(`🗺  Scrape-Universal — ${date}`)
  console.log(`   Target  : ${TARGET} leads per tab`)
  console.log(`   Tabs    : ${tabs.map(c => c.tab).join(', ')}`)
  console.log(`   Mode    : APPEND ONLY — never deletes rows`)
  console.log(`${'═'.repeat(64)}`)

  const results: { tab: string; saved: number }[] = []

  for (const cfg of tabs) {
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`📋  Tab: ${cfg.tab}`)
    const saved = await scrapeTab(cfg, TARGET)
    results.push({ tab: cfg.tab, saved })
    console.log(`  ✅ ${cfg.tab}: ${saved}/${TARGET} saved`)
  }

  console.log(`\n${'═'.repeat(64)}`)
  console.log('SUMMARY')
  let total = 0
  for (const r of results) {
    const bar = '█'.repeat(Math.floor(r.saved / 5)) + (r.saved < TARGET ? '░' : '')
    console.log(`  ${r.tab.padEnd(44)} ${String(r.saved).padStart(4)}/${TARGET}  ${bar}`)
    total += r.saved
  }
  console.log(`\n  TOTAL: ${total} leads appended`)
  console.log(`${'═'.repeat(64)}\n`)

  const anyFailed = results.some(r => r.saved < TARGET * 0.5)
  if (anyFailed) process.exit(1)
}

main()
  .catch(e => { console.error('\n💥 Fatal:', e.message); process.exit(1) })
  .finally(() => { dbPool?.end().catch(() => {}) })
