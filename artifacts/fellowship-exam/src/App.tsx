import { Switch, Route, Router as WouterRouter } from "wouter";
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
import InterviewsPage from "./pages/InterviewsPage";
import RankingsPage from "./pages/RankingsPage";
import ProfilePage from "./pages/ProfilePage";
import ResultsPage from "./pages/ResultsPage";
import ApplicationFormsPage from "./pages/ApplicationFormsPage";
import UnitsPage from "./pages/UnitsPage";
import PaymentsPage from "./pages/PaymentsPage";
import BatchesPage from "./pages/BatchesPage";
import ReportsPage from "./pages/ReportsPage";
import ApplyPage from "./pages/ApplyPage";
import HallTicketPage from "./pages/HallTicketPage";
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
            <Route path="/candidates" component={CandidatesPage} />
            <Route path="/exams" component={ExamsPage} />
            <Route path="/exams/:id" component={ExamDashboardPage} />
            <Route path="/interviews" component={InterviewsPage} />
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
              <Route path="/apply/:token">
                {(params) => <ApplyPage token={params.token} />}
              </Route>
              <Route path="/hall-ticket" component={HallTicketPage} />
              <Route path="/hall-tickets" component={HallTicketPage} />
              
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
