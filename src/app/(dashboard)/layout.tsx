import { Suspense } from "react";
import { requireProfile, getSettings, ROLE_LABEL } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { MobileHeader } from "@/components/layout/mobile-header";
import { KeyboardShortcuts } from "@/components/layout/keyboard-shortcuts";
import { MoneyProvider } from "@/components/ui/money";
import { signOut } from "../(auth)/login/actions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const settings = await getSettings();
  const supabase = await createClient();
  const { data: session } = await supabase.rpc("current_cash_session");

  const money = {
    currency_code: settings.currency_code,
    currency_symbol: settings.currency_symbol,
    currency_position: settings.currency_position,
    currency_decimals: settings.currency_decimals,
  };

  return (
    <MoneyProvider value={money}>
      <div className="flex min-h-dvh">
        <Sidebar role={profile.role} userName={profile.full_name || "Usuario"} roleLabel={ROLE_LABEL[profile.role]}
          businessName={settings.business_name} signOut={signOut} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader businessName={settings.business_name} cashOpen={Boolean(session)} />
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
        </div>
      </div>
      <Suspense><BottomNav /></Suspense>
      <KeyboardShortcuts />
    </MoneyProvider>
  );
}
