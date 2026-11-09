import { CalendarCheck, CalendarClock, ClipboardList, Clock, FolderTree, Search, Settings, Stethoscope, Users } from "lucide-react";

import type { Role } from "@/services";

export const MENU = [
  { to: "/buscar", label: "Buscar disponibilidad", desc: "Encuentra un espacio e inicia una asignación", icon: Search, roles: ["orientador", "admin"] },
  { to: "/asignaciones", label: "Asignaciones y citas", desc: "Confirma, descarta y consulta citas", icon: ClipboardList, roles: ["orientador", "admin"] },
  { to: "/agenda", label: "Mi agenda", desc: "Tus citas confirmadas", icon: CalendarCheck, roles: ["especialista"] },
  { to: "/admin/disponibilidad", label: "Disponibilidad", desc: "Carga y desactiva espacios", icon: CalendarClock, roles: ["admin"] },
  { to: "/admin/especialistas", label: "Especialistas", desc: "Códigos, categorías y estado", icon: Stethoscope, roles: ["admin"] },
  { to: "/admin/catalogos", label: "Departamentos y áreas", desc: "Catálogos de categorías", icon: FolderTree, roles: ["admin"] },
  { to: "/admin/usuarios", label: "Usuarios", desc: "Cuentas, perfiles y contraseñas", icon: Users, roles: ["admin"] },
  { to: "/admin/configuracion", label: "Configuración", desc: "Duración de citas y letras del año", icon: Settings, roles: ["admin"] },
] as const satisfies readonly { to: string; label: string; desc: string; icon: typeof Clock; roles: readonly Role[] }[];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  orientador: "Orientador",
  especialista: "Especialista",
};
