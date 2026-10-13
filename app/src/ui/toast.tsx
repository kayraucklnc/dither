// One short message at a time, at the bottom of the window, with an optional action.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const LIFETIME_MS = 6000;

interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

type Show = (message: string, action?: Toast["action"]) => void;

const Ctx = createContext<Show | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [paused, setPaused] = useState(false);

  const show = useCallback<Show>((message, action) => {
    setPaused(false);
    setToast({ id: Date.now(), message, action });
  }, []);

  useEffect(() => {
    if (!toast || paused) return;
    const t = setTimeout(() => setToast(null), LIFETIME_MS);
    return () => clearTimeout(t);
  }, [toast, paused]);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center">
        {toast && (
          <div
            key={toast.id}
            role="status"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
            className="pointer-events-auto flex items-center gap-1 rounded-lg bg-ink py-1.5 pl-3.5 pr-1.5 text-[13px] text-raised shadow-lg"
          >
            <span className="mr-2">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="h-7 rounded-md px-2.5 font-semibold text-accent-soft hover:bg-raised/15"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss" className="grid size-7 place-items-center rounded-md opacity-70 hover:bg-raised/15 hover:opacity-100" onClick={() => setToast(null)}>
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): Show {
  const show = useContext(Ctx);
  if (!show) throw new Error("useToast outside ToastProvider");
  return show;
}
