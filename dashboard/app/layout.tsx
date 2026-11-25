import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guest Review Dashboard - Azzurro Hotels",
  description: "What Booking.com guests are saying about our Sydney hotels",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="text-lg antialiased">{children}</body>
    </html>
  );
}
