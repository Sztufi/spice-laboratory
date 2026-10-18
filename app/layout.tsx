import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spice Laboratory",
  description: "Spice Laboratory vásárlói fiók és webáruház.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu">
      <body className="antialiased">{children}</body>
    </html>
  );
}
