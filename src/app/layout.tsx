import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SCHOOL_PROFILE } from "@/lib/constants";
import { ScrollObserver } from "@/components";
import { ImpersonationBanner } from "@/components/auth/impersonation-banner";

export const metadata: Metadata = {
  title: `${SCHOOL_PROFILE.name} - ${SCHOOL_PROFILE.subtitle}`,
  description: `${SCHOOL_PROFILE.name}, Dutse, Jigawa State. ${SCHOOL_PROFILE.motto}. Operating Nursery, Primary and Tahfeez programmes.`,
  icons: {
    icon: [
      { url: "/images/swanford-logo.jpg", type: "image/jpeg" },
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    shortcut: "/images/swanford-logo.jpg",
    apple: "/images/swanford-logo.jpg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased font-sans overflow-x-hidden max-w-full"
    >
      <head>
        <link rel="icon" type="image/jpeg" href="/images/swanford-logo.jpg" />
        <link rel="apple-touch-icon" href="/images/swanford-logo.jpg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Montserrat:ital,wght@0,400..900;1,400..900&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap"
          rel="stylesheet"
        />
        {/* Eradicate any Next.js dev indicator floating badge */}
        <script
          id="remove-next-dev-indicators"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function purge() {
                  var portal = document.querySelector('nextjs-portal');
                  if (portal) portal.remove();
                  var badge = document.querySelector('[data-next-badge], [data-nextjs-dev-tools-button], #next-badge');
                  if (badge) {
                    var container = badge.closest('div');
                    if (container) container.remove();
                    else badge.remove();
                  }
                }
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', purge);
                } else {
                  purge();
                }
                window.addEventListener('load', purge);
                if (typeof MutationObserver !== 'undefined') {
                  var obs = new MutationObserver(purge);
                  obs.observe(document.documentElement, { childList: true, subtree: true });
                }
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-[#EFE8DC] text-slate-900 overflow-x-hidden w-full max-w-full relative">
        <ImpersonationBanner />
        <ScrollObserver />
        <div className="flex-1 flex flex-col w-full max-w-full overflow-x-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
