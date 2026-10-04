import { describe, expect, it } from "vitest";
import { createProject } from "@/project/starters";
import type { Project, Widget } from "@/project/schema";
import { gunzip, gzip, projectFile, pruneImages, withoutSecrets } from "./storage";

const base = createProject({ starter: "blank", timezone: "UTC", language: "en", units: "metric", place: null });

function withWidgets(widgets: Widget[], extra: Partial<Project> = {}): Project {
  return { ...base, ...extra, screens: [{ ...base.screens[0], widgets }] };
}

const widget = (id: string, type: string, settings: Record<string, unknown>): Widget =>
  ({ id, type, x: 0, y: 0, w: 2, h: 2, frame: "none", settings });

describe("withoutSecrets", () => {
  it("blanks Wi-Fi passwords and secret widget settings, and nothing else", () => {
    const p = withWidgets(
      [widget("a", "web-value", { url: "https://x.test", header: "Authorization", headerValue: "Bearer abc" }), widget("b", "text", { text: "hi" })],
      { wifi: [{ ssid: "Home", password: "hunter2" }] },
    );
    const out = withoutSecrets(p);
    expect(out.wifi).toEqual([{ ssid: "Home", password: "" }]);
    expect(out.screens[0].widgets[0].settings).toEqual({ url: "https://x.test", header: "Authorization", headerValue: "" });
    expect(out.screens[0].widgets[1]).toBe(p.screens[0].widgets[1]);
    expect(p.wifi[0].password).toBe("hunter2");
    expect(p.screens[0].widgets[0].settings.headerValue).toBe("Bearer abc");
  });

  it("drops linked accounts whole", () => {
    const linked = {
      ...base,
      accounts: { google: { clientId: "id", clientSecret: "s", refreshToken: "r", email: "me@x" }, stripe: { key: "rk_live_k", name: "" } },
    };
    expect(withoutSecrets(linked).accounts).toEqual({ google: null, stripe: null });
  });

  it("keeps secrets in the file only when asked", async () => {
    const p = withWidgets([widget("a", "web-value", { headerValue: "k" })], { wifi: [{ ssid: "Home", password: "pw" }] });
    const kept = JSON.parse(await projectFile(p, true).text()) as Project;
    const left = JSON.parse(await projectFile(p, false).text()) as Project;
    expect(kept.wifi[0].password).toBe("pw");
    expect(kept.screens[0].widgets[0].settings.headerValue).toBe("k");
    expect(left.wifi[0].password).toBe("");
    expect(left.screens[0].widgets[0].settings.headerValue).toBe("");
  });
});

describe("pruneImages", () => {
  it("drops pictures no widget uses", () => {
    const p = withWidgets([widget("a", "picture", { image: "img_1" })], { images: { img_1: "AAA", img_2: "BBB" } });
    expect(pruneImages(p).images).toEqual({ img_1: "AAA" });
    expect(p.images).toEqual({ img_1: "AAA", img_2: "BBB" });
  });

  it("returns the same project when every picture is used", () => {
    const p = withWidgets([widget("a", "picture", { image: "img_1" })], { images: { img_1: "AAA" } });
    expect(pruneImages(p)).toBe(p);
  });

  it("leaves the saved file without unused pictures", async () => {
    const p = withWidgets([], { images: { img_1: "AAA" } });
    expect((JSON.parse(await projectFile(p, true).text()) as Project).images).toEqual({});
  });
});

describe("gunzip", () => {
  it("round-trips", async () => {
    const bytes = new TextEncoder().encode("hello ".repeat(100));
    expect(await gunzip(await gzip(bytes))).toEqual(bytes);
  });

  it("stops once the output passes the limit", async () => {
    const packed = await gzip(new Uint8Array(200_000));
    await expect(gunzip(packed, 100_000)).rejects.toBeInstanceOf(RangeError);
    expect((await gunzip(packed, 200_000)).length).toBe(200_000);
  });
});
