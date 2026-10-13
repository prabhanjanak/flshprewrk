import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { 
  Plus, BookOpen, Clock, HelpCircle, Trash2, 
  BrainCircuit, FileText, CheckCircle, AlertCircle,
  LayoutGrid, BarChart3, Calendar, ArrowRight,
  Sparkles, ShieldCheck
} from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { Progress } from "../components/ui/progress";

interface Exam {
  id: number;
  title: string;
  kind: string;
  programId: number | null;
  programName: string | null;
  durationMinutes: number;
  totalQuestions: number;
  questionCount: number;
  passingScore: number | null;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

export default function ExamsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [addOpen, setAddOpen] = useState(false);

  const [form, setForm] = useState({
    title: "", kind: "mcq", programId: "", durationMinutes: "60",
    totalQuestions: "20", passingScore: "", description: "",
  });

  const { data: exams = [], isLoading } = useQuery<Exam[]>({
    queryKey: ["exams"],
    queryFn: () => api.get<Exam[]>("/exams"),
  });

  const addMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<Exam>("/exams", data),
    onSuccess: () => {
      toast({ title: "Exam created", description: "The new exam has been added successfully." });
      qc.invalidateQueries({ queryKey: ["exams"] });
      setAddOpen(false);
      setForm({ title: "", kind: "mcq", programId: "", durationMinutes: "60", totalQuestions: "20", passingScore: "", description: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/exams/${id}`),
    onSuccess: () => {
      toast({ title: "Exam deleted" });
      qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canManage = user?.role === "super_admin" || user?.role === "program_admin" || user?.role === "central_exam_coordinator";

  const getKindDetails = (kind: string) => {
    switch (kind) {
      case "mcq": return { label: "MCQ", icon: LayoutGrid, color: "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400", border: "border-orange-100 dark:border-orange-900/50" };
      case "psychometric": return { label: "Psychometric", icon: BrainCircuit, color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400", border: "border-amber-100 dark:border-amber-900/50" };
      case "written": return { label: "Written", icon: FileText, color: "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400", border: "border-orange-100 dark:border-orange-900/50" };
      default: return { label: kind.toUpperCase(), icon: BookOpen, color: "text-zinc-600 bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-400", border: "border-zinc-100 dark:border-zinc-800" };
    }
  };

  const stats = {
    total: exams.length,
    active: exams.filter(e => e.active).length,
    totalQs: exams.reduce((acc, e) => acc + e.totalQuestions, 0),
    configuredQs: exams.reduce((acc, e) => acc + e.questionCount, 0),
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-black p-4 md:p-8 space-y-8">
      {/* Header Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-orange-500 p-8 text-white shadow-2xl">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-orange-100 text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              <span>Assessment Portal</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">Personnel Exams</h1>
            <p className="text-orange-100/80 max-w-md">Configure and manage entrance exams, psychometric tests, and skill assessments for the fellowship program.</p>
          </div>
          {canManage && (
            <Button 
              onClick={() => setAddOpen(true)} 
              className="bg-white text-orange-600 hover:bg-orange-50 transition-all font-bold h-12 px-6 rounded-2xl shadow-xl hover:scale-105 active:scale-95 gap-2 border-none"
            >
              <Plus className="h-5 w-5" /> Create New Exam
            </Button>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Exams", value: stats.total, icon: BookOpen, color: "orange" },
          { label: "Active Now", value: stats.active, icon: CheckCircle, color: "emerald" },
          { label: "Questions Target", value: stats.totalQs, icon: HelpCircle, color: "orange" },
          { label: "Configured", value: stats.configuredQs, icon: BarChart3, color: "amber" },
        ].map((s, i) => (
          <Card key={i} className="border-none shadow-sm bg-white dark:bg-zinc-900">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`h-10 w-10 rounded-xl bg-${s.color}-50 dark:bg-${s.color}-900/20 flex items-center justify-center text-${s.color}-600 dark:text-${s.color}-400`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="h-10 w-10 rounded-full border-4 border-orange-600 border-t-transparent animate-spin" />
          <p className="text-muted-foreground animate-pulse font-medium">Syncing exam repository...</p>
        </div>
      ) : exams.length === 0 ? (
        <Card className="border-dashed bg-white/50 dark:bg-zinc-900/50">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center space-y-4">
            <div className="h-20 w-20 rounded-3xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <BookOpen className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold">No Exams Configured</h2>
              <p className="text-muted-foreground max-w-sm">Start by creating your first MCQ or Psychometric assessment for the current program.</p>
            </div>
            {canManage && (
              <Button onClick={() => setAddOpen(true)} variant="outline" className="mt-4">
                Initialize Repository
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {exams.map((e) => {
            const kind = getKindDetails(e.kind);
            const progress = (e.questionCount / e.totalQuestions) * 100;
            
            return (
              <Card 
                key={e.id} 
                className={`overflow-hidden border-2 transition-all duration-300 hover:shadow-xl group cursor-pointer ${kind.border} bg-white dark:bg-zinc-900`}
                onClick={() => navigate(`/exams/${e.id}`)}
              >
                <div className={`h-1.5 w-full ${kind.color.split(" ")[1]}`} />
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${kind.color}`}>
                          <kind.icon className="h-4 w-4" />
                        </div>
                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">
                          {kind.label}
                        </Badge>
                      </div>
                      <h3 className="font-bold text-lg leading-tight group-hover:text-blue-600 transition-colors pt-2">
                        {e.title}
                      </h3>
                      {e.programName && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                          <ShieldCheck className="h-3 w-3 text-emerald-500" />
                          {e.programName}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5 opacity-0 group-hover:opacity-100 transition-all rounded-xl"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          if (confirm(`Are you sure you want to delete "${e.title}"?`)) {
                            deleteMutation.mutate(e.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm font-semibold">{e.durationMinutes}m</span>
                      </div>
                      <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                        <BarChart3 className="h-4 w-4" />
                        <span className="text-sm font-semibold">{e.passingScore ?? 50}% Pass</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-muted-foreground">Configuration Progress</span>
                        <span className={progress >= 100 ? "text-emerald-600 font-bold" : "text-orange-600"}>
                          {e.questionCount} / {e.totalQuestions} Questions
                        </span>
                      </div>
                      <Progress value={progress} className="h-1.5 bg-zinc-100 dark:bg-zinc-800" />
                    </div>
                  </div>

                  <div className="pt-4 border-t flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${e.active ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-300 dark:bg-zinc-700"}`} />
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${e.active ? "text-emerald-600" : "text-zinc-400"}`}>
                        {e.active ? "Live & Accepting" : "Draft Mode"}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-orange-600 h-8 hover:bg-orange-50 font-bold">
                      Manage <ArrowRight className="ml-2 h-3 w-3 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
          <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-8 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-white">Create New Assessment</DialogTitle>
              <CardDescription className="text-orange-100/80">Configure a new examination for candidates.</CardDescription>
            </DialogHeader>
          </div>
          <div className="p-8 space-y-6 bg-white dark:bg-zinc-950">
            <div className="grid gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Exam Title</Label>
                <Input 
                  placeholder="e.g. Fellowship Entrance MCQ - July 2026" 
                  value={form.title} 
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="h-12 border-zinc-200 focus-visible:ring-blue-600 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assessment Category</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                    <SelectTrigger className="h-12 border-zinc-200 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mcq">MCQ Assessment</SelectItem>
                      <SelectItem value="psychometric">Psychometric Profile</SelectItem>
                      <SelectItem value="written">Written Theory</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Time Limit (Min)</Label>
                  <Input 
                    type="number" 
                    value={form.durationMinutes} 
                    onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                    className="h-12 border-zinc-200 rounded-xl"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Questions</Label>
                  <Input 
                    type="number" 
                    value={form.totalQuestions} 
                    onChange={(e) => setForm((f) => ({ ...f, totalQuestions: e.target.value }))}
                    className="h-12 border-zinc-200 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Passing Benchmark (%)</Label>
                  <Input 
                    type="number" 
                    placeholder="e.g. 50" 
                    value={form.passingScore} 
                    onChange={(e) => setForm((f) => ({ ...f, passingScore: e.target.value }))}
                    className="h-12 border-zinc-200 rounded-xl"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Brief Description</Label>
                <Input 
                  placeholder="Additional context for candidates..." 
                  value={form.description} 
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="h-12 border-zinc-200 rounded-xl"
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button variant="ghost" onClick={() => setAddOpen(false)} className="rounded-xl h-12 px-6">Discard</Button>
              <Button
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold h-12 px-8 rounded-xl shadow-lg shadow-orange-200 dark:shadow-none border-none"
                disabled={!form.title || !form.kind || addMutation.isPending}
                onClick={() => addMutation.mutate({
                  title: form.title,
                  kind: form.kind,
                  durationMinutes: Number(form.durationMinutes),
                  totalQuestions: Number(form.totalQuestions),
                  passingScore: form.passingScore ? Number(form.passingScore) : null,
                  description: form.description || null,
                })}
              >
                {addMutation.isPending ? "Configuring..." : "Initialize Exam"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

