import path from "node:path";
import { readdir, stat } from "node:fs/promises";

import Link from "next/link";
import { ArrowLeft, Cpu, Radio, Wifi } from "lucide-react";

import { Flasher, type FirmwareImage } from "@/components/flasher";
import { RedirectUri } from "@/components/redirect-uri";

export const dynamic = "force-dynamic";

/**
 * How a panel joins, which is not by being typed in here.
 *
 * There is no form on this page that creates a device, and adding one would be
 * a mistake. A device is identified by its MAC address; the MAC is known to
 * the panel and to nobody else, and the panel volunteers it the first time it
 * calls `/api/setup`. A row typed in by hand would be a row no panel ever
 * matches - it would sit on the devices page forever looking like hardware.
 *
 * So the two things this page can usefully do are the two things a person
 * actually has to do: point the board at this server, and get firmware onto it
 * if it has none.
 */

const DOWNLOADS = path.join(process.cwd(), "public", "downloads");

async function firmwareImages(): Promise<FirmwareImage[]> {
  try {
    const names = (await readdir(DOWNLOADS)).filter((name) => name.endsWith(".bin")).sort();

    return await Promise.all(
      names.map(async (name) => ({
        name,
        path: `/downloads/${name}`,
        bytes: (await stat(path.join(DOWNLOADS, name))).size,
      })),
    );
  } catch {
    // No directory is the ordinary case on a fresh checkout, not a fault.
    return [];
  }
}

export default async function AddDevicePage() {
  const images = await firmwareImages();

  /*
   * The address a *panel* has to reach, which is deliberately not the one the
   * browser is using. A phone on the sofa and a panel on the wall are on the
   * same network; the machine running `next dev` may be reachable at
   * `localhost` from itself and only at a LAN address from anything else. That
   * is what API_URI is for, and it is what the device is handed in every
   * `/api/setup` answer - so it is what has to be right.
   */
  const apiUri = process.env.API_URI ?? "";

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link
        href="/devices"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} />
        Devices
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Add a panel</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          You do not add a device here — it adds itself. A panel introduces itself by its MAC
          address the first time it wakes on your network, and appears on the devices page with a
          key and an empty tree. What you have to do is point it at this server, and put firmware on
          it if it has none.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Radio size={16} className="text-faint" />
          1. The address it has to reach
        </h2>
        <p className="mt-2 mb-3 text-[13px] leading-relaxed text-muted">
          This is what Dither hands every device in its setup answer, and what the firmware must be
          told. It is not the address in your browser bar: a panel on the wall cannot resolve{" "}
          <code className="font-mono text-ink">localhost</code>. Set{" "}
          <code className="font-mono text-ink">API_URI</code> in{" "}
          <code className="font-mono text-ink">web/.env.local</code> to change it.
        </p>

        {apiUri ? (
          <RedirectUri uri={apiUri} label="Server address — the panel needs exactly this" />
        ) : (
          <p className="rounded-lg border border-line bg-ground px-3 py-2.5 text-[12px] text-warn">
            <code className="font-mono">API_URI</code> is not set, so devices are handed whatever
            host their own request arrived on. That works until something proxies it.
          </p>
        )}

        <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-muted">
          <li className="flex gap-2">
            <Wifi size={14} className="mt-0.5 shrink-0 text-faint" />
            <span>
              A board with TRMNL firmware already on it raises its own Wi-Fi network on first boot.
              Join it, and its setup page takes both your Wi-Fi credentials and the server address
              above. Nothing has to be recompiled for this.
            </span>
          </li>
          <li className="flex gap-2">
            <Cpu size={14} className="mt-0.5 shrink-0 text-faint" />
            <span>
              Rebuilding the firmware to change this is not necessary and mostly not the answer. The
              address is a runtime preference — <code className="font-mono text-ink">api_url</code>{" "}
              in the board&apos;s own storage — and the{" "}
              <code className="font-mono text-ink">API_BASE_URL</code> compiled in is only what it
              falls back to when nothing has been set. One generic image per board is enough.
            </span>
          </li>
        </ul>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <Cpu size={16} className="text-faint" />
          2. Firmware, if the board has none
        </h2>
        <p className="mt-2 mb-3 text-[13px] leading-relaxed text-muted">
          Writes an image straight to an ESP32 over USB from this browser. Useful mostly for boards
          no vendor tool lists — a Waveshare driver board wired up on a desk is a panel this server
          is happy to serve and no upstream flasher has heard of.
        </p>

        <Flasher images={images} />

        <details className="mt-4 rounded-panel border border-line bg-surface px-5 py-3">
          <summary className="cursor-pointer text-[13px] font-medium text-muted transition-colors hover:text-ink">
            The board will not connect
          </summary>
          <ol className="mt-3 space-y-2 pl-4 text-[13px] leading-relaxed text-muted">
            <li className="list-decimal">
              Plug it in over USB <em>before</em> pressing the button, then pick its port from the
              browser&apos;s chooser.
            </li>
            <li className="list-decimal">
              If detection fails, hold <strong>BOOT</strong>, tap <strong>RST</strong>, release
              BOOT, and try again.
            </li>
            <li className="list-decimal">
              Close anything else holding the port — <code className="font-mono">pio device monitor</code>,{" "}
              <code className="font-mono">screen</code>, the Arduino IDE.
            </li>
            <li className="list-decimal">
              Still stuck? Drop to 115200. A long USB cable will not carry 921600.
            </li>
          </ol>
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            Images are read from <code className="font-mono">web/public/downloads/</code> and written
            at offset <code className="font-mono">0x0</code>, so they must be <em>merged</em> images —
            bootloader, partition table and application in one file — not a bare{" "}
            <code className="font-mono">firmware.bin</code>.
          </p>
        </details>
      </section>
    </div>
  );
}
