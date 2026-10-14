import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { services, type User } from "@/services";

const KEY = "citas-session-user";

interface AuthValue {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.sessionStorage.getItem(KEY);
    if (!id) return setReady(true);
    services.users
      .get(id)
      .then((u) => setUser(u && u.active ? u : null))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await services.auth.login(username, password);
    window.sessionStorage.setItem(KEY, u.id);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    window.sessionStorage.removeItem(KEY);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Signed-in user; only call inside the authenticated layout. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("No hay sesión activa");
  return user;
}
