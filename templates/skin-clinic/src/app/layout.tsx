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
  title: `${business.name} | ${business.address}`,
  description: `${business.name} — ${business.tagline} Serving ${business.serviceAreas.join(", ")}. Call ${business.phone}.`,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className="min-h-full flex flex-col antialiased"
        data-theme={business.theme}
      >
        <LoadingScreen name={business.name} tagline={`${business.serviceAreas[0]} · Licensed Dermatology`} />
        <ScrollProgress />
        <MagneticCursor />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  )
}
