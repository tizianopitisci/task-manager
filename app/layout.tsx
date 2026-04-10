import type { Metadata, Viewport } from "next";
import {
  Patrick_Hand,
  Caveat,
  Kalam,
  Indie_Flower,
  Architects_Daughter,
  Permanent_Marker,
  Shadows_Into_Light,
  Gloria_Hallelujah,
  Dancing_Script,
  Amatic_SC,
} from "next/font/google";
import "./globals.css";

const patrickHand       = Patrick_Hand(       { variable: "--font-patrick-hand",       subsets: ["latin"], weight: "400" });
const caveat            = Caveat(             { variable: "--font-caveat",              subsets: ["latin"], weight: ["400","700"] });
const kalam             = Kalam(              { variable: "--font-kalam",               subsets: ["latin"], weight: ["400","700"] });
const indieFlower       = Indie_Flower(       { variable: "--font-indie-flower",        subsets: ["latin"], weight: "400" });
const architectsDaughter= Architects_Daughter({ variable: "--font-architects-daughter", subsets: ["latin"], weight: "400" });
const permanentMarker   = Permanent_Marker(   { variable: "--font-permanent-marker",    subsets: ["latin"], weight: "400" });
const shadowsIntoLight  = Shadows_Into_Light( { variable: "--font-shadows-into-light",  subsets: ["latin"], weight: "400" });
const gloriaHallelujah  = Gloria_Hallelujah(  { variable: "--font-gloria-hallelujah",   subsets: ["latin"], weight: "400" });
const dancingScript     = Dancing_Script(     { variable: "--font-dancing-script",      subsets: ["latin"], weight: ["400","700"] });
const amaticSC          = Amatic_SC(          { variable: "--font-amatic-sc",           subsets: ["latin"], weight: ["400","700"] });

export const viewport: Viewport = {
  themeColor: "#111111",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Task Manager",
  description: "Il tuo task manager personale",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Task Manager",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const fonts = [
    patrickHand, caveat, kalam, indieFlower, architectsDaughter,
    permanentMarker, shadowsIntoLight, gloriaHallelujah, dancingScript, amaticSC,
  ].map((f) => f.variable).join(" ");

  return (
    <html lang="it">
      <body className={`${fonts} antialiased`}>{children}</body>
    </html>
  );
}
