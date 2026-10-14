import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/menu";
import { useAction, useSpecialists } from "@/lib/queries";
import { services, type Role, type User, type UserInput } from "@/services";

export const Route = createFileRoute("/_app/admin/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuarios — Citas con especialistas" },
      { name: "description", content: "Administra cuentas, perfiles y contraseñas." },
      { property: "og:title", content: "Usuarios" },
      { property: "og:description", content: "Administra cuentas, perfiles y contraseñas." },
    ],
  }),
  component: Users,
});

const EMPTY: UserInput = { username: "", fullName: "", email: "", role: "orientador", active: true, password: "" };

function Users() {
  const me = useUser();
  const { data = [] } = useQuery({ queryKey: ["users"], queryFn: () => services.users.list(me.id) });
  const { data: specs = [] } = useSpecialists();
  const [editing, setEditing] = useState<{ id?: string; v: UserInput } | null>(null);
  const create = useAction(services.users.create, "Usuario creado");
  const update = useAction(services.users.update, "Usuario actualizado");

  const save = () => {
    if (!editing) return;
    const opts = { onSuccess: () => setEditing(null) };
    if (editing.id) update.mutate([me.id, editing.id, editing.v], opts);
    else create.mutate([me.id, editing.v], opts);
  };
  const set = (p: Partial<UserInput>) => setEditing((e) => e && { ...e, v: { ...e.v, ...p } });

  return (
    <>
      <PageHeader title="Usuarios" description="Las cuentas desactivadas no pueden ingresar, pero se conserva su historial.">
        <Button className="bg-gradient-primary" onClick={() => setEditing({ v: EMPTY })}>Nuevo usuario</Button>
      </PageHeader>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/60 hover:bg-secondary/60">
              <TableHead>Usuario</TableHead><TableHead>Nombre</TableHead><TableHead>Correo</TableHead><TableHead>Perfil</TableHead><TableHead>Estado</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((u: User) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.username}</TableCell>
                <TableCell>{u.fullName}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                <TableCell><Badge variant={u.active ? "default" : "secondary"}>{u.active ? "Activo" : "Inactivo"}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ id: u.id, v: { ...u, password: "" } })}>Editar</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar usuario" : "Nuevo usuario"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid gap-3">
              <Field label="Nombre de usuario"><Input value={editing.v.username} onChange={(e) => set({ username: e.target.value })} /></Field>
              <Field label="Nombre completo"><Input value={editing.v.fullName} onChange={(e) => set({ fullName: e.target.value })} /></Field>
              <Field label="Correo (para recuperar contraseña)"><Input type="email" value={editing.v.email} onChange={(e) => set({ email: e.target.value })} /></Field>
              <Field label="Perfil">
                <Select value={editing.v.role} onValueChange={(r) => set({ role: r as Role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {editing.v.role === "especialista" && (
                <Field label="Especialista asociado">
                  <Select value={editing.v.specialistId ?? ""} onValueChange={(v) => set({ specialistId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>{specs.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              )}
              <Field label={editing.id ? "Nueva contraseña (opcional)" : "Contraseña inicial"}>
                <Input type="password" value={editing.v.password ?? ""} onChange={(e) => set({ password: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm"><Switch checked={editing.v.active} onCheckedChange={(active) => set({ active })} /> Cuenta activa</label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button className="bg-gradient-primary" onClick={save} disabled={create.isPending || update.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
