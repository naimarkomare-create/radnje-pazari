import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interni izveštaji",
  description: "Interna aplikacija za dnevne izveštaje radnji."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
