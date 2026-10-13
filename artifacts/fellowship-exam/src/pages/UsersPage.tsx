import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Search, UserPlus, Building2, Edit2, Trash2, KeyRound, BadgeCheck, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { RoleAvatar } from "../components/RoleAvatar";

interface User {
  id: number; email: string; salutation: string | null; fullName: string;
  employeeId: string | null; designation: string | null; gender: string | null;
  avatarSeed: string | null; role: string;
  active: boolean; unitId: number | null; unitName: string | null;
  forcePasswordReset: boolean;
}
interface Unit { id: number; name: string; city: string; }

const SALUTATIONS = ["Dr.", "Mr.", "Ms.", "Mrs.", "Prof."];

const roleColors: Record<string, string> = {
  super_admin: "bg-red-100 text-red-800",
  program_admin: "bg-orange-100 text-orange-800",
  central_exam_coordinator: "bg-blue-100 text-blue-800",
  unit_coordinator: "bg-cyan-100 text-cyan-800",
  doctor: "bg-purple-100 text-purple-800",
  student: "bg-gray-100 text-gray-800",
};

const roleLabel: Record<string, string> = {
  super_admin: "Super Admin",
  program_admin: "Program Admin",
  central_exam_coordinator: "Central Exam Coordinator",
  unit_coordinator: "Unit Coordinator",
  doctor: "Doctor / Interviewer",
  student: "Student / Candidate",
};

const ALL_ROLES = [
  { value: "program_admin", label: "Program Admin" },
  { value: "central_exam_coordinator", label: "Central Exam Coordinator" },
  { value: "unit_coordinator", label: "Unit Coordinator" },
  { value: "doctor", label: "Doctor / Interviewer" },
  { value: "student", label: "Student / Candidate" },
];

const COORDINATOR_ROLES = [
  { value: "central_exam_coordinator", label: "Central Exam Coordinator" },
  { value: "unit_coordinator", label: "Unit Coordinator" },
  { value: "doctor", label: "Doctor / Interviewer" },
];

const EMPTY_FORM = {
  salutation: "", fullName: "", email: "", employeeId: "",
  designation: "", gender: "", avatarSeed: "",
  role: "unit_coordinator", unitId: "",
};

const allRoles = Object.keys(roleLabel);

export default function UsersPage() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetPw, setResetPw] = useState("Welcome@123");

  const isSuperAdmin = me?.role === "super_admin";
  const availableRoles = isSuperAdmin ? ALL_ROLES : COORDINATOR_ROLES;

  const [form, setForm] = useState(EMPTY_FORM);

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users"),
  });

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["units"],
    queryFn: () => api.get<Unit[]>("/units"),
  });

  const addMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post<User>("/users", {
        ...data,
        salutation: data.salutation || null,
        employeeId: data.employeeId || null,
        designation: data.designation || null,
        gender: data.gender || null,
        avatarSeed: data.avatarSeed || null,
        unitId: data.unitId ? Number(data.unitId) : null,
      }),
    onSuccess: () => {
      toast({ title: "User created", description: "Initial password: Welcome@123" });
      qc.invalidateQueries({ queryKey: ["users"] });
      setAddOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<User> & { avatarSeed?: string | null } }) =>
      api.patch<User>(`/users/${id}`, data),
    onSuccess: () => { toast({ title: "User updated" }); qc.invalidateQueries({ queryKey: ["users"] }); setEditUser(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => { toast({ title: "User deleted" }); qc.invalidateQueries({ queryKey: ["users"] }); setDeleteUser(null); },
    onError: (e: any) => {
      const msg = e.body?.error || e.message || "Unknown error";
      const det = e.body?.details ? `\n\nDEBUG: ${e.body.details}` : "";
      const hint = e.body?.hint ? `\n\nHINT: ${e.body.hint}` : "";
      toast({ 
        title: "CRITICAL: Deletion Failed", 
        description: `${msg}${det}${hint}`, 
        variant: "destructive" 
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: ({ userId, newPassword }: { userId: number; newPassword: string }) =>
      api.post("/auth/admin-reset-password", { userId, newPassword }),
    onSuccess: () => { toast({ title: "Password reset successfully" }); setResetUser(null); setResetPw("Welcome@123"); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = users.filter((u) => {
    const matchSearch =
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.unitName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (u.employeeId ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (u.designation ?? "").toLowerCase().includes(search.toLowerCase());
    return matchSearch && (roleFilter === "all" || u.role === roleFilter);
  });

  const displayName = (u: User) => [u.salutation, u.fullName].filter(Boolean).join(" ");

  const isFormValid = form.fullName && form.email && form.employeeId && form.designation && form.gender && form.unitId && form.role;

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-black p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-orange-500 p-8 text-white shadow-2xl">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-orange-100 text-sm font-medium">
              <ShieldCheck className="h-4 w-4" />
              <span>Institutional Directory</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">Personnel Registry</h1>
            <p className="text-orange-100/80 max-w-md">Manage active stakeholders, medical faculty, and fellowship coordinators across the Sankara network.</p>
          </div>
          {isSuperAdmin && (
            <Button 
              onClick={() => setAddOpen(true)} 
              className="bg-white text-orange-700 hover:bg-orange-50 transition-all font-bold h-12 px-6 rounded-2xl shadow-xl hover:scale-105 active:scale-95 gap-2 border-none"
            >
              <UserPlus className="h-5 w-5" /> Provision New Account
            </Button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "System Admins", value: users.filter(u => u.role.includes('admin')).length, icon: ShieldCheck, colorClasses: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400" },
          { label: "Unit Coordinators", value: users.filter(u => u.role === 'unit_coordinator').length, icon: Building2, colorClasses: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400" },
          { label: "Medical Faculty", value: users.filter(u => u.role === 'doctor').length, icon: BadgeCheck, colorClasses: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400" },
          { label: "Active Fellows", value: users.filter(u => u.role === 'student').length, icon: UserPlus, colorClasses: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" },
        ].map((s, i) => (
          <Card key={i} className="border-none shadow-sm bg-white dark:bg-zinc-900">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`h-11 w-11 rounded-2xl ${s.colorClasses} flex items-center justify-center shadow-inner`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{s.value}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
          <Input 
            placeholder="Search by name, email, or institutional ID..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            className="pl-12 h-12 rounded-xl border-none bg-white shadow-sm font-medium focus:ring-2 focus:ring-orange-500" 
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full md:w-64 h-12 rounded-xl border-none bg-white shadow-sm font-bold uppercase text-[11px] tracking-widest px-6">
            <SelectValue placeholder="Filter by Role" />
          </SelectTrigger>
          <SelectContent className="rounded-xl shadow-2xl border-none">
            <SelectItem value="all" className="font-bold text-[11px] uppercase">All Personnel</SelectItem>
            {allRoles.map((r) => <SelectItem key={r} value={r} className="font-bold text-[11px] uppercase">{roleLabel[r] ?? r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-6">
           <div className="relative">
             <div className="absolute inset-0 bg-orange-500 blur-2xl opacity-20 animate-pulse" />
             <Loader2 className="h-12 w-12 animate-spin text-orange-500 relative z-10" />
           </div>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Decrypting Personnel Database...</p>
        </div>
      ) : (
        <div className="px-4 space-y-4">
           {filtered.map((u) => (
             <Card key={u.id} className="group rounded-[32px] border-none bg-white shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between p-6 gap-8">
                   <div className="flex items-center gap-6 xl:w-[350px]">
                      <div className="relative">
                         <RoleAvatar role={u.role} size="lg" showRing />
                         <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-white ${u.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      </div>
                      <div className="space-y-1">
                         <h4 className="text-xl font-black text-slate-900 tracking-tight leading-none italic uppercase">
                            {displayName(u)}
                         </h4>
                         <div className="flex items-center gap-2">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{u.email}</p>
                            {u.forcePasswordReset && <Badge className="bg-amber-50 text-amber-600 border-amber-100 text-[8px] h-4 px-2 uppercase font-black">RESET REQ</Badge>}
                         </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 md:grid-cols-4 flex-1 gap-6">
                      <div className="space-y-1">
                         <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Faculty Role</p>
                         <Badge className={`rounded-full px-4 h-7 font-black uppercase text-[9px] tracking-widest ${roleColors[u.role] ?? "bg-slate-100 text-slate-800"}`} variant="secondary">
                           {roleLabel[u.role] ?? u.role}
                         </Badge>
                      </div>
                      <div className="space-y-1">
                         <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Hospital Unit</p>
                         <div className="flex items-center gap-2 text-slate-600">
                            <Building2 className="h-4 w-4 text-orange-500/40" />
                            <span className="text-[11px] font-black uppercase tracking-tight">{u.unitName || "Not Assigned"}</span>
                         </div>
                      </div>
                      <div className="space-y-1">
                         <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Institutional ID</p>
                         <div className="flex items-center gap-2 text-slate-600">
                            <BadgeCheck className="h-4 w-4 text-emerald-500/40" />
                            <span className="text-[11px] font-black font-mono tracking-tighter">{u.employeeId || "—"}</span>
                         </div>
                      </div>
                      <div className="space-y-1">
                         <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Designation</p>
                         <p className="text-[11px] font-black text-slate-500 uppercase tracking-tight break-words">{u.designation || "—"}</p>
                      </div>
                   </div>

                   <div className="flex items-center justify-end gap-3 shrink-0">
                      {isSuperAdmin && (
                        <Button variant="outline" size="icon" className="h-12 w-12 rounded-2xl border-slate-100 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-all" title="Reset Credentials"
                          onClick={() => { setResetUser(u); setResetPw("Welcome@123"); }}>
                          <KeyRound className="h-5 w-5" />
                        </Button>
                      )}
                      <Button variant="outline" size="icon" className="h-12 w-12 rounded-2xl border-slate-100 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 transition-all" title="Modify Registry"
                        onClick={() => setEditUser(u)}>
                        <Edit2 className="h-5 w-5" />
                      </Button>
                      {u.role !== "super_admin" && (
                        <Button variant="outline" size="icon" className="h-12 w-12 rounded-2xl border-slate-100 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all"
                          title="Purge Account" onClick={() => setDeleteUser(u)}>
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      )}
                   </div>
                </div>
                <div className={`h-1.5 w-full ${u.active ? 'bg-emerald-500/50' : 'bg-slate-200'}`} />
             </Card>
           ))}
           {filtered.length === 0 && (
             <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[40px] border-2 border-dashed border-slate-100">
                <Search className="h-12 w-12 text-slate-200 mb-4" />
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">No personnel records match your query</p>
             </div>
           )}
        </div>
      )}

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Alert className="text-xs py-2">
              <AlertDescription>New users will receive initial password: <code className="font-mono">Welcome@123</code> and must reset it on first login.</AlertDescription>
            </Alert>

            {/* Avatar preview */}
            {form.role && (
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <RoleAvatar role={form.role} size="md" showRing />
                <div>
                  <p className="text-xs font-medium">{roleLabel[form.role] ?? form.role}</p>
                  <p className="text-xs text-muted-foreground">Avatar auto-assigned based on role</p>
                </div>
              </div>
            )}

            {/* Salutation + Full Name */}
            <div className="space-y-1">
              <Label>Name <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <Select value={form.salutation} onValueChange={(v) => setForm((f) => ({ ...f, salutation: v }))}>
                  <SelectTrigger className="w-28 shrink-0"><SelectValue placeholder="Title" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {SALUTATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input className="flex-1" placeholder="Full name" value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Email <span className="text-red-500">*</span></Label>
              <Input type="email" placeholder="user@sankaraeye.com" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Employee ID <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. SAV-001" value={form.employeeId}
                onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Designation <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. Senior Ophthalmologist" value={form.designation}
                onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Gender <span className="text-red-500">*</span></Label>
              <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other / Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Role <span className="text-red-500">*</span></Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{availableRoles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Unit <span className="text-red-500">*</span></Label>
              <Select value={form.unitId} onValueChange={(v) => setForm((f) => ({ ...f, unitId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>{units.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.city}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setForm(EMPTY_FORM); }}>Cancel</Button>
            <Button disabled={!isFormValid || addMutation.isPending} onClick={() => addMutation.mutate(form)}>
              {addMutation.isPending ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      {editUser && (
        <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              {/* Avatar preview */}
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <RoleAvatar role={editUser.role} size="md" showRing />
                <div>
                  <p className="text-xs font-medium">{roleLabel[editUser.role] ?? editUser.role}</p>
                  <p className="text-xs text-muted-foreground">Avatar reflects the assigned role</p>
                </div>
              </div>

              {/* Name */}
              <div className="space-y-1">
                <Label>Name</Label>
                <div className="flex gap-2">
                  <Select value={editUser.salutation ?? "none"} onValueChange={(v) => setEditUser((u) => u ? { ...u, salutation: v === "none" ? null : v } : u)}>
                    <SelectTrigger className="w-28 shrink-0"><SelectValue placeholder="Title" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {SALUTATIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="flex-1" value={editUser.fullName}
                    onChange={(e) => setEditUser((u) => u ? { ...u, fullName: e.target.value } : u)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={editUser.email}
                  onChange={(e) => setEditUser((u) => u ? { ...u, email: e.target.value } : u)} />
              </div>

              <div className="space-y-1">
                <Label>Employee ID <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. SAV-001" value={editUser.employeeId ?? ""}
                  onChange={(e) => setEditUser((u) => u ? { ...u, employeeId: e.target.value || null } : u)} />
              </div>

              <div className="space-y-1">
                <Label>Designation <span className="text-red-500">*</span></Label>
                <Input placeholder="e.g. Senior Ophthalmologist" value={editUser.designation ?? ""}
                  onChange={(e) => setEditUser((u) => u ? { ...u, designation: e.target.value || null } : u)} />
              </div>

              <div className="space-y-1">
                <Label>Gender</Label>
                <Select value={editUser.gender ?? ""} onValueChange={(v) => setEditUser((u) => u ? { ...u, gender: v } : u)}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other / Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editUser.role !== "super_admin" && (
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={editUser.role} onValueChange={(v) => setEditUser((u) => u ? { ...u, role: v } : u)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{availableRoles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label>Unit <span className="text-red-500">*</span></Label>
                <Select value={editUser.unitId ? String(editUser.unitId) : ""} onValueChange={(v) => setEditUser((u) => u ? { ...u, unitId: Number(v) } : u)}>
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>{units.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.city}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={editUser.active ? "active" : "disabled"} onValueChange={(v) => setEditUser((u) => u ? { ...u, active: v === "active" } : u)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button
                disabled={!editUser.fullName || !editUser.email || !editUser.employeeId || !editUser.designation || !editUser.unitId || editMutation.isPending}
                onClick={() => editMutation.mutate({
                  id: editUser.id,
                  data: {
                    email: editUser.email,
                    fullName: editUser.fullName,
                    salutation: editUser.salutation,
                    employeeId: editUser.employeeId,
                    designation: editUser.designation,
                    gender: editUser.gender,
                    avatarSeed: editUser.avatarSeed,
                    role: editUser.role,
                    unitId: editUser.unitId,
                    active: editUser.active,
                  },
                })}>
                {editMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete User Dialog */}
      <Dialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete User</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete <strong>{deleteUser ? displayName(deleteUser) : ""}</strong>? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}>
              {deleteMutation.isPending ? "Deleting…" : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetUser} onOpenChange={() => setResetUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Reset Password — {resetUser ? displayName(resetUser) : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Set a new temporary password. The user will be required to change it on next login.</p>
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="Min 8 characters" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetUser(null)}>Cancel</Button>
            <Button
              disabled={!resetPw || resetPw.length < 8 || resetMutation.isPending}
              onClick={() => resetUser && resetMutation.mutate({ userId: resetUser.id, newPassword: resetPw })}
            >
              {resetMutation.isPending ? "Resetting…" : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

