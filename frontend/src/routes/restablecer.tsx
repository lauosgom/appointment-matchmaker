import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/queries";
import { services } from "@/services";
import { AuthCard } from "./index";

export const Route = createFileRoute("/restablecer")({
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s['token'] === "string" ? s['token'] : "" }),
  head: () => ({
    meta: [
      { title: "Nueva contraseña — Citas con especialistas" },
      { name: "description", content: "Define una nueva contraseña para tu cuenta." },
      { property: "og:title", content: "Nueva contraseña" },
      { property: "og:description", content: "Define una nueva contraseña para tu cuenta." },
    ],
  }),
  component: Reset,
});

function Reset() {
  const { token } = Route.useSearch();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  return (
    <AuthCard>
      <h1 className="mb-4 text-center text-xl font-semibold text-primary-strong">Nueva contraseña</h1>
      {done ? (
        <p className="text-center text-sm">Tu contraseña fue actualizada. Ya puedes iniciar sesión.</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw !== pw2) return setError("Las contraseñas no coinciden.");
            try {
              await services.auth.resetPassword(token, pw);
              setDone(true);
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="pw">Nueva contraseña</Label>
            <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw2">Repite la contraseña</Label>
            <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full bg-gradient-primary">Guardar contraseña</Button>
        </form>
      )}
      <Link to="/" className="mt-4 block text-center text-sm text-primary-strong hover:underline">Ir al inicio de sesión</Link>
    </AuthCard>
  );
}
