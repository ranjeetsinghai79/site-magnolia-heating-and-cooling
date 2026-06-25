"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "./sidebar"

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const isClient  = path.startsWith("/client")
  const isLanding = path === "/landing"
  const isBuilder = path.startsWith("/builder")

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!isClient && !isLanding && !isBuilder && <Sidebar />}
      <div
        style={{
          flex: 1,
          marginLeft: isClient || isLanding || isBuilder ? 0 : "var(--sidebar-w)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  )
}
