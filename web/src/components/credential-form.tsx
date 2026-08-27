"use client";

import { useState } from "react";
import { ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";
import type { CredentialField } from "@/lib/connections/provider";

/**
 * Pasting a key in, once.
 *
 * A secret field is masked by default and revealable on purpose, because the
 * one thing you actually need to do with a pasted key is check you pasted the
 * right one. `autoComplete="off"` and `spellCheck` off matter here rather than
 * being tidiness: a browser that helpfully remembers a live secret key, or
 * underlines it in red, is a browser doing the wrong favour.
 *
 * The button says "checking" while the action runs, because verifying a key is
 * a round trip to the provider and a form that looks frozen gets clicked twice.
 */
export function CredentialForm({
  provider,
  fields,
  help,
  action,
  submitLabel = "Link",
  above,
}: {
  provider: string;
  fields: CredentialField[];
  help?: { label: string; url: string };
  action: (formData: FormData) => Promise<void>;
  /** "Link" for a key that is the whole story, "Save and continue" for half of one. */
  submitLabel?: string;
  /** Anything that has to be read before the fields are filled in. */
  above?: React.ReactNode;
}) {
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={async (formData) => {
        setBusy(true);
        try {
          await action(formData);
        } finally {
          setBusy(false);
        }
      }}
      className="mt-3 space-y-3 border-t border-line pt-3"
    >
      <input type="hidden" name="provider" value={provider} />

      {above}

      {fields.map((field) => (
        <div key={field.key}>
          <label
            htmlFor={`${provider}-${field.key}`}
            className="mb-1.5 block text-[12px] font-medium text-ink"
          >
            {field.label}
          </label>

          <div className="relative">
            <input
              id={`${provider}-${field.key}`}
              name={field.key}
              type={field.secret && !shown[field.key] ? "password" : "text"}
              placeholder={field.placeholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className={cn(
                "w-full rounded-md border border-line bg-ground py-1.5 pl-2.5 text-[13px] text-ink",
                "font-mono outline-none transition-colors placeholder:text-faint focus:border-accent/70",
                field.secret ? "pr-9" : "pr-2.5",
              )}
            />
            {field.secret && (
              <button
                type="button"
                aria-label={shown[field.key] ? "Hide" : "Show"}
                onClick={() => setShown((current) => ({ ...current, [field.key]: !current[field.key] }))}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-faint transition-colors hover:text-ink"
              >
                {shown[field.key] ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            )}
          </div>

          {field.help && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{field.help}</p>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          {busy ? "Checking" : submitLabel}
        </button>

        {help && (
          <a
            href={help.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 text-[12px] text-faint transition-colors hover:text-ink"
          >
            {help.label}
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </form>
  );
}
