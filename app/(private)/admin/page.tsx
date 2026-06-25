import Link from "next/link";
import { ShieldCheck, Users } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent } from "@/components/ui/card";

const adminLinks = [
  { href: "/admin/users", label: "Manage Users", icon: Users, text: "View users, edit roles, and set custom welcome messages." },
  { href: "/admin/api-status", label: "API Status", icon: ShieldCheck, text: "Check which provider integrations are configured." }
];

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeading title="Admin Dashboard" description="Manage Plaivra users and API integrations." />
      <div className="grid gap-4 md:grid-cols-2">
        {adminLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <Card className="h-full transition hover:border-primary hover:shadow-luxe">
                <CardContent className="pt-5">
                  <Icon className="h-8 w-8 text-primary" />
                  <h2 className="mt-4 text-lg font-semibold">{item.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
