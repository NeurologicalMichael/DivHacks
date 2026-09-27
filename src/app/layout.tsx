import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "LeaseLens NYC",
  description: "Find the storefront before the listing does.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${outfit.className}`}>{children}</body>
    </html>
  );
}
