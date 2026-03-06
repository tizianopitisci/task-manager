import type { Metadata } from "next";
import {
  Patrick_Hand,
  Caveat,
  Kalam,
  Indie_Flower,
  Architects_Daughter,
} from "next/font/google";
import "./globals.css";

const patrickHand = Patrick_Hand({
  variable: "--font-patrick-hand",
  subsets: ["latin"],
  weight: "400",
});
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "700"],
});
const kalam = Kalam({
  variable: "--font-kalam",
  subsets: ["latin"],
  weight: ["400", "700"],
});
const indieFlower = Indie_Flower({
  variable: "--font-indie-flower",
  subsets: ["latin"],
  weight: "400",
});
const architectsDaughter = Architects_Daughter({
  variable: "--font-architects-daughter",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Task Manager",
  description: "Task Manager",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body
        className={`${patrickHand.variable} ${caveat.variable} ${kalam.variable} ${indieFlower.variable} ${architectsDaughter.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
