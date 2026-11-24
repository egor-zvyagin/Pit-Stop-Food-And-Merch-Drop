import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DemoProvider } from "@/components/DemoProvider";
import AppShell from "@/components/layout/AppShell";
import OrderProvider from "@/components/order/OrderProvider";
import RewardsProvider from "@/components/reward/RewardsProvider";
import { CartProvider } from "@/context/CartContext";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

// Fonts are bundled with the app (see ./fonts/OFL-LICENSES.txt), so the build
// needs no network access and the app shell renders correctly offline.
const inter = localFont({
  src: "./fonts/Inter-latin-variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const bigShoulders = localFont({
  src: "./fonts/BigShouldersDisplay-latin-variable.woff2",
  variable: "--font-big-shoulders",
  weight: "100 900",
  display: "swap",
});

// Page Metadata
export const metadata: Metadata = {
  title: "Pit Stop Food & Merch Drop",
  description: "Order ahead. Pick up fast. Get back to the action.",
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
  themeColor: "#E10600",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${bigShoulders.variable} antialiased`}
      >
        <ServiceWorkerRegistration />
        {/* Makes Demo Mode available across all pages */}
        <DemoProvider>
          {/* Keeps selected Pit Stop and cart available across pages */}
          <CartProvider>
            <OrderProvider>
              <RewardsProvider>
                <AppShell>
                  {children}
                </AppShell>
              </RewardsProvider>
            </OrderProvider>
          </CartProvider>
        </DemoProvider>
      </body>
    </html>
  );
}
