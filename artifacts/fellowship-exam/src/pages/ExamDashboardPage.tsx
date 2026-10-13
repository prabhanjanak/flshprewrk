import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ArrowLeft, Users, CheckCircle, Award, Clock, HelpCircle, LayoutDashboard, Settings, Edit3, Database, FileDown, Archive, ShieldAlert } from "lucide-react";

interface Exam {
  id: number;
  title: string;
  kind: string;
  programName: string | null;
  durationMinutes: number;
  totalQuestions: number;
  questionCount: number;
  passingScore: number | null;
  active: boolean;
}

interface ExamStats {
  totalAssigned: number;
  totalCompleted: number;
  averageScore: number;
}

export default function ExamDashboardPage() {
  const [, params] = useRoute("/exams/:id");
  const [, navigate] = useLocation();
  const examId = params?.id;

  const { data: exam, isLoading: examLoading } = useQuery<Exam>({
    queryKey: ["exams", examId],
    queryFn: () => api.get<Exam>(`/exams/${examId}`),
    enabled: !!examId,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ExamStats>({
    queryKey: ["exams", examId, "stats"],
    queryFn: () => api.get<ExamStats>(`/exams/${examId}/stats`),
    enabled: !!examId,
  });

  if (examLoading || statsLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading dashboard...</div>;
  }

  if (!exam) {
    return (
      <div className="p-12 text-center">
        <p className="text-muted-foreground">Exam not found</p>
        <Button variant="link" onClick={() => navigate("/exams")}>Back to Exams</Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/exams")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-orange-600" />
            {exam.title}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Exam Performance & Management Dashboard</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="p-3 rounded-xl bg-orange-500">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.totalAssigned ?? 0}</p>
              <p className="text-sm text-muted-foreground">Total Assigned</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="p-3 rounded-xl bg-emerald-500">
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.totalCompleted ?? 0}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="p-3 rounded-xl bg-orange-600 shadow-lg shadow-orange-600/20">
              <Award className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold">{(stats?.averageScore ?? 0).toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground">Average Score</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Exam Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-dashed">
              <span className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Duration</span>
              <span className="font-medium">{exam.durationMinutes} minutes</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-dashed">
              <span className="text-sm text-muted-foreground flex items-center gap-2"><HelpCircle className="h-4 w-4" /> Questions</span>
              <span className="font-medium">{exam.questionCount} / {exam.totalQuestions}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-dashed">
              <span className="text-sm text-muted-foreground flex items-center gap-2"><Award className="h-4 w-4" /> Passing Score</span>
              <span className="font-medium">{exam.passingScore ?? "Not set"}%</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant={exam.active ? "default" : "secondary"}>
                {exam.active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4 text-orange-600" />
                Administrative Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <button 
                onClick={() => navigate(`/exams?edit=${exam.id}`)}
                className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-all text-left group"
              >
                <div className="p-2 rounded-md bg-orange-500/10 text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                  <Edit3 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Edit Configuration</p>
                  <p className="text-xs text-muted-foreground">Modify timing, passing score, and basic info.</p>
                </div>
              </button>

              <button 
                className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-all text-left group"
              >
                <div className="p-2 rounded-md bg-amber-500/10 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Question Bank</p>
                  <p className="text-xs text-muted-foreground">Manage MCQs, choices, and correct answers.</p>
                </div>
              </button>

              <button 
                className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-accent hover:text-accent-foreground transition-all text-left group"
              >
                <div className="p-2 rounded-md bg-orange-500/10 text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                  <FileDown className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Export Analytics</p>
                  <p className="text-xs text-muted-foreground">Download detailed candidate performance in Excel.</p>
                </div>
              </button>
            </CardContent>
          </Card>

          <Card className="border-destructive/20 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-base text-destructive flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <button 
                className="flex items-center gap-4 p-3 rounded-lg border border-destructive/20 bg-white/50 hover:bg-destructive hover:text-destructive-foreground transition-all text-left group"
              >
                <div className="p-2 rounded-md bg-destructive/10 text-destructive group-hover:bg-white/20 group-hover:text-white transition-colors">
                  <Archive className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Archive Exam</p>
                  <p className="text-xs opacity-70">Hide from active lists without deleting data.</p>
                </div>
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
