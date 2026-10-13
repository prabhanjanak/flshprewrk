import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Separator } from "../components/ui/separator";
import {
  Building2, Plus, ArrowLeft, Users, UserCheck, Trash2, Pencil, ExternalLink, 
  FileText, Loader2, UserMinus, MapPin, Hospital, Stethoscope, 
  Briefcase, GraduationCap, Phone, Mail, Calendar, ShieldCheck, 
  Sparkles, Network, Fingerprint, Activity, UserCircle2, AlertCircle,
  Settings2
} from "lucide-react";
import { useToast } from "../hooks/use-toast";

interface Unit { id: number; name: string; city: string | null; location: string | null; candidateCount: number; staffCount: number; }
interface StaffMember { id: number; fullName: string; email: string; role: string; salutation: string | null; employeeId: string | null; active: boolean; designation?: string; }
interface CandidateRow {
  id: number; candidateCode: string; fullName: string; email: string; phone: string | null;
  status: string; dateOfBirth: string | null; gender: string | null; qualification: string | null;
  collegeName: string | null; address: string | null; createdAt: string;
  documents: { id: number; docType: string; fileName: string; fileUrl: string | null }[];
}
interface UnitDetail { id: number; name: string; city: string | null; location: string | null; staff: StaffMember[]; candidates: CandidateRow[]; }

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin", program_admin: "Program Admin",
  central_exam_coordinator: "Central Coordinator", unit_coordinator: "Unit Coordinator",
  doctor: "Specialist / Doctor", student: "Candidate / Student",
};

const ROLE_THEMES: Record<string, { color: string; icon: any }> = {
  doctor: { color: "text-orange-600 bg-orange-50 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800", icon: Stethoscope },
  interviewer: { color: "text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800", icon: ShieldCheck },
  staff: { color: "text-zinc-600 bg-zinc-50 border-zinc-100 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700", icon: UserCircle2 },
  exam_coordinator: { color: "text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800", icon: Settings2 },
  unit_coordinator: { color: "text-orange-600 bg-orange-50 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800", icon: Briefcase },
  central_exam_coordinator: { color: "text-orange-600 bg-orange-50 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800", icon: Network },
  program_admin: { color: "text-orange-600 bg-orange-50 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800", icon: ShieldCheck },
  super_admin: { color: "text-red-600 bg-red-50 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800", icon: Sparkles },
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
  approved: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  rejected: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  interview_completed: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  allocated: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
};

export default function UnitsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEdit = user?.role === "super_admin" || user?.role === "program_admin";

  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateRow | null>(null);
  const [activeTab, setActiveTab] = useState<string>("staff");
  const [addOpen, setAddOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [addForm, setAddForm] = useState({ name: "", city: "", location: "" });

  const { data: units = [], isLoading } = useQuery<Unit[]>({
    queryKey: ["units"],
    queryFn: () => api.get<Unit[]>("/units"),
  });

  const { data: unitDetail, isLoading: detailLoading } = useQuery<UnitDetail>({
    queryKey: ["unit-detail", selectedUnitId],
    queryFn: () => api.get<UnitDetail>(`/units/${selectedUnitId}`),
    enabled: selectedUnitId !== null,
  });

  const stats = {
    total: units.length,
    staff: units.reduce((acc, u) => acc + u.staffCount, 0),
    candidates: units.reduce((acc, u) => acc + u.candidateCount, 0),
    cities: new Set(units.map(u => u.city)).size,
  };

  const addMutation = useMutation({
    mutationFn: (data: typeof addForm) => api.post<Unit>("/units", data),
    onSuccess: () => {
      toast({ title: "Unit Added", description: "The hospital unit has been successfully registered." });
      qc.invalidateQueries({ queryKey: ["units"] });
      setAddOpen(false);
      setAddForm({ name: "", city: "", location: "" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; name: string; city: string; location: string }) =>
      api.patch<Unit>(`/units/${id}`, data),
    onSuccess: () => {
      toast({ title: "Unit Updated" });
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["unit-detail", editUnit?.id] });
      setEditUnit(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/units/${id}`),
    onSuccess: () => {
      toast({ title: "Unit Deleted" });
      qc.invalidateQueries({ queryKey: ["units"] });
      setDeleteConfirmId(null);
      if (selectedUnitId === deleteConfirmId) setSelectedUnitId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeStaff = useMutation({
    mutationFn: (userId: number) => api.patch(`/users/${userId}`, { unitId: null }),
    onSuccess: () => {
      toast({ title: "Staff Removed", description: "Personnel has been unassigned from this unit." });
      qc.invalidateQueries({ queryKey: ["unit-detail", selectedUnitId] });
      qc.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateCandidateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.patch(`/candidates/${id}`, { status }),
    onSuccess: () => {
      toast({ title: "Status Updated" });
      qc.invalidateQueries({ queryKey: ["unit-detail", selectedUnitId] });
      if (selectedCandidate) {
        setSelectedCandidate((prev) => prev ? { ...prev, status: updateCandidateStatus.variables?.status ?? prev.status } : prev);
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Candidate detail view
  if (selectedCandidate) {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => setSelectedCandidate(null)} className="rounded-xl h-10 px-4 group">
              <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" /> Back to Unit
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{selectedCandidate.fullName}</h1>
              <p className="text-sm text-muted-foreground font-mono">{selectedCandidate.candidateCode}</p>
            </div>
          </div>
          <Badge className={`${STATUS_COLORS[selectedCandidate.status] ?? ""} h-8 px-4 rounded-full text-xs font-bold uppercase tracking-wider`}>
            {selectedCandidate.status.replace(/_/g, " ")}
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
              <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b pb-4 px-6">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCircle2 className="h-5 w-5 text-orange-600" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid md:grid-cols-2 gap-x-12 gap-y-6">
                  {[
                    { label: "Email", value: selectedCandidate.email, icon: Mail },
                    { label: "Phone", value: selectedCandidate.phone, icon: Phone },
                    { label: "DOB", value: selectedCandidate.dateOfBirth, icon: Calendar },
                    { label: "Gender", value: selectedCandidate.gender, icon: Users },
                    { label: "Address", value: selectedCandidate.address, icon: MapPin, full: true },
                  ].map((item, i) => (
                    <div key={i} className={`space-y-1.5 ${item.full ? "md:col-span-2" : ""}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        <item.icon className="h-3 w-3" /> {item.label}
                      </p>
                      <p className="text-sm font-semibold">{item.value || "—"}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
              <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b pb-4 px-6">
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-emerald-600" />
                  Academic Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 grid md:grid-cols-2 gap-8">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Highest Qualification</p>
                  <p className="text-sm font-semibold">{selectedCandidate.qualification || "—"}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Medical Institution</p>
                  <p className="text-sm font-semibold">{selectedCandidate.collegeName || "—"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
              <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b pb-4 px-6">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-600" />
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {!selectedCandidate.documents.length ? (
                  <div className="text-center py-8 text-muted-foreground text-xs italic">No uploads available</div>
                ) : selectedCandidate.documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-2xl border bg-zinc-50/30 dark:bg-zinc-900/30 hover:border-orange-200 transition-colors">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-xs font-bold truncate">{d.docType}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{d.fileName}</p>
                    </div>
                    {d.fileUrl && (
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-orange-600"
                        onClick={() => window.open(d.fileUrl!, "_blank")}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {canEdit && (
              <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white dark:bg-zinc-900">
                <CardHeader className="bg-orange-600 p-6 text-white">
                  <CardTitle className="text-base font-bold">Admin Actions</CardTitle>
                  <CardDescription className="text-orange-100/70 text-[10px] uppercase tracking-wider">Unit Management Control</CardDescription>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Admission Status</Label>
                    <Select value={selectedCandidate.status}
                      onValueChange={(v) => updateCandidateStatus.mutate({ id: selectedCandidate.id, status: v })}>
                      <SelectTrigger className="h-12 rounded-xl border-zinc-200"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending Review</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="interview_completed">Interview Completed</SelectItem>
                        <SelectItem value="waitlisted">Waitlisted</SelectItem>
                        <SelectItem value="allocated">Allocated to Unit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" className="w-full h-12 rounded-xl gap-2 text-red-600 border-red-100 hover:bg-red-50 dark:border-red-900/50"
                    onClick={() => { if(confirm("Unassign this candidate from current unit?")) { api.patch(`/candidates/${selectedCandidate.id}`, { unitId: null }).then(() => setSelectedCandidate(null)); } }}>
                    <UserMinus className="h-4 w-4" /> Unassign from Unit
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Unit detail view
  if (selectedUnitId !== null) {
    const unit = units.find((u) => u.id === selectedUnitId);
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6">
            <Button variant="ghost" size="sm" onClick={() => setSelectedUnitId(null)} className="h-10 px-4 rounded-xl group hover:bg-orange-50">
              <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform text-orange-600" /> Back
            </Button>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-200 dark:shadow-none">
                  <Hospital className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-3xl font-extrabold tracking-tight">{unit?.name}</h1>
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <MapPin className="h-3.5 w-3.5 text-orange-500" />
                    <span>{unit?.city}{unit?.location ? ` · ${unit.location}` : ""}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {canEdit && unit && (
            <Button variant="outline" className="h-11 rounded-xl px-6 font-bold shadow-sm" onClick={() => setEditUnit(unit)}>
              <Pencil className="h-4 w-4 mr-2" /> Modify Unit
            </Button>
          )}
        </div>

        {detailLoading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="h-12 w-12 rounded-full border-4 border-orange-600 border-t-transparent animate-spin" />
            <p className="text-muted-foreground font-medium animate-pulse">Retrieving unit roster...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-zinc-100 dark:bg-zinc-900 p-1.5 rounded-2xl h-14 mb-8">
              <TabsTrigger value="staff" className="rounded-xl h-11 px-8 font-bold text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <UserCheck className="h-4 w-4 mr-2" /> Assigned Staff
                <Badge variant="secondary" className="ml-2 bg-orange-100 text-orange-700 dark:bg-orange-900/40">{unitDetail?.staff.length ?? 0}</Badge>
              </TabsTrigger>
              <TabsTrigger value="candidates" className="rounded-xl h-11 px-8 font-bold text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Users className="h-4 w-4 mr-2" /> Allotted Candidates
                <Badge variant="secondary" className="ml-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40">{unitDetail?.candidates.length ?? 0}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="staff" className="mt-0 focus-visible:outline-none">
              {!unitDetail?.staff.length ? (
                <div className="text-center py-24 border-2 border-dashed rounded-3xl bg-zinc-50/50 dark:bg-zinc-950/50">
                  <div className="h-20 w-20 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center mx-auto mb-4">
                    <UserMinus className="h-10 w-10 text-muted-foreground/30" />
                  </div>
                  <h3 className="font-bold text-lg text-muted-foreground">No Personnel Assigned</h3>
                  <p className="text-sm text-muted-foreground/70">Assign doctors or coordinators to this hospital unit via the Users page.</p>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {unitDetail.staff.map((s) => {
                    const theme = ROLE_THEMES[s.role] ?? { color: "bg-zinc-100", icon: UserCircle2 };
                    return (
                      <Card key={s.id} className="border-none shadow-sm rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-300">
                        <div className={`h-1.5 w-full ${theme.color.split(" ")[1]}`} />
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0 space-y-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className={`p-2 rounded-xl ${theme.color}`}>
                                    <theme.icon className="h-5 w-5" />
                                  </div>
                                  <Badge className={`text-[10px] font-bold uppercase tracking-wider ${theme.color} border`}>
                                    {ROLE_LABELS[s.role] ?? s.role}
                                  </Badge>
                                </div>
                                <h3 className="font-bold text-lg pt-2 leading-tight flex items-center gap-2">
                                  {s.salutation ? `${s.salutation} ` : ""}{s.fullName}
                                  {!s.active && <div className="h-2 w-2 rounded-full bg-red-500" title="Inactive Account" />}
                                </h3>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-zinc-50 dark:bg-zinc-900 p-2 rounded-xl">
                                  <Mail className="h-3 w-3 text-blue-500" />
                                  <span className="truncate">{s.email}</span>
                                </div>
                                {s.employeeId && (
                                  <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase pl-2">
                                    <Fingerprint className="h-3 w-3" />
                                    <span>ID: {s.employeeId}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            {canEdit && (
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                onClick={() => removeStaff.mutate(s.id)}>
                                <UserMinus className="h-5 w-5" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="candidates" className="mt-0 focus-visible:outline-none">
              {!unitDetail?.candidates.length ? (
                <div className="text-center py-24 border-2 border-dashed rounded-3xl bg-zinc-50/50 dark:bg-zinc-950/50">
                  <div className="h-20 w-20 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center mx-auto mb-4">
                    <Users className="h-10 w-10 text-muted-foreground/30" />
                  </div>
                  <h3 className="font-bold text-lg text-muted-foreground">No Candidates Allotted</h3>
                  <p className="text-sm text-muted-foreground/70">Candidates will appear here once they are allocated to this unit for training.</p>
                </div>
              ) : (
                <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b">
                          <tr>
                            <th className="text-left px-6 py-4 font-bold text-xs uppercase tracking-widest text-muted-foreground">Candidate Profile</th>
                            <th className="text-left px-6 py-4 font-bold text-xs uppercase tracking-widest text-muted-foreground">Identification</th>
                            <th className="text-left px-6 py-4 font-bold text-xs uppercase tracking-widest text-muted-foreground">Admission Status</th>
                            <th className="text-right px-6 py-4 font-bold text-xs uppercase tracking-widest text-muted-foreground">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {unitDetail.candidates.map((c) => (
                            <tr key={c.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center text-orange-700 font-bold text-xs">
                                    {c.fullName.split(" ").map(n => n[0]).join("")}
                                  </div>
                                  <div>
                                    <p className="font-bold text-sm leading-none">{c.fullName}</p>
                                    <p className="text-[10px] text-muted-foreground mt-1.5">{c.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 font-mono text-[10px] text-muted-foreground font-bold">{c.candidateCode}</td>
                              <td className="px-6 py-4">
                                <Badge className={`${STATUS_COLORS[c.status] ?? ""} text-[9px] h-5 px-2 font-bold uppercase tracking-tighter`}>
                                  {c.status.replace(/_/g, " ")}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <Button variant="ghost" size="sm" className="h-9 rounded-xl px-4 font-bold text-orange-600 hover:bg-orange-50"
                                  onClick={() => setSelectedCandidate(c)}>
                                  View Portfolio
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Edit Unit Dialog */}
        <Dialog open={!!editUnit} onOpenChange={(o) => { if (!o) setEditUnit(null); }}>
          <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
            <div className="bg-orange-600 p-6 text-white">
              <DialogHeader><DialogTitle className="text-xl font-bold text-white">Modify Hospital Unit</DialogTitle></DialogHeader>
            </div>
            {editUnit && (
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Official Hospital Name</Label>
                    <Input className="h-12 rounded-xl" value={editUnit.name} onChange={(e) => setEditUnit((u) => u ? { ...u, name: e.target.value } : u)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Operational City</Label>
                    <Input className="h-12 rounded-xl" value={editUnit.city ?? ""} onChange={(e) => setEditUnit((u) => u ? { ...u, city: e.target.value } : u)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Detailed Location / Address</Label>
                    <Input className="h-12 rounded-xl" value={editUnit.location ?? ""} onChange={(e) => setEditUnit((u) => u ? { ...u, location: e.target.value } : u)} />
                  </div>
                </div>
                <DialogFooter className="pt-2">
                  <Button variant="ghost" onClick={() => setEditUnit(null)} className="h-12 px-6 rounded-xl">Discard</Button>
                  <Button className="h-12 px-8 rounded-xl bg-orange-600 font-bold hover:bg-orange-700 transition-all shadow-lg shadow-orange-200" disabled={editMutation.isPending} onClick={() => editUnit && editMutation.mutate({ id: editUnit.id, name: editUnit.name, city: editUnit.city ?? "", location: editUnit.location ?? "" })}>
                    {editMutation.isPending ? "Applying..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-black p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-orange-500 p-8 text-white shadow-2xl">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-orange-100 text-sm font-medium">
              <Activity className="h-4 w-4" />
              <span>Hospital Network Management</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">Health Units</h1>
            <p className="text-orange-100/80 max-w-md">Oversee hospital branches, personnel distribution, and candidate allotments across the Sankara network.</p>
          </div>
          {canEdit && (
            <Button 
              onClick={() => setAddOpen(true)} 
              className="bg-white text-orange-700 hover:bg-orange-50 transition-all font-bold h-12 px-6 rounded-2xl shadow-xl hover:scale-105 active:scale-95 gap-2 border-none"
            >
              <Plus className="h-5 w-5" /> Register New Unit
            </Button>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Units", value: stats.total, icon: Hospital, color: "orange" },
          { label: "Total Personnel", value: stats.staff, icon: UserCheck, color: "emerald" },
          { label: "Allotted Students", value: stats.candidates, icon: Users, color: "orange" },
          { label: "Network Cities", value: stats.cities, icon: MapPin, color: "amber" },
        ].map((s, i) => (
          <Card key={i} className="border-none shadow-sm bg-white dark:bg-zinc-900">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`h-11 w-11 rounded-2xl bg-${s.color}-50 dark:bg-${s.color}-900/20 flex items-center justify-center text-${s.color}-600 dark:text-${s.color}-400 shadow-inner`}>
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

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="h-10 w-10 rounded-full border-4 border-orange-600 border-t-transparent animate-spin" />
          <p className="text-muted-foreground animate-pulse font-medium">Syncing health units...</p>
        </div>
      ) : units.length === 0 ? (
        <Card className="border-dashed bg-white/50 dark:bg-zinc-900/50">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center space-y-4">
            <div className="h-20 w-20 rounded-3xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <Building2 className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold">No Hospital Units</h2>
              <p className="text-muted-foreground max-w-sm">Register your primary hospital units to begin assigning staff and candidates.</p>
            </div>
            {canEdit && (
              <Button onClick={() => setAddOpen(true)} className="mt-4 bg-orange-600 text-white hover:bg-orange-700 rounded-2xl h-12 px-8 shadow-xl">Register Primary Unit</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {units.map((u) => (
            <Card key={u.id} className="border-none shadow-sm bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden group hover:shadow-2xl transition-all duration-500 cursor-pointer"
              onClick={() => setSelectedUnitId(u.id)}>
              <div className="h-2 w-full bg-gradient-to-r from-orange-500 to-amber-500" />
              <CardContent className="p-6 space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600">
                        <Hospital className="h-5 w-5" />
                      </div>
                      <Badge variant="outline" className="text-[10px] font-bold tracking-widest text-blue-600 border-blue-100 bg-blue-50/50">Unit</Badge>
                    </div>
                    <h3 className="text-lg font-bold group-hover:text-blue-600 transition-colors leading-tight">{u.name}</h3>
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 hover:bg-red-50"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(u.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 text-blue-500" />
                    <span className="font-medium">{u.city || "Not Specified"}</span>
                  </div>
                  {u.location && (
                    <p className="text-[10px] text-muted-foreground/70 italic leading-relaxed pl-5 line-clamp-1">— {u.location}</p>
                  )}
                </div>

                <div className="pt-4 border-t flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-base font-bold text-blue-600 leading-none">{u.staffCount}</span>
                      <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">Staff</span>
                    </div>
                    <div className="h-6 w-px bg-zinc-100 dark:bg-zinc-800" />
                    <div className="flex flex-col">
                      <span className="text-base font-bold text-emerald-600 leading-none">{u.candidateCount}</span>
                      <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">Students</span>
                    </div>
                  </div>
                  <div className="flex items-center text-blue-600 group-hover:translate-x-1 transition-transform">
                    <span className="text-xs font-bold mr-2">Manage</span>
                    <ArrowLeft className="h-4 w-4 rotate-180" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Unit Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-700 p-8 text-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-white">Register Hospital Unit</DialogTitle>
              <CardDescription className="text-blue-100/70">Add a new branch to the fellowship network.</CardDescription>
            </DialogHeader>
          </div>
          <div className="p-8 space-y-6 bg-white dark:bg-zinc-950">
            <div className="grid gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Hospital Name</Label>
                <Input placeholder="Sankara Eye Hospital, Bangalore" className="h-12 rounded-xl" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Operational City</Label>
                  <Input placeholder="Bangalore" className="h-12 rounded-xl" value={addForm.city} onChange={(e) => setAddForm((f) => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Detailed Location</Label>
                  <Input placeholder="Varthur Main Road" className="h-12 rounded-xl" value={addForm.location} onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => setAddOpen(false)} className="h-12 px-6 rounded-xl">Discard</Button>
              <Button disabled={!addForm.name || addMutation.isPending} className="h-12 px-8 rounded-xl bg-blue-700 text-white font-bold" onClick={() => addMutation.mutate(addForm)}>
                {addMutation.isPending ? "Registering..." : "Register Unit"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}>
        <DialogContent className="rounded-3xl p-8 max-w-sm text-center border-none shadow-2xl">
          <div className="h-16 w-16 rounded-3xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4 text-red-600">
            <AlertCircle className="h-8 w-8" />
          </div>
          <DialogHeader><DialogTitle className="text-xl font-bold text-center">Delete Unit?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will unassign all personnel from this hospital. This action is irreversible.
          </p>
          <DialogFooter className="flex-col sm:flex-col gap-2 mt-4">
            <Button variant="destructive" className="w-full h-12 rounded-xl font-bold" disabled={deleteMutation.isPending}
              onClick={() => deleteConfirmId !== null && deleteMutation.mutate(deleteConfirmId)}>
              {deleteMutation.isPending ? "Deleting…" : "Confirm Deletion"}
            </Button>
            <Button variant="ghost" className="w-full h-12 rounded-xl" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
