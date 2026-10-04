// Accounts the panel signs in to. Linked here once; every widget that needs
// one uses it, and none can be added before it is linked.

import { useState } from "react";
import { ChevronDown, ExternalLink, LogIn } from "lucide-react";
import { CALENDAR_SCOPES } from "@/extensions/google-calendar";
import { linkGoogle, redirectUri } from "@/extensions/google-calendar/oauth";
import { isStripeKey } from "@/extensions/stripe";
import type { Accounts as AccountsDef } from "@/project/schema";
import { useProject } from "@/state/project-store";
import { Button, Field, Note, TextInput } from "../kit";

function Linked({ who, onUnlink }: { who: string; onUnlink: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2">
      <span className="truncate text-[13px]">{who}</span>
      <button type="button" className="text-[13px] text-muted hover:text-ink" onClick={onUnlink}>Unlink</button>
    </div>
  );
}

function GoogleSetupHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-line bg-raised">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-medium">
        Where do the client ID and secret come from?
        <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ol className="list-decimal space-y-1.5 px-7 pb-3 text-[13px] text-muted">
          <li>
            In{" "}
            <a className="text-accent underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
              Google Cloud credentials <ExternalLink size={11} className="inline" />
            </a>
            , create a project and turn on the Google Calendar API.
          </li>
          <li>Set up the consent screen as “External” and add yourself as a test user.</li>
          <li>Create an OAuth client ID of type “Web application”.</li>
          <li>Add this authorised redirect URI: <code className="break-all text-ink">{redirectUri()}</code></li>
          <li>Paste the client ID and secret here, then sign in.</li>
        </ol>
      )}
    </div>
  );
}

function Google({ account, set }: { account: AccountsDef["google"]; set: (a: AccountsDef["google"]) => void }) {
  const [clientId, setClientId] = useState(account?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState(account?.clientSecret ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (account) return <Linked who={`Google${account.email ? `: ${account.email}` : ""} — calendars, read only`} onUnlink={() => set(null)} />;

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      set(await linkGoogle(clientId.trim(), clientSecret.trim(), CALENDAR_SCOPES));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <GoogleSetupHelp />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client ID">{(id) => <TextInput id={id} value={clientId} onChange={setClientId} placeholder="…apps.googleusercontent.com" />}</Field>
        <Field label="Client secret">{(id) => <TextInput id={id} type="password" value={clientSecret} onChange={setClientSecret} />}</Field>
      </div>
      <Button variant="primary" icon={<LogIn size={15} />} disabled={busy || !clientId.trim() || !clientSecret.trim()} onClick={signIn}>
        {busy ? "Waiting for Google…" : "Sign in with Google"}
      </Button>
      {error && <Note tone="warn">{error}</Note>}
    </div>
  );
}

function Stripe({ account, set }: { account: AccountsDef["stripe"]; set: (a: AccountsDef["stripe"]) => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (account) return <Linked who={`Stripe${account.name ? `: ${account.name}` : ""} — ${account.key.slice(0, 8)}…`} onUnlink={() => set(null)} />;

  // One harmless read proves the key works before the panel depends on it.
  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("https://api.stripe.com/v1/balance_transactions?limit=1", {
        headers: { Authorization: `Bearer ${key.trim()}` }, credentials: "omit",
      });
      if (res.status === 401) throw new Error("Stripe does not recognise that key.");
      if (res.status === 403) throw new Error("That key cannot read balance transactions. Give it read access to Balance.");
      if (!res.ok) throw new Error(`Stripe answered ${res.status}.`);
      set({ key: key.trim(), name: key.trim().includes("_test_") ? "test mode" : "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach Stripe.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Restricted API key" help="In Stripe, create a restricted key with read access to Balance only. It is stored on the panel and in this browser.">
        {(id) => <TextInput id={id} type="password" value={key} onChange={setKey} placeholder="rk_live_…" />}
      </Field>
      <Button variant="primary" disabled={busy || !isStripeKey(key.trim())} onClick={check}>{busy ? "Checking…" : "Connect Stripe"}</Button>
      {error && <Note tone="warn">{error}</Note>}
    </div>
  );
}

export function Accounts() {
  const { project, update } = useProject();
  const set = <K extends keyof AccountsDef>(kind: K, value: AccountsDef[K]) =>
    update((p) => ({ ...p, accounts: { ...p.accounts, [kind]: value } }));
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium">Google</h3>
        <p className="text-[13px] text-muted">For the Google Calendar widget, and rules like “in a meeting”.</p>
        <Google account={project.accounts.google} set={(a) => set("google", a)} />
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">Stripe</h3>
        <p className="text-[13px] text-muted">For the Revenue widget, and rules about what came in today.</p>
        <Stripe account={project.accounts.stripe} set={(a) => set("stripe", a)} />
      </div>
    </div>
  );
}
