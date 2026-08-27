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

/** One linked account, ready to use. */
export interface Account {
  /** The account's own address, which is how a widget names it. */
  account: string;
  /** What to call it on screen. */
  label: string;
  /** The grant, over the installation's client credentials. */
  credentials: Record<string, unknown>;
}

/** What a provider is told when it is asked for data. */
export interface FetchContext {
  /**
   * Every linked account, in address order.
   *
   * A provider that can hold several - two Google accounts, work and personal
   * - reads this and decides which the widget asked for. One that cannot has
   * exactly one entry here.
   */
  accounts: Account[];
  /**
   * The first account's credentials.
   *
   * What a single-account provider wants, and all Stripe has ever needed.
   * Empty when nothing is linked.
   */
  credentials: Record<string, unknown>;
  /** IANA zone of the installation, so "today" means the right day. */
  timezone: string;
  /** BCP 47, for day and month names. */
  locale: string;
}

/**
 * A link that is finished in the browser rather than in a form.
 *
 * Some accounts cannot be linked by pasting a key, because the service does
 * not issue one: Google wants a consent screen, and hands back a refresh
 * token afterwards. That is two steps rather than one - credentials that
 * identify *this installation* to the service, then a round trip through the
 * service where the person says yes - and a provider that needs it says so
 * here.
 *
 * Self-hosted software cannot ship the client credentials for a service like
 * Google: they identify one application, they are rate limited as one, and the
 * consent screen naming it has to be reviewed by Google against a privacy
 * policy that belongs to whoever published it. So the installation registers
 * its own, which is the same bargain every self-hosted Google integration
 * makes. The connections page walks through it.
 */
export interface Handshake {
  /** What the account is asked to grant, shown before the redirect. */
  scopes: string[];
  /** Where to send the browser once the client credentials are stored. */
  authorizeUrl(
    credentials: Record<string, unknown>,
    redirectUri: string,
    state: string,
  ): string;
  /**
   * Turn the code the browser came back with into a grant worth keeping.
   *
   * `account` identifies whose it is and must be stable - the address, not a
   * number we made up - because it is what a widget's settings name. `grant`
   * is only the durable half; the client credentials are already stored and
   * are not copied onto every account.
   */
  exchange(
    code: string,
    credentials: Record<string, unknown>,
    redirectUri: string,
  ): Promise<{ account: string; label: string; grant: Record<string, unknown> }>;
  /**
   * Whether what is stored is a finished handshake or only the first half.
   *
   * A row exists the moment the client credentials are saved, and a page that
   * read "linked" from the row's existence would say linked before anyone had
   * consented to anything.
   */
  complete(credentials: Record<string, unknown>): boolean;
}

export interface Verification {
  ok: boolean;
  /** Whose account it turned out to be, for the connections page. */
  label?: string;
  /**
   * The account's own address, when the provider can say what it is.
   *
   * What the row is filed under and what a widget's settings name, so it has
   * to come from the service rather than being made up here. A provider that
   * holds one account at a time can leave it out and be stored under the
   * installation's own empty name, as it always was.
   */
  account?: string;
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
  /**
   * Whether this provider can hold more than one account at a time.
   *
   * A person can have a work Google account and a personal one and want both
   * on one panel. A Stripe key is one account by construction.
   */
  multiple?: boolean;
  /** What linking it asks for. Empty means one click and no credentials. */
  credentials?: CredentialField[];
  /** Where to get the credentials, linked from the connections page. */
  help?: { label: string; url: string };
  /** Check credentials before they are stored, and say whose account they are. */
  verify?(credentials: Record<string, unknown>): Promise<Verification>;
  /** Set when linking finishes in the browser rather than in the form. */
  handshake?: Handshake;
  fetch(
    settings: Record<string, unknown>,
    now: Date,
    context: FetchContext,
  ): Promise<Record<string, unknown>>;
}

/** The connection an extension needs, if any. Set by `connection:` in its manifest. */
export type RequiredBy = (manifest: Manifest) => Provider | undefined;
