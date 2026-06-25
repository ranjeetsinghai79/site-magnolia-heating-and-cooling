import Nav from "@/components/nav"
import Hero from "@/components/hero"
import Categories from "@/components/categories"
import Dishes from "@/components/dishes"
import About from "@/components/about"
import Specials from "@/components/specials"
import Gallery from "@/components/gallery"
import Contact from "@/components/contact"
import Footer from "@/components/footer"

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Categories />
        <Dishes />
        <About />
        <Specials />
        <Gallery />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
