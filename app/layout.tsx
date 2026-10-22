import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "P2P Compass",
  description: "Synthetic Position to Person request management and process improvement.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
