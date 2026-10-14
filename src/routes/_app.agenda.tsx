import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AssignmentTable } from "@/components/AssignmentTable";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/lib/auth";
import { colombiaDayKey } from "@/lib/datetime";
import { services } from "@/services";

export const Route = createFileRoute("/_app/agenda")({
  head: () => ({
    meta: [
      { title: "Mi agenda — Citas con especialistas" },
      { name: "description", content: "Tus citas confirmadas de hoy, próximas e historial." },
      { property: "og:title", content: "Mi agenda" },
      { property: "og:description", content: "Tus citas confirmadas de hoy, próximas e historial." },
    ],
  }),
  component: Agenda,
});

function Agenda() {
  const user = useUser();
  const { data = [] } = useQuery({ queryKey: ["assignments", "agenda", user.id], queryFn: () => services.assignments.list(user.id) });
  const today = colombiaDayKey(new Date());
  const now = Date.now();
  const todayRows = data.filter((a) => colombiaDayKey(a.start) === today);
  const upcoming = data.filter((a) => new Date(a.start).getTime() >= now && colombiaDayKey(a.start) !== today);
  const past = data.filter((a) => new Date(a.start).getTime() < now && colombiaDayKey(a.start) !== today);
  return (
    <>
      <PageHeader title="Mi agenda" description="Solo consulta: para cambios comunícate con un administrador." />
      <Tabs defaultValue="upcoming">
        <TabsList className="mb-4">
          <TabsTrigger value="upcoming">Hoy y próximas</TabsTrigger>
          <TabsTrigger value="past">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="space-y-6">
          <section>
            <h2 className="mb-2 font-semibold text-primary-strong">Hoy</h2>
            <AssignmentTable rows={todayRows} empty="No tienes citas hoy." hideSpecialist />
          </section>
          <section>
            <h2 className="mb-2 font-semibold text-primary-strong">Próximas</h2>
            <AssignmentTable rows={upcoming} empty="No tienes citas próximas." hideSpecialist />
          </section>
        </TabsContent>
        <TabsContent value="past">
          <AssignmentTable rows={past} empty="Sin citas pasadas." hideSpecialist />
        </TabsContent>
      </Tabs>
    </>
  );
}
