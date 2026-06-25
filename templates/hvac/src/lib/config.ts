import type { SiteConfig } from "@core/web/types"

export const config: SiteConfig = {
  business: {
    name: "Magnolia Heating and Cooling",
    tagline: "Your Comfort, Our Priority. Call Us!",
    phone: "(951) 688-3524",
    phoneHref: "tel:+19516883524",
    email: "info@maghvac.com",
    address: "6990 Jurupa Ave, Riverside, CA 92504, USA",
    city: "Riverside",
    serviceAreas: ["Riverside, CA"],
    license: "Licensed & Insured",
    since: "1994", // Estimated based on established presence
    google_rating: "4.9",
    review_count: "1424",
    emergency: true,
    theme: "clean",
    niche: "hvac",
  },

  services: [
    { icon: "thermometer", title: "AC Repair", desc: "Expert technicians diagnose and fix all AC issues quickly and efficiently.", urgent: true },
    { icon: "flame", title: "Heating Repair", desc: "Fast and reliable heating system repairs to restore warmth to your home.", urgent: true },
    { icon: "thermometer", title: "AC Installation", desc: "Professional installation of new, energy-efficient air conditioning systems.", urgent: false },
    { icon: "flame", title: "Heating Installation", desc: "Seamless installation of new furnaces and heating systems for optimal comfort.", urgent: false },
    { icon: "shield-check", title: "HVAC Maintenance", desc: "Preventative maintenance plans to keep your heating and cooling systems running smoothly.", urgent: false },
    { icon: "wrench", title: "Commercial HVAC", desc: "Comprehensive HVAC services for businesses, including repair, installation, and maintenance.", urgent: false }
  ],

  testimonials: [
    { name: "Sarah Burns", location: "Riverside, CA", stars: 5, text: "Damian was super friendly, communicative, knowledgable, and helpful! He showed me pics of my hvac unit before and after and shared how important maintenance was to help reduce further repairs and energy costs.\nI am glad I chose this new to me company and followed my friend’s referral. Excellent customer service start to finish. Thank you so much! Feeling ready for the high heat summer just around the corner. Damian rocks!" },
    { name: "Chelsea Bullock", location: "Riverside, CA", stars: 5, text: "I had a maintenance appt today, and I was very lucky to have Shawn B as my technician. He was extremely friendly, knowledgeable, and he explained things thoroughly as he worked. Unfortunately, I did need additional services, but there was no pressure, only recommendations. Last year, my AC went out on a holiday weekend, and it was terrible. I knew Shawn's recommendations were honest, and I was not going to even test waiting, and having history repeat itself. While Shawn was here, I signed up for Magnolia's service plan, and I will definitely request Shawn for all future appointments. 10/10 highly recommend!" },
    { name: "Russell Pierce", location: "Riverside, CA", stars: 5, text: "Very professional HVAC technicians. Installation of new home HVAC system by Michael, Allen, and Hugo was well done.  Photos of all equipment was provided and operations were explained. Great to work with.  Also Dominque gave a great quote with extended warranties.  Will recommend Magnolia Heating and Plumbing to others." }
  ],

  trustBadges: [
    "NATE-Certified Technicians", "24/7 Emergency Service", "GAF Master Elite Contractor", "Mon–Fri 7AM–10PM"
  ],

  stats: [
    { value: 4.9, label: "Google Rating", suffix: "★", decimals: 1 },
    { value: 1424, label: "Happy Customers", suffix: "+", decimals: 0 },
    { value: 30, label: "Years Experience", suffix: "+", decimals: 0 } // Estimated based on established presence
  ],

  reasons: [
    { icon: "award", title: "NATE-Certified Technicians", desc: "Our team consists of highly trained and NATE-certified professionals ensuring top-quality service." },
    { icon: "clock", title: "Same-Day Emergency Service", desc: "We offer prompt emergency services to address your HVAC needs quickly and efficiently." },
    { icon: "dollar-sign", title: "Upfront Flat-Rate Pricing", desc: "No surprises! We provide clear, upfront pricing before any work begins." },
    { icon: "wrench", title: "All Brands Serviced", desc: "Our experts are proficient in servicing and repairing all major HVAC brands and models." },
    { icon: "shield-check", title: "10-Year Parts Warranty", desc: "Enjoy peace of mind with our comprehensive 10-year warranty on parts for new installations." },
    { icon: "thumbs-up", title: "Financing Available", desc: "Flexible financing options are available to make your HVAC investments more affordable." }
  ],

  formServiceOptions: ["AC Repair", "AC Installation", "AC Maintenance", "Heating Repair", "Heating Installation", "Heating Maintenance", "Commercial HVAC"]
}

// Backward-compat re-exports
export const BUSINESS = config.business
export const SERVICES = config.services!
export const TESTIMONIALS = config.testimonials!
export const TRUST_BADGES = config.trustBadges!