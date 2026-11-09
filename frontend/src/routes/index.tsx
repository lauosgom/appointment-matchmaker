import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import logo from "@/assets/logo.png.asset.json";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión — Citas con especialistas" },
      { name: "description", content: "Ingreso para orientadores, especialistas y administradores del Teléfono de la Esperanza." },
      { property: "og:title", content: "Citas con especialistas — Teléfono de la Esperanza" },
      { property: "og:description", content: "Consulta disponibilidad y gestiona citas con especialistas." },
    ],
  }),
  component: Login,
});

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-card">
        <img src={logo.url} alt="Teléfono de la Esperanza" className="mx-auto mb-4 h-20 w-auto mix-blend-multiply" />
        {children}
      </div>
    </main>
  );
}

function Login() {
  const { login, user, ready } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) navigate({ to: "/menu" });
  }, [ready, user, navigate]);

  return (
    <AuthCard>
      <h1 className="text-center text-xl font-semibold text-primary-strong">Citas con especialistas</h1>
      <p className="mb-6 text-center text-sm text-muted-foreground">Ingresa con tu usuario y contraseña</p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          try {
            await login(username, password);
            navigate({ to: "/menu" });
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="username">Usuario</Label>
          <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="w-full bg-gradient-primary" disabled={busy}>
          {busy ? "Ingresando…" : "Ingresar"}
        </Button>
        <Link to="/recuperar" className="block text-center text-sm text-primary-strong hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
      <div className="mt-6 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Cuentas de demostración</p>
        <p>admin / admin123 · orientador / orientador123 · especialista / especialista123</p>
      </div>
    </AuthCard>
  );
}
