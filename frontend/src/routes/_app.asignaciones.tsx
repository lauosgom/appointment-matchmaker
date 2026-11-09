import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AssignmentTable } from "@/components/AssignmentTable";
import { PageHeader } from "@/components/PageHeader";
import { ReasonDialog } from "@/components/ReasonDialog";
import { STATUS_LABEL } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/datetime";
import { useAction, useSpecialists, useUserNames } from "@/lib/queries";
import { displayStatus, services, type Assignment, type DisplayStatus, type User } from "@/services";

export const Route = createFileRoute("/_app/asignaciones")({
  head: () => ({
    meta: [
      { title: "Asignaciones y citas — Citas con especialistas" },
      { name: "description", content: "Confirma, descarta, cancela y consulta asignaciones y citas." },
      { property: "og:title", content: "Asignaciones y citas" },
      { property: "og:description", content: "Confirma, descarta, cancela y consulta asignaciones y citas." },
    ],
  }),
  component: Assignments,
});

type Dialog = { kind: "discard" | "cancel" | "correction"; a: Assignment } | null;

function useRowActions(user: User) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const confirm = useAction(services.assignments.confirm, "Cita confirmada");
  const discard = useAction(services.assignments.discard, "Asignación descartada; el horario quedó libre");
  const cancel = useAction(services.assignments.cancel);
  const correction = useAction(services.assignments.requestCorrection, "Solicitud enviada al administrador");

  const actions = (a: Assignment) => {
    const st = displayStatus(a, new Date());
    const canManage = user.role === "admin" || a.createdBy === user.id;
    return (
      <>
        {st === "pending" && canManage && (
          <>
            <Button size="sm" className="bg-gradient-primary" disabled={confirm.isPending} onClick={() => confirm.mutate([user.id, a.id])}>Confirmar</Button>
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "discard", a })}>Descartar</Button>
          </>
        )}
        {st === "confirmed" && user.role === "admin" && (
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDialog({ kind: "cancel", a })}>Cancelar</Button>
        )}
        {st === "confirmed" && user.role === "orientador" && (
          <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "correction", a })}>Solicitar corrección</Button>
        )}
        {st === "cancelled" && user.role === "admin" && (
          <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/buscar", search: { name: a.personName, phone: a.personPhone } })}>Nueva asignación</Button>
        )}
      </>
    );
  };

  const dialogs = (
    <>
      <ReasonDialog
        open={dialog?.kind === "discard"}
        title="Descartar asignación"
        description="El horario quedará disponible de nuevo. Indica el motivo del descarte."
        confirmLabel="Descartar"
        destructive
        onClose={() => setDialog(null)}
        onSubmit={(r) => discard.mutateAsync([user.id, dialog!.a.id, r])}
      />
      <ReasonDialog
        open={dialog?.kind === "cancel"}
        title="Cancelar cita"
        description="El código no se reutilizará y el horario se liberará si sigue vigente."
        confirmLabel="Cancelar cita"
        destructive
        onClose={() => setDialog(null)}
        onSubmit={async (r) => {
          const a = await cancel.mutateAsync([user.id, dialog!.a.id, r]);
          toast.success("Cita cancelada", {
            description: "¿Quieres iniciar una nueva asignación para la misma persona?",
            action: { label: "Nueva asignación", onClick: () => navigate({ to: "/buscar", search: { name: a.personName, phone: a.personPhone } }) },
            duration: 10000,
          });
        }}
      />
      <ReasonDialog
        open={dialog?.kind === "correction"}
        title="Solicitar corrección"
        description={`Describe qué hay que corregir en la cita ${dialog?.a.code ?? ""}. El administrador la revisará.`}
        label="Corrección solicitada"
        confirmLabel="Enviar solicitud"
        onClose={() => setDialog(null)}
        onSubmit={(m) => correction.mutateAsync([user.id, dialog!.a.id, m])}
      />
    </>
  );
  return { actions, dialogs };
}

function Assignments() {
  const user = useUser();
  return user.role === "admin" ? <AdminView user={user} /> : <OrientadorView user={user} />;
}

function SpecialistFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: specs = [] } = useSpecialists();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-60 bg-card"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los especialistas</SelectItem>
        {specs.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function OrientadorView({ user }: { user: User }) {
  const [spec, setSpec] = useState("all");
  const { actions, dialogs } = useRowActions(user);
  const mine = useQuery({ queryKey: ["assignments", "mine", user.id], queryFn: () => services.assignments.list(user.id, { createdBy: user.id }) });
  const confirmed = useQuery({
    queryKey: ["assignments", "confirmed", spec],
    queryFn: () => services.assignments.list(user.id, { specialistId: spec === "all" ? undefined : spec }),
  });
  return (
    <>
      <PageHeader title="Asignaciones y citas" />
      <Tabs defaultValue="mine">
        <TabsList className="mb-4">
          <TabsTrigger value="mine">Mis asignaciones</TabsTrigger>
          <TabsTrigger value="confirmed">Citas confirmadas</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          <AssignmentTable rows={mine.data ?? []} empty="Aún no has iniciado asignaciones." actions={actions} />
        </TabsContent>
        <TabsContent value="confirmed" className="space-y-4">
          <SpecialistFilter value={spec} onChange={setSpec} />
          <AssignmentTable rows={confirmed.data ?? []} empty="No hay citas confirmadas." actions={actions} />
        </TabsContent>
      </Tabs>
      {dialogs}
    </>
  );
}

function AdminView({ user }: { user: User }) {
  const [spec, setSpec] = useState("all");
  const [status, setStatus] = useState<"all" | DisplayStatus>("all");
  const { actions, dialogs } = useRowActions(user);
  const specialistId = spec === "all" ? undefined : spec;
  const pending = useQuery({ queryKey: ["assignments", "pending", spec], queryFn: () => services.assignments.list(user.id, { status: "pending", specialistId }) });
  const all = useQuery({
    queryKey: ["assignments", "all", spec, status],
    queryFn: () => services.assignments.list(user.id, { specialistId, status: status === "all" ? undefined : status }),
  });
  const history = useQuery({
    queryKey: ["assignments", "history", spec],
    queryFn: async () => {
      const [c, d] = await Promise.all([
        services.assignments.list(user.id, { status: "cancelled", specialistId }),
        services.assignments.list(user.id, { status: "discarded", specialistId }),
      ]);
      return [...c, ...d].sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
    },
  });
  const corrections = useQuery({ queryKey: ["corrections"], queryFn: () => services.assignments.corrections(user.id) });
  const { data: names = {} } = useUserNames();
  const codeOf = (id: string) => [...(all.data ?? []), ...(history.data ?? [])].find((a) => a.id === id)?.code ?? "—";

  return (
    <>
      <PageHeader title="Asignaciones y citas">
        <SpecialistFilter value={spec} onChange={setSpec} />
      </PageHeader>
      <Tabs defaultValue="pending">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="pending">Pendientes ({pending.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
          <TabsTrigger value="corrections">Correcciones ({corrections.data?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending">
          <p className="mb-3 text-sm text-muted-foreground">De la más antigua a la más reciente.</p>
          <AssignmentTable rows={pending.data ?? []} empty="No hay asignaciones pendientes de confirmación." actions={actions} />
        </TabsContent>
        <TabsContent value="all" className="space-y-4">
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-60 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {(Object.keys(STATUS_LABEL) as DisplayStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <AssignmentTable rows={all.data ?? []} empty="No hay registros con esos filtros." actions={actions} />
        </TabsContent>
        <TabsContent value="history">
          <p className="mb-3 text-sm text-muted-foreground">Citas canceladas y asignaciones descartadas.</p>
          <AssignmentTable rows={history.data ?? []} empty="Sin registros en el historial." actions={actions} />
        </TabsContent>
        <TabsContent value="corrections">
          <div className="space-y-2">
            {!corrections.data?.length && <p className="text-sm text-muted-foreground">No hay solicitudes de corrección.</p>}
            {corrections.data?.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4 text-sm shadow-card">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Cita <strong className="font-mono text-primary-strong">{codeOf(c.assignmentId)}</strong> · {names[c.createdBy]}</span>
                  <span>{formatDateTime(c.createdAt)}</span>
                </div>
                {c.message}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      {dialogs}
    </>
  );
}
