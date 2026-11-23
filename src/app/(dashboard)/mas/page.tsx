import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { requireProfile, ROLE_LABEL } from "@/lib/auth";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { signOut } from "../../(auth)/login/actions";

export default async function MasPage() {
  const profile = await requireProfile();
  return (
    <>
      <PageHeader title="Más opciones" description={`${profile.full_name} · ${ROLE_LABEL[profile.role]}`} />
      <Card className="divide-y divide-sand-border">
        {NAV_ITEMS.filter((i) => i.roles.includes(profile.role)).map((i) => (
          <Link key={i.href} href={i.href} className="flex min-h-14 items-center gap-3 px-4">
            <i.icon strokeWidth={1.75} className="size-5 text-ink-muted" />
            <span className="flex-1 text-sm font-medium">{i.label}</span>
            <ChevronRight strokeWidth={1.75} className="size-4 text-ink-faint" />
          </Link>
        ))}
        <form action={signOut}>
          <button className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-danger">
            <LogOut strokeWidth={1.75} className="size-5" /><span className="text-sm font-medium">Cerrar sesión</span>
          </button>
        </form>
      </Card>
    </>
  );
}
