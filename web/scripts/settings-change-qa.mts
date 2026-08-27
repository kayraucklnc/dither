import { scratch } from "./scratch.mts";

/**
 * Changing a setting has to change the picture.
 *
 * This was broken for transit in a way nothing caught: the provider returned
 * the manifest's sample whatever it was asked, so From and To were decoration.
 */
const base = "http://localhost:3000";
const { screenId } = await scratch();

const load = async () => (await fetch(`${base}/api/screens-widgets?screenId=${screenId}`)).json();
const render = async () =>
  (await fetch(`${base}/api/preview/screen/${screenId}`)).arrayBuffer().then((b) => b.byteLength);

const { widgets } = await load();
const transit = widgets.find((w: { extension: string }) => w.extension === "public_transport");
if (!transit) throw new Error("The scratch screen has no transit widget.");

const save = async (settings: Record<string, unknown>) => {
  await fetch(`${base}/api/screens/${screenId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      widgets: widgets.map((w: { id: number }) =>
        w.id === transit.id ? { ...transit, settings } : w,
      ),
    }),
  });

  await fetch(`${base}/api/widgets/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ widgetIds: [transit.id] }),
  });
};

await save({ ...transit.settings, origin: "Milano Cadorna", destination: "Saronno" });
const before = await render();

await save({ ...transit.settings, origin: "Milano Centrale", destination: "Bergamo" });
const after = await render();

console.log(`render with Cadorna→Saronno: ${before}b, with Centrale→Bergamo: ${after}b`);
console.log(before === after ? "!! the settings changed nothing" : "ok: the picture followed the settings");

// Put it back.
await save(transit.settings);
