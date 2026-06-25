import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minerva Grand | Authentic Indian Cuisine | Tracy, CA",
  description:
    "Experience authentic Indian flavors at Minerva Grand — biryanis, curries, dosa, beer & wine, and a sports bar. Weekend lunch buffet from $17.99. Tracy, California.",
  keywords: "Indian restaurant Tracy CA, biryani Tracy, Indian food Bay Area, Minerva Grand, South Indian cuisine, lunch buffet",
  openGraph: {
    title: "Minerva Grand | Authentic Indian Cuisine",
    description: "Biryanis, curries, dosa, beer & wine. Weekend buffet $17.99. Tracy, CA.",
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full antialiased bg-surface-900 text-cream font-body">
        {children}
      </body>
    </html>
  );
}
