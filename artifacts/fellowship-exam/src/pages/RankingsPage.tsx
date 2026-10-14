import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useProgram } from "../contexts/ProgramContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { useToast } from "../hooks/use-toast";
import { 
  Trophy, Medal, Download, RefreshCw, 
  Sparkles, Loader2, Stethoscope, Search, FileText,
  User, CheckCircle2, ChevronRight, Filter
} from "lucide-react";
import { CandidateExamDialog } from "../components/CandidateExamDialog";

interface Program { id: number; name: string; code: string; academicYear: string; }
interface Speciality { id: number; programId: number; name: string; code: string; seats: number; }
interface CandidateRank {
  candidateId: number;
  candidateCode: string;
  fullName: string;
  mcqScore: number;
  psychometricScore: number;
  interviewScore: number;
  totalScore: number;
  rank: number;
  specialityRank: number | null;
  segmentRank: number | null;
  topPreference: string | null;
  unitName: string | null;
  status: string | null;
  preferredLocations: string[];
  phone: string;
  email: string;
  photoUrl?: string | null;
}

const statusColors: Record<string, string> = {
  allocated: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300",
  Accepted: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300",
  Upgraded: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-300",
  Withdrawn: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300",
  WAITLISTED: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300",
  waitlisted: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300",
  rejected: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300",
  pending: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400",
};

function fmt(v: number | null) {
  return v != null ? Number(v).toFixed(1) : "—";
}

export default function RankingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { activeProgramId, setActiveProgramId } = useProgram();
  const qc = useQueryClient();

  const [selectedProgram, setSelectedProgram] = useState<string>(activeProgramId ? String(activeProgramId) : "");
  const [selectedSpeciality, setSelectedSpeciality] = useState<string>("all");
  const [selectedExam, setSelectedExam] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("fellowship_token") : "";

  // Synchronize with activeProgramId
  useEffect(() => {
    if (activeProgramId) {
      setSelectedProgram(String(activeProgramId));
    }
  }, [activeProgramId]);

  // Fetch Programs
  const { data: programs = [] } = useQuery<Program[]>({
    queryKey: ["programs"],
    queryFn: () => api.get<Program[]>("/programs"),
  });

  // Auto select active program
  useEffect(() => {
    if (programs.length > 0 && !selectedProgram) {
      const initial = activeProgramId ? String(activeProgramId) : String(programs[0]!.id);
      setSelectedProgram(initial);
    }
  }, [programs, selectedProgram, activeProgramId]);

  // Fetch Specialities of selected program
  const { data: specialities = [] } = useQuery<Speciality[]>({
    queryKey: ["specialities", selectedProgram],
    queryFn: () => api.get<Speciality[]>(`/specialities?programId=${selectedProgram}`),
    enabled: !!selectedProgram,
  });

  // Fetch Exams under selected program
  const { data: exams = [] } = useQuery<{ id: number; title: string; kind: string }[]>({
    queryKey: ["exams", selectedProgram],
    queryFn: () => api.get<{ id: number; title: string; kind: string }[]>(`/exams?programId=${selectedProgram}`),
    enabled: !!selectedProgram,
  });

  // Fetch Rankings based on selectedProgram, selectedSpeciality, and exam cycle
  const { data: rankings = [], isLoading, refetch: refetchRankings, isFetching } = useQuery<CandidateRank[]>({
    queryKey: ["rankings", selectedProgram, selectedSpeciality, selectedExam],
    queryFn: () => {
      const specParam = selectedSpeciality && selectedSpeciality !== "all" ? `&specialityId=${selectedSpeciality}` : "";
      const examParam = selectedExam && selectedExam !== "all" ? `&examId=${selectedExam}` : "";
      const url = `/rankings?programId=${selectedProgram}${specParam}${examParam}`;
      return api.get<CandidateRank[]>(url);
    },
    enabled: !!selectedProgram,
  });

  // Filter and Sort Candidates by Total Score and Tie-Breakers
  const sortedRankings = useMemo(() => {
    let list = [...rankings];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => 
        r.fullName?.toLowerCase().includes(q) ||
        r.candidateCode?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.phone?.includes(q)
      );
    }
    return list.sort((a, b) => {
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      const rankA = a.specialityRank ?? a.rank ?? 99999;
      const rankB = b.specialityRank ?? b.rank ?? 99999;
      return rankA - rankB;
    });
  }, [rankings, searchQuery]);

  const handleExportExcel = () => {
    const specParam = selectedSpeciality && selectedSpeciality !== "all" ? `&specialityId=${selectedSpeciality}` : "";
    const examParam = selectedExam && selectedExam !== "all" ? `&examId=${selectedExam}` : "";
    window.open(`/api/rankings/export?programId=${selectedProgram}${specParam}${examParam}&token=${token}`, "_blank");
    toast({ title: "Export Protocol Triggered", description: "Downloading candidate merit ranking workbook..." });
  };

  const currentSpecName = selectedSpeciality === "all" 
    ? "All Specializations" 
    : specialities.find(s => String(s.id) === selectedSpeciality)?.name || "Specialization";

  const topScore = sortedRankings.length > 0 ? sortedRankings[0].totalScore : 0;
  const avgViva = sortedRankings.length > 0 
    ? (sortedRankings.reduce((acc, r) => acc + (r.interviewScore || 0), 0) / sortedRankings.length) 
    : 0;
  const avgMcq = sortedRankings.length > 0 
    ? (sortedRankings.reduce((acc, r) => acc + (r.mcqScore || 0), 0) / sortedRankings.length) 
    : 0;

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 space-y-6 animate-in fade-in duration-500">
      
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-xl">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/20 to-transparent blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-orange-400 text-xs font-black uppercase tracking-widest">
              <Trophy className="h-4 w-4" />
              <span>Counseling Merit Register & Score Ledger</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Merit Rankings</h1>
            <p className="text-slate-300 text-sm max-w-xl font-medium leading-relaxed">
              Consolidated rank standings according to MCQ exam scores, Mind Matters psychometry marks, and Doctor Viva interview evaluations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {selectedProgram && (
              <Button 
                onClick={handleExportExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl h-11 px-5 shadow-lg gap-2"
              >
                <Download className="h-4 w-4" /> Export Excel
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchRankings()}
              disabled={isFetching}
              className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white border-white/20 font-bold text-xs uppercase tracking-wider gap-2 shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* ── 3-STEP FILTER BAR ──────────────────────────────────────── */}
      <Card className="border border-slate-200 shadow-sm bg-white p-6 rounded-[24px]">
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Filter className="h-4 w-4 text-orange-500" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Filter Rank List by Program, Specialization & Exam Cycle
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Step 1: Program */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                1. Select Program
              </Label>
              <Select 
                value={selectedProgram} 
                onValueChange={(val) => { 
                  setSelectedProgram(val); 
                  setSelectedSpeciality("all"); 
                  setSelectedExam("all"); 
                }}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 font-bold text-xs focus:ring-orange-500">
                  <SelectValue placeholder="Select Program…" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)} className="text-xs font-semibold">
                      {p.name} ({p.academicYear})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Specialization */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                2. Select Specialization
              </Label>
              <Select 
                value={selectedSpeciality} 
                onValueChange={setSelectedSpeciality}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 font-bold text-xs focus:ring-orange-500">
                  <SelectValue placeholder="All Specializations" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="text-xs font-bold text-orange-600">
                    ★ All Specializations (Overall Merit)
                  </SelectItem>
                  {specialities.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)} className="text-xs font-semibold">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 3: Exam Cycle */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                3. Select Exam / Stage
              </Label>
              <Select value={selectedExam} onValueChange={setSelectedExam}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 font-bold text-xs focus:ring-orange-500">
                  <SelectValue placeholder="All Examination Cycles" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="text-xs font-semibold">
                    All Examination Cycles
                  </SelectItem>
                  {exams.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)} className="text-xs font-semibold">
                      {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 4: Candidate Search */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                Search Candidate
              </Label>
              <div className="relative">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Name, Code, Email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 pl-10 rounded-xl border-slate-200 bg-slate-50/50 font-semibold text-xs"
                />
              </div>
            </div>

          </div>

          {/* Quick Speciality Pill Badges */}
          {specialities.length > 0 && (
            <div className="pt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black uppercase text-slate-400 mr-1">Quick Select:</span>
              <button
                type="button"
                onClick={() => setSelectedSpeciality("all")}
                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  selectedSpeciality === "all"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Specializations
              </button>
              {specialities.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSpeciality(String(s.id))}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    selectedSpeciality === String(s.id)
                      ? "bg-orange-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── METRICS STRIP ──────────────────────────────────────────── */}
      {selectedProgram && rankings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border border-slate-200 shadow-xs p-4 rounded-2xl bg-white">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Ranked Candidates</p>
            <p className="text-2xl font-black text-slate-900 font-mono">{sortedRankings.length}</p>
          </Card>
          <Card className="border border-slate-200 shadow-xs p-4 rounded-2xl bg-white">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Top Merit Score</p>
            <p className="text-2xl font-black text-emerald-600 font-mono">{topScore.toFixed(1)}</p>
          </Card>
          <Card className="border border-slate-200 shadow-xs p-4 rounded-2xl bg-white">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Average MCQ</p>
            <p className="text-2xl font-black text-indigo-600 font-mono">{avgMcq.toFixed(1)}</p>
          </Card>
          <Card className="border border-slate-200 shadow-xs p-4 rounded-2xl bg-white">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1.5">Average Viva</p>
            <p className="text-2xl font-black text-orange-600 font-mono">{avgViva.toFixed(1)}</p>
          </Card>
        </div>
      )}

      {/* ── RANK LIST TABLE ────────────────────────────────────────── */}
      {!selectedProgram ? (
        <Card className="border-dashed py-16 text-center bg-white rounded-2xl">
          <CardContent className="space-y-3">
            <Trophy className="h-12 w-12 mx-auto text-slate-300" />
            <p className="text-slate-500 font-medium">Please select an academic program to view rankings.</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          <span className="text-xs uppercase font-black tracking-widest animate-pulse">Calculating Ranks and Computing Merit Matrix...</span>
        </div>
      ) : sortedRankings.length === 0 ? (
        <Card className="border-dashed py-16 text-center bg-white rounded-2xl">
          <CardContent className="space-y-3">
            <Trophy className="h-12 w-12 mx-auto text-slate-300" />
            <p className="text-slate-500 font-bold text-sm">No candidates found for the selected filters.</p>
            <p className="text-xs text-slate-400">Try selecting "All Specializations" or changing the exam cycle filter.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-slate-200 shadow-sm bg-white rounded-[24px] overflow-hidden">
          <CardHeader className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base font-black text-slate-900 tracking-tight">
                {currentSpecName} — Candidate Admissions Directory ({sortedRankings.length} Candidates)
              </CardTitle>
            </div>
            <span className="text-xs font-bold text-slate-500">
              Interview Evaluation & Fellowship Allocation Status
            </span>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-xs uppercase font-extrabold text-slate-600 tracking-wider">
                  <th className="px-5 py-3.5 text-left w-20">#</th>
                  <th className="px-5 py-3.5 text-left">Candidate Dossier</th>
                  <th className="px-4 py-3.5 text-left">Specialization</th>
                  <th className="px-4 py-3.5 text-left">Admission Status</th>
                  <th className="px-4 py-3.5 text-left">Assigned Hospital Unit</th>
                  <th className="px-5 py-3.5 text-right w-56">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRankings.map((r, idx) => {
                  const currentRank = idx + 1;
                  const isAllocated = r.status === "allocated" || r.status === "Accepted" || r.status === "Upgraded";

                  return (
                    <tr 
                      key={r.candidateId} 
                      className={`hover:bg-slate-50/60 transition-colors ${
                        isAllocated ? "bg-emerald-50/30" : ""
                      }`}
                    >
                      {/* Rank Position */}
                      <td className="px-5 py-4 text-left">
                        {currentRank <= 3 ? (
                          <div className="flex items-center gap-1.5">
                            <Medal className={`h-5 w-5 ${
                              currentRank === 1 ? "text-yellow-500 fill-yellow-500" : currentRank === 2 ? "text-slate-400 fill-slate-400" : "text-amber-600 fill-amber-600"
                            }`} />
                            <span className="font-black text-sm font-mono text-slate-900">#{currentRank}</span>
                          </div>
                        ) : (
                          <span className="font-bold text-slate-600 font-mono text-sm">#{currentRank}</span>
                        )}
                      </td>

                      {/* Candidate Identity */}
                      <td className="px-5 py-4 text-left">
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => setSelectedCandidateId(r.candidateId)}
                            className="text-left font-black text-slate-900 hover:text-orange-600 hover:underline cursor-pointer transition-colors text-sm flex items-center gap-2"
                            title="Click to open full Examination Dossier"
                          >
                            {r.fullName}
                            <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full uppercase font-bold">
                              {r.candidateCode}
                            </span>
                          </button>
                          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-1">
                            <span>{r.email}</span>
                            {r.phone && <span>· {r.phone}</span>}
                            {r.unitName && <span className="text-indigo-600 font-bold">· Unit: {r.unitName}</span>}
                          </div>
                        </div>
                      </td>

                      {/* Specialization */}
                      <td className="px-4 py-4 text-left">
                        <Badge variant="outline" className="text-xs font-bold text-slate-800 bg-slate-50 border-slate-200">
                          {r.topPreference || currentSpecName}
                        </Badge>
                      </td>

                      {/* Admission Status */}
                      <td className="px-4 py-4 text-left">
                        {isAllocated ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold text-xs px-2.5 py-0.5">
                            <CheckCircle2 className="h-3 w-3 mr-1 inline text-emerald-600" />
                            Selected Fellow
                          </Badge>
                        ) : r.status === "interview_completed" ? (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300 font-extrabold text-xs px-2.5 py-0.5">
                            Interview Completed
                          </Badge>
                        ) : r.status === "waitlisted" ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-extrabold text-xs px-2.5 py-0.5">
                            Waitlisted
                          </Badge>
                        ) : r.status === "rejected" ? (
                          <Badge className="bg-rose-100 text-rose-800 border-rose-300 font-extrabold text-xs px-2.5 py-0.5">
                            Not Selected
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-700 border-slate-200 font-bold text-xs px-2.5 py-0.5">
                            {r.status || "Under Review"}
                          </Badge>
                        )}
                      </td>

                      {/* Assigned Hospital Unit */}
                      <td className="px-4 py-4 text-left text-xs font-bold text-slate-700">
                        {r.unitName ? (
                          <span className="text-indigo-700 font-extrabold">{r.unitName}</span>
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedCandidateId(r.candidateId)}
                            className="h-7 text-[10px] font-bold uppercase gap-1 text-orange-700 border-orange-200 bg-orange-50/50 hover:bg-orange-100 rounded-lg"
                            title="Review full dossier and record selection decision"
                          >
                            <Stethoscope className="h-3 w-3 text-orange-600" /> Review
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/api/candidates/${r.candidateId}/call-letter-pdf?token=${token}`, "_blank")}
                            className="h-7 text-[10px] font-bold uppercase gap-1 text-blue-700 border-blue-200 bg-blue-50/50 hover:bg-blue-100 rounded-lg"
                            title="Download Interview Call Letter PDF"
                          >
                            <FileText className="h-3 w-3 text-blue-600" /> Call Letter
                          </Button>
                          {isAllocated && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(`/api/candidates/${r.candidateId}/offer-letter-pdf?token=${token}`, "_blank")}
                              className="h-7 text-[10px] font-bold uppercase gap-1 text-purple-700 border-purple-200 bg-purple-50/50 hover:bg-purple-100 rounded-lg"
                              title="Download Fellowship Offer Letter PDF"
                            >
                              <Award className="h-3 w-3 text-purple-600" /> Offer Letter
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Candidate Examination Dialog Modal */}
      <CandidateExamDialog
        candidateId={selectedCandidateId}
        open={!!selectedCandidateId}
        onClose={() => setSelectedCandidateId(null)}
        onSaved={() => refetchRankings()}
      />
    </div>
  );
}

