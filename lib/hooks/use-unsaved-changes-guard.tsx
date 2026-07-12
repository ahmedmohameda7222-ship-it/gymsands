"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type PendingAction = { run: () => void; historyExit?: boolean };

type UnsavedChangesCopy = {
  title: string;
  description: string;
  apply: string;
  discard: string;
  stay: string;
};

export function useUnsavedChangesGuard({
  dirty,
  applying,
  onApply,
  onDiscard,
  copy
}: {
  dirty: boolean;
  applying: boolean;
  onApply: () => Promise<boolean>;
  onDiscard: () => void;
  copy: UnsavedChangesCopy;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const bypassRef = useRef(false);
  const historyGuardRef = useRef(false);

  const request = useCallback((run: () => void, options?: { historyExit?: boolean }) => {
    if (!dirty) {
      run();
      return;
    }
    setPending({ run, historyExit: options?.historyExit });
  }, [dirty]);

  const continueNavigation = useCallback((action: PendingAction) => {
    bypassRef.current = true;
    setPending(null);
    action.run();
    window.setTimeout(() => { bypassRef.current = false; }, 0);
  }, []);

  const applyAndContinue = useCallback(async () => {
    if (!pending || applying) return;
    const applied = await onApply();
    if (applied) continueNavigation(pending);
  }, [applying, continueNavigation, onApply, pending]);

  const discardAndContinue = useCallback(() => {
    if (!pending || applying) return;
    onDiscard();
    continueNavigation(pending);
  }, [applying, continueNavigation, onDiscard, pending]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (bypassRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty || historyGuardRef.current) return;
    historyGuardRef.current = true;
    window.history.pushState({ ...window.history.state, plaivraUnsavedGuard: true }, "", window.location.href);

    const popState = () => {
      if (bypassRef.current) return;
      window.history.pushState({ ...window.history.state, plaivraUnsavedGuard: true }, "", window.location.href);
      setPending({
        historyExit: true,
        run: () => {
          bypassRef.current = true;
          window.history.go(-2);
        }
      });
    };
    window.addEventListener("popstate", popState);
    return () => {
      window.removeEventListener("popstate", popState);
      historyGuardRef.current = false;
    };
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const captureLinks = (event: MouseEvent) => {
      if (bypassRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || target.hasAttribute("download")) return;
      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;
      event.preventDefault();
      request(() => router.push(`${url.pathname}${url.search}${url.hash}`));
    };
    document.addEventListener("click", captureLinks, true);
    return () => document.removeEventListener("click", captureLinks, true);
  }, [dirty, request, router]);

  const dialog = (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open && !applying) setPending(null); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button type="button" onClick={() => void applyAndContinue()} disabled={applying} className="min-h-12">
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{copy.apply}
          </Button>
          <Button type="button" variant="outline" onClick={discardAndContinue} disabled={applying} className="min-h-12">{copy.discard}</Button>
          <Button type="button" variant="ghost" onClick={() => setPending(null)} disabled={applying} className="min-h-12">{copy.stay}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { request, dialog, hasPendingNavigation: Boolean(pending) };
}
