import type { Metadata } from "next"
import "./globals.css"
import { config } from "@/lib/config"
import { SmoothScroll, ScrollProgress } from "@core/web"

const { business } = config

export const metadata: Metadata = {
  title: `${business.name} | ${business.address}`,
  description: `${business.name} — Licensed HVAC & Plumbing serving ${business.serviceAreas.join(", ")}. 24/7 emergency service. Call ${business.phone}.`,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className="min-h-full flex flex-col antialiased"
        data-theme={business.theme}
      >
        <ScrollProgress />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  )
}
