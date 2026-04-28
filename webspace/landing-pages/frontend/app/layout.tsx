import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Landing Pages Admin",
  description: "Manage your AI-powered landing pages",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-white antialiased">{children}</body>
    </html>
  );
}
