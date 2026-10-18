// Steps a widget asks you to follow outside the app, folded away until wanted.

import { Check, ChevronDown, Copy } from "lucide-react";
import { useState } from "react";

/** The app's own address, where it serves files such as the Claude Code bridge. */
const appAddress = () => new URL(".", document.baseURI).href;

function CopyLine({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="mt-1 flex items-start gap-1.5 rounded border border-line bg-surface px-2 py-1.5">
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-all text-[12px] text-ink">{code}</code>
      <button type="button" onClick={copy} aria-label="Copy" title="Copy" className="shrink-0 text-muted hover:text-ink">
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export function GuideField({ label, steps, help }: { label: string; steps: { text: string; code?: string }[]; help?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-line bg-raised">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-medium">
        {label}
        <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <ol className="list-decimal space-y-2.5 pl-4 text-[13px] text-muted">
            {steps.map((s, i) => (
              <li key={i}>
                {s.text}
                {s.code && <CopyLine code={s.code.replaceAll("{{app}}", appAddress())} />}
              </li>
            ))}
          </ol>
          {help && <p className="mt-2.5 text-[12px] text-muted leading-snug">{help}</p>}
        </div>
      )}
    </div>
  );
}
