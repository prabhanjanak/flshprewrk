import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { fmtTime, fmtDate } from "../lib/dateUtils";
import { 
  Loader2, 
  Building2, 
  Clock, 
  Activity, 
  Info,
  ShieldCheck,
  UserCheck,
  Clock3,
  Sun,
  Moon
} from "lucide-react";
import { api } from "../lib/api";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

/**
 * QueueDisplayPage - Premium Enterprise Board
 * Highly creative, space-efficient, and professional.
 * Removes redundant inline labels, enlarges column headers, 
 * and tightens highlight boxes to look elegant rather than oversized.
 */

export default function QueueDisplayPage() {
  const [time, setTime] = useState(new Date());
  const [isVerified, setIsVerified] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("tv_verified");
    if (stored === "true") setIsVerified(true);
  }, []);

  const { data: panels = [], isLoading: isLoadingPanels } = useQuery({
    queryKey: ["display-live"],
    queryFn: () => api.get<any[]>("/display/live"),
    refetchInterval: 3000, 
    enabled: isVerified,
  });

  const { data: specialities = [] } = useQuery<any[]>({
    queryKey: ["specialities-public"],
    queryFn: () => api.get("/specialities"),
    enabled: isVerified,
  });

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode) return;
    setVerifying(true);
    setError("");
    try {
      const res = await api.post<{ success: boolean }>("/tv-access/verify", { code: accessCode });
      if (res.success) {
        setIsVerified(true);
        sessionStorage.setItem("tv_verified", "true");
      }
    } catch (e: any) {
      setError(e.message || "Unauthorized");
    } finally {
      setVerifying(false);
    }
  };

  if (!isVerified) {
    return (
      <div className={`h-screen flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] transition-colors duration-300 ${
        isDark 
          ? "from-slate-800 via-slate-950 to-black text-white" 
          : "from-indigo-50/50 via-slate-50 to-white text-slate-850"
      }`}>
        <div className={`border backdrop-blur-2xl p-12 rounded-[2.5rem] shadow-2xl w-full max-w-md ${
          isDark 
            ? "bg-slate-900/60 border-slate-700/50 text-white" 
            : "bg-white/80 border-slate-200/80 text-slate-800"
        }`}>
          <div className="text-center mb-10">
            <ShieldCheck size={64} className="text-orange-500 mx-auto mb-4 animate-pulse" />
            <h1 className="text-3xl font-black uppercase tracking-wider text-orange-500">TV Board Terminal</h1>
            <p className={`font-semibold mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Secure pairing required for Waiting Hall.</p>
          </div>
          <form onSubmit={handleVerify} className="space-y-6">
            <Input
              autoFocus
              type="text"
              placeholder="000000"
              maxLength={6}
              value={accessCode}
              onChange={(e) => { setAccessCode(e.target.value.toUpperCase()); setError(""); }}
              className={`h-20 text-center text-5xl font-black tracking-[0.4em] rounded-2xl border-2 ${
                isDark 
                  ? "bg-black/40 border-slate-700 text-white placeholder-slate-700 focus:border-orange-500 focus:ring-orange-500" 
                  : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-300 focus:border-orange-500 focus:ring-orange-500"
              }`}
            />
            {error && <p className="text-red-500 font-bold text-center uppercase text-xs">{error}</p>}
            <Button type="submit" disabled={verifying || accessCode.length < 6} className="w-full h-16 text-xl font-black uppercase rounded-2xl shadow-lg bg-orange-600 hover:bg-orange-550 border-none transition-all cursor-pointer text-white">
              {verifying ? "Syncing..." : "Connect Display"}
            </Button>
          </form>
          <div className="flex justify-center mt-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className={`rounded-full h-10 w-10 border transition-all ${isDark ? "border-slate-800 text-yellow-400 hover:bg-slate-800" : "border-slate-250 text-indigo-650 hover:bg-slate-100"}`}
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingPanels) {
    return (
      <div className={`h-screen flex items-center justify-center transition-colors duration-300 ${isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-800"}`}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-16 w-16 animate-spin text-orange-500" />
          <p className="text-slate-500 font-bold tracking-widest text-xs uppercase animate-pulse">Initializing Board...</p>
        </div>
      </div>
    );
  }

  // Segment Split Logic
  const getPanelSegment = (panel: any) => {
    if (panel.isMindMatter) return "Mind Matter";
    
    const spec = specialities.find(s => s.id === panel.specialityId);
    const specNameLower = spec?.name.toLowerCase() || "";
    const panelNameLower = panel.panelName?.toLowerCase() || "";
    
    const isMindMatter = 
      panelNameLower.includes("mind") || 
      panelNameLower.includes("matter") || 
      panelNameLower.includes("psych") || 
      panelNameLower.includes("hr") || 
      panelNameLower.includes("behavior") ||
      specNameLower.includes("mind") || 
      specNameLower.includes("matter") || 
      specNameLower.includes("psych") || 
      specNameLower.includes("hr") || 
      specNameLower.includes("behavior");

    if (isMindMatter) {
      return "Mind Matter";
    }
    return "Medical";
  };

  const medicalPanels = panels.filter(p => getPanelSegment(p) === "Medical");
  const mindMatterPanels = panels.filter(p => getPanelSegment(p) === "Mind Matter");

  return (
    <div className={`h-screen font-sans flex flex-col overflow-hidden select-none transition-colors duration-300 ${
      isDark 
        ? "bg-slate-950 text-slate-100 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black" 
        : "bg-slate-50 text-slate-800 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50/30 via-slate-50 to-white"
    }`}>
      
      {/* 1. PREMIUM BRANDED HEADER */}
      <header className={`h-[120px] backdrop-blur-md border-b px-8 flex items-center justify-between shrink-0 z-50 transition-colors duration-300 ${
        isDark 
          ? "bg-slate-900/60 border-slate-800/80 text-white" 
          : "bg-white/95 border-slate-200/80 text-slate-850"
      }`}>
        <div className="flex items-center gap-8 overflow-hidden">
          <div className={`h-16 px-4 py-2 rounded-2xl flex items-center justify-center border shadow-inner transition-colors duration-300 ${
            isDark 
              ? "bg-white/10 border-white/5" 
              : "bg-slate-100 border-slate-200/85"
          }`}>
            <span className="text-2xl font-black tracking-tight uppercase bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">SAV ACADEMY</span>
          </div>
          <div className={`h-12 w-[1px] flex-shrink-0 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
          <div className="overflow-hidden">
            <h1 className={`text-4xl font-extrabold uppercase tracking-tight leading-none ${isDark ? "text-white" : "text-slate-800"}`}>
              Live Queue Status Board
            </h1>
            <div className="flex items-center gap-4 mt-2">
               <span className={`text-[10px] font-black uppercase border px-3 py-1 rounded-full flex items-center gap-2 flex-shrink-0 shadow-sm ${
                 isDark 
                   ? "text-emerald-400 bg-emerald-950/50 border-emerald-800/40 shadow-emerald-950" 
                   : "text-emerald-700 bg-emerald-50 border-emerald-200/60 shadow-emerald-50"
               }`}>
                 <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                 Broadcasting Live
               </span>
               <div className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase truncate">
                  <Building2 size={14} className="flex-shrink-0" /> <span className="truncate">{panels[0]?.batch?.venue || "Bangalore Campus"}</span>
               </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 flex-shrink-0">
          <div className={`flex items-center gap-4 border px-8 py-4 rounded-3xl shadow-2xl transition-colors duration-300 ${
            isDark 
              ? "bg-slate-900 border-slate-800 text-white" 
              : "bg-white border-slate-200 text-slate-850"
          }`}>
             <Clock size={32} className="text-orange-500" />
             <span className={`text-5xl font-black tabular-nums tracking-tight leading-none ${
               isDark 
                 ? "bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent" 
                 : "text-slate-800"
             }`}>
                {fmtTime(time)}
             </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className={`rounded-full h-12 w-12 border transition-all ${
              isDark 
                ? "border-slate-800 text-yellow-400 hover:bg-slate-800" 
                : "border-slate-250 text-indigo-650 hover:bg-slate-105"
            }`}
            title="Toggle Light/Dark Theme"
          >
            {isDark ? <Sun className="h-6 w-6" /> : <Moon className="h-6 w-6" />}
          </Button>
        </div>
      </header>

      {/* 2. SPLIT SEGMENT COLUMNS */}
      <main className="flex-1 flex p-6 gap-6 overflow-hidden">
        
        {/* ================= MEDICAL INTERVIEW ================= */}
        <section className={`flex-1 flex flex-col rounded-3xl border backdrop-blur-xl p-4 overflow-hidden shadow-2xl relative transition-colors duration-300 ${
          isDark 
            ? "bg-indigo-950/20 border-indigo-900/30" 
            : "bg-indigo-50/25 border-indigo-200/50"
        }`}>
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none rounded-3xl" />
          
          {/* Header */}
          <div className={`flex items-center justify-between border px-6 py-4 rounded-2xl shadow-lg shrink-0 mb-4 transition-colors duration-300 ${
            isDark 
              ? "bg-gradient-to-r from-indigo-900 to-indigo-850 border-indigo-700/50 text-indigo-200" 
              : "bg-gradient-to-r from-indigo-600 to-indigo-550 border-indigo-400 text-white"
          }`}>
            <h2 className="text-2xl font-black uppercase tracking-wider">Medical Interview</h2>
            <Badge variant="outline" className={`text-xs font-black uppercase px-3 py-1 border-none ${
              isDark 
                ? "border-indigo-500/40 text-indigo-300 bg-indigo-950/40" 
                : "text-indigo-600 bg-white"
            }`}>
              {medicalPanels.length} Panels Active
            </Badge>
          </div>

          {/* Table Headers */}
          <div className={`flex w-full items-center px-6 py-3 rounded-xl shrink-0 border mb-3 text-[11px] font-black uppercase tracking-widest transition-colors duration-305 ${
            isDark 
              ? "bg-slate-900/40 border-slate-800/30 text-slate-500" 
              : "bg-indigo-50/45 border-indigo-100 text-indigo-500"
          }`}>
            <div className="w-[20%]">Station</div>
            <div className="w-[45%]">Current Assessment</div>
            <div className="w-[17%]">Next</div>
            <div className="w-[18%] text-right">Status</div>
          </div>

          {/* Cards Queue */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 scrollbar-none">
            {medicalPanels.length === 0 ? (
              <div className="flex-1 flex items-center justify-center flex-col opacity-25">
                 <Activity size={60} strokeWidth={1.5} className="text-indigo-400 mb-4 animate-pulse" />
                 <p className="text-lg font-black text-indigo-300 uppercase tracking-widest">No Active Panels</p>
              </div>
            ) : (
              medicalPanels.map((panel: any) => {
                const current = panel.current;
                const queue = panel.nextQueue || [];
                return (
                  <div key={panel.panelId} className={`flex w-full items-center px-6 py-4 border rounded-2xl transition-all shadow-lg duration-350 ${
                    isDark
                      ? current 
                        ? 'border-indigo-500/30 shadow-indigo-950/20 bg-indigo-950/10 text-white' 
                        : 'border-slate-850 bg-slate-900/20 text-slate-350'
                      : current 
                        ? 'border-indigo-205 shadow-indigo-100/50 bg-indigo-50/40 text-slate-850' 
                        : 'border-slate-200 bg-white text-slate-700'
                  }`}>
                    <div className={`w-[20%] font-black text-3xl tracking-tight ${isDark ? "text-white" : "text-indigo-950"}`}>{panel.roomNumber}</div>
                    <div className="w-[45%]">
                      {current ? (
                        <div className="inline-flex flex-col bg-indigo-600/90 text-white px-5 py-2 rounded-xl shadow-lg border border-indigo-400/20 max-w-full">
                          <span className="text-3xl font-black tracking-tight leading-none font-mono">{current.candidateCode}</span>
                          <span className="text-[10px] opacity-75 font-semibold mt-1 truncate max-w-[150px]">{current.fullName}</span>
                        </div>
                      ) : (
                        <span className="text-base font-bold text-slate-400 uppercase tracking-wider italic">No Candidate</span>
                      )}
                    </div>
                    <div className={`w-[17%] font-mono text-xl font-bold ${isDark ? "text-indigo-205" : "text-indigo-705"}`}>
                      {queue[0]?.candidateCode || "—"}
                    </div>
                    <div className="w-[18%] flex justify-end">
                      {current ? (
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 shadow-sm border ${
                          isDark 
                            ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" 
                            : "bg-indigo-105 border-indigo-200 text-indigo-700"
                        }`}>
                           <span className={`h-1.5 w-1.5 rounded-full animate-ping ${isDark ? "bg-indigo-400" : "bg-indigo-600"}`}></span>
                          Live
                        </span>
                      ) : (
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase border ${
                          isDark 
                            ? "bg-slate-800/40 border-slate-700/30 text-slate-500" 
                            : "bg-slate-100 border-slate-200 text-slate-400"
                        }`}>
                          Free
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ================= MIND MATTER INTERVIEW ================= */}
        <section className={`flex-1 flex flex-col rounded-3xl border backdrop-blur-xl p-4 overflow-hidden shadow-2xl relative transition-colors duration-300 ${
          isDark 
            ? "bg-emerald-950/20 border-emerald-900/30" 
            : "bg-emerald-50/25 border-emerald-200/50"
        }`}>
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none rounded-3xl" />
          
          {/* Header */}
          <div className={`flex items-center justify-between border px-6 py-4 rounded-2xl shadow-lg shrink-0 mb-4 transition-colors duration-300 ${
            isDark 
              ? "bg-gradient-to-r from-emerald-900 to-emerald-850 border-emerald-700/50 text-emerald-200" 
              : "bg-gradient-to-r from-emerald-600 to-emerald-555 border-emerald-400 text-white"
          }`}>
            <h2 className="text-2xl font-black uppercase tracking-wider">Mind Matter Interview</h2>
            <Badge variant="outline" className={`text-xs font-black uppercase px-3 py-1 border-none ${
              isDark 
                ? "border-emerald-500/40 text-emerald-300 bg-emerald-950/40" 
                : "text-emerald-600 bg-white"
            }`}>
              {mindMatterPanels.length} Panels Active
            </Badge>
          </div>

          {/* Table Headers */}
          <div className={`flex w-full items-center px-6 py-3 rounded-xl shrink-0 border mb-3 text-[11px] font-black uppercase tracking-widest transition-colors duration-300 ${
            isDark 
              ? "bg-slate-900/40 border-slate-800/30 text-slate-500" 
              : "bg-emerald-50/45 border-emerald-100 text-emerald-500"
          }`}>
            <div className="w-[20%]">Station</div>
            <div className="w-[45%]">Current Assessment</div>
            <div className="w-[17%]">Next</div>
            <div className="w-[18%] text-right">Status</div>
          </div>

          {/* Cards Queue */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 scrollbar-none">
            {mindMatterPanels.length === 0 ? (
              <div className="flex-1 flex items-center justify-center flex-col opacity-25">
                 <Activity size={60} strokeWidth={1.5} className="text-emerald-400 mb-4 animate-pulse" />
                 <p className="text-lg font-black text-emerald-300 uppercase tracking-widest">No Active Panels</p>
              </div>
            ) : (
              mindMatterPanels.map((panel: any) => {
                const current = panel.current;
                const queue = panel.nextQueue || [];
                return (
                  <div key={panel.panelId} className={`flex w-full items-center px-6 py-4 border rounded-2xl transition-all shadow-lg duration-300 ${
                    isDark
                      ? current 
                        ? 'border-emerald-500/30 shadow-emerald-950/20 bg-emerald-950/10 text-white' 
                        : 'border-slate-850 bg-slate-900/20 text-slate-350'
                      : current 
                        ? 'border-emerald-205 shadow-emerald-100/50 bg-emerald-50/40 text-slate-850' 
                        : 'border-slate-200 bg-white text-slate-700'
                  }`}>
                    <div className={`w-[20%] font-black text-3xl tracking-tight ${isDark ? "text-white" : "text-emerald-950"}`}>{panel.roomNumber}</div>
                    <div className="w-[45%]">
                      {current ? (
                        <div className="inline-flex flex-col bg-emerald-600/90 text-white px-5 py-2 rounded-xl shadow-lg border border-emerald-400/20 max-w-full">
                          <span className="text-3xl font-black tracking-tight leading-none font-mono">{current.candidateCode}</span>
                          <span className="text-[10px] opacity-75 font-semibold mt-1 truncate max-w-[150px]">{current.fullName}</span>
                        </div>
                      ) : (
                        <span className="text-base font-bold text-slate-400 uppercase tracking-wider italic">No Candidate</span>
                      )}
                    </div>
                    <div className={`w-[17%] font-mono text-xl font-bold ${isDark ? "text-emerald-205" : "text-emerald-705"}`}>
                      {queue[0]?.candidateCode || "—"}
                    </div>
                    <div className="w-[18%] flex justify-end">
                      {current ? (
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 shadow-sm border ${
                          isDark 
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                            : "bg-emerald-105 border-emerald-200 text-emerald-700"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full animate-ping ${isDark ? "bg-emerald-400" : "bg-emerald-600"}`}></span>
                          Live
                        </span>
                      ) : (
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase border ${
                          isDark 
                            ? "bg-slate-800/40 border-slate-700/30 text-slate-500" 
                            : "bg-slate-100 border-slate-200 text-slate-400"
                        }`}>
                          Free
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

      </main>

      {/* 3. PREMIUM ANNOUNCEMENT FOOTER */}
      <footer className="h-[80px] bg-orange-600 flex items-center shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-10">
         <div className="h-full px-12 bg-slate-900 flex items-center gap-4 text-white font-black text-2xl uppercase italic z-20 shadow-2xl relative border-r-4 border-white/10">
            <Info size={32} className="text-orange-400" />
            ATTENTION
         </div>
         <div className="flex-1 overflow-hidden relative">
            <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-primary to-transparent z-10" />
            <div className="flex items-center whitespace-nowrap animate-marquee text-white font-bold text-3xl uppercase tracking-widest">
               <span className="mx-24">KINDLY REPORT TO YOUR RESPECTIVE ROOMS 5 MINUTES BEFORE YOUR TURN</span>
               <span className="mx-24 text-slate-950">PLEASE KEEP YOUR MOBILE PHONES IN SILENT MODE</span>
               <span className="mx-24">ALL THE BEST TO ALL CANDIDATES FROM SANKARA ACADEMY OF VISION</span>
            </div>
         </div>
      </footer>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          animation: marquee 40s linear infinite;
        }
        .tabular-nums {
          font-variant-numeric: tabular-nums;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
