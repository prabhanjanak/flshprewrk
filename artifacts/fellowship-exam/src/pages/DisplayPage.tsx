import { useEffect, useState } from "react";
import { fmtDate, fmtTime } from "../lib/dateUtils";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Loader2, Monitor, CheckCircle2, Clock, Sun, Moon } from "lucide-react";
import { Button } from "../components/ui/button";
import logoUrl from "../assets/seh_sav_logo_1777703794142.jpg";

interface QueueItem { candidateCode: string; }
interface PanelDisplay {
  panelId: number;
  panelName: string;
  roomNumber: string;
  isActive: boolean;
  current: { candidateCode: string; calledAt: string } | null;
  nextQueue: QueueItem[];
}

function useTime() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return t;
}

export default function DisplayPage() {
  const { user } = useAuth();
  const now = useTime();

  const [isDark, setIsDark] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const themeParam = params.get("theme");
    if (themeParam) return themeParam === "dark";
    const stored = localStorage.getItem("tv_theme");
    return stored ? stored === "dark" : false; // default to light theme as requested!
  });

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      localStorage.setItem("tv_theme", next ? "dark" : "light");
      return next;
    });
  };

  const { data: panels = [], isLoading, error } = useQuery<PanelDisplay[]>({
    queryKey: ["display-live"],
    queryFn: () => api.get<PanelDisplay[]>("/display/live"),
    refetchInterval: 3000,
  });

  if (!user) return null;

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${isDark ? "bg-gray-950 text-white" : "bg-slate-50 text-slate-900"}`} style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div className={`transition-colors duration-300 border-b px-8 py-4 flex items-center justify-between ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-slate-200"}`}>
        <div className="flex items-center gap-4">
          <img src={logoUrl} alt="SAV" className="h-12 w-12 rounded-xl object-contain bg-white p-1.5 shadow-sm border border-slate-200/50" />
          <div>
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>Sankara Academy of Vision</h1>
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-slate-500"}`}>Fellowship Interview — Waiting Hall Display</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className={`text-2xl font-mono font-bold ${isDark ? "text-blue-400" : "text-indigo-650"}`}>
              {fmtTime(now)}
            </p>
            <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-slate-400"}`}>
              {fmtDate(now)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className={`rounded-full h-10 w-10 border transition-all ${isDark ? "border-gray-800 text-yellow-400 hover:bg-gray-800" : "border-slate-250 text-indigo-650 hover:bg-slate-100"}`}
            title="Toggle Light/Dark Theme"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Loader2 className={`h-12 w-12 animate-spin ${isDark ? "text-blue-400" : "text-indigo-650"}`} />
            <p className={`text-lg ${isDark ? "text-gray-400" : "text-slate-500"}`}>Loading panel status…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64">
            <p className="text-red-400 text-lg">Unable to load panel data. Please check connection.</p>
          </div>
        ) : panels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <Monitor className={`h-16 w-16 ${isDark ? "text-gray-700" : "text-slate-300"}`} />
            <p className={`text-xl ${isDark ? "text-gray-500" : "text-slate-450"}`}>No active interview panels configured</p>
            <p className={`text-sm ${isDark ? "text-gray-600" : "text-slate-400"}`}>Panels will appear here once they are set up in the admin panel</p>
          </div>
        ) : (
          <div className={`grid gap-6 ${panels.length === 1 ? "grid-cols-1 max-w-lg mx-auto" : panels.length === 2 ? "grid-cols-2" : panels.length <= 4 ? "grid-cols-2 lg:grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
            {panels.map((p) => (
              <PanelCard key={p.panelId} panel={p} isDark={isDark} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`transition-colors duration-300 border-t px-8 py-2 flex items-center justify-between ${isDark ? "bg-gray-900 border-gray-800 text-gray-600" : "bg-white border-slate-200 text-slate-400"}`}>
        <p className="text-xs">Refreshes every 3 seconds · Sankara Eye Care Institutions</p>
        <div className="flex items-center gap-2 text-xs text-emerald-500">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </div>
      </div>
    </div>
  );
}

function PanelCard({ panel, isDark }: { panel: PanelDisplay; isDark: boolean }) {
  const hasCurrent = !!panel.current;
  const nextList = panel.nextQueue.slice(0, 3);

  return (
    <div className={`rounded-2xl border-2 overflow-hidden transition-all duration-500 ${
      isDark
        ? hasCurrent
          ? "border-blue-500 bg-gradient-to-b from-blue-950/60 to-gray-900 text-white"
          : "border-gray-700 bg-gray-900 text-gray-300"
        : hasCurrent
          ? "border-indigo-400 bg-gradient-to-b from-indigo-50/80 to-white shadow-lg shadow-indigo-100/50 text-slate-800"
          : "border-slate-200 bg-white shadow-sm text-slate-700"
    }`}>
      {/* Room header */}
      <div className={`px-6 py-3 flex items-center justify-between ${
        isDark 
          ? hasCurrent ? "bg-blue-900/40" : "bg-gray-800/50"
          : hasCurrent ? "bg-indigo-100/50" : "bg-slate-50"
      }`}>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest ${isDark ? "text-gray-400" : "text-slate-400"}`}>Room</p>
          <p className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{panel.roomNumber}</p>
        </div>
        <div className="text-right">
          <p className={`text-xs ${isDark ? "text-gray-500" : "text-slate-450"}`}>{panel.panelName}</p>
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-1 ${
            isDark
              ? hasCurrent ? "bg-blue-500/20 text-blue-300" : "bg-green-500/20 text-green-400"
              : hasCurrent ? "bg-indigo-100 text-indigo-700 border border-indigo-200/60" : "bg-green-50 text-green-700 border border-green-200/60"
          }`}>
            <div className={`h-1.5 w-1.5 rounded-full ${
              hasCurrent 
                ? isDark ? "bg-blue-400 animate-pulse" : "bg-indigo-500 animate-pulse"
                : "bg-green-500"
            }`} />
            {hasCurrent ? "In Session" : "Available"}
          </div>
        </div>
      </div>

      {/* Current candidate */}
      <div className="px-6 py-5">
        <p className={`text-xs font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-gray-500" : "text-slate-400"}`}>Now Interviewing</p>
        {hasCurrent ? (
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center border ${
              isDark 
                ? "bg-blue-500/20 border-blue-500/30" 
                : "bg-indigo-50 border-indigo-150"
            }`}>
              <CheckCircle2 className={`h-6 w-6 ${isDark ? "text-blue-400" : "text-indigo-650"}`} />
            </div>
            <div>
              <p className={`text-3xl font-bold font-mono tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>{panel.current!.candidateCode}</p>
              {panel.current!.calledAt && (
                <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-slate-450"}`}>
                  Called at {fmtTime(panel.current!.calledAt)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 opacity-50">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center border ${isDark ? "bg-gray-800 border-gray-700" : "bg-slate-100 border-slate-200"}`}>
              <Clock className={`h-6 w-6 ${isDark ? "text-gray-500" : "text-slate-400"}`} />
            </div>
            <p className={`text-xl font-medium ${isDark ? "text-gray-500" : "text-slate-400"}`}>—</p>
          </div>
        )}
      </div>

      {/* Next queue */}
      {nextList.length > 0 && (
        <div className="px-6 pb-5">
          <p className={`text-xs font-semibold uppercase tracking-widest mb-2 ${isDark ? "text-gray-500" : "text-slate-400"}`}>Next in Queue</p>
          <div className="flex flex-wrap gap-2">
            {nextList.map((q, i) => (
              <div key={q.candidateCode} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-mono ${
                isDark
                  ? i === 0
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : "bg-gray-800 border-gray-700 text-gray-400"
                  : i === 0
                    ? "bg-amber-50 border-amber-200 text-amber-800 font-bold"
                    : "bg-slate-50 border-slate-200 text-slate-600"
              }`}>
                <span className="text-[10px] font-sans font-medium opacity-60">{i + 1}</span>
                {q.candidateCode}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

