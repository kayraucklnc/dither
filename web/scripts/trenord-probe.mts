import { board } from "../src/lib/transit/board";

/** The real thing, against the real endpoint. */
const settings = {
  country: "it",
  city: "milan",
  provider: "trenord",
  origin: "Milano Cadorna",
  destination: "Saronno",
  limit: 5,
  lead_time: 0,
};

try {
  const result = (await board(settings)) as { transit: Record<string, unknown> };
  const transit = result.transit;
  const departures = transit.departures as Record<string, unknown>[];

  console.log(`${transit.origin} -> ${transit.destination}  (queried ${transit.queried_at}, mocked=${transit.mocked})`);
  console.log(`${departures.length} departures:\n`);

  for (const one of departures) {
    console.log(
      `  ${String(one.line).padEnd(5)} ${one.expected}` +
        `${one.delayed ? ` (+${one.delay})` : ""}`.padEnd(8) +
        ` plat ${String(one.platform || "-").padEnd(3)}` +
        ` in ${String(one.minutes_until).padStart(3)} min` +
        `  ${one.direction}` +
        `  [${one.status}]`,
    );
  }

  const alerts = transit.alerts as Record<string, unknown>[];
  if (alerts.length) console.log(`\nalerts: ${alerts.map((a) => a.title).join(" | ")}`);
} catch (error) {
  console.log("FAILED:", error instanceof Error ? error.message : error);
}
