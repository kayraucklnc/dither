"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Are you sure - for the few things that are not undoable.
 *
 * Most of this dashboard saves as you type and needs no confirming; a screen
 * you delete by accident is a minute's work to rebuild. A device is not that.
 * Forgetting one throws away its whole decision tree and every notice built on
 * top of it, and none of that is recoverable from the panel - the panel only
 * knows its own MAC address.
 *
 * So the dialog's job is not to ask twice, it is to *say what goes*. The
 * caller passes the list, and it is rendered rather than summarised.
 */
export function Confirm({
  title,
  body,
  losing,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  /** The things that will not survive. Rendered verbatim, not counted up. */
  losing?: string[];
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [working, setWorking] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmButton.current?.focus();

    const escape = (event: KeyboardEvent) => event.key === "Escape" && !working && onClose();
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose, working]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(event) => event.target === event.currentTarget && !working && onClose()}
    >
      <div
        role="alertdialog"
        aria-modal
        aria-label={title}
        className="w-full max-w-sm rounded-panel border border-line bg-surface p-5 shadow-[0_28px_60px_-16px_oklch(0_0_0/0.8)]"
      >
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>

        {losing && losing.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg border border-line bg-ground/50 px-3 py-2.5">
            {losing.map((thing) => (
              <li key={thing} className="flex items-start gap-2 text-[12px] text-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-danger" />
                {thing}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={working}
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[13px] text-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            ref={confirmButton}
            type="button"
            disabled={working}
            onClick={async () => {
              setWorking(true);
              try {
                await onConfirm();
              } finally {
                setWorking(false);
              }
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md bg-danger/15 px-3 py-1.5 text-[13px] font-medium text-danger",
              "transition-colors hover:bg-danger/25 disabled:opacity-60",
            )}
          >
            {working && <Loader2 size={13} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
