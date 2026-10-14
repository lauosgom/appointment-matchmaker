import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUser } from "@/lib/auth";
import { formatDate, formatTime, fromColombiaLocal } from "@/lib/datetime";
import { errorMessage, useAction, useSettings, useSpecialists } from "@/lib/queries";
import { services } from "@/services";

export const Route = createFileRoute("/_app/admin/disponibilidad")({
  head: () => ({
    meta: [
      { title: "Disponibilidad — Citas con especialistas" },
      { name: "description", content: "Carga y administra los espacios de disponibilidad de cada especialista." },
      { property: "og:title", content: "Disponibilidad" },
      { property: "og:description", content: "Carga y administra los espacios de disponibilidad de cada especialista." },
    ],
  }),
  component: Availability,
});

function Availability() {
  const me = useUser();
  const { data: specs = [] } = useSpecialists();
  const { data: settings } = useSettings();
  const [spec, setSpec] = useState("");
  const [rows, setRows] = useState<string[]>([""]);
  const slots = useQuery({ queryKey: ["slots", spec], queryFn: () => services.slots.list(spec), enabled: !!spec });
  const add = useAction(services.slots.add);
  const toggle = useAction(services.slots.setActive, "Espacio actualizado");

  const submit = () => {
    let starts: string[];
    try {
      starts = rows.filter(Boolean).map(fromColombiaLocal);
    } catch (e) {
      toast.error(errorMessage(e));
      return;
    }
    add.mutate([me.id, spec, starts], {
      onSuccess: (r) => {
        toast.success(`${r.length} espacio(s) agregados`);
        setRows([""]);
      },
    });
  };

  const now = Date.now();

  return (
    <>
      <PageHeader title="Disponibilidad" description={`Cada espacio dura ${settings?.durationMin ?? "…"} minutos (duración global). Hora de Colombia.`} />
      <div className="mb-6 max-w-sm space-y-1.5">
        <Label>Especialista</Label>
        <Select value={spec} onValueChange={setSpec}>
          <SelectTrigger className="bg-card"><SelectValue placeholder="Selecciona un especialista" /></SelectTrigger>
          <SelectContent>{specs.filter((s) => s.active).map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!spec ? (
        <EmptyState>Selecciona un especialista para cargar o revisar sus espacios.</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <Card className="h-fit shadow-card">
            <CardHeader><CardTitle className="text-base text-primary-strong">Agregar espacios</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {rows.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <Input type="datetime-local" step={300} value={r} onChange={(e) => setRows(rows.map((x, j) => (j === i ? e.target.value : x)))} />
                  <Button variant="ghost" size="icon" aria-label="Quitar fila" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setRows([...rows, ""])}><Plus className="mr-1 h-4 w-4" /> Otra fila</Button>
              <Button className="w-full bg-gradient-primary" disabled={!rows.some(Boolean) || add.isPending} onClick={submit}>Guardar espacios</Button>
            </CardContent>
          </Card>
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/60 hover:bg-secondary/60"><TableHead>Fecha</TableHead><TableHead>Hora</TableHead><TableHead>Duración</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {(slots.data ?? []).map((s) => {
                  const past = new Date(s.start).getTime() < now;
                  return (
                    <TableRow key={s.id} className={past ? "opacity-60" : ""}>
                      <TableCell>{formatDate(s.start)}</TableCell>
                      <TableCell>{formatTime(s.start)}</TableCell>
                      <TableCell>{s.durationMin} min</TableCell>
                      <TableCell>
                        <Badge variant={s.booked ? "default" : s.active ? "outline" : "secondary"}>
                          {s.booked ? "Reservado" : s.active ? "Disponible" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {!s.booked && !past && (
                          <Button size="sm" variant="outline" onClick={() => toggle.mutate([me.id, s.id, !s.active])}>
                            {s.active ? "Desactivar" : "Reactivar"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!slots.data?.length && <p className="p-6 text-center text-sm text-muted-foreground">Sin espacios registrados.</p>}
          </div>
        </div>
      )}
    </>
  );
}
