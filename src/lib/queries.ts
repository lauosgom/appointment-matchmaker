import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { services, type CategoryKind } from "@/services";

export const useSpecialists = () =>
  useQuery({ queryKey: ["specialists"], queryFn: () => services.specialists.list() });

export const useCategories = (kind: CategoryKind) =>
  useQuery({ queryKey: ["categories", kind], queryFn: () => services.categories.list(kind) });

export const useUserNames = () =>
  useQuery({ queryKey: ["user-names"], queryFn: () => services.users.names() });

export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => services.settings.get() });

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Ocurrió un error inesperado. Inténtalo de nuevo.";
}

/** Runs a service call, shows a toast, and refreshes every cached list. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: A) => fn(...args),
    onSuccess: () => {
      if (success) toast.success(success);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
