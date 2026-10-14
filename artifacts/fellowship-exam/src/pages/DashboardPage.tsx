import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useProgram } from "../contexts/ProgramContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Progress } from "../components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useToast } from "../hooks/use-toast";
import {
  Users,
  BookOpen,
  Award,
  ClipboardList,
  Clock,
  RefreshCw,
  ShieldCheck,
  Globe2,
  Trash2,
  CalendarDays,
  FileSpreadsheet,
  Stethoscope,
  Brain,
  GraduationCap,
  Layers,
  ArrowUpRight,
  FileCheck2,
  KeyRound,
  ShieldAlert,
  FolderGit2,
  Sparkles,
  CreditCard,
  CheckCircle2,
  Mail,
} from "lucide-react";

interface ProgramItem {
  id: number;
  name: string;
  code: string;
  category: string;
  academicYear: string;
}

interface SpecialityMetric {
  id: number;
  name: string;
  code: string;
  seats: number;
  applicantCount: number;
  totalApplications: number;
  interviewCompletedCount: number;
  allocatedCount?: number;
  avgMcqScore?: number;
  avgInterviewScore?: number;
}

interface ActivityItem {
  id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  at: string;
  badgeColor: string;
}

interface DashboardSummaryData {
  programs: ProgramItem[];
  selectedProgramId: number | null;
  selectedProgramName: string;
  overall: {
    totalApplicants: number;
    totalApplications: number;
    currentDate: string;
  };
  stages: {
    candidates: {
      total: number;
      approved: number;
      interviewCompleted: number;
      allocated: number;
      paidCount?: number;
      pendingReview?: number;
      callLettersIssued?: number;
    };
    applications?: {
      total: number;
      paidCount: number;
      pendingCount: number;
    };
    approvals?: {
      approvedCount: number;
      pendingCount: number;
    };
    callLetters?: {
      issuedCount: number;
      scheduledCount: number;
    };
    interviews?: {
      completedCount: number;
      inProgressCount: number;
      activePanelsCount: number;
    };
    selections?: {
      totalSeats: number;
      allocatedSeats: number;
      vacantSeats: number;
      offerLettersIssued: number;
    };
    mcq?: {
      totalAssigned: number;
      attemptsCount: number;
      completedCount: number;
      avgScore: number;
      maxScore: number;
    };
    psychometric?: {
      totalAssigned: number;
      completedCount: number;
      avgScore: number;
    };
    interview?: {
      totalApplications: number;
      completedCount: number;
      inProgressCount: number;
      avgScore: number;
      activePanelsCount: number;
    };
    merit?: {
      totalSeats: number;
      allocatedSeats: number;
      vacantSeats: number;
    };
  };
  specialities: SpecialityMetric[];
  recentActivity: ActivityItem[];
}

const defaultStages = {
  candidates: { total: 0, approved: 0, interviewCompleted: 0, allocated: 0, paidCount: 0, pendingReview: 0, callLettersIssued: 0 },
  mcq: { totalAssigned: 0, attemptsCount: 0, completedCount: 0, avgScore: 0, maxScore: 0 },
  psychometric: { totalAssigned: 0, completedCount: 0, avgScore: 0 },
  interview: { totalApplications: 0, completedCount: 0, inProgressCount: 0, avgScore: 0, activePanelsCount: 0 },
  merit: { totalSeats: 0, allocatedSeats: 0, vacantSeats: 0 },
};

const parseDeviceAgent = (ua: string | null | undefined) => {
  if (!ua) return { type: "Unknown", name: "Unknown Device" };
  if (ua.includes(" (App)")) {
    const type = ua.includes("Tablet") || ua.includes("iPad") ? "Tablet" : "Mobile";
    return { type, name: ua };
  }
  const u = ua.toLowerCase();
  let type = "Desktop";
  let name = "Unknown Device";
  if (u.includes("ipad") || (u.includes("macintosh") && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1)) {
    type = "Tablet";
    name = "iPad";
  } else if (u.includes("iphone") || u.includes("ipod")) {
    type = "Mobile";
    name = "iPhone";
  } else if (u.includes("android")) {
    type = u.includes("mobile") ? "Mobile" : "Tablet";
    name = "Android Device";
  } else if (u.includes("windows")) {
    type = "Desktop";
    name = "Windows PC";
  } else if (u.includes("macintosh") || u.includes("mac os")) {
    type = "Desktop";
    name = "Mac";
  } else if (u.includes("linux")) {
    type = "Desktop";
    name = "Linux PC";
  }
  return { type, name };
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { activeProgram, activeProgramId, setActiveProgramId, openProgramHub } = useProgram();
  const role = user?.role ?? "";
  const [, navigate] = useLocation();

  const [timeoutMinutes, setTimeoutMinutes] = useState("30");
  const [activeTab, setActiveTab] = useState<"overview" | "sessions">("overview");
  const [systemIp, setSystemIp] = useState("");

  useEffect(() => {
    fetch("/api/system-ip")
      .then((r) => r.json())
      .then((data) => {
        if (data?.ip) setSystemIp(data.ip);
      })
      .catch(() => {});
  }, []);

  const { data: summary, refetch: refetchSummary, isFetching } = useQuery<DashboardSummaryData>({
    queryKey: ["dashboard-summary", activeProgramId],
    queryFn: () =>
      api.get<DashboardSummaryData>(
        `/dashboard/summary${activeProgramId ? `?programId=${activeProgramId}` : ""}`
      ),
    refetchInterval: 15000,
    retry: false,
  });

  const { data: activeSessions = [], refetch: refetchSessions } = useQuery<any[]>({
    queryKey: ["active-sessions"],
    queryFn: () => api.get<any[]>("/auth/sessions"),
    enabled: role === "super_admin" || role === "program_admin",
    refetchInterval: 10000,
  });

  const { data: timeoutSetting, refetch: refetchTimeout } = useQuery<any>({
    queryKey: ["session-timeout"],
    queryFn: () => api.get<any>("/global-settings/session_inactivity_timeout"),
    enabled: role === "super_admin" || role === "program_admin",
  });

  useEffect(() => {
    if (timeoutSetting?.value) {
      setTimeoutMinutes(timeoutSetting.value);
    }
  }, [timeoutSetting]);

  const saveTimeoutMutation = useMutation({
    mutationFn: (value: string) => api.patch(`/global-settings/session_inactivity_timeout`, { value }),
    onSuccess: () => {
      toast({ title: "Inactivity timeout updated" });
      refetchTimeout();
    },
    onError: (e: any) => toast({ title: "Failed to update timeout", description: e.message, variant: "destructive" }),
  });

  const terminateSessionMutation = useMutation({
    mutationFn: (sessionId: number) => api.post("/auth/sessions/terminate", { sessionId }),
    onSuccess: () => {
      toast({ title: "User session terminated" });
      refetchSessions();
    },
    onError: (e: any) => toast({ title: "Failed to terminate session", description: e.message, variant: "destructive" }),
  });

  // ── Candidate / Student View ─────────────────────────────────────────────
  if (role === "student") {
    return (
      <div className="min-h-screen bg-slate-50 p-6 md:p-10 space-y-6 animate-in fade-in duration-300">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 p-8 text-white shadow-xl">
          <div className="absolute -top-10 -right-10 w-60 h-60 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 space-y-2">
            <span className="bg-white/20 text-white text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Candidate Examination Portal
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight">Welcome, {user?.fullName}</h1>
            <p className="text-orange-100 text-sm">Fellowship & VCT Selection Center</p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: <FileCheck2 className="h-6 w-6" />, label: "My Application & Payment", sub: "View submitted dossier, fee verification & admission status", path: "/admissions/status", color: "orange" },
            { icon: <Mail className="h-6 w-6" />, label: "Interview Call Letter", sub: "Download official interview call letter and instructions", path: "/admissions/status", color: "blue" },
            { icon: <Award className="h-6 w-6" />, label: "Fellowship Offer Letter", sub: "Download official admission & fellowship offer letter if selected", path: "/admissions/status", color: "emerald" },
          ].map(({ icon, label, sub, path, color }) => (
            <div
              key={label}
              onClick={() => path && navigate(path)}
              className={`bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all ${path ? "cursor-pointer hover:-translate-y-1" : "opacity-90"}`}
            >
              <div className={`w-12 h-12 rounded-xl bg-${color}-50 text-${color}-600 flex items-center justify-center mb-4 border border-${color}-100`}>
                {icon}
              </div>
              <h3 className="text-lg font-bold text-slate-800">{label}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Calculation helpers with safe fallbacks ──────────────────────────────
  const stages = summary?.stages ?? defaultStages;
  const overall = summary?.overall ?? { totalApplicants: 0, totalApplications: 0, currentDate: "" };
  const specialities = summary?.specialities ?? [];
  const recentActivity = summary?.recentActivity ?? [];
  const programs = summary?.programs ?? [];

  const totalApplicants = stages.candidates?.total ?? 0;
  const paidCount = stages.candidates?.paidCount ?? stages.applications?.paidCount ?? totalApplicants;
  const approvedCount = stages.candidates?.approved ?? stages.approvals?.approvedCount ?? 0;
  const pendingReviewCount = stages.candidates?.pendingReview ?? stages.approvals?.pendingCount ?? Math.max(0, totalApplicants - approvedCount);
  const callLetterCount = stages.candidates?.callLettersIssued ?? stages.callLetters?.issuedCount ?? approvedCount;
  const interviewCount = stages.candidates?.interviewCompleted ?? stages.interviews?.completedCount ?? 0;
  const allocatedCount = stages.candidates?.allocated ?? stages.selections?.allocatedSeats ?? stages.merit?.allocatedSeats ?? 0;
  const totalSeats = stages.selections?.totalSeats ?? stages.merit?.totalSeats ?? 0;

  const paymentPct = totalApplicants > 0 ? Math.min(100, Math.round((paidCount / totalApplicants) * 100)) : 0;
  const approvalPct = totalApplicants > 0 ? Math.min(100, Math.round((approvedCount / totalApplicants) * 100)) : 0;
  const callLetterPct = approvedCount > 0 ? Math.min(100, Math.round((callLetterCount / approvedCount) * 100)) : (totalApplicants > 0 ? 100 : 0);
  const interviewPct = approvedCount > 0 ? Math.min(100, Math.round((interviewCount / approvedCount) * 100)) : 0;
  const seatsAllocPct = totalSeats > 0 ? Math.min(100, Math.round((allocatedCount / totalSeats) * 100)) : 0;

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 space-y-8 animate-in fade-in duration-300">
      
      {/* ── 1. EXECUTIVE HERO HEADER WITH PROGRAM SELECTOR ──────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-orange-50/30 p-6 md:p-8 shadow-sm">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-100/30 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 bg-orange-100/80 text-orange-800 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide">
                <ShieldCheck className="h-3.5 w-3.5 text-orange-600" />
                Executive Command Center {systemIp ? `• ${systemIp}` : ""}
              </div>
              <div className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[11px] font-bold">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                {overall.currentDate || "Active Cycle"}
              </div>
            </div>

            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                {activeProgram ? `${activeProgram.name} Intake Command` : "SAV Examination & Intake Command"}
              </h1>
              <p className="text-xs md:text-sm text-slate-500 font-medium max-w-2xl mt-0.5">
                {activeProgram?.description || "Dedicated examination portal, candidate pipeline, and merit allocations."}
              </p>
            </div>

            {/* Program Switcher Pills / Dropdown */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openProgramHub()}
                className="h-9 px-3 text-xs font-black rounded-xl bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100 gap-1.5 shadow-2xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-orange-600" />
                Switch Program Suite
              </Button>
              <Select
                value={activeProgramId ? String(activeProgramId) : "all"}
                onValueChange={(v) => setActiveProgramId(v === "all" ? null : Number(v))}
              >
                <SelectTrigger className="w-64 h-9 text-xs font-bold bg-white border-slate-200 rounded-xl shadow-2xs">
                  <SelectValue placeholder="Select Program" />
                </SelectTrigger>
                <SelectContent className="rounded-xl text-xs font-semibold">
                  <SelectItem value="all" className="font-bold">✨ All Programs Overview</SelectItem>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)} className="font-medium">
                      {p.category === "fellowship" ? "🎓 " : p.category === "vct" ? "👁️ " : "📋 "}
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchSummary();
                if (role === "super_admin" || role === "program_admin") refetchSessions();
              }}
              disabled={isFetching}
              className="h-10 px-4 rounded-xl bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs shadow-sm gap-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-orange-500" : "text-slate-500"}`} />
              {isFetching ? "Syncing..." : "Sync Live Data"}
            </Button>
            <Button
              onClick={async () => {
                try {
                  const blob = await api.getBlob("/reports/cycle-report");
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.setAttribute("download", `SAV_Cycle_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  window.URL.revokeObjectURL(url);
                  toast({ title: "Cycle Report Exported", description: "Excel report downloaded successfully." });
                } catch {
                  toast({ title: "Export Failed", description: "Could not generate cycle report", variant: "destructive" });
                }
              }}
              className="h-10 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-sm gap-2"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Cycle Excel
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2. QUICK ACTION COMMAND SHORTCUTS ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Application Forms", sub: "Review & verify submissions", icon: <FileCheck2 className="h-5 w-5 text-blue-600" />, bg: "bg-white hover:bg-blue-50/50 border-slate-200/80 hover:border-blue-200", path: "/application-forms" },
          { label: "Candidates Directory", sub: "Manage approvals & schedule", icon: <CalendarDays className="h-5 w-5 text-orange-600" />, bg: "bg-white hover:bg-orange-50/50 border-slate-200/80 hover:border-orange-200", path: "/candidates" },
          { label: "Interview Evaluation", sub: "Doctor full dossier view", icon: <Stethoscope className="h-5 w-5 text-emerald-600" />, bg: "bg-white hover:bg-emerald-50/50 border-slate-200/80 hover:border-emerald-200", path: "/interviews" },
          { label: "Call & Offer Letters", sub: "Generate & download letters", icon: <Award className="h-5 w-5 text-purple-600" />, bg: "bg-white hover:bg-purple-50/50 border-slate-200/80 hover:border-purple-200", path: "/letters" },
        ].map((act) => (
          <div
            key={act.label}
            onClick={() => navigate(act.path)}
            className={`p-4.5 rounded-2xl border ${act.bg} cursor-pointer transition-all duration-300 hover:shadow-md hover:-translate-y-1 flex items-center justify-between group`}
          >
            <div className="space-y-0.5">
              <span className="text-xs font-black text-slate-900 block group-hover:text-orange-600 transition-colors">{act.label}</span>
              <span className="text-[11px] text-slate-500 font-medium block">{act.sub}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 group-hover:bg-white shadow-2xs shrink-0 border border-slate-100 group-hover:scale-110 transition-all">
              {act.icon}
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. 5-STAGE ADMISSIONS PIPELINE FUNNEL CARDS ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Stage 1: Applications & Razorpay Payment */}
        <div 
          onClick={() => navigate("/candidates")}
          className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 space-y-3 relative overflow-hidden group cursor-pointer"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">1. Applications & Fee</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 group-hover:scale-105 transition-transform"><CreditCard className="h-4 w-4" /></div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">{totalApplicants}</div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              <span className="font-bold text-emerald-600">{paidCount}</span> Paid via Razorpay
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-500">
              <span>Payment Completed</span>
              <span className="text-blue-600">{paymentPct}%</span>
            </div>
            <Progress value={paymentPct} className="h-2 bg-slate-100" />
          </div>
        </div>

        {/* Stage 2: Scrutiny & Approval */}
        <div 
          onClick={() => navigate("/candidates")}
          className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 space-y-3 relative overflow-hidden group cursor-pointer"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">2. Dossier Approval</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-105 transition-transform"><CheckCircle2 className="h-4 w-4" /></div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">{approvedCount} <span className="text-xs font-bold text-slate-400">/ {totalApplicants}</span></div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              <span className="font-bold text-amber-600">{pendingReviewCount}</span> Pending Scrutiny
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-500">
              <span>Dossiers Approved</span>
              <span className="text-emerald-600">{approvalPct}%</span>
            </div>
            <Progress value={approvalPct} className="h-2 bg-slate-100" />
          </div>
        </div>

        {/* Stage 3: Interview Call Letters */}
        <div 
          onClick={() => navigate("/letters")}
          className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 space-y-3 relative overflow-hidden group cursor-pointer"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">3. Interview Call Letters</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 group-hover:scale-105 transition-transform"><Mail className="h-4 w-4" /></div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">{callLetterCount} <span className="text-xs font-bold text-slate-400">/ {approvedCount}</span></div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              <span className="font-bold text-amber-600">Issued & Scheduled</span> for Interview
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-500">
              <span>Call Letters Ready</span>
              <span className="text-amber-600">{callLetterPct}%</span>
            </div>
            <Progress value={callLetterPct} className="h-2 bg-slate-100" />
          </div>
        </div>

        {/* Stage 4: Doctor Interview Evaluation */}
        <div 
          onClick={() => navigate("/interviews")}
          className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 space-y-3 relative overflow-hidden group cursor-pointer"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 to-violet-500" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">4. Doctor Interview</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 group-hover:scale-105 transition-transform"><Stethoscope className="h-4 w-4" /></div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">{interviewCount} <span className="text-xs font-bold text-slate-400">/ {approvedCount}</span></div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              <span className="font-bold text-indigo-600">Full Dossier Reviews</span> by Panels
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-500">
              <span>Interviews Completed</span>
              <span className="text-indigo-600">{interviewPct}%</span>
            </div>
            <Progress value={interviewPct} className="h-2 bg-slate-100" />
          </div>
        </div>

        {/* Stage 5: Selection & Offer Letters */}
        <div 
          onClick={() => navigate("/letters")}
          className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 space-y-3 relative overflow-hidden group cursor-pointer"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-500 to-pink-500" />
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">5. Selection & Offer Letters</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600 group-hover:scale-105 transition-transform"><Award className="h-4 w-4" /></div>
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 tracking-tight">{allocatedCount} <span className="text-xs font-bold text-slate-400">/ {totalSeats}</span></div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              <span className="font-bold text-purple-600">{allocatedCount}</span> Fellows Selected & Offered
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-500">
              <span>Seats Allocated</span>
              <span className="text-purple-600">{seatsAllocPct}%</span>
            </div>
            <Progress value={seatsAllocPct} className="h-2 bg-slate-100" />
          </div>
        </div>

      </div>

      {/* ── 4. VIEW SELECTOR TABS ────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab("overview")}
          className={`pb-3 font-extrabold text-sm transition-all border-b-2 px-1 flex items-center gap-2 ${
            activeTab === "overview"
              ? "border-orange-500 text-slate-900 font-black"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Layers className="h-4 w-4" />
          Specialization Matrix & Performance
          <Badge variant="secondary" className="rounded-full text-[10px] px-2">
            {specialities.length}
          </Badge>
        </button>

        {(role === "super_admin" || role === "program_admin") && (
          <button
            onClick={() => setActiveTab("sessions")}
            className={`pb-3 font-extrabold text-sm transition-all border-b-2 px-1 flex items-center gap-2 ${
              activeTab === "sessions"
                ? "border-orange-500 text-slate-900 font-black"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Globe2 className="h-4 w-4" />
            Live Logins & Session Security
            <Badge className="bg-orange-100 text-orange-600 rounded-full px-2 text-[10px] border-none font-bold">
              {activeSessions.length}
            </Badge>
          </button>
        )}
      </div>

      {/* ── 5. MAIN CONTENT AREA ─────────────────────────────────────────── */}
      {activeTab === "overview" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Specialization Matrix (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  {summary?.selectedProgramName !== "All Programs" ? `${summary?.selectedProgramName} Specializations` : "Program Specializations"}
                </h2>
                <p className="text-xs text-slate-500">Live seat vacancies, candidate volume, and stage metrics per specialty</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/rankings")}
                className="text-xs font-bold text-orange-600 hover:text-orange-700 hover:bg-orange-50 gap-1"
              >
                View Full Merit Rankings <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {specialities.length > 0 ? (
                specialities.map((sp) => {
                  const compPct = sp.applicantCount > 0 ? Math.min(100, Math.round((sp.interviewCompletedCount / sp.applicantCount) * 100)) : 0;
                  return (
                    <div
                      key={sp.id}
                      onClick={() => navigate("/candidates")}
                      className="bg-white p-5 rounded-3xl border border-slate-200/80 hover:border-orange-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer space-y-3.5 group shadow-2xs"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-0.5">
                          <span className="font-extrabold text-sm text-slate-900 group-hover:text-orange-600 transition-colors block leading-tight">
                            {sp.name}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                            Code: {sp.code}
                          </span>
                        </div>
                        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 border-none text-xs font-black shrink-0 px-3 py-1 rounded-full">
                          {sp.seats} {sp.seats === 1 ? "Seat" : "Seats"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-slate-50/80 p-3 rounded-2xl text-center border border-slate-100">
                        <div>
                          <div className="text-base font-black text-slate-900">{sp.applicantCount}</div>
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Applied</div>
                        </div>
                        <div>
                          <div className="text-base font-black text-blue-600">{sp.interviewCompletedCount}</div>
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Interviewed</div>
                        </div>
                        <div>
                          <div className="text-base font-black text-emerald-600">{sp.allocatedCount ?? 0} / {sp.seats}</div>
                          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Allocated</div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold text-slate-600">
                          <span>Selection & Allocation</span>
                          <span className="text-slate-800">{sp.allocatedCount ?? 0} of {sp.seats} filled ({compPct}%)</span>
                        </div>
                        <Progress value={sp.seats > 0 ? Math.min(100, Math.round(((sp.allocatedCount ?? 0) / sp.seats) * 100)) : 0} className="h-2 bg-slate-100" />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-2 text-center py-12 bg-white rounded-3xl border border-slate-200/80 text-slate-400 font-bold text-sm shadow-2xs space-y-2">
                  <Layers className="h-8 w-8 mx-auto text-slate-300" />
                  <p>No specializations configured for this academic suite.</p>
                </div>
              )}
            </div>
          </div>

          {/* Live Recent Activity Feed (1 col) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Live Intake Activity</h2>
                <p className="text-xs text-slate-500">Real-time candidate registrations & evaluation events</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 divide-y divide-slate-100">
              {recentActivity.length > 0 ? (
                recentActivity.map((act) => (
                  <div key={act.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900 truncate">{act.title}</p>
                      <span className="text-xs font-mono font-bold text-slate-500 shrink-0 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        {new Date(act.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {act.subtitle && (
                      <p className="text-xs text-slate-600 font-medium leading-tight">{act.subtitle}</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs font-bold space-y-2">
                  <Clock className="h-6 w-6 mx-auto text-slate-300" />
                  <p>No recent activity recorded for this suite yet.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      ) : (
        /* ── 6. ACTIVE SESSIONS & SECURITY TAB ────────────────────────────── */
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-6 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Active User Sessions ({activeSessions.length})</h2>
              <p className="text-xs text-slate-500">Monitor active administrator and evaluator logins with device and IP tracking</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchSessions()}
              className="text-xs font-bold h-9 gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Sessions
            </Button>
          </div>

          {activeSessions.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm font-bold flex flex-col items-center justify-center gap-2">
              <ShieldAlert className="h-8 w-8 text-slate-300" />
              No active logged-in sessions detected
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                    <th className="text-left py-3 px-4">User</th>
                    <th className="text-left py-3 px-4">IP Address</th>
                    <th className="text-left py-3 px-4">Device & Browser</th>
                    <th className="text-left py-3 px-4">Last Active</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeSessions.map((sess) => {
                    const parsedAgent = parseDeviceAgent(sess.deviceInfo);
                    return (
                      <tr key={sess.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-bold text-xs text-slate-900">{sess.userName}</p>
                          <p className="text-[11px] text-slate-400">{sess.userEmail}</p>
                          <Badge variant="outline" className="text-[9px] uppercase mt-0.5 font-bold text-slate-600">
                            {sess.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{sess.ipAddress || "—"}</td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {parsedAgent.type} • {parsedAgent.name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 font-mono">
                          {new Date(sess.lastActivityAt).toLocaleTimeString("en-IN")}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={terminateSessionMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`Terminate session for ${sess.userName}?`)) {
                                terminateSessionMutation.mutate(sess.id);
                              }
                            }}
                            className="h-8 px-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-bold gap-1 ml-auto"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Close Session
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Session Inactivity Timeout Configuration */}
          <div className="border-t pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 p-4 rounded-xl">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-orange-500" />
                Session Inactivity Timeout
              </span>
              <p className="text-[11px] text-slate-500">Automatically logout inactive users after the specified duration.</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1440}
                value={timeoutMinutes}
                onChange={(e) => setTimeoutMinutes(e.target.value)}
                placeholder="Minutes"
                className="w-24 h-9 text-xs font-bold font-mono bg-white"
              />
              <Button
                size="sm"
                disabled={!timeoutMinutes || saveTimeoutMutation.isPending}
                onClick={() => saveTimeoutMutation.mutate(timeoutMinutes)}
                className="h-9 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
