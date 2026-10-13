import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fmtDate } from "../lib/dateUtils";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { useToast } from "../hooks/use-toast";
import { 
  FileText, CheckCircle2, Clock, ShieldCheck, AlertTriangle, 
  TrendingUp, XCircle, Download, Check, RefreshCw, Loader2, Sparkles, Building2, MapPin
} from "lucide-react";

interface AttemptResult {
  id: number;
  examId: number;
  examTitle: string;
  examKind: string;
  score: number | null;
  maxScore: number | null;
  submittedAt: string | null;
  startedAt: string;
}

interface Allocation {
  id: number;
  specialityName: string | null;
  unitName: string | null;
  status: string;
  rank: number | null;
  totalScore: number | null;
}

export default function ResultsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: attempts = [], isLoading: isLoadingAttempts } = useQuery<AttemptResult[]>({
    queryKey: ["my-attempts"],
    queryFn: () => api.get<AttemptResult[]>("/attempts/me"),
  });

  const { data: allocation, isLoading: isLoadingAllocation, refetch: refetchAllocation } = useQuery<Allocation | null>({
    queryKey: ["my-allocation"],
    queryFn: () => api.get<Allocation | null>("/allocations/me").catch(() => null),
  });

  // Action Mutation (Freeze, Float, Withdraw)
  const actionMutation = useMutation({
    mutationFn: (action: string) => api.post("/allocations/action", { action }),
    onSuccess: (data: any) => {
      toast({
        title: "Allotment Choice Committed",
        description: `Successfully updated status to: ${data.status}`,
      });
      qc.invalidateQueries({ queryKey: ["my-allocation"] });
      refetchAllocation();
    },
    onError: (e: Error) => {
      toast({ title: "Failed to save action", description: e.message, variant: "destructive" });
    }
  });

  const handleAction = (action: string) => {
    const message = action === "freeze" 
      ? "Freezing your seat means you accept this allocation and lock your choices. Proceed?" 
      : action === "float"
      ? "Floating your seat keeps this allocation but registers you for potential upgrades in the next counselling round. Proceed?"
      : "WITHDRAWING from counselling will permanently forfeit your seat and remove you from subsequent rounds. This action is IRREVERSIBLE. Proceed?";

    if (confirm(message)) {
      actionMutation.mutate(action);
    }
  };

  const handleDownloadLetter = () => {
    if (!allocation) return;
    const token = localStorage.getItem("fellowship_token");
    window.open(`/api/allocations/${allocation.id}/letter?token=${token}`, "_blank");
    toast({ title: "Letter Generated", description: "Downloading formal allotment offer document..." });
  };

  const statusColors: Record<string, string> = {
    "Provisionally Allocated": "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-300",
    Accepted: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300",
    Upgraded: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-300",
    Withdrawn: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-300",
    WAITLISTED: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300",
    waitlisted: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300",
  };

  const pctFmt = (v: number | null, max: number | null) => {
    return v != null && max ? Math.round((v / max) * 100) : null;
  };

  const isLoading = isLoadingAttempts || isLoadingAllocation;

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <span className="text-xs uppercase font-black tracking-widest animate-pulse">Loading Results and Allocations...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-black p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-8 text-white shadow-2xl">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 to-transparent blur-3xl" />
        <div className="relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-indigo-200 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <span>Applicant Portfolio</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight italic">My Results & Counselling Standing</h1>
            <p className="text-slate-400 max-w-md">
              Inspect your dynamic aggregate rankings, select round actions, and verify entrance exam performance scores.
            </p>
          </div>
        </div>
      </div>

      {/* ALLOTMENT CARD */}
      {allocation ? (
        <Card className="border-none shadow-premium bg-white rounded-3xl overflow-hidden">
          <CardHeader className="bg-slate-950 text-white p-6 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-400" />
                Counselling Seat Allotment Status
              </CardTitle>
              <CardDescription className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">
                July 2026 Academic Fellowship Admissions Round Allotment
              </CardDescription>
            </div>
            <Badge variant="outline" className={`text-[10px] font-black uppercase tracking-wider px-3 h-6 rounded-full border-2 ${statusColors[allocation.status] ?? ""}`}>
              {allocation.status}
            </Badge>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              {/* Placement info */}
              <div className="space-y-6">
                <div className="flex gap-4 items-center">
                  <div className="h-16 w-16 bg-indigo-50 rounded-2xl border-2 border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                    <Building2 className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Allocated Program Specialty</p>
                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none mb-2">
                      {allocation.specialityName ?? "Waitlisted Queue"}
                    </h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {allocation.unitName ?? "All-India Waitlist Waiting Queue"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 items-center">
                  <div className="h-16 w-16 bg-slate-100 rounded-2xl border flex items-center justify-center font-black text-slate-500 font-mono text-xl shrink-0 shadow-sm">
                    #{allocation.rank}
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">All-India Merit Standing</p>
                    <p className="text-sm font-extrabold text-slate-700 uppercase">
                      Rank Standing: AIR #{allocation.rank}
                    </p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                      Aggregate Merit Score: {allocation.totalScore ? allocation.totalScore.toFixed(2) : "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Action commands */}
              <div className="bg-slate-50/50 p-6 rounded-2xl border-2 border-slate-100/50 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Admissions Round Selection Protocol</h4>
                
                {allocation.status === "Withdrawn" ? (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 font-semibold text-xs flex gap-2 items-center">
                    <XCircle className="h-5 w-5 shrink-0" />
                    <span>You have WITHDRAWN from the fellowship admissions counselling cycle. Your allocated seat has been vacated.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAction("freeze")}
                        disabled={actionMutation.isPending || allocation.status === "Accepted"}
                        className="rounded-xl h-11 flex-1 font-bold text-xs uppercase bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
                      >
                        <Check className="h-4 w-4" /> Freeze Seat
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction("float")}
                        disabled={actionMutation.isPending || allocation.status === "Upgraded"}
                        className="rounded-xl h-11 flex-1 font-bold text-xs uppercase border-slate-200 text-purple-700 gap-1.5 hover:bg-purple-50"
                      >
                        <TrendingUp className="h-4 w-4" /> Float (Upgrade)
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAction("withdraw")}
                      disabled={actionMutation.isPending}
                      className="rounded-xl h-11 w-full font-bold text-xs uppercase border-rose-200 text-rose-600 gap-1.5 hover:bg-rose-50 hover:border-rose-300"
                    >
                      <XCircle className="h-4 w-4" /> Withdraw from Counselling
                    </Button>

                    {allocation.status !== "WAITLISTED" && (
                      <div className="pt-2 border-t flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleDownloadLetter}
                          className="text-xs font-black uppercase text-indigo-600 hover:bg-indigo-50 rounded-lg gap-2"
                        >
                          <Download className="h-4 w-4" /> Download Allotment letter (PDF)
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed py-10 text-center">
          <CardContent className="space-y-3">
            <Clock className="h-10 w-10 mx-auto text-slate-300" />
            <p className="text-slate-500 font-medium text-sm">Counselling Round 1 Allotment results are currently pending publication.</p>
          </CardContent>
        </Card>
      )}

      {/* EXAM ATTEMPTS */}
      <Card className="border-none shadow-md bg-white rounded-3xl overflow-hidden">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-500" /> Exam Attempts & Performance Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {attempts.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-medium">No registered exam scores recorded on this profile yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {attempts.map((a) => {
                const pct = pctFmt(a.score, a.maxScore);
                return (
                  <Card key={a.id} className="border-2 rounded-xl shadow-none hover:border-indigo-100 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-extrabold text-slate-800 text-sm leading-tight uppercase tracking-tight">{a.examTitle}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{a.examKind}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          Completed: {fmtDate(a.submittedAt)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {a.submittedAt ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 justify-end text-emerald-600 text-[10px] font-black uppercase tracking-wider">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Validated
                            </div>
                            {a.score != null && (
                              <p className="text-2xl font-black text-slate-900 tabular-nums leading-none mt-1">
                                {a.score}
                                <span className="text-slate-300 text-sm font-semibold ml-0.5">/{a.maxScore ?? "?"}</span>
                              </p>
                            )}
                            {pct != null && (
                              <Badge className="bg-slate-100 text-slate-500 font-bold border-none text-[10px] h-5 rounded-md font-mono mt-1">
                                {pct}% Correct
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-amber-600 text-[10px] font-black uppercase tracking-wider">
                            <Clock className="h-3.5 w-3.5 animate-pulse" /> Running
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
