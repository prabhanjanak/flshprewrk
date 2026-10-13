import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Users, BookOpen, Award, ClipboardList, Clock, Building2, Database, Loader2, MonitorPlay, KeyRound, RefreshCw, Eye, EyeOff, ChevronRight, TrendingUp, ShieldCheck } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { Input } from "../components/ui/input";

interface DashboardStats {
  candidates: number;
  programs: number;
  units: number;
  activeExams: number;
  allocated: number;
  pendingReview: number;
}

function StatCard({
  title, value, icon: Icon, color, href, description, trend
}: {
  title: string; value: number | string; icon: React.ElementType; color: string; href?: string; description?: string; trend?: string;
}) {
  const [, navigate] = useLocation();
  return (
    <div 
      onClick={() => href && navigate(href)}
      className={`group relative overflow-hidden rounded-[32px] p-8 transition-all duration-500 ${href ? 'cursor-pointer hover:scale-[1.02] active:scale-95' : ''} bg-white border border-slate-100 shadow-premium hover:shadow-2xl`}
    >
      <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full opacity-[0.03] transition-transform duration-700 group-hover:scale-150 ${color.replace('bg-', 'bg-')}`} />
      
      <div className="relative z-10 flex flex-col h-full justify-between gap-6">
        <div className="flex justify-between items-start">
          <div className={`p-4 rounded-2xl ${color} shadow-lg shadow-current/20 group-hover:rotate-6 transition-transform duration-500`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
          {trend && (
            <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 font-black text-[10px] h-6 px-3">
              {trend}
            </Badge>
          )}
        </div>
        
        <div>
          <h3 className="text-4xl font-black text-slate-900 tracking-tighter mb-1">{value}</h3>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
          {description && (
            <p className="text-[10px] font-bold text-slate-400 mt-2 italic">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  interview_completed: "bg-blue-100 text-blue-800",
  waitlisted: "bg-purple-100 text-purple-800",
  allocated: "bg-emerald-100 text-emerald-800",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const role = user?.role ?? "";

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardStats>("/dashboard/summary"),
    retry: false,
  });

  const [tvCodeOpen, setTvCodeOpen] = useState(false);
  const [tvCode, setTvCode] = useState("");
  const [generatingTv, setGeneratingTv] = useState(false);
  const [showTvCode, setShowTvCode] = useState(false);

  const loadTvCode = async () => {
    try {
      const res = await api.get<{code: string}>("/tv-access/code");
      setTvCode(res.code);
    } catch (e) {
      console.error("Failed to load TV access code", e);
    }
  };

  const generateTvCode = async () => {
    setGeneratingTv(true);
    try {
      const res = await api.post<{code: string}>("/tv-access/code/generate", {});
      setTvCode(res.code);
      toast({ title: "New TV Access Code generated successfully" });
    } catch (e) {
      toast({ title: "Failed to generate code", variant: "destructive" });
    } finally {
      setGeneratingTv(false);
    }
  };

  const { data: candidates } = useQuery({
    queryKey: ["candidates"],
    queryFn: () => api.get<{ id: number; fullName: string; status: string; candidateCode: string }[]>("/candidates"),
    enabled: !["student"].includes(role),
    retry: false,
  });

  if (role === "student") {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {user?.fullName}</h1>
          <p className="text-muted-foreground mt-1">Fellowship Candidate Portal</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard title="Assigned Exams" value="—" icon={BookOpen} color="bg-orange-500" href="/exams" />
          <StatCard title="Completed Exams" value="—" icon={ClipboardList} color="bg-blue-600" href="/results" />
          <StatCard title="Allocation Status" value="Pending" icon={Award} color="bg-emerald-600" />
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Getting Started</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Complete your candidate profile under <strong>My Profile</strong></p>
            <p>2. Take assigned entrance exams under <strong>Exams</strong></p>
            <p>3. Check your results under <strong>My Results</strong></p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canSeeCandidates = ["super_admin","program_admin","central_exam_coordinator","unit_coordinator"].includes(role);
  const canSeeExams      = ["super_admin","program_admin","central_exam_coordinator"].includes(role);
  const canSeeAllocations= ["super_admin","program_admin"].includes(role);
  const canSeePrograms   = ["super_admin","program_admin"].includes(role);

  const gridCards = [
    { title: "Active Candidates", value: stats?.candidates ?? "0", icon: Users, color: "bg-indigo-600", href: canSeeCandidates ? "/candidates" : undefined, description: "Total registered in system", trend: "+12%" },
    { title: "Live Examinations", value: stats?.activeExams ?? "0", icon: BookOpen, color: "bg-amber-500", href: canSeeExams ? "/exams" : undefined, description: "Exams currently in progress", trend: "Active" },
    { title: "Clinical Programs", value: stats?.programs ?? "0", icon: ClipboardList, color: "bg-rose-600", href: canSeePrograms ? "/programs" : undefined, description: "Specialized fellowship tracks" },
    { title: "Allocated Fellows", value: stats?.allocated ?? "0", icon: Award, color: "bg-emerald-600", href: canSeeAllocations ? "/allocations" : undefined, description: "Successfully assigned units", trend: "98% Fill" },
    { title: "Institutional Units", value: stats?.units ?? "0", icon: Building2, color: "bg-slate-900", href: undefined, description: "Sankara hospital network" },
    { title: "Pending Evaluation", value: stats?.pendingReview ?? "0", icon: Clock, color: "bg-blue-600", href: canSeeCandidates ? "/candidates" : undefined, description: "Awaiting coordinator review", trend: "Priority" },
  ];

  return (
    <div className="p-10 space-y-12 bg-transparent min-h-screen relative z-10">
      <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-10 text-white shadow-xl border border-slate-800/80">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-3.5 text-left">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium text-[10px] tracking-wider h-6 px-3 rounded-full">
                INSTITUTIONAL COMMAND CENTER
              </Badge>
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Secure Node
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight pt-1">
              Welcome back, <span className="bg-gradient-to-r from-indigo-200 via-blue-100 to-white bg-clip-text text-transparent">{user?.fullName}</span>
            </h1>
            <p className="text-slate-400 text-sm max-w-xl leading-relaxed font-normal">
              {role === "unit_coordinator" ? `Managing Hospital Unit Protocols` : "Orchestrating the Sankara Academy of Vision Fellowship Lifecycle with real-time merit data and specialized analytics."}
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {(role === "super_admin" || role === "program_admin") && (
              <Button
                variant="outline"
                className="h-12 px-6 rounded-2xl bg-white/5 border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20 text-slate-200 font-semibold text-xs tracking-wider uppercase gap-2.5 backdrop-blur-md transition-all shadow-lg"
                onClick={() => {
                  setTvCodeOpen(true);
                  setShowTvCode(false);
                  loadTvCode();
                }}
              >
                <MonitorPlay className="h-4.5 w-4.5 text-indigo-400" />
                Live TV Access
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {gridCards.map((c) => (
          <StatCard key={c.title} title={c.title} value={c.value} icon={c.icon} color={c.color} href={c.href} description={c.description} trend={c.trend} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        {candidates && candidates.length > 0 && (
          <div className="xl:col-span-8 space-y-6">
             <div className="flex justify-between items-center px-4">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic">Candidate Intelligence Feed</h3>
                <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors">View Unified Registry</Button>
             </div>
             <Card className="rounded-[40px] border-none shadow-premium overflow-hidden bg-white">
                <CardContent className="p-0">
                  <div className="divide-y divide-slate-50">
                    {candidates.slice(0, 6).map((c) => (
                      <div key={c.id} className="group flex items-center justify-between p-8 hover:bg-slate-50 transition-all duration-300">
                        <div className="flex items-center gap-6">
                           <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-slate-900 text-lg shadow-sm group-hover:bg-primary group-hover:text-white transition-all">
                              {c.fullName.charAt(0)}
                           </div>
                           <div>
                              <p className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none mb-1.5">{c.fullName}</p>
                              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] font-mono">{c.candidateCode}</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-8">
                           <div className="hidden md:flex flex-col items-end">
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Status Registry</p>
                              <Badge className={`rounded-full px-5 h-8 font-black uppercase text-[10px] tracking-widest shadow-sm border ${statusColors[c.status] ?? "bg-slate-100 text-slate-800"}`} variant="secondary">
                                {c.status.replace(/_/g, " ")}
                              </Badge>
                           </div>
                           <Button variant="outline" size="icon" className="h-12 w-12 rounded-2xl border-slate-100 hover:bg-slate-900 hover:text-white transition-all shadow-sm">
                              <ChevronRight className="h-5 w-5" />
                           </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
             </Card>
          </div>
        )}

        <div className="xl:col-span-4 space-y-6">
           <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic px-4">System Health</h3>
           <Card className="rounded-[40px] border-none shadow-premium bg-gradient-to-br from-indigo-600 to-primary p-10 text-white relative overflow-hidden">
              <div className="relative z-10 space-y-8">
                 <div className="space-y-2">
                    <p className="text-[11px] font-black text-white/60 uppercase tracking-[0.3em]">Institutional Capacity</p>
                    <h4 className="text-4xl font-black tracking-tighter">84% Operational</h4>
                 </div>
                 <div className="space-y-4">
                    <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden">
                       <div className="h-full w-[84%] bg-amber-400 rounded-full shadow-[0_0_20px_rgba(251,191,36,0.5)]" />
                    </div>
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                       <span>Interview Throughput</span>
                       <span className="text-amber-400">High Efficiency</span>
                    </div>
                 </div>
                 <Button className="w-full h-14 rounded-2xl bg-white text-slate-900 font-black uppercase tracking-widest text-[11px] hover:bg-slate-50 shadow-2xl">
                    Download Cycle Report
                 </Button>
              </div>
              <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
           </Card>
        </div>
      </div>

      {/* TV Access Code Dialog */}
      <Dialog open={tvCodeOpen} onOpenChange={setTvCodeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-emerald-500" />
              Waiting Hall TV Access
            </DialogTitle>
            <DialogDescription>
              Use this secure code to authorize public screens accessing the TV portal.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-6 space-y-4">
            <div className="relative">
              <Input
                readOnly
                value={showTvCode ? tvCode : "••••••"}
                className="w-48 h-16 text-center text-3xl font-black tracking-[0.25em] bg-slate-100 dark:bg-slate-900 border-2"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-3 h-10 w-10 text-muted-foreground hover:text-foreground"
                onClick={() => setShowTvCode(!showTvCode)}
              >
                {showTvCode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Anyone with this code can access the live interview dashboard until a new code is generated.
            </p>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => setTvCodeOpen(false)}>Close</Button>
            <Button variant="default" onClick={generateTvCode} disabled={generatingTv} className="gap-2">
              {generatingTv ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Generate New Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
