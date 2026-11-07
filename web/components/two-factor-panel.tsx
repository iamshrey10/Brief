"use client";

import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { disableTwoFactor, enableTwoFactor, groupSecret, makeNewRecoveryCodes, startSetup, type Setup } from "@/lib/two-factor";

type Stage = "off" | "setting up" | "codes" | "on" | "turning off" | "new codes";

const INPUT = "h-10 w-44 rounded-lg border border-input bg-background px-3 font-mono text-lg tracking-[0.3em] outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function QrCode({ uri }: { uri: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(uri, { margin: 1, width: 192 }).then((url) => live && setSrc(url), () => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [uri]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={192} height={192} alt="QR code for your authenticator app" className="rounded-lg border border-border bg-white p-1" /> : null;
}

/**
 * Two step verification with an authenticator app. Turning it on shows a QR code, asks for the first code to prove it works, and then shows
 * ten recovery codes once. Turning it off needs a code too. Nothing is switched on until the first code is proved.
 */
export function TwoFactorPanel({ initialEnabled, initialCodesLeft }: { initialEnabled: boolean; initialCodesLeft: number }) {
  const [stage, setStage] = useState<Stage>(initialEnabled ? "on" : "off");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [codesLeft, setCodesLeft] = useState(initialCodesLeft);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Whether the codes on show are a new set that replaced the old ones, which changes what is said above them.
  const [replaced, setReplaced] = useState(false);

  async function begin() {
    setBusy(true);
    setError(null);
    const outcome = await startSetup();
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    setSetup(outcome.result);
    setCode("");
    setStage("setting up");
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const outcome = await enableTwoFactor(code);
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    setCodes(outcome.result);
    setCodesLeft(outcome.result.length);
    setSetup(null);
    setCode("");
    setReplaced(false);
    setStage("codes");
  }

  async function makeNew(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const outcome = await makeNewRecoveryCodes(code);
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    setCodes(outcome.result);
    setCodesLeft(outcome.result.length);
    setCode("");
    setReplaced(true);
    setStage("codes");
  }

  async function turnOff(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const outcome = await disableTwoFactor(code);
    setBusy(false);
    if (!outcome.ok) return setError(outcome.message);
    setCode("");
    setCodesLeft(0);
    setStage("off");
  }

  return (
    <section id="two-step" aria-labelledby="two-step-heading" className="scroll-mt-6 rounded-2xl border border-border bg-card p-6">
      <h2 id="two-step-heading" className="text-lg font-semibold tracking-tight text-foreground">
        Two step verification
      </h2>

      {stage === "off" && (
        <>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Add a second lock to your account. After you sign in with Google, Brief asks for a 6 digit code from an authenticator app on your phone,
            such as Google Authenticator. It is asked on a new browser, and again every 30 days if you choose to remember one.
          </p>
          <p className="mt-3 text-sm font-medium text-foreground">Status: off</p>
          <div className="mt-3">
            <Button type="button" size="lg" disabled={busy} onClick={begin}>
              {busy ? "Starting..." : "Turn on"}
            </Button>
          </div>
        </>
      )}

      {stage === "setting up" && setup && (
        <div className="mt-3 flex flex-col gap-4">
          <ol className="flex max-w-xl list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
            <li>Open an authenticator app on your phone and add an account by scanning this code.</li>
            <li>Or type this key in by hand: <span className="font-mono font-semibold text-foreground">{groupSecret(setup.secret)}</span></li>
            <li>Enter the 6 digit code the app shows to finish.</li>
          </ol>
          <QrCode uri={setup.otpauth_uri} />
          <form onSubmit={confirm} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              6 digit code
              <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className={INPUT} />
            </label>
            <Button type="submit" size="lg" disabled={busy || code.length !== 6}>
              {busy ? "Checking..." : "Turn on"}
            </Button>
            <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => { setStage("off"); setSetup(null); setError(null); }}>
              Cancel
            </Button>
          </form>
        </div>
      )}

      {stage === "codes" && (
        <div className="mt-3 flex flex-col gap-3">
          <p role="status" className="text-sm font-medium text-foreground">
            {replaced ? "Here are your new recovery codes. The old ones no longer work." : "Two step verification is on."}
          </p>
          <p className="max-w-xl text-sm text-muted-foreground">
            Save these recovery codes somewhere safe. If you lose your phone, each one signs you in once. They are shown only now.
          </p>
          <ul aria-label="Recovery codes" className="grid max-w-md grid-cols-2 gap-2 font-mono text-sm text-foreground">
            {codes.map((recovery) => (
              <li key={recovery} className="rounded-md bg-muted px-3 py-1.5">
                {recovery}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(codes.join("\n"));
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy codes"}
            </Button>
            <Button type="button" size="sm" onClick={() => { setCodes([]); setCopied(false); setStage("on"); }}>
              I have saved them
            </Button>
          </div>
        </div>
      )}

      {stage === "on" && (
        <>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">Brief asks for a code from your authenticator app when you sign in on a browser it does not remember.</p>
          <p className="mt-3 text-sm font-medium text-foreground">Status: on · {codesLeft} recovery {codesLeft === 1 ? "code" : "codes"} left</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => { setError(null); setCode(""); setStage("new codes"); }}>
              Make new recovery codes
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={() => { setError(null); setCode(""); setStage("turning off"); }}>
              Turn off
            </Button>
          </div>
        </>
      )}

      {stage === "new codes" && (
        <form onSubmit={makeNew} className="mt-3 flex flex-col gap-3">
          <p className="max-w-xl text-sm text-muted-foreground">
            This replaces all ten recovery codes. The old ones stop working at once, even the ones you have not used, so use this if you think a copy
            has leaked or you have lost the list.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              Code, or a recovery code, to make new ones
              <input value={code} onChange={(event) => setCode(event.target.value)} maxLength={32} autoComplete="one-time-code" className={INPUT.replace("w-44", "w-56")} />
            </label>
            <Button type="submit" size="lg" disabled={busy || code.trim().length === 0}>
              {busy ? "Checking..." : "Make new codes"}
            </Button>
            <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => { setStage("on"); setError(null); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {stage === "turning off" && (
        <form onSubmit={turnOff} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
            Code, or a recovery code, to turn it off
            <input value={code} onChange={(event) => setCode(event.target.value)} maxLength={32} autoComplete="one-time-code" className={INPUT.replace("w-44", "w-56")} />
          </label>
          <Button type="submit" size="lg" disabled={busy || code.trim().length === 0}>
            {busy ? "Checking..." : "Turn off"}
          </Button>
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => { setStage("on"); setError(null); }}>
            Cancel
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
