import type { Metadata } from "next";
import { JetBrains_Mono, Patrick_Hand, Shantell_Sans } from "next/font/google";
import "./globals.css";

// Body text: a hand-drawn feel that stays easy to read in tables and prices (ADR-0013).
const shantell = Shantell_Sans({
  variable: "--font-shantell",
  subsets: ["latin"],
  display: "swap",
});

// Headings and the dog's speech bubbles, in a calm marker hand (ADR-0013).
const patrick = Patrick_Hand({
  variable: "--font-patrick",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FlowHub",
    template: "%s · FlowHub",
  },
  description:
    "The hub for everything your company sells, with Gemini built in. Cited research, prices from your own catalogue, and a person approving every step.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${shantell.variable} ${patrick.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
