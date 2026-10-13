import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Badge } from "../components/ui/badge";
import {
  Users, CheckCircle2, Clock, Target, Stethoscope,
  TrendingUp, Award, Loader2, RefreshCw, Info,
  CalendarCheck, LayoutDashboard, AlertCircle, ArrowRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { CandidateExamDialog } from "../components/CandidateExamDialog";

interface DoctorStats {
  panelName: string | null;
  specialityName: string | null;
  totalAssigned: number;
  totalCompleted: number;
  remaining: number;
  avgInterviewMinutes: number | null;
  recentlyScoredCandidates: Array<{
    id: number;
    candidateId: number;
    candidateName: string;
    candidateCode: string;
    score: number;
    scoredAt: string | null;
  }>;
}

export default function DoctorDashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);

  const { data: stats, isLoading, refetch, isFetching } = useQuery<DoctorStats>({
    queryKey: ["doctor-stats"],
    queryFn: () => api.get<DoctorStats>("/dashboard/doctor-stats"),
    refetchInterval: 30000,
    retry: false,
  });

  const completionPct = stats && stats.totalAssigned > 0
    ? Math.round((stats.totalCompleted / stats.totalAssigned) * 100)
    : 0;

  const circumference = 2 * Math.PI * 52;
  const strokeDashoffset = circumference - (completionPct / 100) * circumference;

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 space-y-8 animate-in fade-in duration-500">

      {/* ── HERO HEADER ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 md:p-10 shadow-sm">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-50/40 rounded-full -mr-24 -mt-24 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-50/30 rounded-full -ml-16 -mb-16 blur-2xl" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-orange-50 rounded-full px-3.5 py-1 border border-orange-100 w-fit">
              <Stethoscope className="h-3.5 w-3.5 text-orange-600" />
              <span className="text-[10px] font-bold text-orange-800 uppercase tracking-widest">Doctor / Interviewer Portal</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 leading-tight">
              Welcome, Dr. {user?.fullName?.split(" ")[0]}
            </h1>
            <p className="text-sm text-slate-500 font-semibold max-w-xl leading-relaxed">
              Your personal candidate examination and interview dashboard. Access candidate application dossiers, enter psychometry marks and applied specialization scores.
            </p>
            {stats?.panelName && (
              <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl px-4 py-2 w-fit">
                <LayoutDashboard className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Panel: {stats.panelName}
                  {stats.specialityName && <span className="ml-2 text-indigo-500">— {stats.specialityName}</span>}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              size="sm"
              onClick={() => setLocation("/interviews")}
              className="h-11 px-6 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs uppercase tracking-wider gap-2 shadow-sm shrink-0"
            >
              <Stethoscope className="h-4 w-4" />
              Start Candidate Examination
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-11 px-4 rounded-xl bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs uppercase tracking-wider gap-2 shadow-sm shrink-0"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          <span className="font-bold text-sm">Loading your dashboard...</span>
        </div>
      ) : !stats?.panelName && stats?.totalAssigned === 0 ? (
        /* No panel assigned */
        <div className="bg-white rounded-[28px] border border-amber-100 p-10 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto border border-amber-100">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">No Active Panel Assignment</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              You haven't been assigned to an active interview panel yet. Please contact the coordinator to get assigned.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl p-4 border border-slate-100 max-w-md mx-auto text-left">
            <Info className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <p className="text-xs text-slate-500 font-medium">
              Once assigned, your panel details, candidate queue, and progress metrics will appear here automatically.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── METRICS CARDS ────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: <Users className="h-5 w-5 text-slate-600" />,
                label: "Total Candidates",
                value: stats?.totalAssigned ?? 0,
                sub: "Assigned to your panel",
                bg: "bg-slate-50 border-slate-200",
                iconBg: "bg-white border border-slate-200 shadow-inner",
              },
              {
                icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
                label: "Interviews Done",
                value: stats?.totalCompleted ?? 0,
                sub: "Successfully scored",
                bg: "bg-emerald-50/40 border-emerald-100",
                iconBg: "bg-white border border-emerald-100 shadow-inner",
              },
              {
                icon: <Target className="h-5 w-5 text-orange-600" />,
                label: "Remaining",
                value: stats?.remaining ?? 0,
                sub: "Candidates still in queue",
                bg: "bg-orange-50/40 border-orange-100",
                iconBg: "bg-white border border-orange-100 shadow-inner",
              },
              {
                icon: <Clock className="h-5 w-5 text-indigo-600" />,
                label: "Avg. Interview Time",
                value: stats?.avgInterviewMinutes != null ? `${stats.avgInterviewMinutes} min` : "—",
                sub: "Average per candidate",
                bg: "bg-indigo-50/40 border-indigo-100",
                iconBg: "bg-white border border-indigo-100 shadow-inner",
              },
            ].map((m, idx) => (
              <div
                key={idx}
                className={`bg-white rounded-2xl border p-5 shadow-sm flex items-center justify-between gap-4 ${m.bg}`}
              >
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{m.label}</span>
                  <div className="text-3xl font-black text-slate-900 tracking-tight">{m.value}</div>
                  <p className="text-[10px] font-semibold text-slate-400">{m.sub}</p>
                </div>
                <div className={`p-3 rounded-xl flex-shrink-0 ${m.iconBg}`}>{m.icon}</div>
              </div>
            ))}
          </div>

          {/* ── PROGRESS + RECENT ACTIVITY ──────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Progress Ring */}
            <div className="lg:col-span-1 bg-white rounded-[28px] border border-slate-200 shadow-sm p-8 flex flex-col items-center justify-center gap-6">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 text-center">Interview Progress</h3>
                <p className="text-xs text-slate-400 font-medium text-center mt-1">Completion rate for today's session</p>
              </div>
              <div className="relative">
                <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                  <circle
                    cx="60" cy="60" r="52" fill="none"
                    stroke="url(#progressGrad)"
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    style={{ transition: "stroke-dashoffset 1s ease" }}
                  />
                  <defs>
                    <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#f59e0b" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-slate-900">{completionPct}%</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Complete</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 w-full text-center">
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                  <p className="text-lg font-black text-emerald-700">{stats?.totalCompleted ?? 0}</p>
                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Done</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
                  <p className="text-lg font-black text-orange-700">{stats?.remaining ?? 0}</p>
                  <p className="text-[9px] font-bold text-orange-500 uppercase tracking-wider">Left</p>
                </div>
              </div>
            </div>

            {/* Recent Scored Candidates */}
            <div className="lg:col-span-2 bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-sm uppercase tracking-widest text-slate-900 flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-orange-500" />
                    Recently Scored Candidates
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Your last 5 completed interview evaluations</p>
                </div>
                <Badge className="bg-orange-100 text-orange-700 border-none font-bold h-7 px-3 text-[10px] uppercase rounded-full">
                  {stats?.recentlyScoredCandidates?.length ?? 0} Recent
                </Badge>
              </div>

              {!stats?.recentlyScoredCandidates?.length ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3 bg-slate-50/50">
                  <Award className="h-9 w-9 text-slate-300" />
                  <div className="text-center">
                    <p className="font-bold text-slate-700 text-sm">No scored candidates yet</p>
                    <p className="text-xs text-slate-400 mt-0.5">Scores will appear here once you complete interviews</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {stats.recentlyScoredCandidates.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedCandidateId(c.candidateId)}
                      className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white flex items-center justify-center font-black text-xs flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                          {c.candidateName.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-extrabold text-sm text-slate-900 group-hover:text-orange-600 transition-colors">{c.candidateName}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono mt-0.5">
                            {c.candidateCode}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-lg font-black text-slate-900">{c.score}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Score</p>
                        </div>
                        {c.scoredAt && (
                          <Badge className="bg-slate-100 text-slate-600 border-none font-bold text-[9px] uppercase rounded-full h-6 px-2.5">
                            {new Date(c.scoredAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </Badge>
                        )}
                        <Badge className="bg-emerald-100 text-emerald-700 border-none font-bold text-[9px] uppercase rounded-full h-6 px-2.5">
                          <CheckCircle2 className="h-3 w-3 mr-0.5" />
                          Done
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── INFO BANNER ──────────────────────────────────────────── */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 rounded-[28px] p-6 text-white shadow-md relative overflow-hidden border border-white/10">
            <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/10 rounded-full -mr-16 -mt-16 blur-2xl" />
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-500/20 border border-orange-500/30 rounded-2xl flex items-center justify-center flex-shrink-0 text-orange-400">
                  <Stethoscope className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-black text-base uppercase tracking-wider">Candidate Examination & Scoring</h4>
                  <p className="text-xs text-slate-300 font-medium mt-0.5 leading-relaxed max-w-2xl">
                    View complete candidate dossiers (UG/PG qualifications, surgical skills, LORs) and submit mandatory Psychometry marks along with applied specialization viva scores.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setLocation("/interviews")}
                className="bg-orange-600 hover:bg-orange-700 text-white font-black text-xs uppercase tracking-wider px-5 h-10 rounded-xl shrink-0 gap-2"
              >
                Go to Examination List
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <CandidateExamDialog
            candidateId={selectedCandidateId}
            open={!!selectedCandidateId}
            onClose={() => setSelectedCandidateId(null)}
            onSaved={() => refetch()}
          />
        </>
      )}
    </div>
  );
}
