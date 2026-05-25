"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getWelcomeSettings } from "@/services/database/repository";
import { useAuth } from "@/components/auth/auth-provider";

export function WelcomePopup() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("Welcome back to S&S Gym. Ready for today?");

  useEffect(() => {
    async function load() {
      if (!user) return;
      try {
        const settings = await getWelcomeSettings(user.id);
        setMessage(settings.default_message);
        if (!settings.popup_enabled) return;
        const key = `ss-gym-welcome-${user.id}-${new Date().toISOString().slice(0, 10)}`;
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
  }, [user]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome back, {profile?.full_name || "S&S Gym member"}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <Button onClick={() => setOpen(false)}>Start today</Button>
      </DialogContent>
    </Dialog>
  );
}
