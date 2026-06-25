"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getWelcomeSettings } from "@/services/database/settings";
import { useAuth } from "@/components/auth/auth-provider";

const DEFAULT_MESSAGE = "Welcome back to Plaivra. Ready for today?";
const NEW_PROFILE_MESSAGE = "Start with the setup checklist, then import your first workout or meal plan when you are ready.";

function messageFingerprint(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function WelcomePopup() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [isCustomMessage, setIsCustomMessage] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const createdAtMs = profile?.created_at ? Date.parse(profile.created_at) : Number.NaN;
  const isNewProfile = Number.isFinite(createdAtMs) && nowMs - createdAtMs < 24 * 60 * 60 * 1000;
  const title = isNewProfile ? "Welcome to Plaivra" : `Welcome back, ${profile?.full_name || "Plaivra member"}`;
  const displayMessage = isNewProfile && !isCustomMessage ? NEW_PROFILE_MESSAGE : message;

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      try {
        const settings = await getWelcomeSettings(user.id);
        const hasCustomMessage = Boolean(settings.is_custom_message);
        const messageToShow = isNewProfile && !hasCustomMessage ? NEW_PROFILE_MESSAGE : settings.default_message;

        setMessage(settings.default_message);
        setIsCustomMessage(hasCustomMessage);

        if (!settings.popup_enabled) return;

        const today = new Date().toISOString().slice(0, 10);
        const messageKey = messageFingerprint(`${settings.show_frequency}:${messageToShow}`);
        const key = `plaivra-welcome-${user.id}-${today}-${messageKey}`;
        const seenToday = window.localStorage.getItem(key);

        if (settings.show_frequency === "every_login" || !seenToday) {
          setOpen(true);
          window.localStorage.setItem(key, "true");
        }
      } catch {
        setOpen(true);
      }
    }
    load();
  }, [user?.id, isNewProfile]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{displayMessage}</DialogDescription>
        </DialogHeader>
        <Button onClick={() => setOpen(false)}>Start today</Button>
      </DialogContent>
    </Dialog>
  );
}
