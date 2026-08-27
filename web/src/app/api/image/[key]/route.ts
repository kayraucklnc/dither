import { NextResponse } from "next/server";

import { store } from "@/lib/storage";

/**
 * Rendered images, fetched by the device in a second request that carries no
 * headers at all. It cannot be authenticated, which is why the key is an
 * unguessable content hash rather than a screen id.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  if (!/^[a-f0-9]{16,64}\.png$/.test(key)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const bytes = await store().get(key);
  if (!bytes) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      // The key is the content hash, so this can never go stale.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
