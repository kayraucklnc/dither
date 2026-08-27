"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";

import { ScreenPreview } from "@/components/screen-preview";
import { ContextMenu, type MenuItem } from "@/components/flow/context-menu";

export interface ScreenSummary {
  id: number;
  name: string;
  widgetCount: number;
  usedBy: number;
}

export function ScreenCard({
  screen,
  width,
  height,
}: {
  screen: ScreenSummary;
  width: number;
  height: number;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const router = useRouter();

  const items: MenuItem[] = [
    {
      id: "duplicate",
      label: "Duplicate",
      icon: Copy,
      onSelect: async () => {
        const response = await fetch(`/api/screens/${screen.id}/duplicate`, { method: "POST" });
        if (response.ok) router.refresh();
      },
    },
    {
      id: "delete",
      label: "Delete",
      icon: Trash2,
      danger: true,
      // A screen a device is relying on leaves that leaf with nothing to show,
      // so the count is on the label rather than buried in a confirmation.
      hint: screen.usedBy > 0 ? `${screen.usedBy} device rule${screen.usedBy === 1 ? "" : "s"} point here` : undefined,
      onSelect: async () => {
        await fetch(`/api/screens/${screen.id}`, { method: "DELETE" });
        router.refresh();
      },
    },
  ];

  return (
    <div className="group relative rounded-panel border border-line bg-surface p-3 transition-colors hover:border-line-strong">
      <Link href={`/screens/${screen.id}`} className="block">
        <ScreenPreview
          src={`/api/preview/screen/${screen.id}`}
          width={width}
          height={height}
          alt={screen.name}
          className="paper-shadow"
        />
      </Link>

      <div className="flex items-end justify-between gap-2 px-1 pt-3 pb-1">
        <div className="min-w-0">
          <Link href={`/screens/${screen.id}`} className="block truncate text-[14px] font-medium">
            {screen.name}
          </Link>
          <p className="mt-0.5 text-[12px] text-faint">
            {screen.widgetCount} widget{screen.widgetCount === 1 ? "" : "s"}
            {screen.usedBy > 0 && ` · used by ${screen.usedBy}`}
          </p>
        </div>

        <button
          type="button"
          onClick={(event) => setMenu({ x: event.clientX, y: event.clientY })}
          className="shrink-0 rounded-md p-1.5 text-faint opacity-0 transition-opacity hover:bg-raised hover:text-ink group-hover:opacity-100"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>

      {menu && <ContextMenu at={menu} items={items} onClose={() => setMenu(undefined)} />}
    </div>
  );
}
