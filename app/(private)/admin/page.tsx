import Link from "next/link";
import { Soup, Users, Video, MessageSquare, Dumbbell, Settings } from "lucide-react";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent } from "@/components/ui/card";

const adminLinks = [
  { href: "/admin/users", label: "Manage Users", icon: Users, text: "View users, edit roles, and set custom welcome messages." },
  { href: "/admin/foods", label: "Manage Egyptian Foods", icon: Soup, text: "Add, edit, or review global food macros." },
  { href: "/admin/workouts", label: "Manage Workouts", icon: Dumbbell, text: "Review global workout library and instructions." },
  { href: "/admin/videos", label: "Manage Workout Videos", icon: Video, text: "Add video sources and prepare 3000+ record imports." },
  { href: "/admin/welcome", label: "Manage Welcome Messages", icon: MessageSquare, text: "Set default and user-specific welcome popups." },
  { href: "/admin/settings", label: "Admin Settings", icon: Settings, text: "Configure FitLife Hub admin-level settings." }
];

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeading title="Admin Dashboard" description="Manage FitLife Hub users, foods, workouts, videos, and welcome messages." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
