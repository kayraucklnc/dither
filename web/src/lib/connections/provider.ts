import type { Manifest } from "@/lib/extensions/manifest";

/**
 * What a connection is.
 *
 * Connections are accounts and services you link once, and every widget or
 * trigger that names one can use it. An extension that needs a connection does
 * not carry credentials in its settings - it says "I need Stripe" and the
 * linked account answers for every placement of it. That keeps a screen's
 * settings about *what to show* rather than about how to authenticate.
 */

/** One thing a person has to paste in to link an account. */
export interface CredentialField {
  key: string;
  label: string;
  help: string;
  placeholder?: string;
  /**
   * Never sent back to the browser, and shown as a hint rather than a value.
   *
   * A form that renders the secret it holds is a secret in every screenshot,
   * every screen share and every browser cache. The dashboard shows the last
   * four characters, which is enough to tell one key from another and useless
   * to anyone who reads it.
   */
  secret: boolean;
}

/** What a provider is told when it is asked for data. */
export interface FetchContext {
  /** Whatever was stored when the account was linked. Empty when unlinked. */
  credentials: Record<string, unknown>;
  /** IANA zone of the installation, so "today" means the right day. */
  timezone: string;
  /** BCP 47, for day and month names. */
  locale: string;
}

export interface Verification {
  ok: boolean;
  /** Whose account it turned out to be, for the connections page. */
  label?: string;
  error?: string;
}

export interface Provider {
  id: string;
  label: string;
  description: string;
  /** What linking it unlocks, for the connections page. */
  unlocks: string;
  icon: string;
  /** True while the real integration is not written yet. */
  mocked: boolean;
  /** What linking it asks for. Empty means one click and no credentials. */
  credentials?: CredentialField[];
  /** Where to get the credentials, linked from the connections page. */
  help?: { label: string; url: string };
  /** Check credentials before they are stored, and say whose account they are. */
  verify?(credentials: Record<string, unknown>): Promise<Verification>;
  fetch(
    settings: Record<string, unknown>,
    now: Date,
    context: FetchContext,
  ): Promise<Record<string, unknown>>;
}

/** The connection an extension needs, if any. Set by `connection:` in its manifest. */
export type RequiredBy = (manifest: Manifest) => Provider | undefined;
