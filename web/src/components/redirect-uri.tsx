"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * The one string that has to match exactly.
 *
 * An OAuth client refuses a redirect URI that differs by a character - a
 * trailing slash, http against https, a host the proxy rewrote - and the
 * failure arrives as `redirect_uri_mismatch` on Google's own error page, not
 * on ours. So it is shown here to be copied rather than typed, and shown
 * *before* the form rather than after the first failure.
 *
 * The same shape serves the address a *panel* has to be pointed at, which
 * fails the same way and for the same reason: one character out and the
 * device talks to somebody else's server.
 */
export function RedirectUri({
  uri,
  label = "Authorised redirect URI — paste this into the OAuth client first",
}: {
  uri: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-lg border border-line bg-ground px-3 py-2.5">
      <p className="text-[11px] font-medium text-muted">{label}</p>

      <div className="mt-1.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{uri}</code>

        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(uri);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              // A browser with no clipboard permission still shows the text,
              // which is the part that matters.
            }
          }}
          className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:text-ink"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
