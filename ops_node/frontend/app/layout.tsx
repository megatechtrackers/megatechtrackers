import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import Navigation from "@/components/Navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TimezoneProvider } from "@/lib/TimezoneContext";

export const metadata: Metadata = {
  title: "Device Service",
  description: "Device Configuration System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen bg-slate-50 text-slate-900 antialiased`}
      >
        <ErrorBoundary>
          <TimezoneProvider>
            <Navigation />
            <main className="relative pt-14 sm:pt-16">{children}</main>
          </TimezoneProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
