import type { ReactNode } from "react";

import { EmptyState } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatTime } from "@/lib/datetime";
import { useSpecialists, useUserNames } from "@/lib/queries";
import { displayStatus, type Assignment } from "@/services";

interface Props {
  rows: Assignment[];
  empty: string;
  hideSpecialist?: boolean;
  actions?: (a: Assignment) => ReactNode;
}

export function AssignmentTable({ rows, empty, hideSpecialist, actions }: Props) {
  const { data: specs = [] } = useSpecialists();
  const { data: names = {} } = useUserNames();
  if (!rows.length) return <EmptyState>{empty}</EmptyState>;
  const now = new Date();
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/60 hover:bg-secondary/60">
            <TableHead>Código</TableHead>
            <TableHead>Persona</TableHead>
            {!hideSpecialist && <TableHead>Especialista</TableHead>}
            <TableHead>Fecha</TableHead>
            <TableHead>Hora</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Orientador</TableHead>
            <TableHead>Confirmó / cerró</TableHead>
            {actions && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-mono font-semibold text-primary-strong">{a.code ?? "—"}</TableCell>
              <TableCell>
                <div>{a.personName ?? "—"}</div>
                {a.personPhone && <div className="text-xs text-muted-foreground">{a.personPhone}</div>}
              </TableCell>
              {!hideSpecialist && <TableCell>{specs.find((s) => s.id === a.specialistId)?.fullName ?? "—"}</TableCell>}
              <TableCell>{formatDate(a.start)}</TableCell>
              <TableCell>{formatTime(a.start)}</TableCell>
              <TableCell>
                <StatusBadge status={displayStatus(a, now)} />
                {a.closeReason && <div className="mt-1 max-w-48 text-xs text-muted-foreground">Motivo: {a.closeReason}</div>}
              </TableCell>
              <TableCell>{names[a.createdBy] ?? "—"}</TableCell>
              <TableCell className="text-sm">
                {a.closedBy ? names[a.closedBy] : a.confirmedBy ? names[a.confirmedBy] : "—"}
              </TableCell>
              {actions && <TableCell className="text-right"><div className="flex justify-end gap-2">{actions(a)}</div></TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
