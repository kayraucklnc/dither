import { scratch } from "./scratch.mts";

/**
 * A setting nobody reads is a setting that lies.
 *
 * The transit templates never looked at the heading, so typing one did
 * nothing - and there was no way to tell that from a slow save.
 */
const base = "http://localhost:3000";
const { screenId } = await scratch();

const { widgets } = await (await fetch(`${base}/api/screens-widgets?screenId=${screenId}`)).json();
const transit = widgets.find((w: { extension: string }) => w.extension === "public_transport");

const save = async (settings: Record<string, unknown>) => {
  await fetch(`${base}/api/screens/${screenId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      widgets: widgets.map((w: { id: number }) => (w.id === transit.id ? { ...transit, settings } : w)),
    }),
  });
};

const render = async () =>
  (await fetch(`${base}/api/preview/screen/${screenId}`)).arrayBuffer().then((b) => b.byteLength);

await save({ ...transit.settings, heading: "" });
const plain = await render();

await save({ ...transit.settings, heading: "Morning commute" });
const headed = await render();

console.log(`without a heading: ${plain}b, with one: ${headed}b`);
console.log(plain === headed ? "!! the heading changed nothing" : "ok: the heading reaches the panel");

await save(transit.settings);
