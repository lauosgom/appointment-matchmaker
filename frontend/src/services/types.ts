// Domain types and the single service contract every screen talks to.
// Swap the implementation in src/services/index.ts to connect a real backend.

export type Role = "admin" | "orientador" | "especialista";

export interface User {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  specialistId?: string | undefined;
}

export interface UserInput {
  username: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  specialistId?: string | undefined;
  password?: string | undefined;
}

export type CategoryKind = "department" | "area";

export interface Category {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface CategoryInput {
  code: string;
  name: string;
  active: boolean;
}

export interface Specialist {
  id: string;
  code: string;
  fullName: string;
  departmentIds: string[];
  areaIds: string[];
  active: boolean;
}

export type SpecialistInput = Omit<Specialist, "id">;

export interface Slot {
  id: string;
  specialistId: string;
  start: string; // ISO UTC
  durationMin: number;
  active: boolean;
}

export type AssignmentStatus = "pending" | "confirmed" | "cancelled" | "discarded";
/** Status as displayed: confirmed appointments in the past show as "past". */
export type DisplayStatus = AssignmentStatus | "past";

export interface Assignment {
  id: string;
  slotId: string;
  specialistId: string;
  start: string;
  durationMin: number;
  personName?: string | undefined;
  personPhone?: string | undefined;
  status: AssignmentStatus;
  code?: string | undefined;
  createdAt: string;
  createdBy: string;
  confirmedAt?: string | undefined;
  confirmedBy?: string | undefined;
  closedAt?: string | undefined;
  closedBy?: string | undefined;
  closeReason?: string | undefined;
}

export interface CorrectionRequest {
  id: string;
  assignmentId: string;
  message: string;
  createdBy: string;
  createdAt: string;
}

export interface Settings {
  durationMin: number;
  yearLetters: Record<string, string>;
}

export interface AvailabilityResult {
  specialist: Specialist;
  slot: Slot;
}

export interface SearchQuery {
  by: "specialist" | "department" | "area";
  id: string;
  /** YYYY-MM-DD in Colombia time; when omitted returns upcoming slots */
  date?: string | undefined;
}

export interface AssignmentFilter {
  specialistId?: string | undefined;
  status?: DisplayStatus | undefined;
  createdBy?: string | undefined;
}

export interface UsageWarning {
  specialists: number;
  pendingAppointments: number;
}

export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface AppServices {
  auth: {
    login(username: string, password: string): Promise<User>;
    requestPasswordReset(email: string): Promise<{ demoToken?: string }>;
    resetPassword(token: string, newPassword: string): Promise<void>;
  };
  users: {
    list(actorId: string): Promise<User[]>;
    get(id: string): Promise<User | undefined>;
    /** id -> full name, for showing who performed an operation */
    names(): Promise<Record<string, string>>;
    create(actorId: string, input: UserInput): Promise<User>;
    update(actorId: string, id: string, input: UserInput): Promise<User>;
  };
  categories: {
    list(kind: CategoryKind): Promise<Category[]>;
    create(actorId: string, kind: CategoryKind, input: CategoryInput): Promise<Category>;
    update(actorId: string, kind: CategoryKind, id: string, input: CategoryInput): Promise<Category>;
    usage(kind: CategoryKind, id: string): Promise<UsageWarning>;
  };
  specialists: {
    list(): Promise<Specialist[]>;
    create(actorId: string, input: SpecialistInput): Promise<Specialist>;
    update(actorId: string, id: string, input: SpecialistInput): Promise<Specialist>;
    pendingAppointments(id: string): Promise<number>;
  };
  slots: {
    list(specialistId: string): Promise<(Slot & { booked: boolean })[]>;
    add(actorId: string, specialistId: string, starts: string[]): Promise<Slot[]>;
    setActive(actorId: string, id: string, active: boolean): Promise<Slot>;
  };
  settings: {
    get(): Promise<Settings>;
    setDuration(actorId: string, minutes: number): Promise<{ needsReview: Slot[] }>;
    setYearLetters(actorId: string, year: string, letters: string): Promise<Settings>;
  };
  availability: {
    search(query: SearchQuery): Promise<AvailabilityResult[]>;
  };
  assignments: {
    list(actorId: string, filter?: AssignmentFilter): Promise<Assignment[]>;
    create(
      actorId: string,
      input: { slotId: string; personName?: string | undefined; personPhone?: string },
    ): Promise<Assignment>;
    confirm(actorId: string, id: string): Promise<Assignment>;
    discard(actorId: string, id: string, reason: string): Promise<Assignment>;
    cancel(actorId: string, id: string, reason: string): Promise<Assignment>;
    requestCorrection(actorId: string, id: string, message: string): Promise<CorrectionRequest>;
    corrections(actorId: string): Promise<CorrectionRequest[]>;
  };
}
