import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { api, setToken, clearToken, ApiError, type User } from "../lib/api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  sessionWarning: boolean;
  secondsRemaining: number;
  extendSession: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Ref so event handlers always see the latest lastInteractionTime without stale closures
  const lastInteractionRef = useRef<number>(Date.now());

  const loadMe = useCallback(async () => {
    const token = localStorage.getItem("fellowship_token");
    if (!token) { setLoading(false); return; }
    try {
      const me = await api.get<User>("/auth/me");
      setUser(me);
    } catch (err) {
      // Only clear the stored token when the server explicitly rejects it (401).
      // Network errors, server restarts, or 5xx responses must NOT log the user out.
      if (err instanceof ApiError && err.status === 401) {
        clearToken();
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMe(); }, [loadMe]);

  const login = async (email: string, password: string) => {
    let networkIp = "";
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json").then((r) => r.json());
      if (ipRes && ipRes.ip) {
        networkIp = ipRes.ip;
      }
    } catch (e) {
      console.warn("Failed to fetch public network IP:", e);
    }

    const data = await api.post<{ token: string; user: User }>("/auth/login", { email, password, networkIp });
    setToken(data.token);
    setUser(data.user);
  };

  const logout = useCallback(() => {
    api.post("/auth/logout", {}).catch(() => {});
    clearToken();
    setUser(null);
    setSessionWarning(false);
  }, []);

  const extendSession = useCallback(() => {
    lastInteractionRef.current = Date.now();
    setSessionWarning(false);
    setSecondsRemaining(0);
  }, []);

  // Inactivity Auto-Logout Effect
  useEffect(() => {
    if (!user) return;

    lastInteractionRef.current = Date.now();
    let timeoutMinutes = 30;

    // Fetch dynamic timeout configuration from global settings
    api.get<{ value: string }>("/global-settings/session_inactivity_timeout")
      .then(setting => {
        if (setting?.value) {
          const parsed = parseInt(setting.value, 10);
          if (!isNaN(parsed) && parsed > 0) timeoutMinutes = parsed;
        }
      })
      .catch(() => {});

    const handleInteraction = () => {
      lastInteractionRef.current = Date.now();
    };

    window.addEventListener("mousemove", handleInteraction);
    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("click", handleInteraction);
    window.addEventListener("scroll", handleInteraction);

    // Check every second for precise countdown display
    const intervalId = setInterval(() => {
      const elapsedMs = Date.now() - lastInteractionRef.current;
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const warningThresholdMs = 2 * 60 * 1000; // show warning 2 min before expiry
      const remaining = Math.max(0, Math.ceil((timeoutMs - elapsedMs) / 1000));

      if (elapsedMs >= timeoutMs) {
        logout();
      } else if (elapsedMs >= timeoutMs - warningThresholdMs) {
        setSessionWarning(true);
        setSecondsRemaining(remaining);
      } else {
        setSessionWarning(false);
      }
    }, 1000);

    return () => {
      window.removeEventListener("mousemove", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("scroll", handleInteraction);
      clearInterval(intervalId);
    };
  }, [user, logout]);

  const refreshUser = async () => {
    const me = await api.get<User>("/auth/me");
    setUser(me);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, sessionWarning, secondsRemaining, extendSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
