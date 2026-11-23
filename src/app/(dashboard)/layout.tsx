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
        {/* overflow-x-clip: red de seguridad contra desbordes horizontales. "clip" (no "hidden")
            para no crear un contenedor de scroll y no romper el encabezado sticky. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
          <MobileHeader businessName={settings.business_name} cashOpen={Boolean(session)} />
          {/* En móvil se deja espacio para la barra inferior + la zona del indicador de inicio del iPhone */}
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">{children}</main>
        </div>
      </div>
      <Suspense><BottomNav /></Suspense>
      <KeyboardShortcuts />
    </MoneyProvider>
  );
}
