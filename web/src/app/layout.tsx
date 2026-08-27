import type { Metadata } from "next";
import Link from "next/link";

import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dither",
  description: "Decide what your e-ink display shows, and when.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-line bg-surface">
            <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
              <span
                aria-hidden
                className="grid h-7 w-7 place-items-center rounded-md bg-ink text-[13px] font-bold text-ground"
              >
                D
              </span>
              <span className="text-[15px] font-semibold tracking-tight">Dither</span>
            </Link>

            <Nav />

            <p className="mt-auto px-5 py-4 text-xs leading-relaxed text-faint">
              Extensions are code. Add one by adding a directory to{" "}
              <code className="font-mono text-[11px] text-muted">extensions/</code>.
            </p>
          </aside>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
