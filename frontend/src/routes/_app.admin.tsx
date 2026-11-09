import { createFileRoute, Outlet } from "@tanstack/react-router";

import { EmptyState } from "@/components/PageHeader";
import { useUser } from "@/lib/auth";

export const Route = createFileRoute("/_app/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const user = useUser();
  if (user.role !== "admin") return <EmptyState>Esta sección es solo para administradores.</EmptyState>;
  return <Outlet />;
}
