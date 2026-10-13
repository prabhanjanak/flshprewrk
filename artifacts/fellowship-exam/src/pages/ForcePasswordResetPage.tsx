import { useState } from "react";
import logoUrl from "../assets/seh_sav_logo_1777703794142.jpg";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Loader2, KeyRound, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import ParticleCanvas from "../components/ParticleCanvas";

export default function ForcePasswordResetPage() {
  const { user, refreshUser, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPw.length < 8) { setError("New password must be at least 8 characters"); return; }
    if (newPw !== confirm) { setError("Passwords do not match"); return; }
    if (newPw === current) { setError("New password must be different from your current password"); return; }
    setLoading(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: newPw });
      await refreshUser();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen relative flex items-center justify-center bg-gradient-to-br from-[#0b1f3a] via-[#112d54] to-[#0b1f3a] p-4 overflow-hidden">
        <ParticleCanvas count={60} color="34, 197, 94" connectionColor="34, 197, 94" maxDistance={120} />
        <Card className="relative z-10 w-full max-w-md border-0 shadow-2xl backdrop-blur-sm bg-card/90">
          <CardContent className="flex flex-col items-center py-12 text-center gap-4">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-green-600" />
            </div>
            <h2 className="text-xl font-bold">Password Changed!</h2>
            <p className="text-muted-foreground text-sm">Your password has been updated successfully.</p>
            <Button className="mt-2" onClick={() => window.location.reload()}>Continue to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-gradient-to-br from-[#0b1f3a] via-[#112d54] to-[#0b1f3a] p-4 overflow-hidden">
      <ParticleCanvas count={80} color="255, 122, 0" connectionColor="255, 159, 67" maxDistance={140} />

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <img src={logoUrl} alt="SAV" className="h-20 w-auto mx-auto rounded-xl shadow-lg object-contain bg-white p-2" />
          <div>
            <h1 className="text-2xl font-bold text-white drop-shadow">Sankara Academy of Vision</h1>
            <p className="text-sm text-blue-200 mt-1">Fellowship Exam Management System</p>
          </div>
        </div>

        <Card className="border-0 shadow-2xl backdrop-blur-sm bg-card/90">
          <CardHeader className="pb-2 text-center">
            <div className="flex justify-center mb-2">
              <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                <KeyRound className="h-6 w-6 text-orange-600" />
              </div>
            </div>
            <h2 className="text-lg font-semibold">Set Your Password</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Welcome, <strong>{user?.fullName}</strong>. For security, you must set a new password before continuing.
            </p>
            <p className="text-xs text-muted-foreground">Your initial password is: <code className="bg-muted px-1 rounded font-mono">Welcome@123</code></p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label>Current Password</Label>
                <div className="relative">
                  <Input type={showCurrent ? "text" : "password"} placeholder="Welcome@123" value={current} onChange={(e) => setCurrent(e.target.value)} required className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowCurrent(!showCurrent)}>
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <div className="relative">
                  <Input type={showNew ? "text" : "password"} placeholder="Min 8 characters" value={newPw} onChange={(e) => setNewPw(e.target.value)} required className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNew(!showNew)}>
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
                <Input type="password" placeholder="Repeat new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !current || !newPw || !confirm}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Changing…</> : "Set New Password"}
              </Button>
              <Button type="button" variant="ghost" className="w-full text-muted-foreground text-xs" onClick={logout}>
                Sign out and use a different account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

