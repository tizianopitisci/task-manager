import type { Metadata } from "next";
import { Patrick_Hand } from "next/font/google";
import "./globals.css";

const caveat = Patrick_Hand({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Task Manager",
  description: "Task Manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={`${caveat.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
