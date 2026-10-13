import React, { createContext, useContext, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

export interface Program {
  id: number;
  name: string;
  code: string;
  category: "fellowship" | "vct" | "optometry" | "nursing" | "paramedical" | "general_exam" | string;
  academicYear: string;
  description?: string | null;
  requiresApplicationForm?: boolean;
  requiresPayment?: boolean;
  requiresPsychometry?: boolean;
  requiresTheoryExam?: boolean;
  requiresInterviewViva?: boolean;
  stats?: {
    specialitiesCount: number;
    candidatesCount: number;
  };
}

interface ProgramContextType {
  programs: Program[];
  activeProgram: Program | null;
  activeProgramId: number | null;
  setActiveProgramId: (id: number | null) => void;
  isLoading: boolean;
  isHubOpen: boolean;
  setHubOpen: (open: boolean) => void;
  openProgramHub: () => void;
}

const ProgramContext = createContext<ProgramContextType | undefined>(undefined);

const STORAGE_KEY = "sav_active_program_id";

export function ProgramProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeProgramId, setActiveProgramIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Number(saved) : null;
  });
  const [isHubOpen, setHubOpen] = useState<boolean>(false);

  const { data: programs = [], isLoading } = useQuery<Program[]>({
    queryKey: ["programs"],
    queryFn: () => api.get<Program[]>("/programs"),
    enabled: !!user,
    staleTime: 60_000,
  });

  // Auto-select Fellowship or first program if none is selected yet
  useEffect(() => {
    if (programs.length > 0) {
      if (activeProgramId === null) {
        // Find fellowship program by default
        const fellowshipProg = programs.find((p) => p.category === "fellowship" || p.name.toLowerCase().includes("fellowship"));
        const defaultProg = fellowshipProg || programs[0];
        if (defaultProg) {
          setActiveProgramIdState(defaultProg.id);
          localStorage.setItem(STORAGE_KEY, String(defaultProg.id));
        }
      } else {
        // Verify activeProgramId actually exists in programs
        const exists = programs.some((p) => p.id === activeProgramId);
        if (!exists && programs[0]) {
          setActiveProgramIdState(programs[0].id);
          localStorage.setItem(STORAGE_KEY, String(programs[0].id));
        }
      }
    }
  }, [programs, activeProgramId]);

  const setActiveProgramId = (id: number | null) => {
    setActiveProgramIdState(id);
    if (id !== null) {
      localStorage.setItem(STORAGE_KEY, String(id));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const activeProgram = programs.find((p) => p.id === activeProgramId) || null;

  return (
    <ProgramContext.Provider
      value={{
        programs,
        activeProgram,
        activeProgramId,
        setActiveProgramId,
        isLoading,
        isHubOpen,
        setHubOpen,
        openProgramHub: () => setHubOpen(true),
      }}
    >
      {children}
    </ProgramContext.Provider>
  );
}

export function useProgram() {
  const context = useContext(ProgramContext);
  if (!context) {
    throw new Error("useProgram must be used within a ProgramProvider");
  }
  return context;
}
