import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SCHOOL_PROFILE } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${SCHOOL_PROFILE.name} - ${SCHOOL_PROFILE.subtitle}`,
  description: `${SCHOOL_PROFILE.name}, Dutse, Jigawa State. ${SCHOOL_PROFILE.motto}. Operating Nursery, Primary and Tahfeez programmes.`,
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
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col font-sans bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
