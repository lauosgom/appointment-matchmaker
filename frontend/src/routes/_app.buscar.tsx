import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/lib/auth";
import { formatDate, formatTime } from "@/lib/datetime";
import { useAction, useCategories, useSpecialists } from "@/lib/queries";
import { services, type Assignment, type AvailabilityResult, type SearchQuery } from "@/services";

export const Route = createFileRoute("/_app/buscar")({
  validateSearch: (s: Record<string, unknown>) => ({
    name: typeof s['name'] === "string" ? s['name'] : undefined,
    phone: typeof s['phone'] === "string" ? s['phone'] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Buscar disponibilidad — Citas con especialistas" },
      { name: "description", content: "Busca espacios por especialista, departamento o área de intervención." },
      { property: "og:title", content: "Buscar disponibilidad" },
      { property: "og:description", content: "Busca espacios por especialista, departamento o área de intervención." },
    ],
  }),
  component: Search,
});

type By = SearchQuery["by"];

function Search() {
  const user = useUser();
  const prefill = Route.useSearch();
  const [by, setBy] = useState<By>("department");
  const [id, setId] = useState("");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<AvailabilityResult>();
  const [name, setName] = useState(prefill.name ?? "");
  const [phone, setPhone] = useState(prefill.phone ?? "");
  const [step, setStep] = useState<"form" | "review">("form");
  const [saved, setSaved] = useState<Assignment>();

  const { data: specs = [] } = useSpecialists();
  const { data: deps = [] } = useCategories("department");
  const { data: areas = [] } = useCategories("area");
  const options =
    by === "specialist"
      ? specs.filter((s) => s.active).map((s) => ({ id: s.id, label: `${s.fullName} (${s.code})` }))
      : (by === "department" ? deps : areas).filter((c) => c.active).map((c) => ({ id: c.id, label: c.name }));

  const results = useQuery({
    queryKey: ["availability", by, id, date],
    queryFn: () => services.availability.search({ by, id, date: date || undefined }),
    enabled: !!id,
  });

  const create = useAction(services.assignments.create, "Asignación guardada como pendiente de confirmación");
  const confirm = useAction(services.assignments.confirm, "Cita confirmada");

  const reset = () => {
    setSelected(undefined);
    setSaved(undefined);
    setStep("form");
    setName("");
    setPhone("");
  };

  if (saved) {
    return (
      <>
        <PageHeader title="Asignación guardada" />
        <Card className="max-w-lg shadow-card">
          <CardContent className="space-y-4 pt-6">
            <Summary r={selected!} name={saved.personName} phone={saved.personPhone} />
            {saved.code ? (
              <p className="rounded-lg bg-secondary p-4 text-center">
                Código de cita: <span className="font-mono text-xl font-bold text-primary-strong">{saved.code}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Estado: <strong>Pendiente de confirmación</strong>. El horario queda bloqueado hasta que se confirme o descarte.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {!saved.code && (
                <Button
                  className="bg-gradient-primary"
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate([user.id, saved.id], { onSuccess: setSaved })}
                >
                  Confirmar definitivamente
                </Button>
              )}
              <Button variant="outline" onClick={reset}>Nueva búsqueda</Button>
              <Button variant="ghost" asChild><Link to="/asignaciones">Ver asignaciones</Link></Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  if (selected) {
    return (
      <>
        <PageHeader title={step === "form" ? "Datos de la persona" : "Revisa antes de guardar"} />
        <Card className="max-w-lg shadow-card">
          <CardContent className="space-y-4 pt-6">
            {step === "form" ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setStep("review");
                }}
              >
                <p className="text-sm text-muted-foreground">Ingresa al menos el nombre o el celular; puedes ingresar ambos.</p>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nombre</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Celular</Label>
                  <Input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" type="button" onClick={() => setSelected(undefined)}>Cambiar horario</Button>
                  <Button type="submit" className="bg-gradient-primary" disabled={!name.trim() && !phone.trim()}>Continuar</Button>
                </div>
              </form>
            ) : (
              <>
                <Summary r={selected} name={name} phone={phone} />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("form")}>Corregir datos</Button>
                  <Button
                    className="bg-gradient-primary"
                    disabled={create.isPending}
                    onClick={() =>
                      create.mutate([user.id, { slotId: selected.slot.id, personName: name, personPhone: phone }], {
                        onSuccess: setSaved,
                        onError: () => setSelected(undefined),
                      })
                    }
                  >
                    Guardar asignación
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Buscar disponibilidad" description="Busca por especialista, departamento o área de intervención." />
      <Card className="mb-6 shadow-card">
        <CardContent className="grid gap-4 pt-6 md:grid-cols-[auto_1fr_auto]">
          <div className="space-y-1.5">
            <Label>Buscar por</Label>
            <Tabs value={by} onValueChange={(v) => { setBy(v as By); setId(""); }}>
              <TabsList>
                <TabsTrigger value="department">Departamento</TabsTrigger>
                <TabsTrigger value="area">Área</TabsTrigger>
                <TabsTrigger value="specialist">Especialista</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="space-y-1.5">
            <Label>Selección</Label>
            <Select value={id} onValueChange={setId}>
              <SelectTrigger><SelectValue placeholder="Elige una opción" /></SelectTrigger>
              <SelectContent>
                {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Fecha concreta (opcional)</Label>
            <div className="flex gap-2">
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              {date && <Button variant="ghost" onClick={() => setDate("")}>Próximos</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      {!id ? (
        <EmptyState>Selecciona un criterio para ver los próximos horarios disponibles.</EmptyState>
      ) : results.isLoading ? (
        <EmptyState>Buscando…</EmptyState>
      ) : !results.data?.length ? (
        <EmptyState>No hay espacios disponibles{date ? " en esa fecha" : ""}. Prueba otra fecha u otro criterio.</EmptyState>
      ) : (
        <SlotList results={results.data} showSpecialist={by !== "specialist"} onPick={setSelected} />
      )}
    </>
  );
}

function SlotList({ results, showSpecialist, onPick }: { results: AvailabilityResult[]; showSpecialist: boolean; onPick: (r: AvailabilityResult) => void }) {
  const groups = new Map<string, AvailabilityResult[]>();
  for (const r of results) {
    const k = formatDate(r.slot.start);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return (
    <div className="space-y-4">
      {[...groups].map(([day, rows]) => (
        <Card key={day} className="shadow-card">
          <CardHeader className="pb-2"><CardTitle className="text-base text-primary-strong">{day}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {rows.map((r) => (
              <button
                key={r.slot.id}
                onClick={() => onPick(r)}
                className="rounded-xl border border-input bg-card px-4 py-2 text-left transition-colors hover:border-primary hover:bg-secondary"
              >
                <div className="font-semibold">{formatTime(r.slot.start)}</div>
                {showSpecialist && <div className="text-xs text-muted-foreground">{r.specialist.fullName}</div>}
              </button>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Summary({ r, name, phone }: { r: AvailabilityResult; name?: string | undefined; phone?: string | undefined }) {
  const rows = [
    ["Nombre", name?.trim() || "—"],
    ["Celular", phone?.trim() || "—"],
    ["Especialista", r.specialist.fullName],
    ["Fecha", formatDate(r.slot.start)],
    ["Hora", formatTime(r.slot.start)],
  ];
  return (
    <dl className="divide-y divide-border rounded-lg border border-border">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between px-4 py-2 text-sm">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
