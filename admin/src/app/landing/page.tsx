"use client"

import { useEffect, useRef, useState } from "react"

const NICHES = [
  "HVAC", "Roofing", "Dentist", "Med Spa", "Law Firm",
  "Remodeling", "Cleaning", "Junk Removal", "Daycare",
  "Auto Detailing", "Restaurant", "Real Estate",
]

const STEPS = [
  {
    n: "01",
    title: "AI hunts the leads",
    body: "Scans Google Maps for local businesses with missing or broken websites. Scores each one for opportunity. Skips the rest.",
    color: "#6366f1",
  },
  {
    n: "02",
    title: "Site builds itself",
    body: "AI extracts brand colors, copy, and photos. Generates a full Next.js site, deploys it to Cloudflare in under 90 seconds.",
    color: "#22c55e",
  },
  {
    n: "03",
    title: "Outreach goes out",
    body: "Email + SMS fires automatically with the live demo link. Client sees their finished site. You collect the monthly fee.",
    color: "#f59e0b",
  },
]

const FEATURES = [
  { icon: "⚡", label: "90-second deploy", sub: "GitHub fork → Cloudflare Pages, fully automated" },
  { icon: "🤖", label: "AI content & images", sub: "Gemini writes copy, fal.ai generates hero images" },
  { icon: "📍", label: "12 niche templates", sub: "HVAC, dentist, medspa, law firm, roofing + more" },
  { icon: "📩", label: "Auto outreach", sub: "Email + SMS with live demo link, no manual work" },
  { icon: "💳", label: "Stripe payment links", sub: "Auto-generated when the lead responds" },
  { icon: "🪣", label: "$0 hosting per site", sub: "Cloudflare Pages free tier, unlimited sites" },
  { icon: "📊", label: "Client portal", sub: "Each client logs in to see their site analytics" },
  { icon: "🔁", label: "Retention engine", sub: "GBP posts, review replies, GSC weekly reports" },
]

function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        let start = 0
        const step = target / 60
        const tick = () => {
          start = Math.min(start + step, target)
          setVal(Math.round(start))
          if (start < target) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [target])

  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>
}

export default function LandingPage() {
  const [clients, setClients] = useState(50)
  const [price, setPrice] = useState(297)

  const mrr = clients * price
  const arr = mrr * 12
  const costPerSite = 0.25
  const profit = mrr - clients * costPerSite

  return (
    <div style={{ background: "#07070f", color: "#e2e8f0", fontFamily: "system-ui, -apple-system, sans-serif", overflowX: "hidden" }}>

      {/* NAV */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(7,7,15,0.85)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid #1a1a2e",
        padding: "14px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "linear-gradient(135deg, #6366f1, #22c55e)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800,
          }}>W</div>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.02em" }}>WebsiteDeveloper</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <a href="#how" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>How it works</a>
          <a href="#math" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>The math</a>
          <a href="#features" style={{ fontSize: 13, color: "#94a3b8", textDecoration: "none" }}>Features</a>
          <a href="/client/login" style={{
            background: "linear-gradient(135deg, #6366f1, #4f46e5)",
            color: "#fff", fontSize: 13, fontWeight: 700,
            padding: "8px 18px", borderRadius: 8,
            textDecoration: "none", letterSpacing: "-0.01em",
          }}>Get Access →</a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding: "96px 32px 80px", maxWidth: 900, margin: "0 auto", textAlign: "center", position: "relative" }}>
        {/* glow */}
        <div style={{
          position: "absolute", top: 40, left: "50%", transform: "translateX(-50%)",
          width: 600, height: 300, borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)",
          borderRadius: 999, padding: "5px 14px",
          fontSize: 11, fontWeight: 700, color: "#22c55e",
          letterSpacing: "0.1em", textTransform: "uppercase",
          marginBottom: 28,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse-dot 1.5s ease infinite" }} />
          AI-Powered Local Business Agency
        </div>

        <h1 style={{
          fontSize: "clamp(42px, 7vw, 72px)",
          fontWeight: 900,
          letterSpacing: "-0.04em",
          lineHeight: 1.05,
          marginBottom: 24,
        }}>
          Build. Deploy.{" "}
          <span style={{
            background: "linear-gradient(135deg, #22c55e, #4ade80)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Get Paid.</span>
        </h1>

        <p style={{ fontSize: 19, color: "#94a3b8", lineHeight: 1.65, maxWidth: 620, margin: "0 auto 40px", fontWeight: 400 }}>
          An AI pipeline that finds local businesses with bad websites,
          builds them something stunning in <strong style={{ color: "#e2e8f0" }}>90 seconds</strong>,
          and sends outreach automatically.
          You collect the monthly fee.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 56 }}>
          <a href="/client/login" style={{
            background: "linear-gradient(135deg, #6366f1, #4f46e5)",
            color: "#fff", fontSize: 15, fontWeight: 700,
            padding: "14px 28px", borderRadius: 10,
            textDecoration: "none", letterSpacing: "-0.01em",
            boxShadow: "0 0 40px rgba(99,102,241,0.35)",
          }}>
            Start Your Agency →
          </a>
          <a href="#how" style={{
            background: "#0d0d1b", color: "#e2e8f0",
            border: "1px solid #1a1a2e",
            fontSize: 15, fontWeight: 600,
            padding: "14px 28px", borderRadius: 10,
            textDecoration: "none",
          }}>
            See How It Works
          </a>
        </div>

        {/* hero stats */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 0,
          background: "#0d0d1b", border: "1px solid #1a1a2e",
          borderRadius: 14, overflow: "hidden", maxWidth: 520, margin: "0 auto",
        }}>
          {[
            { val: 12, suffix: "", label: "niche templates" },
            { val: 25, suffix: "¢", label: "cost per site" },
            { val: 90, suffix: "s", label: "to deploy" },
          ].map((s, i) => (
            <div key={i} style={{
              flex: 1, padding: "20px 16px", textAlign: "center",
              borderRight: i < 2 ? "1px solid #1a1a2e" : "none",
            }}>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.04em", color: "#e2e8f0" }}>
                <Counter target={s.val} suffix={s.suffix} />
              </div>
              <div style={{ fontSize: 11, color: "#4a5568", marginTop: 3, fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ padding: "80px 32px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>How it works</div>
          <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em" }}>Three steps. Zero manual work.</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{
              background: "#0d0d1b", border: "1px solid #1a1a2e",
              borderRadius: 14, padding: "28px 24px",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: -12, right: -8,
                fontSize: 72, fontWeight: 900, color: `${s.color}08`,
                lineHeight: 1, letterSpacing: "-0.06em", userSelect: "none",
              }}>{s.n}</div>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: `${s.color}15`, border: `1px solid ${s.color}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: s.color,
                marginBottom: 16, letterSpacing: "0.05em",
              }}>{s.n}</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em" }}>{s.title}</div>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* NICHES */}
      <section style={{ padding: "0 32px 80px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: "#4a5568", fontWeight: 600, marginBottom: 12 }}>WORKS FOR EVERY LOCAL NICHE</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 700, margin: "0 auto" }}>
          {NICHES.map((n) => (
            <span key={n} style={{
              background: "#0d0d1b", border: "1px solid #1a1a2e",
              borderRadius: 999, padding: "6px 14px",
              fontSize: 12, fontWeight: 600, color: "#94a3b8",
            }}>{n}</span>
          ))}
        </div>
      </section>

      {/* REVENUE MATH */}
      <section id="math" style={{ padding: "80px 32px", background: "#0a0a16", borderTop: "1px solid #1a1a2e", borderBottom: "1px solid #1a1a2e" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>The math</div>
            <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em" }}>
              What does{" "}
              <span style={{ background: "linear-gradient(135deg, #22c55e, #4ade80)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                your agency
              </span>{" "}
              actually earn?
            </h2>
            <p style={{ fontSize: 15, color: "#94a3b8", marginTop: 12 }}>Adjust the sliders. This is recurring, monthly revenue.</p>
          </div>

          {/* sliders */}
          <div style={{
            background: "#0d0d1b", border: "1px solid #1a1a2e",
            borderRadius: 16, padding: "32px 36px", marginBottom: 20,
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 32 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>Clients</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#e2e8f0", letterSpacing: "-0.03em" }}>{clients}</span>
                </div>
                <input type="range" min={1} max={200} value={clients}
                  onChange={(e) => setClients(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#6366f1" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: "#4a5568" }}>1</span>
                  <span style={{ fontSize: 10, color: "#4a5568" }}>200</span>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>Monthly fee per client</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#e2e8f0", letterSpacing: "-0.03em" }}>${price}</span>
                </div>
                <input type="range" min={97} max={997} step={10} value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#22c55e" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: "#4a5568" }}>$97</span>
                  <span style={{ fontSize: 10, color: "#4a5568" }}>$997</span>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div style={{
                background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 12, padding: "20px 16px", textAlign: "center",
              }}>
                <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Monthly Revenue</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#e2e8f0", letterSpacing: "-0.04em" }}>
                  ${mrr.toLocaleString()}
                </div>
              </div>
              <div style={{
                background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)",
                borderRadius: 12, padding: "20px 16px", textAlign: "center",
              }}>
                <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Annual Revenue</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#e2e8f0", letterSpacing: "-0.04em" }}>
                  ${arr.toLocaleString()}
                </div>
              </div>
              <div style={{
                background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)",
                borderRadius: 12, padding: "20px 16px", textAlign: "center",
              }}>
                <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>Net Profit</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#e2e8f0", letterSpacing: "-0.04em" }}>
                  ${Math.round(profit).toLocaleString()}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: "#4a5568" }}>
              AI infrastructure costs ≈ ${(clients * costPerSite).toFixed(2)}/mo total ({clients} sites × $0.25) — the rest is yours
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: "80px 32px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>What's included</div>
          <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em" }}>Everything to run a real agency</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {FEATURES.map((f) => (
            <div key={f.label} style={{
              background: "#0d0d1b", border: "1px solid #1a1a2e",
              borderRadius: 12, padding: "20px 18px",
            }}>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5, color: "#e2e8f0" }}>{f.label}</div>
              <div style={{ fontSize: 12, color: "#4a5568", lineHeight: 1.5 }}>{f.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PIPELINE FLOW */}
      <section style={{ padding: "0 32px 80px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{
          background: "#0d0d1b", border: "1px solid #1a1a2e",
          borderRadius: 16, padding: "28px 32px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4a5568", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20 }}>Pipeline stages</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {[
              { label: "Lead Hunt", color: "#6366f1" },
              { label: "Site Score", color: "#6366f1" },
              { label: "Brand Extract", color: "#6366f1" },
              { label: "Config Gen", color: "#f59e0b" },
              { label: "Image Gen", color: "#f59e0b" },
              { label: "Video Gen", color: "#f59e0b" },
              { label: "Deploy", color: "#10b981" },
              { label: "Outreach", color: "#10b981" },
              { label: "Stripe Link", color: "#22c55e" },
              { label: "💰 Paid", color: "#22c55e" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  background: `${s.color}15`, border: `1px solid ${s.color}35`,
                  color: s.color, borderRadius: 6, padding: "4px 10px",
                  fontSize: 11, fontWeight: 700,
                }}>{s.label}</span>
                {i < 9 && <span style={{ color: "#252540", fontSize: 14 }}>→</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{
        padding: "80px 32px",
        background: "linear-gradient(180deg, #07070f 0%, #0d0d1b 50%, #07070f 100%)",
        borderTop: "1px solid #1a1a2e",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Ready to start</div>
          <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 16, lineHeight: 1.1 }}>
            Your agency runs
            <br />
            <span style={{
              background: "linear-gradient(135deg, #6366f1, #22c55e)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>while you sleep.</span>
          </h2>
          <p style={{ fontSize: 15, color: "#94a3b8", lineHeight: 1.65, marginBottom: 36 }}>
            The AI finds the leads, builds the sites, sends the demos, and follows up.
            You just close the deal and cash the check.
          </p>
          <a href="/client/login" style={{
            display: "inline-block",
            background: "linear-gradient(135deg, #6366f1, #4f46e5)",
            color: "#fff", fontSize: 16, fontWeight: 800,
            padding: "16px 36px", borderRadius: 12,
            textDecoration: "none", letterSpacing: "-0.01em",
            boxShadow: "0 0 60px rgba(99,102,241,0.4)",
          }}>
            Get Access →
          </a>
          <div style={{ marginTop: 16, fontSize: 12, color: "#4a5568" }}>
            No credit card required to explore
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{
        padding: "24px 32px",
        borderTop: "1px solid #1a1a2e",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#4a5568" }}>WebsiteDeveloper</div>
        <div style={{ fontSize: 12, color: "#252540" }}>AI-powered local business agency platform</div>
      </footer>

    </div>
  )
}
