import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminReadinessPage() {
  return (
    <>
      <PageHeading title="Admin Readiness" description="Review app privacy and member experience settings." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>App readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Member dashboards are private.</p>
            <p>Meal, workout, profile, and progress areas are connected across the app.</p>
            <p>Use the admin pages to keep library content polished.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Passwords are never visible to admins.</p>
            <p>Members can only see their own logs and progress.</p>
            <p>Keep health and nutrition guidance general and supportive.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
