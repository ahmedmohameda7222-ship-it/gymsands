"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import {
  adminGetWelcomeSettings,
  adminListUsers,
  adminListWelcomeMessages,
  adminUpdateUserRole,
  adminUpdateWelcomeSettings,
  adminUpsertWelcomeMessage,
  type AdminUser
} from "@/services/database/admin";
import type { UserRole } from "@/types";

type WelcomeFrequency = "every_login" | "once_per_day";

type UserMessageDraft = {
  message: string;
  frequency: WelcomeFrequency;
  saved: boolean;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function AdminUsersPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [defaultMessage, setDefaultMessage] = useState("Welcome back to FitLife Hub. Ready for today?");
  const [defaultFrequency, setDefaultFrequency] = useState<WelcomeFrequency>("once_per_day");
  const [userMessages, setUserMessages] = useState<Record<string, UserMessageDraft>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadAdminData() {
      setIsLoading(true);
      try {
        const [list, savedMessages, settings] = await Promise.all([
          adminListUsers(),
          adminListWelcomeMessages(),
          adminGetWelcomeSettings()
        ]);

        if (!isMounted) return;

        setUsers(list);
        setDefaultMessage(settings.default_message);
        setDefaultFrequency(settings.show_frequency);

        const savedByUser = new Map(savedMessages.map((item) => [item.user_id, item]));
        const map: Record<string, UserMessageDraft> = {};
        for (const user of list) {
          const saved = savedByUser.get(user.id);
          map[user.id] = {
            message: saved?.message ?? "",
            frequency: saved?.show_frequency ?? "once_per_day",
            saved: Boolean(saved?.message)
          };
        }
        setUserMessages(map);
      } catch (error) {
        if (!isMounted) return;
        toast({ title: "Could not load admin users", description: errorMessage(error, "Saved welcome messages could not be loaded.") });
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadAdminData();
    return () => {
      isMounted = false;
    };
  }, [toast]);

  async function setRole(id: string, role: UserRole) {
    try {
      await adminUpdateUserRole(id, role);
      setUsers((current) => current.map((user) => (user.id === id ? { ...user, role } : user)));
      toast({ title: "User role updated", description: "Passwords are never visible in FitLife Hub admin." });
    } catch (error) {
      toast({ title: "Could not update role", description: errorMessage(error, "The user role was not changed.") });
    }
  }

  async function saveUserMessage(userId: string, email: string | null) {
    const payload = userMessages[userId];
    if (!payload?.message.trim()) return;
    try {
      await adminUpsertWelcomeMessage({
        user_id: userId,
        message: payload.message,
        popup_enabled: true,
        show_frequency: payload.frequency
      });
      setUserMessages((current) => ({
        ...current,
        [userId]: {
          ...(current[userId] ?? { message: "", frequency: "once_per_day", saved: false }),
          message: payload.message.trim(),
          saved: true
        }
      }));
      toast({ title: "Welcome message saved", description: `Custom message set for ${email ?? "this user"}.` });
    } catch (error) {
      toast({ title: "Could not save welcome message", description: errorMessage(error, "The custom message was not saved.") });
    }
  }

  async function saveDefault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await adminUpdateWelcomeSettings({
        default_message: defaultMessage,
        popup_enabled: true,
        show_frequency: defaultFrequency,
        is_custom_message: false
      });
      setDefaultMessage(defaultMessage.trim());
      toast({ title: "Default welcome message saved", description: "Users without a custom message will see this." });
    } catch (error) {
      toast({ title: "Could not save default message", description: errorMessage(error, "The default welcome message was not saved.") });
    }
  }

  function updateUserMessage(userId: string, patch: Partial<{ message: string; frequency: WelcomeFrequency }>) {
    setUserMessages((current) => ({
      ...current,
      [userId]: { ...(current[userId] ?? { message: "", frequency: "once_per_day", saved: false }), ...patch, saved: false }
    }));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Default welcome message</CardTitle>
          <CardDescription>Users without a custom message will see this default.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={saveDefault}>
            <TextField label="Message" value={defaultMessage} onChange={setDefaultMessage} placeholder="Welcome back to FitLife Hub. Ready for today?" />
            <Select value={defaultFrequency} onValueChange={(value) => setDefaultFrequency(value as WelcomeFrequency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once_per_day">Once per day</SelectItem>
                <SelectItem value="every_login">Every login</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!defaultMessage.trim()}>
              <Save className="h-4 w-4" />
              Save default
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading users and saved messages...</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="pt-5">
              <p className="font-semibold">{user.full_name || "FitLife Hub member"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
              <div className="mt-4">
                <Label>Role</Label>
                <Select value={user.role ?? "member"} onValueChange={(value) => setRole(user.id, value as UserRole)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-4 space-y-3 rounded-md border bg-slate-50 p-3">
                <p className="text-sm font-semibold">Welcome message</p>
                <TextField
                  label="Message"
                  value={userMessages[user.id]?.message ?? ""}
                  onChange={(message) => updateUserMessage(user.id, { message })}
                  placeholder="Custom message for this user..."
                />
                <Select value={userMessages[user.id]?.frequency ?? "once_per_day"} onValueChange={(value) => updateUserMessage(user.id, { frequency: value as WelcomeFrequency })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="once_per_day">Once per day</SelectItem>
                    <SelectItem value="every_login">Every login</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveUserMessage(user.id, user.email)}
                  disabled={!userMessages[user.id]?.message?.trim()}
                >
                  <Save className="h-4 w-4" />
                  {userMessages[user.id]?.saved ? "Saved" : "Save for user"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AdminApiStatusPanel() {
  const { session } = useAuth();
  const [providers, setProviders] = useState<Array<{ provider: string; configured: boolean }>>([]);
  const { toast } = useToast();

  async function loadStatus() {
    const response = await fetch("/api/admin/api-status", {
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast({ title: "Could not load API status", description: data.error ?? "Please try again." });
    setProviders(data.providers ?? []);
  }

  useEffect(() => {
    if (session?.access_token) loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Status</CardTitle>
        <CardDescription>Secrets are never displayed. Only configured state is shown.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((item) => (
          <div key={item.provider} className="flex items-center justify-between rounded-md border bg-card p-3">
            <span className="font-medium">{item.provider}</span>
            <span className={item.configured ? "text-primary" : "text-muted-foreground"}>{item.configured ? "Configured" : "Not configured"}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}
