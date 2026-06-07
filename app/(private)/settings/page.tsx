import Link from "next/link";
import { Settings } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectedApps } from "@/components/settings/connected-apps";

export default function SettingsPage() {
  return (
    <>
      <PageHeading title="Settings" description="Account and app preferences for FitLife Hub." />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Profile Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Profile settings live with your account details.</p>
          <Button asChild>
            <Link href="/profile">Open Profile</Link>
          </Button>
        </CardContent>
      </Card>
      <div className="mt-4">
        <ConnectedApps />
      </div>
    </>
  );
}
