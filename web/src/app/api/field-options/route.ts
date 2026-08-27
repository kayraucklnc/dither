import { NextResponse } from "next/server";
import { z } from "zod";

import { capabilities, source } from "@/lib/fields/sources";

/**
 * Choices for a settings field, and what the current settings can do.
 *
 * One endpoint rather than one per extension: a field names a source and the
 * form asks for it, so a new source is a registry entry and a manifest line.
 */
const body = z.object({
  /** Option sources to resolve, by id. */
  sources: z.array(z.string()).default([]),
  /** Capability sources to resolve, by id. */
  capabilities: z.array(z.string()).default([]),
  settings: z.record(z.string(), z.unknown()).default({}),
  /** For a searchable source. */
  query: z.string().default(""),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const { sources, settings, query } = parsed.data;
  const options: Record<string, unknown> = {};

  await Promise.all(
    sources.map(async (id) => {
      const found = source(id);
      if (!found) return;

      try {
        options[id] = await found.list(settings, query);
      } catch (error) {
        // A registry that is down should leave the field usable, not blank the
        // form: the value already chosen still works.
        options[id] = { error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );

  return NextResponse.json({
    options,
    can: parsed.data.capabilities.flatMap((id) => capabilities(id, settings)),
  });
}
