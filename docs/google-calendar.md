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

## More than one Google account

Press **Add account** on the Google Calendar card and sign in again. The OAuth
client you registered is the installation's, not the account's, so it is
pasted once and every account afterwards is one button.

Each account appears on the card with its own **Sign out**. *Forget* removes
every account and the client credentials with them.

A widget's calendar selection carries the account as well as the calendar,
because "primary" is a calendar on both of them. If an account is signed out,
widgets naming its calendars say so rather than quietly showing somebody
else's — and a selection saved when there was only one account still means
that account.

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

## The address it uses, and why it is not `API_URI`

The redirect URI is the address a **browser** reaches Dither at. That is not
the address a device reaches it at, and only one of them is allowed here:
Google refuses a plain-HTTP redirect URI unless the host is `localhost` or
`127.0.0.1`. A LAN address cannot even be registered — the console answers

> Invalid Redirect: must end with a public top-level domain (such as .com or
> .org).

`API_URI` names the host a panel on the wall can reach, which on a dev box *is*
a LAN address. Devices do not do OAuth, so it takes no part in this decision.
Dither reads the browser's own view of the server instead: `X-Forwarded-Proto`
and `X-Forwarded-Host` first, because behind a reverse proxy the request's own
host is the proxy's internal one, then the host the browser did send.

So on a dev server, open the dashboard at **`http://localhost:<port>`** — `make
url` prints the port — and register exactly what the Connections page then
shows:

```
http://localhost:3001/api/connections/google/callback
```

Reaching the dashboard at the LAN address instead would advertise the LAN
address, which is the thing Google will not take.

### When nothing in the request is true

A reverse proxy that rewrites the host and sets no forwarded headers leaves
Dither nothing to go on. Name the public origin explicitly:

```
DITHER_OAUTH_ORIGIN=https://dither.example.com
```

It wins over everything else, and `make up` does not touch it. Whatever the
Connections page displays is what Dither will send, so register that.

## Choosing what a widget shows

**Which calendars.** Every calendar on every linked account is listed,
including ones other people have shared with you, and a widget can tick more
than one — across accounts, so a work meeting and a school pickup can sit on
one panel.
They are merged into a single list in time order, and each entry is marked with
where it came from — so "1:1 with Ana" appearing on both the work and the
family calendar is legible rather than baffling. Eight is the most one widget
will read; every calendar is a request.

Ticking the same two in a different order is the same question, so two widgets
configured alike still share one answer and one trip to Google.

If one of several feeds fails — a shared calendar somebody stopped sharing —
the rest still draw, and `calendar.unread` counts what was missed so a rule can
notice. Only when *every* feed fails does the widget report a fault.

**How far ahead.** The rest of today, today and tomorrow, the rest of this
week, the rest of this month, or a rolling number of hours. These are calendar
boundaries in the installation's own time zone, not durations: at 22:00 "the
rest of today" is two hours and "the next twelve" is most of tomorrow morning
as well, and only one of those is what somebody meant. Weeks end where the
locale says they do — Sunday night in London, Saturday night in Chicago.

A window that can leave today is also grouped day by day, which is what the
Agenda and Week designs draw.

**Which look.** Eight designs, overlapping on purpose, so most sizes offer
three or four to choose between: the full timeline, a day-grouped agenda, a
week of columns, one enormous next-thing, and the four band and column shapes.

## What it reads

One request per calendar per refresh, at the extension's ten minute interval.
`events.list` on each chosen calendar between now and the end of the window,
with recurring events already expanded into occurrences.

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
