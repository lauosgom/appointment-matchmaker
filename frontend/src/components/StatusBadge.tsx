import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DisplayStatus } from "@/services";

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  pending: "Pendiente de confirmación",
  confirmed: "Confirmada",
  past: "Fecha pasada",
  cancelled: "Cancelada",
  discarded: "Descartada",
};

const STYLE: Record<DisplayStatus, string> = {
  pending: "bg-warning/20 text-foreground border-warning",
  confirmed: "bg-primary text-primary-foreground border-primary",
  past: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/15 text-destructive border-destructive/40",
  discarded: "bg-secondary text-secondary-foreground border-border",
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", STYLE[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
