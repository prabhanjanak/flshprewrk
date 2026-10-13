import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useToast } from "../hooks/use-toast";
import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  Globe2, Loader2, RefreshCw, Trash2, KeyRound, ShieldAlert,
  Users, ShieldCheck, Stethoscope, Clock, Search, Filter, ShieldX
} from "lucide-react";

export default function ActiveSessionsPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [timeoutMinutes, setTimeoutMinutes] = useState("30");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("all");
  const [systemIp, setSystemIp] = useState("");

  useEffect(() => {
    fetch("/api/system-ip")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.ip) {
          setSystemIp(data.ip);
        }
      })
      .catch((err) => console.warn("Failed to fetch system IP:", err));
  }, []);

  const { data: activeSessions = [], refetch: refetchSessions, isFetching } = useQuery<any[]>({
    queryKey: ["active-sessions"],
    queryFn: () => api.get<any[]>("/auth/sessions"),
    refetchInterval: 5000,
  });

  const { data: timeoutSetting, refetch: refetchTimeout } = useQuery<any>({
    queryKey: ["session-timeout"],
    queryFn: () => api.get<any>("/global-settings/session_inactivity_timeout"),
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
      toast({ title: "User session terminated successfully" });
      refetchSessions();
    },
    onError: (e: any) => toast({ title: "Failed to terminate session", description: e.message, variant: "destructive" }),
  });

  const terminateBulkMutation = useMutation({
    mutationFn: async (sessionIds: number[]) => {
      await Promise.all(sessionIds.map(id => api.post("/auth/sessions/terminate", { sessionId: id })));
    },
    onSuccess: () => {
      toast({ title: "Stale user sessions terminated successfully" });
      refetchSessions();
    },
    onError: (e: any) => toast({ title: "Failed during bulk session termination", description: e.message, variant: "destructive" }),
  });

  const roleLabel: Record<string, string> = {
    super_admin: "Super Admin",
    program_admin: "Program Admin",
    central_exam_coordinator: "Central Exam Coordinator",
    exam_coordinator: "Exam Coordinator",
    unit_coordinator: "Unit Coordinator",
    doctor: "Doctor / Interviewer",
    student: "Candidate",
    display_operator: "Display Operator",
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-rose-50 border-rose-200 text-rose-700";
      case "program_admin":
      case "central_exam_coordinator":
        return "bg-amber-50 border-amber-250 text-amber-800";
      case "doctor":
        return "bg-indigo-50 border-indigo-200 text-indigo-700";
      default:
        return "bg-slate-50 border-slate-200 text-slate-700";
    }
  };

  const getAvatarStyle = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-gradient-to-br from-rose-500 to-red-600 text-white";
      case "program_admin":
      case "central_exam_coordinator":
        return "bg-gradient-to-br from-amber-500 to-orange-600 text-white";
      case "doctor":
        return "bg-gradient-to-br from-indigo-500 to-violet-600 text-white";
      default:
        return "bg-gradient-to-br from-slate-400 to-slate-550 text-white";
    }
  };

  const parseDeviceAgent = (ua: string | null | undefined) => {
    if (!ua) return { type: "Unknown", name: "Unknown Device" };

    // Handle parsed app device info (e.g. "iOS Mobile (App)", "Android Mobile (App)")
    if (ua.includes(" (App)")) {
      const type = ua.includes("Tablet") || ua.includes("iPad") ? "Tablet" : "Mobile";
      return { type, name: ua };
    }

    const u = ua.toLowerCase();
    let type = "Desktop";
    let name = "Unknown Device";

    if (u.includes("ipad") || (u.includes("macintosh") && navigator.maxTouchPoints > 1)) {
      type = "Tablet";
      name = "iPad";
    } else if (u.includes("iphone") || u.includes("ipod")) {
      type = "Mobile";
      name = "iPhone";
    } else if (u.includes("android")) {
      type = u.includes("mobile") ? "Mobile" : "Tablet";
      // Try to extract Android device name/model
      const match = ua.match(/\(([^)]+)\)/);
      if (match && match[1]) {
        const parts = match[1].split(";");
        const devicePart = parts.find(p => p.includes("Build/") || (!p.includes("Android") && !p.includes("Linux") && !p.includes("wv")));
        if (devicePart) {
          name = devicePart.split("Build/")[0].trim();
        } else {
          name = parts[parts.length - 1].trim();
        }
      } else {
        name = "Android Device";
      }
    } else if (u.includes("windows phone")) {
      type = "Mobile";
      name = "Windows Phone";
    } else if (u.includes("windows")) {
      type = "Desktop";
      name = "Windows PC";
    } else if (u.includes("macintosh") || u.includes("mac os")) {
      type = "Desktop";
      name = "Mac PC";
    } else if (u.includes("linux")) {
      type = "Desktop";
      name = "Linux PC";
    }

    return { type, name };
  };

  // Compute metrics
  const totalSessions = activeSessions.length;
  const adminSessions = activeSessions.filter(s => ["super_admin", "program_admin", "central_exam_coordinator"].includes(s.role)).length;
  const doctorSessions = activeSessions.filter(s => s.role === "doctor").length;

  // Filter sessions
  const filteredSessions = activeSessions.filter((sess) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      sess.userName?.toLowerCase().includes(query) || 
      sess.userEmail?.toLowerCase().includes(query) || 
      sess.ipAddress?.includes(query);
    
    if (selectedRoleFilter === "all") return matchesSearch;
    if (selectedRoleFilter === "admins") {
      return matchesSearch && ["super_admin", "program_admin", "central_exam_coordinator"].includes(sess.role);
    }
    if (selectedRoleFilter === "doctors") {
      return matchesSearch && sess.role === "doctor";
    }
    return matchesSearch && sess.role === selectedRoleFilter;
  });

  const handleBulkTerminate = () => {
    // Terminate all other sessions (excluding current super admin active sessions or excluding logged-in session email)
    const otherSessions = activeSessions.filter(s => s.userEmail !== currentUser?.email);
    if (otherSessions.length === 0) {
      toast({ title: "No other active sessions", description: "There are no other active sessions to terminate." });
      return;
    }
    if (window.confirm(`Are you absolutely sure you want to FORCE LOG OUT all other ${otherSessions.length} active sessions? This will log out all other active faculty, coordinators, and doctors immediately.`)) {
      terminateBulkMutation.mutate(otherSessions.map(s => s.id));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      
      {/* ── HERO HEADER ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-100/20 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-orange-50 rounded-full px-3.5 py-1 border border-orange-100 w-fit">
              <ShieldCheck className="h-3.5 w-3.5 text-orange-600" />
              <span className="text-[10px] font-bold text-orange-850 uppercase tracking-widest">Active Security Monitor</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-slate-900 leading-tight">
              Portal Logins & Active Sessions {systemIp ? `(${systemIp})` : ""}
            </h1>
            <p className="text-xs md:text-sm font-semibold text-slate-550 leading-relaxed">
              Real-time audit directory of active coordinators, doctors, and units. Monitor system concurrency, invalid logins, and secure auto-logout settings.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchSessions()}
              disabled={isFetching}
              className="h-11 px-5 rounded-xl bg-white border-slate-250 text-slate-700 hover:bg-slate-50 font-bold text-xs uppercase tracking-wider gap-2 shadow-sm shrink-0"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync Live Status
            </Button>
            <Button
              onClick={handleBulkTerminate}
              disabled={terminateBulkMutation.isPending || activeSessions.filter(s => s.userEmail !== currentUser?.email).length === 0}
              className="h-11 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider gap-2 shadow-md border-none shrink-0"
            >
              <ShieldX className="h-4 w-4" />
              Terminate Other Sessions
            </Button>
          </div>
        </div>
      </div>

      {/* ── METRICS OVERVIEW CARDS ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          {
            title: "Total Active Users",
            val: totalSessions,
            desc: "Active authenticated sessions",
            icon: <Users className="h-5 w-5 text-orange-655" />,
            bg: "bg-orange-50/50 border-orange-100"
          },
          {
            title: "Coordinators Online",
            val: adminSessions,
            desc: "Admins & exam coordinators",
            icon: <ShieldCheck className="h-5 w-5 text-amber-655" />,
            bg: "bg-amber-50/40 border-amber-100"
          },
          {
            title: "Faculty & Doctors",
            val: doctorSessions,
            desc: "Active grading interview panels",
            icon: <Stethoscope className="h-5 w-5 text-indigo-655" />,
            bg: "bg-indigo-50/40 border-indigo-150"
          },
          {
            title: "Auto-Logout Limit",
            val: `${timeoutMinutes} min`,
            desc: "Idle timeout session rule",
            icon: <Clock className="h-5 w-5 text-slate-655" />,
            bg: "bg-slate-50 border-slate-200"
          }
        ].map((m, idx) => (
          <div key={idx} className={`bg-white rounded-2xl border p-5 shadow-sm relative overflow-hidden flex items-center justify-between ${m.bg}`}>
            <div className="space-y-1 z-10">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{m.title}</span>
              <div className="text-3xl font-black text-slate-900 tracking-tight">{m.val}</div>
              <p className="text-[10px] font-semibold text-slate-450">{m.desc}</p>
            </div>
            <div className="p-3 bg-white rounded-xl shadow-inner shadow-slate-100 border border-slate-100 flex-shrink-0 z-10">{m.icon}</div>
            {idx === 0 && (
              <div className="absolute top-2 right-2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── CONSOLE PANEL ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        
        {/* ── SESSIONS DIRECTORY (TABLE OR GRID) ─────────────────────────── */}
        <div className="xl:col-span-3 bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
          
          {/* Dashboard Header & Filters */}
          <div className="p-6 border-b border-slate-200 bg-white space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
                  <Globe2 className="h-5 w-5 text-orange-600" />
                  Live Sessions Registry
                </h3>
                <p className="text-xs text-slate-500 font-medium">Verify login device context and prevent stale resource leaks</p>
              </div>
              <Badge className="bg-orange-100 text-orange-700 border-none font-bold h-7 px-3 text-[10px] uppercase rounded-full">
                {filteredSessions.length} Online
              </Badge>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row items-center gap-3 pt-2">
              <div className="relative w-full md:flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by user name, email, IP address..."
                  className="h-10 pl-9 rounded-xl border-slate-250 focus:ring-orange-500 text-xs font-semibold bg-slate-50/50 focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200 w-full md:w-auto shrink-0 overflow-x-auto">
                {[
                  { id: "all", label: "All Roles" },
                  { id: "admins", label: "Coordinators" },
                  { id: "doctors", label: "Doctors" }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedRoleFilter(tab.id)}
                    className={`h-8 px-3.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      selectedRoleFilter === tab.id
                        ? "bg-white text-slate-900 shadow-sm border border-slate-150 font-black"
                        : "text-slate-550 hover:text-slate-800"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="text-center py-20 text-slate-400 text-sm font-bold flex flex-col items-center justify-center gap-3 bg-slate-50/30">
              <ShieldAlert className="h-10 w-10 text-slate-350" />
              <div>
                <p className="text-slate-800 text-base font-black">No matching sessions found</p>
                <p className="text-slate-450 text-xs font-semibold mt-1">Try resetting the search query or role filter tab</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b bg-slate-50/50">
                    <th className="px-6 py-3.5 font-bold text-[10px] text-slate-500 uppercase tracking-widest w-72">Stakholder Info</th>
                    <th className="px-4 py-3.5 font-bold text-[10px] text-slate-500 uppercase tracking-widest">Network (IP Address)</th>
                    <th className="px-4 py-3.5 font-bold text-[10px] text-slate-500 uppercase tracking-widest">Device Type & Name</th>
                    <th className="px-4 py-3.5 font-bold text-[10px] text-slate-500 uppercase tracking-widest">Last Access Timestamp</th>
                    <th className="px-6 py-3.5 font-bold text-[10px] text-slate-500 uppercase tracking-widest text-right w-44">Manage Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSessions.map((sess) => {
                    const isSelf = sess.userEmail === currentUser?.email;
                    const parsedAgent = parseDeviceAgent(sess.deviceInfo);
                    
                    return (
                      <tr key={sess.id} className={`hover:bg-slate-50/50 transition-colors ${isSelf ? 'bg-orange-50/10 hover:bg-orange-50/20' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${getAvatarStyle(sess.role)}`}>
                              {sess.userName?.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-extrabold text-sm text-slate-900 truncate">{sess.userName}</p>
                                {isSelf && (
                                  <Badge className="bg-orange-500 text-white font-extrabold text-[8px] h-4 rounded-full border-none">
                                    YOU
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 font-medium truncate mt-0.5">{sess.userEmail}</p>
                              <div className="mt-1 flex items-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${getRoleBadgeStyle(sess.role)}`}>
                                  {roleLabel[sess.role] ?? sess.role}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <span className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-md">
                              {sess.ipAddress || "N/A"}
                            </span>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-1 mt-1">Network Route</p>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {parsedAgent.type}
                            </span>
                            <p className="text-xs font-bold text-slate-850">
                              {parsedAgent.name}
                            </p>
                            <p className="text-[9px] font-semibold text-slate-400 max-w-[170px] truncate" title={sess.deviceInfo}>
                              {sess.deviceInfo || "Raw agent unavailable"}
                            </p>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-800 font-mono">
                              {new Date(sess.lastActivityAt).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </p>
                            <p className="text-[10px] text-slate-450 font-bold">
                              {new Date(sess.lastActivityAt).toLocaleDateString("en-IN", { day: '2-digit', month: 'short' })}
                            </p>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={terminateSessionMutation.isPending || isSelf}
                            onClick={() => {
                              if (window.confirm(`Force log out "${sess.userName}"? All their current page buffers and unsaved inputs will be cleared.`)) {
                                terminateSessionMutation.mutate(sess.id);
                              }
                            }}
                            className={`h-8 px-3 rounded-xl font-bold text-[10px] uppercase border flex items-center gap-1.5 ml-auto transition-all ${
                              isSelf
                                ? "border-slate-100 text-slate-350 cursor-not-allowed"
                                : "text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-100 bg-white shadow-sm"
                            }`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Force Logout
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── SECURITY CONFIGURATION PANEL ───────────────────────────────── */}
        <div className="xl:col-span-1 space-y-6">
          
          {/* Timeout Settings Widget */}
          <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-6 space-y-5">
            <div className="flex items-center gap-3 border-b pb-4">
              <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 border border-orange-100 flex items-center justify-center">
                <KeyRound className="h-4.5 w-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-900">Session Security Policy</h4>
                <p className="text-[9px] text-slate-450 font-bold">Configures session validation limit</p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Define the session inactivity limit in minutes. Once configured, coordinates and medical examiners are automatically booted off the platform if inactive for this set duration.
              </p>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Inactivity Limit</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={timeoutMinutes}
                    onChange={(e) => setTimeoutMinutes(e.target.value)}
                    placeholder="Minutes..."
                    className="h-10 rounded-xl border-slate-250 focus:ring-orange-500 text-sm font-bold font-mono focus:bg-slate-50/20"
                  />
                  <Button
                    disabled={!timeoutMinutes || saveTimeoutMutation.isPending}
                    onClick={() => saveTimeoutMutation.mutate(timeoutMinutes)}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold h-10 px-4 rounded-xl text-xs uppercase shrink-0 shadow-sm"
                  >
                    Apply Limit
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Security Alert Card */}
          <div className="bg-gradient-to-br from-amber-500 to-orange-655 rounded-[32px] p-6 text-white shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-36 h-36 bg-white/10 rounded-full -mr-12 -mt-12 blur-xl" />
            <div className="relative z-10 space-y-4">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <ShieldAlert className="h-4.5 w-4.5 text-white" />
              </div>
              <div className="space-y-1">
                <h5 className="font-black text-sm uppercase tracking-wider">Exam System Security</h5>
                <p className="text-[11px] text-orange-50 font-semibold leading-relaxed">
                  Stale login sessions consume server resources and invite audit security compliance risks during high-stakes evaluations.
                </p>
              </div>
              <p className="text-[10px] text-orange-100 font-bold border-t border-white/20 pt-3">
                Ensure active terminals are locked during evaluations.
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
