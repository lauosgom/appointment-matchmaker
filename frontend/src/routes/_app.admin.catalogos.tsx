import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/lib/auth";
import { useAction, useCategories } from "@/lib/queries";
import { services, type CategoryInput, type CategoryKind, type UsageWarning } from "@/services";
import { Field } from "./_app.admin.usuarios";

export const Route = createFileRoute("/_app/admin/catalogos")({
  head: () => ({
    meta: [
      { title: "Departamentos y áreas — Citas con especialistas" },
      { name: "description", content: "Administra los catálogos de departamentos y áreas de intervención." },
      { property: "og:title", content: "Departamentos y áreas" },
      { property: "og:description", content: "Administra los catálogos de departamentos y áreas de intervención." },
    ],
  }),
  component: Catalogs,
});

function Catalogs() {
  return (
    <>
      <PageHeader title="Departamentos y áreas" description="Catálogos independientes. No se eliminan: se desactivan." />
      <Tabs defaultValue="department">
        <TabsList className="mb-4">
          <TabsTrigger value="department">Departamentos</TabsTrigger>
          <TabsTrigger value="area">Áreas de intervención</TabsTrigger>
        </TabsList>
        <TabsContent value="department"><CatalogTable kind="department" /></TabsContent>
        <TabsContent value="area"><CatalogTable kind="area" /></TabsContent>
      </Tabs>
    </>
  );
}

function CatalogTable({ kind }: { kind: CategoryKind }) {
  const me = useUser();
  const { data = [] } = useCategories(kind);
  const [editing, setEditing] = useState<{ id?: string; v: CategoryInput; warn?: UsageWarning | undefined } | null>(null);
  const create = useAction((v: CategoryInput) => services.categories.create(me.id, kind, v), "Guardado");
  const update = useAction((id: string, v: CategoryInput) => services.categories.update(me.id, kind, id, v), "Guardado");
  const set = (p: Partial<CategoryInput>) => setEditing((e) => e && { ...e, v: { ...e.v, ...p } });

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button className="bg-gradient-primary" onClick={() => setEditing({ v: { code: "", name: "", active: true } })}>
          {kind === "department" ? "Nuevo departamento" : "Nueva área"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/60 hover:bg-secondary/60"><TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Estado</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono">{c.code}</TableCell>
                <TableCell>{c.name}</TableCell>
                <TableCell><Badge variant={c.active ? "default" : "secondary"}>{c.active ? "Activo" : "Inactivo"}</Badge></TableCell>
                <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setEditing({ id: c.id, v: { ...c } })}>Editar</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar" : "Nuevo"} {kind === "department" ? "departamento" : "área"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <Field label="Código único"><Input value={editing.v.code} onChange={(e) => set({ code: e.target.value })} /></Field>
              <Field label="Nombre"><Input value={editing.v.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={editing.v.active}
                  onCheckedChange={async (active) => {
                    const warn = !active && editing.id ? await services.categories.usage(kind, editing.id) : undefined;
                    setEditing((e) => e && { ...e, warn, v: { ...e.v, active } });
                  }}
                />
                Activo
              </label>
              {editing.warn && (editing.warn.specialists > 0 || editing.warn.pendingAppointments > 0) && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Hay {editing.warn.specialists} especialista(s) asociados y {editing.warn.pendingAppointments} cita(s) pendientes. Las citas se conservarán, pero la categoría dejará de estar disponible para nuevas asignaciones.
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
                if (editing?.id) update.mutate([editing.id, editing.v], opts);
                else if (editing) create.mutate([editing.v], opts);
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
