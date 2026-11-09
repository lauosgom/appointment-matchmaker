import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { useAction, useSettings, useSpecialists } from "@/lib/queries";
import { services, type Slot } from "@/services";
import { Field } from "./_app.admin.usuarios";

export const Route = createFileRoute("/_app/admin/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración — Citas con especialistas" },
      { name: "description", content: "Duración global de las citas y letras del año para los códigos." },
      { property: "og:title", content: "Configuración" },
      { property: "og:description", content: "Duración global de las citas y letras del año para los códigos." },
    ],
  }),
  component: Config,
});

function Config() {
  const me = useUser();
  const { data: settings } = useSettings();
  const { data: specs = [] } = useSpecialists();
  const [minutes, setMinutes] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [letters, setLetters] = useState("");
  const [review, setReview] = useState<Slot[]>();
  const duration = useAction(services.settings.setDuration);
  const yearLetters = useAction(services.settings.setYearLetters, "Letras guardadas");

  useEffect(() => {
    if (settings) setMinutes(String(settings.durationMin));
  }, [settings]);

  return (
    <>
      <PageHeader title="Configuración" />
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base text-primary-strong">Duración global de las citas</CardTitle>
            <CardDescription>Las citas y asignaciones existentes conservan su duración original.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Minutos"><Input type="number" min={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
            <Button
              className="bg-gradient-primary"
              onClick={() =>
                duration.mutate([me.id, Number(minutes)], {
                  onSuccess: (r) => {
                    setReview(r.needsReview);
                    toast.success(r.needsReview.length ? "Duración actualizada; algunos espacios requieren revisión" : "Duración actualizada");
                  },
                })
              }
            >
              Guardar duración
            </Button>
            {!!review?.length && (
              <div className="rounded-lg border border-warning bg-warning/10 p-3 text-sm">
                <p className="mb-1 font-medium">Requieren revisión manual (se cruzarían con otro espacio):</p>
                <ul className="list-inside list-disc">
                  {review.map((s) => (
                    <li key={s.id}>{specs.find((x) => x.id === s.specialistId)?.fullName} — {formatDateTime(s.start)}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-base text-primary-strong">Letras del año para códigos</CardTitle>
            <CardDescription>Cambiar las letras no modifica los códigos ya generados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Año"><Input value={year} onChange={(e) => setYear(e.target.value)} maxLength={4} /></Field>
              <Field label="Letras"><Input value={letters} onChange={(e) => setLetters(e.target.value.toUpperCase())} maxLength={2} placeholder="AK" /></Field>
            </div>
            <Button className="bg-gradient-primary" onClick={() => yearLetters.mutate([me.id, year, letters])}>Guardar letras</Button>
            <div className="flex flex-wrap gap-2 pt-2">
              {Object.entries(settings?.yearLetters ?? {}).sort().map(([y, l]) => (
                <span key={y} className="rounded-lg bg-secondary px-3 py-1 text-sm">{y} = <strong className="font-mono">{l}</strong></span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
