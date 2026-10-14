import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/PageHeader";
import { useUser } from "@/lib/auth";
import { MENU } from "@/lib/menu";

export const Route = createFileRoute("/_app/menu")({
  head: () => ({
    meta: [
      { title: "Menú — Citas con especialistas" },
      { name: "description", content: "Opciones disponibles según tu perfil." },
      { property: "og:title", content: "Menú principal" },
      { property: "og:description", content: "Opciones disponibles según tu perfil." },
    ],
  }),
  component: Menu,
});

function Menu() {
  const user = useUser();
  const items = MENU.filter((m) => (m.roles as readonly string[]).includes(user.role));
  return (
    <>
      <PageHeader title={`Hola, ${user.fullName.split(" ")[0]}`} description="¿Qué quieres hacer hoy?" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m) => (
          <Link
            key={m.to}
            to={m.to}
            className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition-transform hover:-translate-y-0.5"
          >
            <span className="rounded-xl bg-gradient-primary p-3 text-primary-foreground">
              <m.icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-semibold text-primary-strong">{m.label}</span>
              <span className="text-sm text-muted-foreground">{m.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
