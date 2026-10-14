import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/queries";
import { services } from "@/services";
import { AuthCard } from "./index";

export const Route = createFileRoute("/recuperar")({
  head: () => ({
    meta: [
      { title: "Recuperar contraseña — Citas con especialistas" },
      { name: "description", content: "Solicita un enlace para restablecer tu contraseña." },
      { property: "og:title", content: "Recuperar contraseña" },
      { property: "og:description", content: "Solicita un enlace para restablecer tu contraseña." },
    ],
  }),
  component: Recover,
});

function Recover() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState<string>();
  const [error, setError] = useState("");

  return (
    <AuthCard>
      <h1 className="mb-2 text-center text-xl font-semibold text-primary-strong">Recuperar contraseña</h1>
      {sent ? (
        <div className="space-y-4 text-sm">
          <p>Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.</p>
          {token && (
            <Alert>
              <AlertDescription>
                Modo demostración (no se envían correos):{" "}
                <Link to="/restablecer" search={{ token }} className="font-medium text-primary-strong underline">
                  abrir el enlace de recuperación
                </Link>
              </AlertDescription>
            </Alert>
          )}
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await services.auth.requestPasswordReset(email);
              setToken(r.demoToken);
              setSent(true);
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full bg-gradient-primary">Enviar enlace</Button>
        </form>
      )}
      <Link to="/" className="mt-4 block text-center text-sm text-primary-strong hover:underline">Volver al inicio de sesión</Link>
    </AuthCard>
  );
}
