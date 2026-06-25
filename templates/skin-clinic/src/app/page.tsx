import { Nav, Hero, Services, WhyUs, Reviews, ServiceAreas, Contact, Footer } from "@core/web"
import { SkinMenuSection } from "@/components/skin-menu"
import { config } from "@/lib/config"

export default function Home() {
  return (
    <>
      <Nav config={config} scrolledTheme="light" />
      <main>
        <Hero config={config} videoSrc={config.heroVideo} posterSrc="/hero-4.jpg" posterBrightness={0.6} />
        <Services config={config} layout="zigzag" />
        <SkinMenuSection config={config} />
        <WhyUs config={config} />
        <Reviews
          config={config}
          ctaText={`Book your free skin consultation — ${config.business.review_count}+ happy clients`}
        />
        <ServiceAreas config={config} />
        <Contact config={config} />
      </main>
      <Footer config={config} />
    </>
  )
}
