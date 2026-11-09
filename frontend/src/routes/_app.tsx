import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useEffect } from "react";

import logo from "@/assets/logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { MENU, ROLE_LABEL } from "@/lib/menu";
import { resetDemoData } from "@/services";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  if (!ready || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando…</div>;
  }

  const items = MENU.filter((m) => (m.roles as readonly string[]).includes(user.role));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2">
          <Link to="/menu" className="flex items-center gap-2">
            <img src={logo.url} alt="Teléfono de la Esperanza" className="h-10 w-auto mix-blend-multiply" />
          </Link>
          <nav className="hidden flex-1 flex-wrap gap-1 lg:flex">
            {items.map((m) => (
              <Link
                key={m.to}
                to={m.to}
                className="rounded-lg border border-transparent px-2.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-primary-strong"
                activeProps={{ className: "!border-primary/30 bg-secondary !text-primary-strong" }}
              >
                {m.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right text-xs leading-tight">
              <div className="font-medium">{user.fullName}</div>
              <div className="text-muted-foreground">{ROLE_LABEL[user.role]}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cerrar sesión"
              onClick={() => {
                logout();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <footer className="pb-6 text-center text-xs text-muted-foreground">
        Datos de demostración ·{" "}
        <button className="underline" onClick={resetDemoData}>Restablecer datos</button>
      </footer>
    </div>
  );
}
