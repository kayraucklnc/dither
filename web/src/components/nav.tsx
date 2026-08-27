"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Blocks,
  LayoutTemplate,
  Link2,
  MonitorSmartphone,
  Radio,
  SlidersHorizontal,
} from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Three places, in the order you use them: the devices you own, the screens
 * you design, and the extensions those screens are built from.
 *
 * Matching is by segment boundary, not prefix, so /screens/new does not also
 * light up a /screens/nested entry.
 */
const LINKS = [
  { href: "/devices", label: "Devices", icon: MonitorSmartphone, hint: "What each panel is showing" },
  { href: "/screens", label: "Screens", icon: LayoutTemplate, hint: "Designs you can show" },
  { href: "/extensions", label: "Extensions", icon: Blocks, hint: "What screens are built from" },
  { href: "/sources", label: "Sources", icon: Radio, hint: "What Dither watches, shared by every device" },
  { href: "/connections", label: "Connections", icon: Link2, hint: "Accounts Dither can read from" },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal, hint: "Language and time zone" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            title={link.hint}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-raised text-ink"
                : "text-muted hover:bg-surface hover:text-ink",
            )}
          >
            <link.icon
              size={17}
              className={cn("shrink-0", active ? "text-accent" : "text-faint group-hover:text-muted")}
            />
            <span className="font-medium">{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
