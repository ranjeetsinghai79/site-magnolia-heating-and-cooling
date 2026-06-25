"use client"

import { useRef, useState, useEffect } from "react"
import { gsap } from "@core/web"
import type { SiteConfig } from "@core/web/types"

interface Props { config: SiteConfig }

const DISPATCH_STATS = [
  { label: "Technicians On Call", value: "12" },
  { label: "Avg Response Time",   value: "45m" },
  { label: "Jobs Today",          value: "7"  },
  { label: "Availability",        value: "24/7" },
]

export default function HvacContact({ config }: Props) {
  const { business } = config
  const sectionRef   = useRef<HTMLElement>(null)
  const leftRef      = useRef<HTMLDivElement>(null)
  const rightRef     = useRef<HTMLDivElement>(null)
  const [status, setStatus]   = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [formData, setFormData] = useState({
    name: "", phone: "", email: "", service: "", message: "",
  })

  const services = config.formServiceOptions ?? []

  useEffect(() => {
    if (!leftRef.current || !rightRef.current) return
    gsap.from(leftRef.current, {
      opacity: 0, x: -40, duration: 0.8, ease: "power3.out",
      scrollTrigger: { trigger: sectionRef.current, start: "top 75%", once: true },
    })
    gsap.from(rightRef.current, {
      opacity: 0, x: 40, duration: 0.8, ease: "power3.out",
      scrollTrigger: { trigger: sectionRef.current, start: "top 75%", once: true },
    })
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(p => ({ ...p, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("sending")
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_PIPELINE_API_URL ?? ""}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, source: "contact_form", niche: "hvac", city: business.city }),
      })
      setStatus(res.ok ? "sent" : "error")
    } catch {
      setStatus("error")
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: "12px 16px",
    color: "var(--brand-fg)",
    fontFamily: "var(--font-body)",
    fontSize: "0.9rem",
    outline: "none",
    transition: "border-color 0.25s",
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontFamily: "var(--font-display)",
    fontSize: "0.7rem",
    fontWeight: 600,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: "rgba(248,250,252,0.5)",
  }

  return (
    <section
      ref={sectionRef}
      id="contact"
      className="relative py-24 lg:py-32"
      style={{ background: "var(--brand-bg-2)" }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.3), transparent)" }}
      />

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 xl:px-16">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-12 xl:gap-20 items-start">

          {/* ── Left: Dispatch panel ── */}
          <div ref={leftRef}>
            <p className="section-label mb-3">Get In Touch</p>
            <h2
              className="font-display font-700 uppercase mb-6"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2rem, 4.5vw, 3.5rem)",
                lineHeight: 0.95,
                color: "var(--brand-fg)",
                letterSpacing: "-0.02em",
              }}
            >
              Book Service.
              <br />
              <span style={{ color: "var(--brand-accent)" }}>We Dispatch Fast.</span>
            </h2>

            <p
              className="mb-8"
              style={{ fontFamily: "var(--font-body)", fontSize: "1rem", lineHeight: 1.7, color: "var(--brand-fg-muted)", maxWidth: "44ch" }}
            >
              Fill out the form and a dispatcher will call you within 15 minutes to confirm your appointment.
              Emergency? Call us directly for immediate dispatch.
            </p>

            {/* Direct contact options */}
            <div className="flex flex-col gap-4 mb-10">
              <a
                href={business.phoneHref}
                className="flex items-center gap-4 px-5 py-4 rounded-xl hover-lift cursor-pointer"
                style={{
                  background: "rgba(249,115,22,0.08)",
                  border: "1px solid rgba(249,115,22,0.2)",
                  textDecoration: "none",
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(249,115,22,0.15)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.003 1.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.85 6.85l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                  </svg>
                </div>
                <div>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.12em", color: "rgba(249,115,22,0.7)", textTransform: "uppercase" }}>Call / Emergency</p>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", fontWeight: 700, color: "var(--brand-fg)" }}>{business.phone}</p>
                </div>
                <div className="ml-auto">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(249,115,22,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
              </a>

              <a
                href={`mailto:${business.email}`}
                className="flex items-center gap-4 px-5 py-4 rounded-xl hover-lift cursor-pointer"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  textDecoration: "none",
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(248,250,252,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <div>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.12em", color: "rgba(248,250,252,0.4)", textTransform: "uppercase" }}>Email</p>
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "0.95rem", color: "rgba(248,250,252,0.8)" }}>{business.email}</p>
                </div>
              </a>
            </div>

            {/* Dispatch status board */}
            <div
              className="rounded-xl overflow-hidden"
              style={{
                border: "1px solid rgba(255,255,255,0.07)",
                background: "var(--brand-bg-card)",
              }}
            >
              <div
                className="px-5 py-3 flex items-center gap-2"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.2)" }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: "#22C55E", boxShadow: "0 0 8px #22C55E" }}
                />
                <span
                  className="text-xs uppercase tracking-widest font-display font-600"
                  style={{ fontFamily: "var(--font-display)", color: "rgba(248,250,252,0.5)", letterSpacing: "0.2em" }}
                >
                  Dispatch Status — Live
                </span>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y"
                style={{ borderColor: "rgba(255,255,255,0.05)" }}
              >
                {DISPATCH_STATS.map(s => (
                  <div key={s.label} className="p-4">
                    <p
                      className="font-display font-700 tabular-nums"
                      style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", color: "var(--brand-accent)", lineHeight: 1 }}
                    >
                      {s.value}
                    </p>
                    <p
                      style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "rgba(248,250,252,0.4)", marginTop: 4 }}
                    >
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right: Contact form ── */}
          <div
            ref={rightRef}
            className="rounded-2xl p-8 lg:p-10"
            style={{
              background: "var(--brand-bg-card)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {status === "sent" ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-6">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.4)" }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div>
                  <h3
                    className="font-display font-700 uppercase"
                    style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", color: "var(--brand-fg)", letterSpacing: "-0.01em" }}
                  >
                    Request Received!
                  </h3>
                  <p style={{ fontFamily: "var(--font-body)", color: "var(--brand-fg-muted)", marginTop: 8, fontSize: "0.95rem" }}>
                    A dispatcher will call you within 15 minutes to confirm.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h3
                  className="font-display font-700 uppercase mb-7"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.25rem",
                    color: "var(--brand-fg)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Request Service
                </h3>

                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label style={labelStyle}>Name *</label>
                    <input
                      type="text" name="name" required placeholder="Your name"
                      style={inputStyle} value={formData.name} onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone *</label>
                    <input
                      type="tel" name="phone" required placeholder="(555) 000-0000"
                      style={inputStyle} value={formData.phone} onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email" name="email" placeholder="your@email.com"
                    style={inputStyle} value={formData.email} onChange={handleChange}
                  />
                </div>

                <div className="mb-4">
                  <label style={labelStyle}>Service Needed</label>
                  <select
                    name="service"
                    style={{ ...inputStyle, cursor: "pointer" }}
                    value={formData.service} onChange={handleChange}
                  >
                    <option value="">Select a service...</option>
                    {services.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="mb-6">
                  <label style={labelStyle}>Message</label>
                  <textarea
                    name="message" placeholder="Describe the issue briefly..."
                    rows={4}
                    style={{ ...inputStyle, resize: "none" }}
                    value={formData.message} onChange={handleChange as React.ChangeEventHandler<HTMLTextAreaElement>}
                  />
                </div>

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="btn-primary w-full py-4"
                  style={{ fontSize: "1rem" }}
                >
                  {status === "sending" ? "Sending…" : "Submit Request — We Call Within 15 Min"}
                </button>

                {status === "error" && (
                  <p
                    className="mt-3 text-center text-sm"
                    style={{ color: "#F87171" }}
                  >
                    Something went wrong. Please call us directly at {business.phone}.
                  </p>
                )}

                <p
                  className="mt-4 text-center"
                  style={{ fontFamily: "var(--font-body)", fontSize: "0.78rem", color: "rgba(248,250,252,0.3)" }}
                >
                  By submitting you agree to receive a callback from {business.name}.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
