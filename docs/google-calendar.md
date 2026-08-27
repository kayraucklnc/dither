# Connecting a real Google Calendar

Dither reads a Google account's calendar through Google's own API, over
OAuth. There are four minutes of setup before the first link, and none after
it.

## Why there is any setup at all

There is no published "Dither" application registered with Google, and there
cannot usefully be one. `calendar.readonly` is what Google calls a *sensitive*
scope: the consent screen naming an application has to be reviewed by Google
against a privacy policy and a verified domain belonging to whoever published
it. A self-hosted server has no such domain, and an unverified app can only be
used by a handful of accounts explicitly listed as testers.

So each installation registers its own OAuth client. That is the same bargain
every self-hosted Google integration makes — Home Assistant asks for exactly
this — and it has a real upside: the grant is between your Google account and
*your* server. Nothing passes through anyone else, and the client is rate
limited as one user rather than as one shared application.

What Dither ends up storing is a **refresh token**. Access tokens are minted
from it an hour at a time and never written down. You can revoke the whole
thing from [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
without touching Dither.

## The four minutes

1. Open the [Google Cloud console](https://console.cloud.google.com/) and
   create a project, or pick one you already have.

2. **APIs & Services → Library → Google Calendar API → Enable.** Nothing works
   until this is on, and the failure it produces otherwise names the project
   rather than the API.

3. **APIs & Services → OAuth consent screen.** Choose **External** unless you
   are on a Workspace domain and only ever linking accounts on it, in which
   case **Internal** skips the rest of this step. Fill in an app name and your
   own email. Add the scope
   `https://www.googleapis.com/auth/calendar.readonly`. Then, under **Audience**,
   add the Google accounts you intend to link as **test users**.

   Leaving the app in "Testing" is the right thing to do. A test user's refresh
   token expires after seven days, so if this is a panel you want to leave
   running, press **Publish app** — an unverified app in production still works
   for `calendar.readonly`; the consent screen simply shows an "unverified"
   warning that you click past. Verification is only needed to offer the app to
   strangers, which you are not doing.

4. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   type **Web application**.

   Under *Authorised redirect URIs*, add the URI shown on Dither's Connections
   page. It is your server's address followed by
   `/api/connections/google/callback` — for example
   `http://localhost:3000/api/connections/google/callback`. It has to match
   character for character; a trailing slash or the wrong scheme is
   `redirect_uri_mismatch`.

5. Copy the **Client ID** and **Client secret** into **Connections → Google
   Calendar** in Dither, press *Save and continue*, then *Sign in to Google
   Calendar* and pick the account.

The card then shows the address of the account it linked. Every calendar
widget and every calendar trigger on every screen uses it.

## Behind a proxy or a tunnel

The redirect URI has to be the address a *browser* reaches Dither at, not the
address the container listens on. Dither works it out from `X-Forwarded-Proto`
and `X-Forwarded-Host`, and if your proxy does not set those, set `API_URI` —
the same variable that fixes up the URLs handed to devices:

```
API_URI=https://dither.example.com
```

Whatever the Connections page displays is what Dither will send, so register
that.

### In local development

`make up` writes `API_URI` into `web/.env.local`, keeping the host from the
root `.env` and changing only the port — because a device on the wall cannot
reach `localhost`. That is right for devices and wrong for this handshake:
Google accepts a plain-HTTP redirect URI **only** for `http://localhost` and
`http://127.0.0.1`. A LAN address like `http://192.168.1.27:3005/...` cannot
be registered at all, so the sign-in fails before it starts.

While you are linking an account on a dev server, point `API_URI` at loopback
on this worktree's port:

```
# web/.env.local, after `make up` — `make url` prints the port
API_URI=http://localhost:3005
```

`make up` rewrites that key, so set it after running it. Devices will follow
the same address, which on a dev box is usually what you want anyway.

## What it reads

One request per refresh, per calendar being shown, at the extension's ten
minute interval. `events.list` on the chosen calendar between now and the
widget's look-ahead, with recurring events already expanded into occurrences.

- Meetings already running are included — the one you are in is the most
  relevant thing on a panel — and count as starting "now" rather than as
  overdue.
- All-day entries are kept off the timeline, because a thing with no start
  time cannot be placed on one. They are counted, and the full-size design
  names them when there is nothing timed.
- Declined events are dropped unless the widget says otherwise.
- A video link pasted into the location box becomes the name of the service,
  because eighty characters of URL and a meeting password is not something to
  put on a wall.

## When it stops working

Everything shows up as the widget's own error, on the widget, with the last
good answer still on screen.

| What it says | What happened |
| --- | --- |
| *Finish signing in to Google Calendar* | The client ID and secret are stored but nobody has consented yet. |
| *Google refused the stored authorisation* | The grant was revoked, the client secret was rotated, or a test-user token aged out after seven days. Unlink and connect again. |
| *That calendar is not on the linked Google account* | A widget names a calendar the account can no longer see — it was unshared, or a different account is linked now. |
| *Google did not return a refresh token* | Google issues one per grant. Remove Dither at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) and connect again. |
