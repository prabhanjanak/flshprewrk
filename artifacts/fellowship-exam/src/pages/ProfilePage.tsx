import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { KeyRound, Eye, EyeOff, CheckCircle2, Building2, BadgeCheck, Briefcase, Database, AlertTriangle, Mail, Settings, Send, Loader2 } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { RoleAvatar } from "../components/RoleAvatar";

interface CandidateProfile {
  id: number; candidateCode: string; fullName: string; email: string;
  phone: string | null; dateOfBirth: string | null; gender: string | null;
  qualification: string | null; collegeName: string | null; address: string | null;
  status: string; unitName?: string | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  interview_completed: "bg-blue-100 text-blue-800",
  waitlisted: "bg-purple-100 text-purple-800",
  allocated: "bg-emerald-100 text-emerald-800",
};

const roleLabel: Record<string, string> = {
  super_admin: "Super Admin",
  program_admin: "Program Admin",
  central_exam_coordinator: "Central Exam Coordinator",
  unit_coordinator: "Unit Coordinator",
  doctor: "Doctor / Interviewer",
  student: "Candidate",
};

const roleColors: Record<string, string> = {
  super_admin: "bg-red-100 text-red-800",
  program_admin: "bg-orange-100 text-orange-800",
  central_exam_coordinator: "bg-blue-100 text-blue-800",
  unit_coordinator: "bg-cyan-100 text-cyan-800",
  doctor: "bg-purple-100 text-purple-800",
  student: "bg-gray-100 text-gray-800",
};


function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setCurrent(""); setNewPw(""); setConfirm(""); setError(""); };

  const handleSubmit = async () => {
    setError("");
    if (newPw.length < 8) { setError("New password must be at least 8 characters"); return; }
    if (newPw !== confirm) { setError("Passwords do not match"); return; }
    if (newPw === current) { setError("New password must differ from current"); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: newPw });
      await refreshUser();
      toast({ title: "Password changed successfully" });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Change Password
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-1.5">
            <Label>Current Password</Label>
            <div className="relative">
              <Input type={showCurrent ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} className="pr-10" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowCurrent(!showCurrent)}>
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <div className="relative">
              <Input type={showNew ? "text" : "password"} placeholder="Min 8 characters" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="pr-10" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowNew(!showNew)}>
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPw && (
              <div className="flex gap-1 mt-1">
                {[newPw.length >= 8, /[A-Z]/.test(newPw), /[0-9]/.test(newPw), /[^A-Za-z0-9]/.test(newPw)].map((ok, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${ok ? "bg-green-500" : "bg-muted"}`} />
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Confirm New Password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {confirm && newPw && (
              <p className={`text-xs flex items-center gap-1 ${confirm === newPw ? "text-green-600" : "text-red-500"}`}>
                {confirm === newPw ? <><CheckCircle2 className="h-3 w-3" /> Passwords match</> : "Passwords do not match"}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button disabled={loading || !current || !newPw || !confirm} onClick={handleSubmit}>
            {loading ? "Changing…" : "Change Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetDatabaseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logout } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => { setPassword(""); setError(""); };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      await api.post("/debug/reset-database", { password });
      toast({ title: "Database Reset Complete", description: "All application data has been deleted." });
      reset();
      onClose();
      logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset database");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Database className="h-5 w-5" /> Factory Reset Database
          </DialogTitle>
          <DialogDescription>
            This action is <strong>irreversible</strong>. All candidates, applications, and seat matrices will be permanently deleted. Your admin account will be preserved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-1.5">
            <Label>Enter Super Admin Password</Label>
            <div className="relative">
              <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button variant="destructive" disabled={loading || !password} onClick={handleSubmit}>
            {loading ? "Resetting…" : "Confirm Reset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MockDataToggle() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { data: mode, refetch } = useQuery({
    queryKey: ["mock-mode"],
    queryFn: () => api.get<{ enabled: boolean }>("/debug/mock-mode"),
  });

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (!mode?.enabled) {
        // If enabling, we might need to seed. The backend handles "seed if missing",
        // but for a better UX we can explicitly call seed if we want "fresh" mock data.
        // But user said "no reset", so we'll just toggle.
        const res = await api.post<{ enabled: boolean; message: string }>("/debug/toggle-mock", {});
        toast({ title: res.message });
        // If it was just enabled and message says "need seed", we could trigger it.
        // But my backend toggle-mock handles it.
        refetch();
        window.location.reload(); 
      } else {
        const res = await api.post<{ enabled: boolean; message: string }>("/debug/toggle-mock", {});
        toast({ title: res.message });
        refetch();
        window.location.reload();
      }
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Action failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={`border-2 transition-colors ${mode?.enabled ? "border-amber-200 bg-amber-50/30" : "border-slate-200"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className={`h-5 w-5 ${mode?.enabled ? "text-amber-600" : "text-slate-400"}`} />
            <div>
              <CardTitle className="text-base">Mock Data Mode</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Toggle between Live and Mock data without resetting.</p>
            </div>
          </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={async () => {
              setLoading(true);
              try {
                const res = await api.post<{ message: string }>("/debug/init-july-2026", {});
                toast({ title: res.message });
              } catch (err) {
                toast({ title: "Error", description: String(err), variant: "destructive" });
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            {loading ? "Initializing..." : "Initialize July 2026"}
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
            onClick={async () => {
              if (confirm("This will WIPE all existing programs, candidates, and forms and replace them with dummy test data. Continue?")) {
                setLoading(true);
                try {
                  await api.post("/debug/seed", {});
                  toast({ title: "Database seeded successfully" });
                  window.location.reload();
                } catch (err) {
                  toast({ title: "Seed failed", description: String(err), variant: "destructive" });
                } finally {
                  setLoading(false);
                }
              }
            }}
            disabled={loading}
          >
            {loading ? "Seeding..." : "Seed Registry"}
          </Button>
          <Button 
            size="sm" 
            variant={mode?.enabled ? "secondary" : "default"} 
            onClick={handleToggle}
            disabled={loading}
            className="font-bold"
          >
            {loading ? "Processing..." : mode?.enabled ? "Disable Mock Mode" : "Enable Mock Mode"}
          </Button>
        </div>
        </div>
      </CardHeader>
      {mode?.enabled && (
        <CardContent>
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-100/50 p-2 rounded-md border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <p>System is currently showing test data. This includes mock doctors, coordinators, and programs.</p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function EmailSettingsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [settings, setSettings] = useState({
    enabled: false,
    host: "",
    port: "587",
    user: "",
    pass: "",
    useSsl: false,
    fromName: "Sankara Academy of Vision",
    fromEmail: ""
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["email-settings"],
    queryFn: () => api.get<any>("/settings/email"),
  });

  useEffect(() => {
    if (data) {
      setSettings(prev => ({ ...prev, ...data }));
    }
  }, [data]);

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.patch("/settings/email", settings);
      toast({ title: "Email settings updated" });
      refetch();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast({ title: "Test email required", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      await api.post("/settings/email/test", { to: testEmail });
      toast({ title: "Test email sent successfully" });
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) return <Card className="p-6 flex justify-center border-slate-200"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></Card>;

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">SMTP Email Configuration</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Configure the system email server for outgoing notifications.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">SMTP Host</Label>
            <Input 
              placeholder="smtp.gmail.com" 
              value={settings.host} 
              onChange={e => setSettings({...settings, host: e.target.value})} 
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Port</Label>
            <Input 
              placeholder="587" 
              value={settings.port} 
              onChange={e => setSettings({...settings, port: e.target.value})} 
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Username</Label>
            <Input 
              placeholder="admin@example.com" 
              value={settings.user} 
              onChange={e => setSettings({...settings, user: e.target.value})} 
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Password</Label>
            <Input 
              type="password" 
              placeholder="••••••••" 
              value={settings.pass} 
              onChange={e => setSettings({...settings, pass: e.target.value})} 
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">From Name</Label>
            <Input 
              value={settings.fromName} 
              onChange={e => setSettings({...settings, fromName: e.target.value})} 
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">From Email</Label>
            <Input 
              placeholder="no-reply@sankaraeye.com" 
              value={settings.fromEmail} 
              onChange={e => setSettings({...settings, fromEmail: e.target.value})} 
              className="rounded-xl"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input 
            type="checkbox" 
            id="useSsl" 
            checked={settings.useSsl} 
            onChange={e => setSettings({...settings, useSsl: e.target.checked})}
            className="rounded border-slate-300 h-4 w-4 text-primary focus:ring-primary/20"
          />
          <Label htmlFor="useSsl" className="text-sm font-medium cursor-pointer">Use SSL/TLS Security</Label>
        </div>

        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex gap-2 flex-1 max-w-sm">
            <Input 
              placeholder="Send test email to..." 
              value={testEmail} 
              onChange={e => setTestEmail(e.target.value)} 
              className="rounded-xl text-xs"
            />
            <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="rounded-xl px-3">
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <Button onClick={handleSave} disabled={loading} className="gap-2 px-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
            Save SMTP Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [resetDatabaseOpen, setResetDatabaseOpen] = useState(false);

  const { data: profile, isLoading, error } = useQuery<CandidateProfile>({
    queryKey: ["candidate-profile"],
    queryFn: () => api.get<CandidateProfile>("/candidates/me"),
    enabled: user?.role === "student",
    retry: false,
  });

  const isStaff = user?.role !== "student";

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Profile</h1>
          <p className="text-muted-foreground text-sm mt-1">{user?.email}</p>
        </div>
        <div className="flex gap-2">
          {user?.role === "super_admin" && (
            <Button variant="destructive" size="sm" className="gap-2" onClick={() => setResetDatabaseOpen(true)}>
              <AlertTriangle className="h-4 w-4" /> Reset Database
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setChangePasswordOpen(true)}>
            <KeyRound className="h-4 w-4" /> Change Password
          </Button>
        </div>
      </div>

      {user?.role === "super_admin" && (
        <div className="space-y-6">
          <MockDataToggle />
          <EmailSettingsPanel />
        </div>
      )}

      {/* Staff Profile Card with Avatar */}
      {isStaff && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-5">
              {/* Avatar */}
              <div className="shrink-0">
                <RoleAvatar role={user?.role ?? ""} size="xl" showRing />
              </div>

              {/* Info */}
              <div className="flex-1 space-y-3">
                <div>
                  <h2 className="text-xl font-semibold">
                    {[user?.salutation, user?.fullName].filter(Boolean).join(" ")}
                  </h2>
                  {user?.designation && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Briefcase className="h-3.5 w-3.5" />
                      {user.designation}
                    </p>
                  )}
                  <div className="mt-2">
                    <Badge className={roleColors[user?.role ?? ""] ?? "bg-gray-100 text-gray-800"} variant="secondary">
                      {roleLabel[user?.role ?? ""] ?? user?.role}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {user?.employeeId && (
                    <div className="flex items-center gap-2 text-sm">
                      <BadgeCheck className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Employee ID</p>
                        <p className="font-mono font-medium">{user.employeeId}</p>
                      </div>
                    </div>
                  )}
                  {user?.unitName && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Unit</p>
                        <p className="font-medium">{user.unitName}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <div className="h-4 w-4 shrink-0 flex items-center justify-center">
                      <span className="text-xs">@</span>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium text-xs break-all">{user?.email}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Student: candidate profile */}
      {user?.role === "student" && (
        <>
          {isLoading && <div className="text-center text-muted-foreground py-6">Loading…</div>}
          {(error || !profile) && !isLoading && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground text-sm">Candidate profile not set up yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Please contact your exam coordinator.</p>
              </CardContent>
            </Card>
          )}
          {profile && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">Candidate Details</CardTitle>
                  <Badge className={statusColors[profile.status] ?? ""} variant="secondary">
                    {profile.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    ["Candidate Code", profile.candidateCode],
                    ["Phone", profile.phone],
                    ["Date of Birth", profile.dateOfBirth],
                    ["Gender", profile.gender],
                    ["Qualification", profile.qualification],
                    ["College / Institution", profile.collegeName],
                    ["Address", profile.address],
                    ["Posted Unit", profile.unitName],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between border-b pb-2 last:border-0 text-sm">
                      <span className="text-muted-foreground font-medium">{label}</span>
                      <span className="text-right max-w-xs">{value ?? <span className="text-muted-foreground/50">—</span>}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <ChangePasswordDialog open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} />
      <ResetDatabaseDialog open={resetDatabaseOpen} onClose={() => setResetDatabaseOpen(false)} />
    </div>
  );
}

