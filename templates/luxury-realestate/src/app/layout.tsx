import type { Metadata } from "next"
import "./globals.css"
import { config } from "@/lib/config"
import {
  SmoothScroll,
  MagneticCursor,
  LoadingScreen,
  ScrollProgress,
} from "@core/web"

const { business } = config

export const metadata: Metadata = {
  title: `${business.name} | Luxury Real Estate ${business.city}`,
  description: `${business.name} — ${business.tagline} Serving ${business.serviceAreas.join(", ")}.`,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className="min-h-full flex flex-col antialiased"
        data-theme={business.theme}
        style={{ background: "var(--brand-bg)" }}
      >
        <LoadingScreen name={business.name} tagline={`${business.city} · Luxury Real Estate`} />
        <ScrollProgress />
        <MagneticCursor />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  )
}
