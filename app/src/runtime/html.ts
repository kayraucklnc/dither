// A web page as text: docs/format.md "Web pages". Byte by byte, exactly as
// the firmware reads it while the page streams in.

export const HTML_TEXT_BYTES = 1024;
export const HTML_TITLE_BYTES = 256;

const RAW = new Set(["script", "style", "noscript", "template", "svg"]);
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "figcaption", "figure", "footer",
  "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section",
  "table", "tr", "ul",
]);
const CELL = new Set(["td", "th"]);
const NAMED: Record<string, number> = { amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27 };
const MAX_NAME = 16;
const MAX_ENTITY = 10;

const isSpace = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c;
const isAlpha = (c: number) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;
const isNameChar = (c: number) => isAlpha(c) || isDigit(c) || c === 0x2d || c === 0x3a;
const lower = (c: number) => (c >= 0x41 && c <= 0x5a ? c + 0x20 : c);

/** Collapsed text, kept to `limit` bytes plus one so the cut can find a character boundary. */
class Collector {
  private bytes: number[] = [];
  private space = false;
  constructor(private readonly limit: number) {}

  char(b: number): void {
    if (this.space && this.bytes.length > 0 && this.bytes[this.bytes.length - 1] !== 0x0a) this.push(0x20);
    this.space = false;
    this.push(b);
  }

  whitespace(): void {
    this.space = true;
  }

  lineBreak(): void {
    this.space = false;
    if (this.bytes.length > 0 && this.bytes[this.bytes.length - 1] !== 0x0a) this.push(0x0a);
  }

  private push(b: number): void {
    if (this.bytes.length <= this.limit) this.bytes.push(b);
  }

  text(): string {
    let end = this.bytes.length;
    if (end > this.limit) {
      end = this.limit;
      while (end > 0 && (this.bytes[end] & 0xc0) === 0x80) end--;
    }
    while (end > 0 && this.bytes[end - 1] === 0x0a) end--;
    return new TextDecoder().decode(new Uint8Array(this.bytes.slice(0, end)));
  }
}

function utf8(cp: number): number[] {
  if (cp < 0x80) return [cp];
  if (cp < 0x800) return [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)];
  if (cp < 0x10000) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
}

/** What an entity's name (between `&` and `;`) stands for: a codepoint, "space", or null to keep it as written. */
function entity(name: string): number | "space" | null {
  if (name === "nbsp") return "space";
  if (Object.hasOwn(NAMED, name)) return NAMED[name];
  const m = /^#(?:([0-9]+)|[xX]([0-9a-fA-F]+))$/.exec(name);
  if (!m) return null;
  const cp = m[1] !== undefined ? Number(m[1]) : parseInt(m[2], 16);
  return cp >= 1 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? cp : null;
}

type State = "text" | "open" | "name" | "attrs" | "endName" | "endRest" | "bang" | "bangDash" | "comment" | "decl" | "entity" | "raw";

export function htmlToText(input: Uint8Array): { text: string; title: string } {
  const body = new Collector(HTML_TEXT_BYTES);
  const title = new Collector(HTML_TITLE_BYTES);
  let inTitle = false;
  let state = "text" as State; // "as": the helpers below change it, which narrowing cannot see
  let name = "";
  let quote = 0;
  let afterEq = false;
  let dashes = 0;
  let ent = "";
  let raw = "";
  let rawMatch = 0;

  const out = () => (inTitle ? title : body);
  const emit = (b: number) => out().char(b);
  const emitAll = (s: string) => {
    for (const b of new TextEncoder().encode(s)) emit(b);
  };
  const startTag = (tag: string) => {
    if (RAW.has(tag)) {
      raw = `</${tag}`;
      rawMatch = 0;
      state = "raw";
      return;
    }
    state = "text";
    if (tag === "title") inTitle = true;
    else if (CELL.has(tag)) out().whitespace();
    else if (BLOCK.has(tag)) {
      out().lineBreak();
      if (tag === "li") {
        emit(0x2d);
        out().whitespace();
      }
    }
  };
  const endTag = (tag: string) => {
    state = "text";
    if (tag === "title") inTitle = false;
    else if (CELL.has(tag)) out().whitespace();
    else if (BLOCK.has(tag)) out().lineBreak();
  };
  const text = (c: number) => {
    if (c === 0x3c) state = "open";
    else if (c === 0x26) {
      ent = "";
      state = "entity";
    } else if (isSpace(c)) out().whitespace();
    else emit(c);
  };

  for (const c of input) {
    switch (state) {
      case "text":
        text(c);
        break;
      case "open":
        if (c === 0x21) state = "bang";
        else if (c === 0x3f) state = "decl";
        else if (c === 0x2f) {
          name = "";
          state = "endName";
        } else if (isAlpha(c)) {
          name = String.fromCharCode(lower(c));
          state = "name";
        } else {
          state = "text";
          emit(0x3c);
          text(c);
        }
        break;
      case "name":
        if (isNameChar(c)) {
          if (name.length < MAX_NAME) name += String.fromCharCode(lower(c));
        } else if (c === 0x3e) startTag(name);
        else {
          quote = 0;
          afterEq = false;
          state = "attrs";
        }
        break;
      case "attrs":
        if (quote) {
          if (c === quote) quote = 0;
        } else if (c === 0x3e) startTag(name);
        else if ((c === 0x22 || c === 0x27) && afterEq) quote = c;
        else if (!isSpace(c)) afterEq = c === 0x3d;
        break;
      case "endName":
        if (isNameChar(c)) {
          if (name.length < MAX_NAME) name += String.fromCharCode(lower(c));
        } else if (c === 0x3e) endTag(name);
        else state = "endRest";
        break;
      case "endRest":
        if (c === 0x3e) endTag(name);
        break;
      case "bang":
        state = c === 0x2d ? "bangDash" : c === 0x3e ? "text" : "decl";
        break;
      case "bangDash":
        if (c === 0x2d) {
          dashes = 0;
          state = "comment";
        } else state = c === 0x3e ? "text" : "decl";
        break;
      case "comment":
        if (c === 0x2d) dashes++;
        else if (c === 0x3e && dashes >= 2) state = "text";
        else dashes = 0;
        break;
      case "decl":
        if (c === 0x3e) state = "text";
        break;
      case "entity":
        if (c === 0x3b) {
          const e = entity(ent);
          state = "text";
          if (e === "space") out().whitespace();
          else if (e === null) emitAll(`&${ent};`);
          else for (const b of utf8(e)) emit(b);
        } else if ((isAlpha(c) || isDigit(c) || c === 0x23) && ent.length < MAX_ENTITY) {
          ent += String.fromCharCode(c);
        } else {
          state = "text";
          emitAll(`&${ent}`);
          text(c);
        }
        break;
      case "raw":
        if (lower(c) === raw.charCodeAt(rawMatch)) {
          rawMatch++;
          if (rawMatch === raw.length) {
            name = raw.slice(2);
            state = "endRest";
          }
        } else rawMatch = c === 0x3c ? 1 : 0;
        break;
    }
  }
  if (state === "entity") emitAll(`&${ent}`);
  else if (state === "open") emit(0x3c);
  return { text: body.text(), title: title.text() };
}
