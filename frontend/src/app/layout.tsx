import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DemoProvider } from "@/components/DemoProvider";
import AppShell from "@/components/layout/AppShell";
import OrderProvider from "@/components/order/OrderProvider";
import RewardsProvider from "@/components/reward/RewardsProvider";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

// Fonts are bundled with the app (see ./fonts/OFL-LICENSES.txt), so the build
// needs no network access and the app shell renders correctly offline.
// Archivo has a width axis: the condensed cut sets prices, codes and
// headings, the normal width sets body text.
const archivo = localFont({
  src: "./fonts/Archivo-latin-variable.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  style: "normal",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

// Page Metadata
export const metadata: Metadata = {
  title: "Pit Stop: trackside food and merch",
  description: "Order food and merch from your seat, collect it from a locker, and get back to the race.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};


// Mobile Viewport behaviour
export const viewport: Viewport = {
  width: "device-width",
  // Loading page to 100% zoom 
  initialScale: 1,
  themeColor: "#1d2125",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${archivo.variable} antialiased`}
      >
        <ServiceWorkerRegistration />
        {/* Makes Demo Mode available across all pages */}
        <DemoProvider>
          {/* Ticket, cart, pickup pod and the active order */}
          <OrderProvider>
            <RewardsProvider>
              <AppShell>{children}</AppShell>
            </RewardsProvider>
          </OrderProvider>
        </DemoProvider>
      </body>
    </html>
  );
}
