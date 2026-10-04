// Plug in, connect, flash. Firmware goes on only when the panel needs it;
// the screens always do. Afterwards the panel shows what the simulator showed.

import { useEffect, useRef, useState } from "react";
import { Cable, CheckCircle2, CircleAlert, Download, Usb } from "lucide-react";
import type { Compiled } from "@/compiler";
import { DeviceError, FirmwareError, PanelConnection, getBoard, loadFirmware, openMonitor, type Monitor, type PanelInfo } from "@/device";
import { parseProject, type Project } from "@/project/schema";
import { freshness } from "@/state/compile";
import { useProject } from "@/state/project-store";
import { gunzip } from "@/state/storage";
import { Button, Dialog, Note } from "../kit";

type Phase =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "ready"; info: PanelInfo; firmwareVersion: string | null; firmwareError: string | null }
  | { kind: "working"; label: string; fraction: number }
  | { kind: "done"; installedFirmware: boolean }
  | { kind: "error"; message: string };

const STAGE: Record<string, string> = {
  firmware: "Installing the Dither firmware",
  settings: "Writing your screens and settings",
  restarting: "Restarting the panel",
};

// Far beyond any real project; stops a corrupt or hostile panel from filling memory.
const MAX_PANEL_PROJECT = 4 * 1024 * 1024;

async function unpackPanelProject(gz: Uint8Array): Promise<Project> {
  let json: Uint8Array;
  try {
    json = await gunzip(gz, MAX_PANEL_PROJECT);
  } catch (e) {
    if (e instanceof RangeError) throw new Error("The project saved on this panel is larger than 4 MB unpacked, so it is not a Dither project. It was left alone.");
    throw e;
  }
  return parseProject(JSON.parse(new TextDecoder().decode(json)));
}

async function firmwareFor(boardId: string): Promise<{ firmwareVersion: string | null; firmwareError: string | null }> {
  try {
    return { firmwareVersion: (await loadFirmware(boardId)).version, firmwareError: null };
  } catch (e) {
    return { firmwareVersion: null, firmwareError: message(e) };
  }
}

function message(e: unknown): string {
  if (e instanceof DeviceError || e instanceof FirmwareError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

function checklist(project: Project, compiled: Compiled | null): string[] {
  const out: string[] = [];
  if (!project.wifi.some((n) => n.ssid.trim())) out.push("No Wi-Fi network is set, so the panel cannot fetch data or set its clock. Add one under Panel.");
  if (compiled?.problems.length) out.push(...compiled.problems.map((p) => p.message));
  const needsData = compiled?.sources.length === 0 && project.screens.some((s) => s.widgets.some((w) => w.type === "weather"));
  if (needsData) out.push("A weather widget has no place yet.");
  return out;
}

export function FlashDialog({ open, onClose, compiled, onFlashed }: {
  open: boolean; onClose: () => void; compiled: Compiled | null; onFlashed: () => void;
}) {
  const { project, replace } = useProject();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [forceFirmware, setForceFirmware] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const conn = useRef<PanelConnection | null>(null);
  const monitor = useRef<Monitor | null>(null);
  const monitorOpening = useRef(false);
  // Bumped on close: anything still running from before reports to nobody.
  const attempt = useRef(0);
  const board = getBoard(project.board);
  const compileState = freshness(project, compiled);
  const blocked = compileState.state === "compiling"
    ? "Waiting for your latest changes to compile."
    : compileState.state === "failed" ? `The project does not compile: ${compileState.error}` : null;

  const release = () => {
    const c = conn.current;
    conn.current = null;
    void c?.disconnect();
  };

  useEffect(() => {
    if (open) return;
    // Closing the dialog lets go of the port, whatever state it was in.
    attempt.current += 1;
    release();
    void monitor.current?.close();
    monitor.current = null;
    monitorOpening.current = false;
    setPhase({ kind: "idle" });
    setForceFirmware(false);
    setConfirmLoad(false);
    setLog([]);
  }, [open]);

  const connect = async () => {
    if (!board) return setPhase({ kind: "error", message: `Unknown display “${project.board}”.` });
    const a = attempt.current;
    release();
    setPhase({ kind: "connecting" });
    try {
      const c = await PanelConnection.connect(board);
      if (a !== attempt.current) return void c.disconnect();
      conn.current = c;
      const info = await c.info();
      const firmware = await firmwareFor(board.id);
      if (a !== attempt.current) return;
      setPhase({ kind: "ready", info, ...firmware });
    } catch (e) {
      if (a !== attempt.current) return;
      release();
      setPhase(e instanceof DeviceError && e.kind === "cancelled" ? { kind: "idle" } : { kind: "error", message: message(e) });
    }
  };

  const flash = async (needsFirmware: boolean) => {
    const c = conn.current;
    if (!c || !compiled || !board || blocked) return;
    const a = attempt.current;
    const show = (p: Phase) => a === attempt.current && setPhase(p);
    try {
      show({ kind: "working", label: "Preparing", fraction: 0 });
      const firmware = needsFirmware ? (await loadFirmware(board.id)).bytes : undefined;
      await c.flash({ firmware, blob: compiled.blob }, (p) => show({ kind: "working", label: STAGE[p.stage] ?? p.stage, fraction: p.fraction }));
      if (conn.current === c) conn.current = null;
      show({ kind: "done", installedFirmware: Boolean(firmware) });
      onFlashed();
    } catch (e) {
      if (a !== attempt.current) return;
      release();
      setPhase({ kind: "error", message: message(e) });
    }
  };

  const loadFromPanel = async () => {
    const c = conn.current;
    if (!c) return;
    const a = attempt.current;
    const show = (p: Phase) => a === attempt.current && setPhase(p);
    const label = "Reading the project saved on the panel";
    try {
      show({ kind: "working", label, fraction: 0 });
      const gz = await c.readProject((fraction) => show({ kind: "working", label, fraction }));
      if (!gz) throw new Error("This panel has no Dither project on it.");
      const p = await unpackPanelProject(gz);
      if (a !== attempt.current) return;
      replace(p);
      release();
      onClose();
    } catch (e) {
      if (a !== attempt.current) return;
      release();
      setPhase({ kind: "error", message: message(e) });
    }
  };

  const watch = async () => {
    if (monitor.current || monitorOpening.current) return;
    monitorOpening.current = true;
    const a = attempt.current;
    try {
      const m = await openMonitor(undefined, { onLine: (line) => a === attempt.current && setLog((l) => [...l.slice(-200), line]) });
      if (a !== attempt.current) return void m.close();
      monitor.current = m;
    } catch (e) {
      if (a === attempt.current) setLog((l) => [...l, `Could not open the panel's log: ${message(e)}`]);
    } finally {
      if (a === attempt.current) monitorOpening.current = false;
    }
  };

  const issues = checklist(project, compiled);
  const size = compiled?.blob.length ?? 0;

  return (
    <Dialog open={open} onClose={onClose} title="Flash to panel" dismissible={phase.kind !== "working"}>
      <div className="space-y-5">
        {!PanelConnection.isSupported() && (
          <Note tone="warn">Flashing needs Chrome, Edge or Opera on a computer — this browser cannot talk to USB devices.</Note>
        )}

        {phase.kind === "idle" && (
          <>
            <div className="flex gap-4 items-start">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Cable size={22} /></span>
              <div className="space-y-1">
                <p className="font-medium">{board?.howToConnect ?? "Plug the panel into this computer."}</p>
                <p className="text-[13px] text-muted">Then choose it in the list the browser shows. {board?.troubleshoot}</p>
              </div>
            </div>
            {issues.length > 0 && (
              <div className="space-y-1.5">{issues.map((i) => <Note key={i} tone="warn">{i}</Note>)}</div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted">{(size / 1024).toFixed(0)} KB of screens and fonts</span>
              <Button variant="primary" size="lg" icon={<Usb size={17} />} onClick={connect} disabled={!PanelConnection.isSupported() || !compiled}>
                Connect
              </Button>
            </div>
          </>
        )}

        {phase.kind === "connecting" && <p className="text-muted">Waiting for the panel… pick it in the browser's list.</p>}

        {phase.kind === "ready" && (() => {
          const { info, firmwareVersion, firmwareError } = phase;
          const current = info.isDither ? info.firmware?.version ?? "unknown" : null;
          const outdated = current !== null && firmwareVersion !== null && current !== firmwareVersion;
          const needsFirmware = !info.isDither || outdated || forceFirmware;
          const savedProject = info.blob && info.blob.project[1] > 0;
          return (
            <>
              <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-[13px] rounded-lg border border-line bg-raised p-3.5">
                <dt className="text-muted">Board</dt><dd>{info.chip}, {info.flashSize ?? "unknown"} flash</dd>
                <dt className="text-muted">Address</dt><dd className="tabular-nums">{info.mac}</dd>
                <dt className="text-muted">Firmware</dt>
                <dd>{info.isDither ? `Dither ${current}${outdated ? ` — ${firmwareVersion} is available` : ""}` : "Not Dither yet — it will be installed"}</dd>
                <dt className="text-muted">Saved project</dt>
                <dd>{info.blob ? `Flashed ${new Date(info.blob.builtAt * 1000).toLocaleString()}` : "None"}</dd>
              </dl>
              {needsFirmware && firmwareError && <Note tone="warn">{firmwareError}</Note>}
              {info.isDither && !outdated && (
                <label className="flex items-center gap-2 text-[13px] text-muted">
                  <input type="checkbox" checked={forceFirmware} onChange={(e) => setForceFirmware(e.target.checked)} className="accent-[var(--accent)]" />
                  Reinstall the firmware too
                </label>
              )}
              {blocked && <Note tone="warn">{blocked}</Note>}
              {confirmLoad ? (
                <Note>
                  <div className="space-y-2">
                    <p>Replace what is in the editor with the project saved on this panel? You can undo this.</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={loadFromPanel}>Replace</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmLoad(false)}>Keep mine</Button>
                    </div>
                  </div>
                </Note>
              ) : (
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  {savedProject ? (
                    <Button variant="ghost" icon={<Download size={15} />} onClick={() => setConfirmLoad(true)}>Load the panel's project</Button>
                  ) : <span />}
                  <Button variant="primary" size="lg" onClick={() => flash(needsFirmware)} disabled={(needsFirmware && firmwareError !== null) || blocked !== null}>
                    {needsFirmware ? "Install Dither and flash" : "Flash"}
                  </Button>
                </div>
              )}
            </>
          );
        })()}

        {phase.kind === "working" && (
          <div className="space-y-2">
            <p className="font-medium">{phase.label}…</p>
            <div className="h-2 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={Math.round(phase.fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(phase.fraction * 100)}%` }} />
            </div>
            <p className="text-[12px] text-muted">Keep the cable in until this finishes.</p>
          </div>
        )}

        {phase.kind === "done" && (
          <div className="space-y-4">
            <div className="flex gap-3 items-start">
              <CheckCircle2 className="text-accent shrink-0" size={22} />
              <div>
                <p className="font-medium">Flashed{phase.installedFirmware ? ", with fresh firmware" : ""}.</p>
                <p className="text-[13px] text-muted">The panel is restarting. It joins Wi-Fi, fetches what it needs and redraws in under a minute.</p>
              </div>
            </div>
            {log.length === 0 ? (
              <Button size="sm" variant="ghost" onClick={watch}>Watch what the panel is doing</Button>
            ) : (
              <pre className="max-h-48 overflow-auto rounded-md bg-bezel p-3 text-[12px] leading-relaxed text-paper">{log.join("\n")}</pre>
            )}
          </div>
        )}

        {phase.kind === "error" && (
          <div className="space-y-3">
            <div className="flex gap-3 items-start">
              <CircleAlert className="text-danger shrink-0" size={22} />
              <p>{phase.message}</p>
            </div>
            <Button onClick={() => { release(); setPhase({ kind: "idle" }); }}>Try again</Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
