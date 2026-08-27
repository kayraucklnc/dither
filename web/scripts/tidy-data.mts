import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { decisionNodes, devices, notices, triggers } from "../src/lib/db/schema";
import { reachableFrom } from "../src/lib/flow/graph";

/**
 * Tidy up what earlier bugs left behind.
 *
 * Two messes, both mine. Adding a source used to fail silently, which invited
 * a second click and left identical rows. And exercising the canvas from a
 * script left unreachable nodes on a real device - one of which took the root.
 *
 * Safe to run more than once: it only removes duplicates that are byte-identical
 * to a survivor, and only nodes that are both unreachable and untouched.
 */
const dryRun = !process.argv.includes("--commit");
const say = (line: string) => console.log(line);

say(dryRun ? "Dry run. Pass --commit to apply.\n" : "Applying.\n");

/* -- identical sources ------------------------------------------------------ */

const rewriteSource = (condition: unknown, from: string, to: string): unknown => {
  if (!condition || typeof condition !== "object") return condition;

  const node = condition as Record<string, unknown>;
  if (Array.isArray(node.conditions)) {
    return { ...node, conditions: node.conditions.map((child) => rewriteSource(child, from, to)) };
  }
  return node.sourceId === from ? { ...node, sourceId: to } : node;
};

for (const device of await db.select().from(devices)) {
  const rows = await db.select().from(triggers).where(eq(triggers.deviceId, device.id));
  const seen = new Map<string, number>();

  for (const row of rows.sort((a, b) => a.id - b.id)) {
    const key = `${row.extension}|${JSON.stringify(row.settings)}`;
    const survivor = seen.get(key);

    if (survivor === undefined) {
      seen.set(key, row.id);
      continue;
    }

    say(`  ${device.name}: source ${row.id} "${row.label}" is identical to ${survivor}`);
    if (dryRun) continue;

    // Anything reading from the duplicate is repointed, never orphaned.
    for (const node of await db.select().from(decisionNodes).where(eq(decisionNodes.deviceId, device.id))) {
      const next = rewriteSource(node.condition, String(row.id), String(survivor));
      if (JSON.stringify(next) !== JSON.stringify(node.condition)) {
        await db.update(decisionNodes)
          .set({ condition: next as Record<string, unknown> })
          .where(eq(decisionNodes.id, node.id));
      }
    }

    for (const notice of await db.select().from(notices).where(eq(notices.deviceId, device.id))) {
      const next = rewriteSource(notice.condition, String(row.id), String(survivor));
      if (JSON.stringify(next) !== JSON.stringify(notice.condition)) {
        await db.update(notices)
          .set({ condition: next as Record<string, unknown> })
          .where(eq(notices.id, notice.id));
      }
    }

    await db.delete(triggers).where(eq(triggers.id, row.id));
  }
}

/* -- nodes nothing points at ------------------------------------------------ */

for (const device of await db.select().from(devices)) {
  const rows = await db.select().from(decisionNodes).where(eq(decisionNodes.deviceId, device.id));
  if (!rows.length) continue;

  // A root with a placeholder check above the real tree is the signature of a
  // stray click: it is a check nobody wrote, sitting on top of one somebody did.
  // Unwrap every placeholder in a row: a stray click can land on top of the
  // previous stray click, and stopping after one leaves the second in place.
  let root = device.rootNodeId;

  for (let guard = 0; guard < 16; guard += 1) {
    const node = rows.find((candidate) => candidate.id === root);
    if (node?.kind !== "question" || node.label !== "Check") break;

    const below = rows.find((candidate) => candidate.id === node.noNodeId);
    if (!below) break;

    root = below.id;
  }

  if (root !== device.rootNodeId) {
    const restored = rows.find((node) => node.id === root);
    say(`  ${device.name}: root was an untouched "Check"; restoring "${restored?.label}"`);
    if (!dryRun) await db.update(devices).set({ rootNodeId: root }).where(eq(devices.id, device.id));
  }

  const live = reachableFrom(rows, root);

  for (const node of rows) {
    if (live.has(node.id)) continue;
    // Only ever the untouched placeholders. Anything renamed is somebody's work.
    if (node.label !== "Check" && node.label !== "New screen") {
      say(`  ${device.name}: node ${node.id} "${node.label}" is unreachable — left alone`);
      continue;
    }

    say(`  ${device.name}: removing unreachable "${node.label}" (${node.id})`);
    if (!dryRun) await db.delete(decisionNodes).where(eq(decisionNodes.id, node.id));
  }
}

say(dryRun ? "\nNothing changed." : "\nDone.");
process.exit(0);
