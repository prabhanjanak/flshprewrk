import { useState } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "./components/ui/toaster";
import { TooltipProvider } from "./components/ui/tooltip";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProgramProvider } from "./contexts/ProgramContext";
import AppSidebar from "./components/AppSidebar";
import { ProgramHubDialog } from "./components/ProgramHubDialog";
import { InteractiveBackground } from "./components/InteractiveBackground";
import { PageTransition } from "./components/PageTransition";
import LoginPage from "./pages/LoginPage";
import ForcePasswordResetPage from "./pages/ForcePasswordResetPage";
import DashboardPage from "./pages/DashboardPage";
import DoctorDashboardPage from "./pages/DoctorDashboardPage";
import CandidatesPage from "./pages/CandidatesPage";
import ExamsPage from "./pages/ExamsPage";
import ExamDashboardPage from "./pages/ExamDashboardPage";
import ProgramsPage from "./pages/ProgramsPage";
import UsersPage from "./pages/UsersPage";
import InterviewsPage, { DoctorPortalView } from "./pages/InterviewsPage";
import RankingsPage from "./pages/RankingsPage";
import ProfilePage from "./pages/ProfilePage";
import ResultsPage from "./pages/ResultsPage";
import ApplicationFormsPage from "./pages/ApplicationFormsPage";
import UnitsPage from "./pages/UnitsPage";
import PaymentsPage from "./pages/PaymentsPage";
import BatchesPage from "./pages/BatchesPage";
import ReportsPage from "./pages/ReportsPage";
import ApplyPage from "./pages/ApplyPage";
import NotFound from "./pages/not-found";
import { Loader2 } from "lucide-react";
import EmailSettingsPage from "./pages/EmailSettingsPage";
import LettersPage from "./pages/LettersPage";
import VerifyLorPage from "./pages/VerifyLorPage";
import ActiveSessionsPage from "./pages/ActiveSessionsPage";
import { SessionWarningBanner } from "./components/SessionWarningBanner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function DoctorSuperView() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"evaluate" | "overview">("evaluate");
  const isAdminPreview = user?.role !== "doctor";

  return (
    <div className="space-y-4">
      {isAdminPreview && (
        <div className="mx-6 mt-6 mb-0 p-4 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center rounded-md bg-orange-500 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                Super Admin · Doctor View
              </span>
              <span className="text-xs text-slate-300 font-medium">
                Live panel-doctor perspective: switch between Mind Matter &amp; Speciality panels, review dossiers, and verify consensus marks.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex bg-white/10 p-1 rounded-xl border border-white/15">
              <button
                type="button"
                onClick={() => setTab("evaluate")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${tab === "evaluate" ? "bg-white text-slate-900 shadow-xs" : "text-white/80 hover:text-white"}`}
              >
                Live Examination
              </button>
              <button
                type="button"
                onClick={() => setTab("overview")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${tab === "overview" ? "bg-white text-slate-900 shadow-xs" : "text-white/80 hover:text-white"}`}
              >
                Doctor Dashboard
              </button>
            </div>
            <button
              type="button"
              onClick={() => setLocation("/interviews")}
              className="px-3 py-1.5 rounded-xl border border-white/25 bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all"
            >
              Panel Setup &amp; Queues
            </button>
          </div>
        </div>
      )}
      {tab === "overview" && isAdminPreview ? (
        <DoctorDashboardPage onOpenExamination={() => setTab("evaluate")} />
      ) : (
        <DoctorPortalView />
      )}
    </div>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (user.forcePasswordReset) return <ForcePasswordResetPage />;

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      <InteractiveBackground />
      <AppSidebar />
      <SessionWarningBanner />
      <ProgramHubDialog />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0 relative z-10">
        <PageTransition>
          <Switch>
            <Route path="/">
              {() => user?.role === "doctor" ? <DoctorDashboardPage /> : <DashboardPage />}
            </Route>
            <Route path="/programs" component={ProgramsPage} />
            <Route path="/users" component={UsersPage} />
            <Route path="/candidates">{() => <Redirect to="/application-forms" />}</Route>
            <Route path="/exams" component={ExamsPage} />
            <Route path="/exams/:id" component={ExamDashboardPage} />
            <Route path="/interviews" component={InterviewsPage} />
            <Route path="/doctor" component={DoctorSuperView} />
            <Route path="/rankings" component={RankingsPage} />
            <Route path="/application-forms" component={ApplicationFormsPage} />
            <Route path="/application-forms/:token/manual-entry">
              {(params) => <ApplyPage token={params.token} isManualEntry={true} />}
            </Route>
            <Route path="/units" component={UnitsPage} />
            <Route path="/payments" component={PaymentsPage} />
            <Route path="/batches" component={BatchesPage} />
            <Route path="/reports" component={ReportsPage} />
            <Route path="/email-settings" component={EmailSettingsPage} />
            <Route path="/profile" component={ProfilePage} />
            <Route path="/letters" component={LettersPage} />
            <Route path="/results" component={ResultsPage} />
            <Route path="/verify-lor" component={VerifyLorPage} />
            {(user?.role === "super_admin" || user?.role === "program_admin" || user?.role === "central_exam_coordinator") && (
              <Route path="/active-sessions" component={ActiveSessionsPage} />
            )}
            <Route component={NotFound} />
          </Switch>
        </PageTransition>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <WouterRouter>
            <Switch>
              {/* Public Routes - NO Sidebar, NO Auth needed */}
              <Route path="/apply">
                <Redirect to="/apply/JAN2027" />
              </Route>
              <Route path="/apply/">
                <Redirect to="/apply/JAN2027" />
              </Route>
              <Route path="/apply/:token">
                {(params) => <ApplyPage token={params.token} />}
              </Route>
              
              {/* Auth Routes */}
              <Route>
                <AuthProvider>
                  <ProgramProvider>
                    <AppRouter />
                    <Toaster />
                  </ProgramProvider>
                </AuthProvider>
              </Route>
            </Switch>
          </WouterRouter>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
