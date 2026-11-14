"use client";

import { Play, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/** Tells the site, with nobody identified, that this happened, so the owner can see how often the video is opened and finished. It never gets in the way. */
function count(event: "demo_opened" | "demo_finished") {
  void fetch(`/api/events/${event}`, { method: "POST", keepalive: true }).catch(() => {});
}

/**
 * The button on the first screen that plays a walk through of Brief of just under two minutes: signing in, the tour, adding photos, the key terms, asking a question, sharing, and the account.
 * It opens in a window over the page, with captions, and the video is only fetched once it is opened. Escape, the Close button or a click
 * outside it puts it away, and it stops playing when it goes.
 */
export function DemoVideoButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // Whether the end of this showing has been counted, so a video that is replayed from the controls counts once.
  const finished = useRef(false);

  function show() {
    setOpen(true);
    finished.current = false;
    count("demo_opened");
    dialog.current?.showModal();
  }

  return (
    <>
      <Button type="button" variant="outline" size="lg" className="h-12 px-6 text-base max-sm:w-full sm:text-lg" onClick={show}>
        <Play aria-hidden="true" className="size-4" />
        Watch how it works
      </Button>
      <dialog
        ref={dialog}
        aria-label="Brief in under 2 minutes"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        className="m-auto w-[min(94vw,1040px)] max-w-none rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-2xl backdrop:bg-black/70"
      >
        <div className="flex items-center justify-between gap-3 px-2 pb-3">
          <p className="text-sm font-medium text-foreground">Brief in under 2 minutes</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => dialog.current?.close()}>
            <X aria-hidden="true" className="size-4" />
            Close
          </Button>
        </div>
        {open && (
          <video className="demo-video w-full rounded-lg bg-black" controls autoPlay playsInline preload="metadata"
            poster="/demo/brief-demo-poster.jpg"
            onEnded={() => {
              if (finished.current) return;
              finished.current = true;
              count("demo_finished");
            }}
          >
            <source src="/demo/brief-demo.mp4" type="video/mp4" />
            <track kind="captions" src="/demo/brief-demo.vtt" srcLang="en" label="English" />
            Your browser can&apos;t play this video.
          </video>
        )}
      </dialog>
    </>
  );
}
