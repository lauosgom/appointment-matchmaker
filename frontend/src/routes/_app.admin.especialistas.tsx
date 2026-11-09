import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { CheckList } from "@/components/CheckList";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUser } from "@/lib/auth";
import { useAction, useCategories, useSpecialists } from "@/lib/queries";
import { services, type SpecialistInput } from "@/services";
import { Field } from "./_app.admin.usuarios";

export const Route = createFileRoute("/_app/admin/especialistas")({
  head: () => ({
    meta: [
      { title: "Especialistas — Citas con especialistas" },
      { name: "description", content: "Administra especialistas, sus departamentos y áreas." },
      { property: "og:title", content: "Especialistas" },
      { property: "og:description", content: "Administra especialistas, sus departamentos y áreas." },
    ],
  }),
  component: Specialists,
});

const EMPTY: SpecialistInput = { code: "", fullName: "", departmentIds: [], areaIds: [], active: true };

function Specialists() {
  const me = useUser();
  const { data = [] } = useSpecialists();
  const { data: deps = [] } = useCategories("department");
  const { data: areas = [] } = useCategories("area");
  const [editing, setEditing] = useState<{ id?: string; v: SpecialistInput; warn?: number | undefined } | null>(null);
  const create = useAction(services.specialists.create, "Especialista creado");
  const update = useAction(services.specialists.update, "Especialista actualizado");
  const set = (p: Partial<SpecialistInput>) => setEditing((e) => e && { ...e, v: { ...e.v, ...p } });
  const names = (ids: string[], list: typeof deps) => ids.map((id) => list.find((c) => c.id === id)?.name).filter(Boolean).join(", ");

  return (
    <>
      <PageHeader title="Especialistas" description="Los especialistas no se eliminan: se desactivan para conservar el historial.">
        <Button className="bg-gradient-primary" onClick={() => setEditing({ v: EMPTY })}>Nuevo especialista</Button>
      </PageHeader>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/60 hover:bg-secondary/60">
              <TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Departamentos</TableHead><TableHead>Áreas</TableHead><TableHead>Estado</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono">{s.code}</TableCell>
                <TableCell className="font-medium">{s.fullName}</TableCell>
                <TableCell className="text-sm">{names(s.departmentIds, deps)}</TableCell>
                <TableCell className="text-sm">{names(s.areaIds, areas)}</TableCell>
                <TableCell><Badge variant={s.active ? "default" : "secondary"}>{s.active ? "Activo" : "Inactivo"}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ id: s.id, v: { ...s } })}>Editar</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar especialista" : "Nuevo especialista"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <Field label="Código único"><Input value={editing.v.code} onChange={(e) => set({ code: e.target.value })} /></Field>
              <Field label="Nombre completo"><Input value={editing.v.fullName} onChange={(e) => set({ fullName: e.target.value })} /></Field>
              <Field label="Departamentos"><CheckList items={deps} value={editing.v.departmentIds} onChange={(departmentIds) => set({ departmentIds })} /></Field>
              <Field label="Áreas de intervención"><CheckList items={areas} value={editing.v.areaIds} onChange={(areaIds) => set({ areaIds })} /></Field>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={editing.v.active}
                  onCheckedChange={async (active) => {
                    const warn = !active && editing.id ? await services.specialists.pendingAppointments(editing.id) : undefined;
                    setEditing((e) => e && { ...e, warn, v: { ...e.v, active } });
                  }}
                />
                Activo
              </label>
              {!!editing.warn && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Este especialista tiene {editing.warn} cita(s) o asignación(es) pendientes. Se conservarán, pero ya no aparecerá en nuevas búsquedas.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              className="bg-gradient-primary"
              onClick={() => {
                const opts = { onSuccess: () => setEditing(null) };
                if (editing?.id) update.mutate([me.id, editing.id, editing.v], opts);
                else if (editing) create.mutate([me.id, editing.v], opts);
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
