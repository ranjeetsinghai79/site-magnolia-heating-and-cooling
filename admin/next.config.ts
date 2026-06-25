import type { NextConfig } from "next"
import path from "path"

const config: NextConfig = {
  experimental: { serverActions: { allowedOrigins: ["localhost:3010"] } },
  outputFileTracingRoot: path.join(__dirname, "../../"),
  typescript: { ignoreBuildErrors: true },
}

export default config
