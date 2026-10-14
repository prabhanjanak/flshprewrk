import { useState, useRef, useEffect } from "react";
import { fmtDate } from "../lib/dateUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useProgram } from "../contexts/ProgramContext";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { 
  Search, UserPlus, Eye, FolderOpen, ExternalLink, Upload, Filter, 
  ClipboardEdit, Trash2, Building2, CalendarDays, Info, ChevronDown, 
  ChevronUp, Download, Printer, Users, CheckCircle, Clock, Loader2,
  Check, FileText, GitMerge, Edit3, Mail, Award, ArrowRightLeft
} from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "../hooks/use-toast";
import { getCleanObjectPath } from "../lib/utils";
import { CandidateExamDialog } from "../components/CandidateExamDialog";

interface CandidateDocument {
  id: number; docType: string; fileName: string; fileUrl: string | null;
}

interface Candidate {
  id: number; candidateCode: string; fullName: string; email: string;
  phone: string | null; status: string; unitId: number | null; unitName?: string | null;
  gender?: string | null; dateOfBirth?: string | null;
  qualification?: string | null; collegeName?: string | null; address?: string | null;
  specializations: string[]; documents: CandidateDocument[]; createdAt?: string;
  mcqScore?: number | null; psychometricScore?: number | null;
  interviewScore?: number | null; totalScore?: number | null;
  photoUrl?: string | null;
  lor1Url?: string | null;
  lor2Url?: string | null;
  lor1RefName?: string | null;
  lor2RefName?: string | null;
  paymentInfo?: { amount: number | null; id: string | null; mode: string | null } | null;
  centerPreference?: string | null;
  submissionId?: number | null;
  pgQualifications?: string | null;
  applications?: {
    id: number;
    specialityId: number;
    hallTicketNumber: string | null;
    status: string;
    batchId: number | null;
    interviewSlot: string | null;
  }[];
}



const INTERVIEW_SCHEDULE = [
  { 
    displayDate: "01 June 2026", 
    category: "Posterior Segment (Retina)", 
    specialities: ["Vitreo Retina", "Medical Retina", "Retina", "Uveitis", "Ocular Oncology"], 
    venue: "Bengaluru" 
  },
  { 
    displayDate: "08 June 2026", 
    category: "Anterior Segment", 
    specialities: ["IOL Fellowship", "Cornea", "Glaucoma", "Oculoplasty", "Pediatric Ophthalmology", "Phaco Refractive", "Comprehensive Ophthalmology", "General Ophthalmology"], 
    venue: "Bengaluru" 
  },
];

function getInterviewInfo(specializations: string[]) {
  for (const spec of specializations) {
    const sNormalized = spec.trim();
    const slot = INTERVIEW_SCHEDULE.find((s) => 
      s.specialities.some(sp => new RegExp(sp, "i").test(sNormalized))
    );
    if (slot) return slot;
  }
  return null;
}

const DOC_LABELS: Record<string, string> = {
  LOR1: "LOR 1", LOR2: "LOR 2", PAYMENT: "Payment Proof", PHOTO: "Passport Photo",
};

const SPEC_COLORS: Record<string, string> = {
  "IOL Fellowship": "bg-blue-100 text-blue-800",
  "Cornea": "bg-cyan-100 text-cyan-800",
  "Glaucoma": "bg-indigo-100 text-indigo-800",
  "Oculoplasty": "bg-pink-100 text-pink-800",
  "Pediatric Ophthalmology": "bg-orange-100 text-orange-800",
  "Phaco Refractive": "bg-violet-100 text-violet-800",
  "Medical Retina": "bg-red-100 text-red-800",
  "Vitreo Retina": "bg-rose-100 text-rose-800",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  interview_completed: "bg-blue-100 text-blue-800 border-blue-200",
  allocated: "bg-purple-100 text-purple-800 border-purple-200",
  waitlisted: "bg-slate-100 text-slate-800 border-slate-200",
  rejected: "bg-rose-100 text-rose-800 border-rose-200",
};

/** Normalize a specialization string that may be raw PostgreSQL array format */
function parseSpecString(spec: string): string[] {
  if (!spec) return [];
  const s = spec.trim();
  if (s.startsWith("{") && s.endsWith("}")) {
    const inner = s.slice(1, -1);
    const list: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of inner) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { if (cur.trim()) list.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    if (cur.trim()) list.push(cur.trim());
    return list.map(x => x.replace(/^"|"$/g, "").trim()).filter(Boolean);
  }
  try {
    const p = JSON.parse(s);
    if (Array.isArray(p)) return p.map(String).filter(Boolean);
  } catch { /* not JSON */ }
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

/** Normalize candidate specializations — parse any raw PostgreSQL format strings */
function normalizeSpecs(specs: string[]): string[] {
  return Array.from(new Set(specs.flatMap(s => {
    if (s.startsWith("{") || s.startsWith("[")) return parseSpecString(s);
    return [s];
  }))).filter(Boolean);
}

function SecureFileLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-xs text-muted-foreground">None</span>;

  const handleOpen = () => {
    const cleanPath = getCleanObjectPath(url);
    if (!cleanPath) {
      // Fully external URL (no /objects/ segment) — open directly
      window.open(url, "_blank");
      return;
    }
    const token = localStorage.getItem("fellowship_token");
    window.open(`/api/storage${cleanPath}?token=${token}`, "_blank");
  };

  return (
    <div className="flex flex-col items-end">
      <Button
        variant="link"
        size="sm"
        className="text-xs text-orange-600 hover:underline p-0 h-auto flex items-center gap-1"
        onClick={handleOpen}
      >
        <ExternalLink className="h-3 w-3" />
        View Document
      </Button>
    </div>
  );
}

interface Panel { id: number; name: string; roomNumber: string; isActive: boolean; }

function ScoreDialog({ candidate, open, onClose }: { candidate: Candidate | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mcq, setMcq] = useState(candidate?.mcqScore != null ? String(candidate.mcqScore) : "");
  const [psycho, setPsycho] = useState(candidate?.psychometricScore != null ? String(candidate.psychometricScore) : "");
  const [panelId, setPanelId] = useState<string>("");

  const { data: panels = [] } = useQuery<Panel[]>({
    queryKey: ["panels"],
    queryFn: () => api.get<Panel[]>("/panels"),
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: (data: { mcqScore?: number | null; psychometricScore?: number | null; panelId?: number | null }) =>
      api.patch(`/candidates/${candidate!.id}/marks`, data),
    onSuccess: () => {
      toast({ title: "Marks saved", description: panelId ? "Candidate added to panel queue" : undefined });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["panels"] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activePanels = panels.filter((p) => p.isActive);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardEdit className="h-4 w-4" /> Enter Marks — {candidate?.fullName}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{candidate?.candidateCode}</p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>MCQ Score <span className="text-muted-foreground text-xs">(0–100)</span></Label>
            <Input type="number" min={0} max={100} step={0.01} value={mcq} onChange={(e) => setMcq(e.target.value)} placeholder="e.g. 72.5" />
          </div>
          <div className="space-y-1.5">
            <Label>Psychometric Score <span className="text-muted-foreground text-xs">(0–100)</span></Label>
            <Input type="number" min={0} max={100} step={0.01} value={psycho} onChange={(e) => setPsycho(e.target.value)} placeholder="e.g. 65" />
          </div>
          <div className="space-y-1.5">
            <Label>Assign to Interview Panel <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Select value={panelId} onValueChange={setPanelId}>
              <SelectTrigger>
                <SelectValue placeholder="— No panel assignment —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No panel assignment —</SelectItem>
                {activePanels.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    Room {p.roomNumber} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {panelId && panelId !== "none" && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Candidate will be added to the waiting queue for this panel
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded p-2">
            Interview scores are submitted separately by the panel doctors.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({
            mcqScore: mcq !== "" ? Number(mcq) : null,
            psychometricScore: psycho !== "" ? Number(psycho) : null,
            panelId: panelId && panelId !== "none" ? Number(panelId) : null,
          })}>
            {saveMutation.isPending ? "Saving…" : "Save Marks"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleBatchDialog({ 
  candidate, 
  open, 
  onClose,
  batches,
  specialities
}: { 
  candidate: Candidate | null; 
  open: boolean; 
  onClose: () => void;
  batches: any[];
  specialities: any[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedBatches, setSelectedBatches] = useState<Record<number, string>>({});

  const appItems = (candidate?.applications && candidate.applications.length > 0)
    ? candidate.applications
    : (candidate?.specializations || []).map((specName) => {
        const spec = specialities.find(s => s.name.toLowerCase() === specName.toLowerCase());
        const specId = spec?.id || 0;
        return {
          id: -specId,
          specialityId: specId,
          status: "approved",
          batchId: null,
          hallTicketNumber: null,
          interviewSlot: null,
        };
      });

  useEffect(() => {
    if (candidate && appItems.length > 0) {
      const init: Record<number, string> = {};
      appItems.forEach((app) => {
        init[app.id] = app.batchId ? String(app.batchId) : "none";
      });
      setSelectedBatches(init);
    } else {
      setSelectedBatches({});
    }
  }, [candidate, open]);

  const scheduleMutation = useMutation({
    mutationFn: (data: { schedules: { applicationId: number; batchId: number | null }[] }) =>
      api.post(`/candidates/${candidate!.id}/batches`, data),
    onSuccess: () => {
      toast({ title: "Schedules updated", description: "Batch assignments saved successfully." });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error saving schedules", description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!candidate) return;
    const schedules = Object.entries(selectedBatches).map(([appIdStr, batchIdStr]) => ({
      applicationId: Number(appIdStr),
      batchId: batchIdStr === "none" ? null : Number(batchIdStr)
    }));
    scheduleMutation.mutate({ schedules });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <CalendarDays className="h-5 w-5 text-orange-500" /> Schedule Batches — {candidate?.fullName}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{candidate?.candidateCode} • {candidate?.email}</p>
        
        <div className="space-y-4 my-4">
          {appItems.length > 0 ? (
            appItems.map((app) => {
              const spec = specialities.find(s => s.id === app.specialityId);
              const specName = spec?.name || (app.specialityId < 0 ? candidate?.specializations?.[Math.abs(app.specialityId) - 1] : "Specialty");
              return (
                <div key={app.id} className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{specName}</span>
                    <Badge variant="outline" className="text-[10px] font-semibold text-slate-500 uppercase">
                      {app.status}
                    </Badge>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-500">Select Batch</Label>
                    <Select 
                      value={selectedBatches[app.id] || "none"} 
                      onValueChange={(val) => setSelectedBatches(prev => ({ ...prev, [app.id]: val }))}
                    >
                      <SelectTrigger className="h-10 text-sm font-medium bg-white dark:bg-black rounded-lg border-slate-200">
                        <SelectValue placeholder="— Unassigned —" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="none">— Unassigned —</SelectItem>
                        {batches.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name} ({fmtDate(b.date)} - {b.timing})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground italic text-center py-4 bg-slate-50 rounded-xl">
              No approved applications found to schedule.
            </p>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-lg">Cancel</Button>
          <Button 
            disabled={scheduleMutation.isPending} 
            onClick={handleSave}
            className="bg-[#0b4a8f] text-white hover:bg-[#08386b] rounded-lg"
          >
            {scheduleMutation.isPending ? "Saving…" : "Save Assignments"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CandidatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { activeProgram, activeProgramId, setActiveProgramId, openProgramHub } = useProgram();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [specFilter, setSpecFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");
  const [addOpen, setAddOpen] = useState(false);
  const [viewCandidate, setViewCandidate] = useState<Candidate | null>(null);
  const [docsCandidate, setDocsCandidate] = useState<Candidate | null>(null);
  const [scoreCandidate, setScoreCandidate] = useState<Candidate | null>(null);
  const [scheduleCandidate, setScheduleCandidate] = useState<Candidate | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importProgramId, setImportProgramId] = useState("");
  const [importFileData, setImportFileData] = useState<string>("");
  const [importFileName, setImportFileName] = useState("");
  const [importColumns, setImportColumns] = useState<string[]>([]);
  const [importFieldLabels, setImportFieldLabels] = useState<Record<string, string>>({});
  const [importMapping, setImportMapping] = useState<Record<string, number>>({});
  const [importTotalRows, setImportTotalRows] = useState(0);
  const [importStep, setImportStep] = useState<"upload" | "map" | "done">("upload");
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: number[]; label: string } | null>(null);
  const [assignUnitCandidate, setAssignUnitCandidate] = useState<Candidate | null>(null);
  const [assignUnitId, setAssignUnitId] = useState<string>("");

  // Edit Candidate State
  const [editCandidate, setEditCandidate] = useState<Candidate | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: "",
    candidateCode: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    gender: "male",
    qualification: "",
    collegeName: "",
    address: "",
    unitId: "none",
    status: "pending",
    mcqScore: "",
    psychometricScore: "",
  });

  const openEditCandidate = (c: Candidate) => {
    setEditCandidate(c);
    setEditForm({
      fullName: c.fullName || "",
      candidateCode: c.candidateCode || "",
      email: c.email || "",
      phone: c.phone || "",
      dateOfBirth: c.dateOfBirth || "",
      gender: c.gender || "male",
      qualification: c.qualification || "",
      collegeName: c.collegeName || "",
      address: c.address || "",
      unitId: c.unitId ? String(c.unitId) : "none",
      status: c.status || "pending",
      mcqScore: c.mcqScore != null ? String(c.mcqScore) : "",
      psychometricScore: c.psychometricScore != null ? String(c.psychometricScore) : "",
    });
  };

  // Merge Candidates State
  const [mergeOpen, setMergeOpen] = useState(false);
  const [primaryMergeId, setPrimaryMergeId] = useState<number | null>(null);
  const [secondaryMergeId, setSecondaryMergeId] = useState<number | null>(null);

  const [form, setForm] = useState({
    fullName: "", email: "", phone: "", gender: "", qualification: "", collegeName: "", address: "",
    pgQualifications: "", centerPreference: "", specialityIds: [] as number[],
  });

  const { data: candidates = [], isLoading } = useQuery<Candidate[]>({
    queryKey: ["candidates", activeProgramId],
    queryFn: () => api.get<Candidate[]>(`/candidates${activeProgramId ? `?programId=${activeProgramId}` : ""}`),
  });

  const { data: units = [] } = useQuery<{ id: number; name: string; city: string }[]>({
    queryKey: ["units"],
    queryFn: () => api.get("/units"),
  });

  const { data: programs = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["programs"],
    queryFn: () => api.get("/programs"),
  });

  const { data: specialities = [] } = useQuery<{ id: number; name: string; code?: string }[]>({
    queryKey: ["specialities"],
    queryFn: () => api.get("/specialities"),
  });

  const { data: batches = [] } = useQuery<any[]>({
    queryKey: ["batches"],
    queryFn: () => api.get("/batches"),
  });

  const refreshAllCandidateData = () => {
    qc.invalidateQueries({ queryKey: ["candidates"] });
    qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    qc.invalidateQueries({ queryKey: ["specialities"] });
    qc.invalidateQueries({ queryKey: ["rankings"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["seat-matrix"] });
    qc.invalidateQueries({ queryKey: ["panels"] });
  };

  const assignUnitMutation = useMutation({
    mutationFn: ({ candidateId, unitId }: { candidateId: number; unitId: number }) =>
      api.post(`/candidates/${candidateId}/assign-unit`, { unitId }),
    onSuccess: () => {
      toast({ title: "Unit assigned successfully" });
      refreshAllCandidateData();
      setAssignUnitCandidate(null);
      setAssignUnitId("");
    },
    onError: (e: Error) => toast({ title: "Assign failed", description: e.message, variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: (data: typeof form) => api.post<Candidate>("/candidates", data),
    onSuccess: () => {
      toast({ title: "Candidate registered" });
      refreshAllCandidateData();
      setAddOpen(false);
      setForm({ fullName: "", email: "", phone: "", gender: "", qualification: "", collegeName: "", address: "", pgQualifications: "", centerPreference: "", specialityIds: [] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!editCandidate) throw new Error("No candidate selected for modification");
      return api.patch(`/candidates/${editCandidate.id}`, payload);
    },
    onSuccess: () => {
      toast({ title: "Candidate Updated", description: "Candidate details modified successfully." });
      refreshAllCandidateData();
      setEditCandidate(null);
    },
    onError: (e: any) => {
      toast({ title: "Update Failed", description: e.response?.data?.error || e.message, variant: "destructive" });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!primaryMergeId || !secondaryMergeId) {
        throw new Error("Please select two distinct candidates to merge.");
      }
      return api.post("/candidates/merge", {
        primaryId: primaryMergeId,
        secondaryId: secondaryMergeId,
        deleteSecondary: true,
      });
    },
    onSuccess: (res: any) => {
      toast({
        title: "Candidates Merged",
        description: res.message || "Candidate profiles, applications, and documents successfully unified.",
      });
      refreshAllCandidateData();
      setMergeOpen(false);
      setSelected(new Set());
      setPrimaryMergeId(null);
      setSecondaryMergeId(null);
    },
    onError: (e: any) => {
      toast({ title: "Merge Failed", description: e.response?.data?.error || e.message, variant: "destructive" });
    },
  });

  const handleDownloadCallLetter = async (c: Candidate) => {
    try {
      const token = localStorage.getItem("fellowship_token") || "";
      const res = await fetch(`/api/candidates/${c.id}/call-letter-pdf?token=${token}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to download Call Letter" }));
        throw new Error(data.error || "Failed to download Call Letter");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Interview_Call_Letter_${c.candidateCode}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({
        title: "Call Letter Downloaded",
        description: `Downloaded Interview Call Letter PDF for Dr. ${c.fullName}`,
      });
    } catch (e: any) {
      toast({
        title: "Download Failed",
        description: e.response?.data?.error || e.message,
        variant: "destructive",
      });
    }
  };

  const handleDownloadOfferLetter = async (c: Candidate) => {
    try {
      const token = localStorage.getItem("fellowship_token") || "";
      const res = await fetch(`/api/candidates/${c.id}/offer-letter-pdf?token=${token}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to download Offer Letter" }));
        throw new Error(data.error || "Failed to download Offer Letter");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Fellowship_Offer_Letter_${c.candidateCode}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({
        title: "Offer Letter Downloaded",
        description: `Downloaded Fellowship Offer Letter PDF for Dr. ${c.fullName}`,
      });
    } catch (e: any) {
      toast({
        title: "Download Failed",
        description: e.response?.data?.error || e.message,
        variant: "destructive",
      });
    }
  };

  const downloadApprovedCandidates = async () => {
    try {
      const token = localStorage.getItem("fellowship_token");
      const res = await fetch("/api/candidates/export", {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) {
        let errMsg = `Server error ${res.status}`;
        try {
          const body = await res.json();
          errMsg = body.error || body.message || errMsg;
        } catch { /* ignore */ }
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SAV_Candidates_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Candidates Excel file downloaded with colour-coded sheets." });
    } catch (e: any) {
      toast({ title: "Download failed", description: e.message, variant: "destructive" });
    }
  };

  const updateStatus = useMutation({
    mutationFn: ({ id, status, candidate }: { id: number; status: string; candidate: Candidate }) =>
      api.patch<Candidate>(`/candidates/${id}`, { status }),
    onSuccess: (_data, vars) => {
      const { status, candidate } = vars;
      if (status === "approved") {
        const info = getInterviewInfo(candidate.specializations);
        toast({
          title: "Status updated → Approved",
          description: info
            ? `Interview: ${info.displayDate} at ${info.venue} (${info.category})`
            : "Status updated to approved",
        });
      } else if (status === "allocated") {
        toast({
          title: "Candidate allocated",
          description: `${candidate.fullName} has been allocated. Seat matrix updated.`,
        });
      } else {
        toast({ title: "Status updated" });
      }
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["seat-matrix"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      ids.length === 1
        ? api.delete(`/candidates/${ids[0]}`)
        : api.delete(`/candidates`),
    mutationKey: ["delete-candidates"],
    onSuccess: (_data, ids) => {
      toast({ title: `${ids.length === 1 ? "Candidate" : `${ids.length} candidates`} deleted` });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      setSelected(new Set());
      setDeleteConfirm(null);
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const openImportDialog = () => {
    setImportStep("upload");
    setImportFileData("");
    setImportFileName("");
    setImportColumns([]);
    setImportMapping({});
    setImportProgramId("");
    setImportResult(null);
    setImportDialogOpen(true);
  };

  const handleFileSelect = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const b64 = (e.target!.result as string).split(",")[1]!;
      setImportFileData(b64);
      setImportFileName(file.name);
      setImportLoading(true);
      try {
        const res = await api.post<{ columns: string[]; suggestedMapping: Record<string, number>; fieldLabels: Record<string, string>; totalDataRows: number }>(
          "/import/excel/detect",
          { fileData: b64, fileName: file.name }
        );
        setImportColumns(res.columns);
        setImportMapping(res.suggestedMapping);
        setImportFieldLabels(res.fieldLabels);
        setImportTotalRows(res.totalDataRows);
        setImportStep("map");
      } catch (e) {
        toast({ title: "Could not read file", description: (e as Error).message, variant: "destructive" });
      } finally { setImportLoading(false); }
    };
    reader.readAsDataURL(file);
  };

  const runImport = async () => {
    if (!importProgramId) { toast({ title: "Please select a program" }); return; }
    setImportLoading(true);
    try {
      const result = await api.post<{ inserted: number; updated: number; skipped: number }>(
        "/import/excel/process",
        { fileData: importFileData, programId: Number(importProgramId), mapping: importMapping }
      );
      setImportResult(result);
      setImportStep("done");
      qc.invalidateQueries({ queryKey: ["candidates"] });
    } catch (e) {
      toast({ title: "Import failed", description: (e as Error).message, variant: "destructive" });
    } finally { setImportLoading(false); }
  };

  const allSpecs = Array.from(new Set(candidates.flatMap((c) => normalizeSpecs(c.specializations)))).sort();
  
  const filtered = candidates.filter((c) => {
    const normalizedSpecs = normalizeSpecs(c.specializations);
    const matchSearch = c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.candidateCode.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchSpec = specFilter === "all" || normalizedSpecs.includes(specFilter);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    
    let matchCategory = true;
    if (categoryFilter !== "all") {
      const interviewInfo = getInterviewInfo(normalizedSpecs);
      if (categoryFilter === "Anterior") {
        matchCategory = interviewInfo?.category.includes("Anterior") ?? false;
      } else if (categoryFilter === "Retina") {
        matchCategory = interviewInfo?.category.includes("Retina") ?? false;
      }
    }

    return matchSearch && matchSpec && matchStatus && matchCategory;
  }).sort((a, b) => {
    if (sortBy === "date_desc") {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    } else if (sortBy === "date_asc") {
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    } else if (sortBy === "name_asc") {
      return a.fullName.localeCompare(b.fullName);
    } else if (sortBy === "name_desc") {
      return b.fullName.localeCompare(a.fullName);
    }
    return 0;
  });
   const isSuperAdmin = user?.role === "super_admin";
   const isCEC = user?.role === "central_exam_coordinator";
   const isEC = user?.role === "exam_coordinator";
   const canManage = isSuperAdmin || user?.role === "program_admin" || isCEC || isEC;
   const canEnterScores = canManage;

   const { data: activeForms = [] } = useQuery<any[]>({
     queryKey: ["application-forms-active"],
     queryFn: () => api.get("/application-forms"),
   });

  const allFilteredIds = filtered.map((c) => c.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));
  const someSelected = allFilteredIds.some((id) => selected.has(id));
  const selectedCount = allFilteredIds.filter((id) => selected.has(id)).length;

  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selected);
      allFilteredIds.forEach((id) => next.delete(id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      allFilteredIds.forEach((id) => next.add(id));
      setSelected(next);
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const confirmDelete = (ids: number[]) => {
    const names = candidates.filter((c) => ids.includes(c.id)).map((c) => c.fullName);
    setDeleteConfirm({
      ids,
      label: ids.length === 1 ? names[0]! : `${ids.length} candidates`,
    });
  };

  const executeDelete = () => {
    if (!deleteConfirm) return;
    const { ids } = deleteConfirm;
    if (ids.length === 1) {
      api.delete<unknown>(`/candidates/${ids[0]}`).then(() => {
        toast({ title: "Candidate deleted" });
        refreshAllCandidateData();
        setSelected(new Set());
        setDeleteConfirm(null);
      }).catch((e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }));
    } else {
      api.post<unknown>("/candidates/bulk-delete", { ids }).then(() => {
        toast({ title: `${ids.length} candidates deleted` });
        refreshAllCandidateData();
        setSelected(new Set());
        setDeleteConfirm(null);
      }).catch((e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }));
    }
  };

  const [bulkBatchModalOpen, setBulkBatchModalOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");

  const executeBulkStatus = (status: string) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    api.post<unknown>("/candidates/bulk-status", { ids, status }).then(() => {
      toast({ title: `Status updated to ${status.replace("_", " ")} for ${ids.length} candidate(s)` });
      refreshAllCandidateData();
      setSelected(new Set());
    }).catch((e: Error) => toast({ title: "Bulk status update failed", description: e.message, variant: "destructive" }));
  };

  const executeBulkBatchAssign = () => {
    const ids = Array.from(selected);
    if (ids.length === 0 || !selectedBatchId) return;
    api.post<unknown>("/candidates/bulk-assign-batch", { candidateIds: ids, batchId: Number(selectedBatchId) }).then(() => {
      toast({ title: `Assigned ${ids.length} candidate(s) to batch successfully` });
      setSelected(new Set());
      setBulkBatchModalOpen(false);
      setSelectedBatchId("");
    }).catch((e: Error) => toast({ title: "Batch assignment failed", description: e.message, variant: "destructive" }));
  };

  const primaryCandidate = candidates.find(c => c.id === primaryMergeId) || null;
  const secondaryCandidate = candidates.find(c => c.id === secondaryMergeId) || null;

  const handleSaveEditCandidate = () => {
    if (!editCandidate) return;
    const payload: any = {
      fullName: editForm.fullName.trim(),
      candidateCode: editForm.candidateCode.trim(),
      email: editForm.email.trim(),
      phone: editForm.phone.trim() || null,
      dateOfBirth: editForm.dateOfBirth.trim() || null,
      gender: editForm.gender,
      qualification: editForm.qualification.trim() || null,
      collegeName: editForm.collegeName.trim() || null,
      address: editForm.address.trim() || null,
      unitId: editForm.unitId === "none" ? null : Number(editForm.unitId),
      status: editForm.status,
      mcqScore: editForm.mcqScore.trim() || null,
      psychometricScore: editForm.psychometricScore.trim() || null,
    };
    editMutation.mutate(payload);
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      {/* Executive Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0a1b33] via-[#0f284d] to-[#0a1b33] p-6 md:p-8 text-white shadow-xl border border-white/10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-orange-300 text-[11px] font-black uppercase tracking-wider">
                <Users className="h-3.5 w-3.5" />
                {activeProgram ? activeProgram.name : "Candidate Directory"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openProgramHub()}
                className="h-6 px-2.5 text-[10px] font-bold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full cursor-pointer"
              >
                Switch Suite
              </Button>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {activeProgram ? `${activeProgram.name} Candidate Registry` : "Candidates Management"}
            </h1>
            <p className="text-slate-300 max-w-xl text-xs md:text-sm font-medium">
              {activeProgram ? `Oversee ${activeProgram.name} candidate dossiers, marksheet scoring, and panel viva schedules.` : "Oversee applications, track qualification status, and manage interview schedules."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {canManage && selectedCount > 0 && (
              <Button 
                variant="destructive" 
                onClick={() => confirmDelete(allFilteredIds.filter((id) => selected.has(id)))}
                className="rounded-xl h-10 px-4 font-bold shadow-sm gap-2 text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedCount})
              </Button>
            )}
            {(isSuperAdmin || isCEC) && (
              <>
                <Button 
                  variant="outline" 
                  onClick={openImportDialog}
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20 rounded-xl h-10 px-4 font-bold shadow-sm gap-2 text-xs"
                >
                  <Upload className="h-3.5 w-3.5" /> Import Excel
                </Button>
                <Button 
                  onClick={downloadApprovedCandidates}
                  className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white hover:from-emerald-700 hover:to-teal-800 transition-all shadow-sm gap-2 border-none rounded-xl h-10 px-4 font-bold text-xs"
                  title="Export complete candidate register to Excel"
                >
                  <Download className="h-3.5 w-3.5" /> Export Excel
                </Button>
                <Button 
                  onClick={() => window.open(`/api/candidates/bulk-dossier-pdf?token=${localStorage.getItem("fellowship_token")}`, "_blank")}
                  className="bg-gradient-to-r from-orange-600 to-amber-600 text-white hover:from-orange-700 hover:to-amber-700 transition-all shadow-sm gap-2 border-none rounded-xl h-10 px-4 font-bold text-xs"
                  title="Download all candidate application dossiers compiled into a single PDF document"
                >
                  <Download className="h-3.5 w-3.5" /> Dossiers PDF
                </Button>
                <Button 
                  onClick={() => window.open(`/api/candidates/export-zip?token=${localStorage.getItem("fellowship_token")}`, "_blank")}
                  className="bg-white/10 hover:bg-white/20 text-white transition-all shadow-sm gap-2 border-white/20 rounded-xl h-10 px-4 font-bold text-xs"
                  title="Download all candidate application dossier PDFs in a single ZIP package"
                >
                  <Download className="h-3.5 w-3.5" /> ZIP
                </Button>
              </>
            )}
            {canManage && (
              <>
                <Button 
                  onClick={() => {
                    const selArr = Array.from(selected);
                    if (selArr.length >= 2) {
                      setPrimaryMergeId(selArr[0]);
                      setSecondaryMergeId(selArr[1]);
                    } else if (selArr.length === 1) {
                      setPrimaryMergeId(selArr[0]);
                    }
                    setMergeOpen(true);
                  }}
                  variant="outline"
                  className="bg-white/10 hover:bg-white/20 text-white transition-all shadow-sm gap-2 border-white/20 rounded-xl h-10 px-4 font-bold text-xs cursor-pointer"
                  title="Merge duplicate candidate profiles"
                >
                  <GitMerge className="h-3.5 w-3.5 text-orange-400" /> Merge Candidates
                </Button>
                <Button 
                  onClick={() => setAddOpen(true)} 
                  className="bg-orange-600 text-white hover:bg-orange-700 transition-all font-bold h-10 px-4 rounded-xl shadow-md gap-2 border-none text-xs"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add Candidate
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Candidates", value: candidates.length, icon: Users, color: "blue" },
          { label: "Approved Applications", value: candidates.filter(c => c.status === 'approved' || c.status === 'interview_completed').length, icon: CheckCircle, color: "emerald" },
          { label: "Waitlisted", value: candidates.filter(c => c.status === 'waitlisted').length, icon: Clock, color: "amber" },
          { label: "Allocated", value: candidates.filter(c => c.status === 'allocated').length, icon: Building2, color: "purple" }
        ].map((s, i) => (
          <div key={i} className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all flex items-center gap-4">
            <div className={`h-12 w-12 rounded-2xl bg-${s.color}-50 flex items-center justify-center text-${s.color}-600 border border-${s.color}-100 shadow-2xs shrink-0`}>
              <s.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight text-slate-900 leading-none">{s.value}</p>
              <p className="text-[11px] text-slate-500 font-bold mt-1.5 uppercase tracking-wider">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Premium Segment Filtering Sub-Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 mt-4">
        {[
          { id: "all", label: "All Candidates", count: candidates.length },
          { id: "Anterior", label: "Anterior Segment", count: candidates.filter(c => getInterviewInfo(normalizeSpecs(c.specializations))?.category.includes("Anterior")).length },
          { id: "Retina", label: "Retina Segment", count: candidates.filter(c => getInterviewInfo(normalizeSpecs(c.specializations))?.category.includes("Retina")).length },
        ].map((tab) => {
          const isActive = categoryFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setCategoryFilter(tab.id)}
              className={`pb-3 font-semibold text-sm transition-all border-b-2 px-1 relative ${
                isActive 
                  ? "border-[#0b4a8f] text-[#0b4a8f] dark:text-blue-400 font-bold" 
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isActive ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}`}>
                  {tab.count}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Quick Status Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: "all", label: "All Statuses", count: candidates.length },
          { id: "pending", label: "Pending Review", count: candidates.filter(c => c.status === "pending").length },
          { id: "approved", label: "Approved", count: candidates.filter(c => c.status === "approved").length },
          { id: "interview_completed", label: "Interview Done", count: candidates.filter(c => c.status === "interview_completed").length },
          { id: "allocated", label: "Allocated", count: candidates.filter(c => c.status === "allocated").length },
          { id: "waitlisted", label: "Waitlisted", count: candidates.filter(c => c.status === "waitlisted").length },
          { id: "rejected", label: "Rejected", count: candidates.filter(c => c.status === "rejected").length },
        ].map((st) => {
          const isActive = statusFilter === st.id;
          return (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                isActive
                  ? "bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/20"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
              }`}
            >
              <span>{st.label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {st.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-white p-1 rounded-xl shadow-sm flex gap-2 flex-wrap border border-slate-200">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search candidates by name, code, or email…" 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            className="pl-10 h-10 border-none bg-transparent focus-visible:ring-0 text-sm font-medium"
          />
        </div>
        <div className="h-10 w-px bg-slate-200 hidden md:block"></div>
        <Select value={activeProgramId ? String(activeProgramId) : "all"} onValueChange={(v) => setActiveProgramId(v === "all" ? null : Number(v))}>
          <SelectTrigger className="w-56 h-10 border-none bg-transparent focus:ring-0 font-semibold text-sm text-slate-700">
            <Filter className="h-4 w-4 mr-2 text-slate-400" />
            <SelectValue placeholder="All Programs" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-slate-200">
            <SelectItem value="all">✨ All Programs Overview</SelectItem>
            {programs.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="h-10 w-px bg-slate-200 hidden md:block"></div>
        <Select value={specFilter} onValueChange={setSpecFilter}>
          <SelectTrigger className="w-52 h-10 border-none bg-transparent focus:ring-0 font-semibold text-sm text-slate-700">
            <Filter className="h-4 w-4 mr-2 text-slate-400" />
            <SelectValue placeholder="All Specializations" />
          </SelectTrigger>
          <SelectContent className="rounded-lg border-slate-200">
            <SelectItem value="all">All Specializations</SelectItem>
            {allSpecs.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="h-10 w-px bg-slate-200 hidden md:block"></div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-48 h-10 border-none bg-transparent focus:ring-0 font-semibold text-sm text-slate-700">
            <CalendarDays className="h-4 w-4 mr-2 text-slate-400" />
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent className="rounded-lg border-slate-200">
            <SelectItem value="date_desc">Applied (Newest)</SelectItem>
            <SelectItem value="date_asc">Applied (Oldest)</SelectItem>
            <SelectItem value="name_asc">Name (A-Z)</SelectItem>
            <SelectItem value="name_desc">Name (Z-A)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Floating Batch Actions Bar */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white rounded-2xl px-5 py-3 shadow-2xl mb-4 border border-slate-800"
        >
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-xs font-black uppercase tracking-wider">{selected.size} Candidate(s) Selected</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canManage && selected.size === 2 && (
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold gap-1.5 h-8.5 rounded-xl cursor-pointer"
                onClick={() => {
                  const [id1, id2] = Array.from(selected);
                  setPrimaryMergeId(id1);
                  setSecondaryMergeId(id2);
                  setMergeOpen(true);
                }}
              >
                <GitMerge className="w-3.5 h-3.5" />
                Merge 2 Selected
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border-emerald-500/40 text-xs font-bold gap-1.5 h-8.5 rounded-xl cursor-pointer"
              onClick={() => executeBulkStatus("approved")}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Approve All
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-amber-500/40 text-xs font-bold gap-1.5 h-8.5 rounded-xl cursor-pointer"
              onClick={() => setBulkBatchModalOpen(true)}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Assign Batch
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border-rose-500/40 text-xs font-bold gap-1.5 h-8.5 rounded-xl cursor-pointer"
              onClick={() => confirmDelete(Array.from(selected))}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selected
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-400 hover:text-white text-xs font-bold h-8.5 cursor-pointer"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </motion.div>
      )}


      {isLoading ? (
        <div className="text-center py-24">
           <Loader2 className="w-10 h-10 animate-spin text-slate-300 mx-auto mb-4" />
           <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Loading Candidate Directory…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-3xl border border-slate-100 shadow-sm">
           <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-300" />
           </div>
           <p className="text-slate-900 font-black text-xl tracking-tight">No Candidates Found</p>
           <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or search query.</p>
        </div>
      ) : (
        <Card className="border border-slate-200 shadow-sm rounded-xl overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {canManage && (
                    <th className="px-4 py-3 w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        className="rounded border-slate-300"
                      />
                    </th>
                  )}
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Candidate</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Specialization</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Interview & Selection</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Payment</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className={`group hover:bg-slate-50/50 transition-colors ${selected.has(c.id) ? "bg-orange-50/30" : ""}`}>
                    {canManage && (
                      <td className="px-6 py-5">
                        <Checkbox
                          checked={selected.has(c.id)}
                          onCheckedChange={() => toggleOne(c.id)}
                          className="rounded-md border-slate-300"
                        />
                      </td>
                    )}
                    <td className="px-6 py-5">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 border border-orange-200 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden shadow-xs">
                          {c.photoUrl ? (
                            <img
                              src={c.photoUrl.startsWith("/objects/") ? `/api/storage${c.photoUrl}?token=${localStorage.getItem("fellowship_token")}` : c.photoUrl}
                              alt={c.fullName}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            c.fullName?.charAt(0)?.toUpperCase() || "C"
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span
                            onClick={() => setScoreCandidate(c)}
                            className="font-black text-slate-900 text-sm leading-tight group-hover:text-orange-600 transition-colors cursor-pointer flex items-center gap-2 flex-wrap"
                            title="Click to open Candidate Examination Dossier & Marks Entry"
                          >
                            {c.fullName}
                            <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full uppercase font-bold tracking-tight">
                              {c.candidateCode}
                            </span>
                          </span>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                              <Search className="w-3 h-3 text-slate-400" /> {c.email}
                            </span>
                            {c.phone && (
                              <span className="text-xs font-bold text-slate-500 border-l pl-2 border-slate-200">
                                {c.phone}
                              </span>
                            )}
                          </div>
                          {/* LOR Quick Links */}
                          <div className="flex items-center gap-2 mt-2">
                            {c.lor1Url ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!c.lor1Url) return;
                                  const target = c.lor1Url.startsWith("/objects/") ? `/api/storage${c.lor1Url}?token=${localStorage.getItem("fellowship_token")}` : c.lor1Url;
                                  window.open(target, "_blank");
                                }}
                                className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                                title={`Open LOR 1: ${c.lor1RefName || 'Referee 1'}`}
                              >
                                <FileText className="w-3 h-3" /> LOR 1
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">
                                No LOR 1
                              </span>
                            )}
                            {c.lor2Url ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!c.lor2Url) return;
                                  const target = c.lor2Url.startsWith("/objects/") ? `/api/storage${c.lor2Url}?token=${localStorage.getItem("fellowship_token")}` : c.lor2Url;
                                  window.open(target, "_blank");
                                }}
                                className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                                title={`Open LOR 2: ${c.lor2RefName || 'Referee 2'}`}
                              >
                                <FileText className="w-3 h-3" /> LOR 2
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">
                                No LOR 2
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 max-w-[280px]">
                      {(() => {
                        const apps = c.applications || [];
                        if (apps.length === 0) {
                          const specs = normalizeSpecs(c.specializations);
                          return (
                            <div className="flex flex-wrap gap-1.5">
                              {specs.length === 0 ? (
                                <span className="text-xs font-bold text-slate-400 uppercase italic">No Selection</span>
                              ) : specs.map((s) => (
                                <Badge key={s} className={`${SPEC_COLORS[s] ?? "bg-slate-100 text-slate-700"} rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-tight border-none shadow-2xs`}>
                                   {s}
                                </Badge>
                              ))}
                            </div>
                          );
                        }
                        return (
                          <div className="flex flex-col gap-2">
                            {apps.map((app) => {
                              const spec = specialities.find(s => s.id === app.specialityId);
                              const batch = batches.find(b => b.id === app.batchId);
                              const specName = spec?.name || "Unknown Specialty";
                              return (
                                <div key={app.id} className="flex flex-col gap-1.5 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                                  <div className="flex items-center justify-between gap-2">
                                    <Badge className={`${SPEC_COLORS[specName] ?? "bg-slate-100 text-slate-700"} rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-tight border-none shadow-2xs`}>
                                      {specName}
                                    </Badge>
                                    <span className="text-xs font-mono text-slate-500 uppercase font-semibold">
                                      {app.status}
                                    </span>
                                  </div>
                                  {batch ? (
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#0b4a8f]">
                                      <CalendarDays className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                      <span className="truncate max-w-[130px]" title={batch.name}>{batch.name}</span>
                                      <span className="text-slate-500 font-normal shrink-0">({fmtDate(batch.date)})</span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">No batch assigned</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-5">
                       <div className="flex flex-col gap-1.5 min-w-[145px] text-xs">
                         {c.status === "allocated" ? (
                           <div className="space-y-1">
                             <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold text-[11px] px-2.5 py-0.5 shadow-2xs">
                               <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600 inline" />
                               Selected Fellow
                             </Badge>
                             <div className="text-[11px] font-bold text-emerald-700 truncate">
                               {c.unitName ? `Unit: ${c.unitName}` : "Fellowship Allocated"}
                             </div>
                             <button
                               type="button"
                               onClick={() => handleDownloadOfferLetter(c)}
                               className="text-[10px] font-extrabold text-purple-700 hover:text-purple-900 underline flex items-center gap-1 mt-0.5"
                             >
                               <Award className="h-3 w-3 text-purple-600" /> Offer Letter Ready
                             </button>
                           </div>
                         ) : c.status === "interview_completed" ? (
                           <div className="space-y-0.5">
                             <Badge className="bg-blue-100 text-blue-800 border-blue-300 font-extrabold text-[11px] px-2.5 py-0.5 shadow-2xs">
                               Interview Completed
                             </Badge>
                             <span className="text-[10px] text-slate-500 font-semibold block">Panel Reviewed</span>
                           </div>
                         ) : c.status === "waitlisted" ? (
                           <div className="space-y-0.5">
                             <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-extrabold text-[11px] px-2.5 py-0.5 shadow-2xs">
                               Waitlisted
                             </Badge>
                             <span className="text-[10px] text-slate-500 font-semibold block">Under Consideration</span>
                           </div>
                         ) : c.status === "rejected" ? (
                           <div className="space-y-0.5">
                             <Badge className="bg-rose-100 text-rose-800 border-rose-300 font-extrabold text-[11px] px-2.5 py-0.5 shadow-2xs">
                               Not Selected
                             </Badge>
                           </div>
                         ) : c.status === "approved" ? (
                           <div className="space-y-1">
                             <Badge className="bg-indigo-100 text-indigo-800 border-indigo-300 font-extrabold text-[11px] px-2.5 py-0.5 shadow-2xs">
                               Approved Dossier
                             </Badge>
                             <button
                               type="button"
                               onClick={() => handleDownloadCallLetter(c)}
                               className="text-[10px] font-extrabold text-blue-700 hover:text-blue-900 underline flex items-center gap-1 mt-0.5"
                             >
                               <Mail className="h-3 w-3 text-blue-600" /> Call Letter Ready
                             </button>
                           </div>
                         ) : (
                           <Badge className="bg-slate-100 text-slate-600 border-slate-200 font-bold text-[10px] px-2 py-0.5">
                             Under Scrutiny
                           </Badge>
                         )}
                       </div>
                    </td>
                    <td className="px-6 py-5">
                       {c.status === 'approved' || c.status === 'interview_completed' || c.status === 'allocated' ? (
                         <div className="flex flex-col">
                           <span className="text-base font-black text-emerald-600 leading-none">
                             ₹{(2750 * Math.max(1, normalizeSpecs(c.specializations || []).length)).toLocaleString("en-IN")}
                           </span>
                           <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider mt-1">PAID (Verified)</span>
                         </div>
                       ) : c.paymentInfo && c.paymentInfo.amount != null ? (
                         <div className="flex flex-col">
                           <span className="text-base font-black text-slate-900 leading-none">
                             ₹{Number(c.paymentInfo.amount).toLocaleString("en-IN")}
                           </span>
                           <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">{c.paymentInfo.mode}</span>
                         </div>
                       ) : (
                         <span className="text-xs font-bold text-slate-400 uppercase tracking-widest italic">—</span>
                       )}
                     </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5 flex-wrap">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 gap-1.5 text-xs text-orange-700 border-orange-200 bg-orange-50/60 hover:bg-orange-100 font-bold rounded-xl shadow-2xs" 
                            onClick={() => setScoreCandidate(c)} 
                            title="Examine Candidate, View Full Dossier, Documents & Marks"
                          >
                            <ClipboardEdit className="h-3.5 w-3.5 text-orange-600" /> Review Dossier
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-slate-700 border-slate-200 hover:bg-slate-50 font-bold rounded-xl shadow-2xs"
                            onClick={() => handleDownloadCallLetter(c)}
                            title="Download Interview Call Letter PDF"
                          >
                            <Mail className="h-3.5 w-3.5 text-orange-500" /> Call Letter
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-purple-700 border-purple-200 bg-purple-50/50 hover:bg-purple-100 font-bold rounded-xl shadow-2xs"
                            onClick={() => handleDownloadOfferLetter(c)}
                            title="Download Fellowship Offer Letter PDF"
                          >
                            <Award className="h-3.5 w-3.5 text-purple-600" /> Offer Letter
                          </Button>

                          {canManage && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs text-blue-700 border-blue-200 bg-blue-50/50 hover:bg-blue-100 font-bold rounded-xl shadow-2xs"
                              onClick={() => openEditCandidate(c)}
                              title="Modify Candidate Profile & Status"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-blue-600" /> Edit
                            </Button>
                          )}

                          {canManage && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl" 
                              onClick={() => confirmDelete([c.id])}
                              title="Delete Candidate"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

      {/* Examination Dossier & Score Entry Dialog */}
      <CandidateExamDialog 
        candidateId={scoreCandidate?.id ?? null} 
        open={!!scoreCandidate} 
        onClose={() => setScoreCandidate(null)} 
      />

      {/* Schedule Batch Dialog */}
      <ScheduleBatchDialog 
        candidate={scheduleCandidate} 
        open={!!scheduleCandidate} 
        onClose={() => setScheduleCandidate(null)} 
        batches={batches}
        specialities={specialities}
      />

      {/* Documents Dialog */}
      <Dialog open={!!docsCandidate} onOpenChange={() => setDocsCandidate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FolderOpen className="h-4 w-4" />Documents — {docsCandidate?.fullName}</DialogTitle></DialogHeader>
          {docsCandidate && (
            <div className="space-y-2">
              {docsCandidate.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No documents uploaded</p>
              ) : docsCandidate.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{DOC_LABELS[doc.docType] ?? doc.docType}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-60">{doc.fileName}</p>
                  </div>
                  {doc.fileUrl ? (
                    <Button size="sm" variant="outline" className="gap-1 text-xs shrink-0" onClick={() => window.open(doc.fileUrl!, "_blank")}>
                      <ExternalLink className="h-3 w-3" /> Open
                    </Button>
                  ) : <span className="text-xs text-muted-foreground">No link</span>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Candidate Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-xl font-bold text-slate-900">Register Candidate</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            {[
              { field: "fullName", label: "Full Name", placeholder: "Dr. John Smith" },
              { field: "email", label: "Email", placeholder: "candidate@example.com" },
              { field: "phone", label: "Phone", placeholder: "10-digit mobile number" },
              { field: "qualification", label: "Qualification (e.g. MBBS)", placeholder: "MBBS" },
              { field: "pgQualifications", label: "PG Qualification (e.g. MS, DNB)", placeholder: "MS Ophthalmology, DNB" },
              { field: "collegeName", label: "College/Institution", placeholder: "Medical College Name" },
              { field: "centerPreference", label: "Center Preference", placeholder: "e.g. Bangalore, Chennai" },
              { field: "address", label: "Address", placeholder: "Full permanent address" },
            ].map(({ field, label, placeholder }) => (
              <div key={field} className="space-y-1">
                <Label className="text-sm font-semibold text-slate-700">{label}</Label>
                <Input placeholder={placeholder} value={form[field as keyof typeof form] as string} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} className="h-10 rounded-lg text-sm font-medium border-slate-200 focus:border-orange-500 focus:ring-orange-500/10" />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-sm font-semibold text-slate-700">Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                <SelectTrigger className="h-10 rounded-lg text-sm font-medium border-slate-200"><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-semibold text-slate-700">Speciality Preferences</Label>
              <div className="flex flex-wrap gap-2 pt-1">
                {specialities.map((spec: any) => {
                  const selected = form.specialityIds.includes(spec.id);
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => {
                        setForm((f) => {
                          const exists = f.specialityIds.includes(spec.id);
                          const specialityIds = exists
                            ? f.specialityIds.filter((id) => id !== spec.id)
                            : [...f.specialityIds, spec.id];
                          return { ...f, specialityIds };
                        });
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        selected
                          ? "bg-orange-100 text-orange-800 border-orange-300 shadow-sm"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {spec.name}
                    </button>
                  );
                })}
                {specialities.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No specialities available</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)} className="rounded-lg h-10 px-5">Cancel</Button>
            <Button onClick={() => addMutation.mutate(form)} disabled={addMutation.isPending || !form.fullName || !form.email} className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg h-10 px-5 border-none font-semibold">
              {addMutation.isPending ? "Registering…" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excel Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(o) => { if (!o) setImportDialogOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Import Candidates from Excel
            </DialogTitle>
          </DialogHeader>

          {importStep === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Upload the SAV fellowship application Excel file. Columns will be auto-detected from Google Sheets export.</p>
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">{importLoading ? "Detecting columns…" : "Click or drag an Excel file here"}</p>
                <p className="text-xs text-muted-foreground mt-1">.xlsx or .xls files only</p>
              </div>
            </div>
          )}

          {importStep === "map" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{importFileName}</p>
                  <p className="text-xs text-muted-foreground">{importTotalRows} data rows detected • {importColumns.length} columns</p>
                </div>
                <button type="button" className="text-xs text-orange-600 hover:underline" onClick={() => setImportStep("upload")}>Change file</button>
              </div>

              <div className="space-y-1.5">
                <Label>Program <span className="text-red-500">*</span></Label>
                <Select value={importProgramId} onValueChange={setImportProgramId}>
                  <SelectTrigger><SelectValue placeholder="Select program…" /></SelectTrigger>
                  <SelectContent>
                    {programs.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Column Mapping</p>
                <p className="text-xs text-muted-foreground mb-3">Auto-detected from column headers. Adjust any that are incorrect.</p>
                <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
                  {Object.entries(importFieldLabels).map(([field, label]) => (
                    <div key={field} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-xs font-medium w-40 shrink-0 text-muted-foreground">{label}</span>
                      <Select
                        value={importMapping[field] != null ? String(importMapping[field]) : "__none__"}
                        onValueChange={(v) => {
                          setImportMapping((m) => {
                            const next = { ...m };
                            if (v === "__none__") delete next[field]; else next[field] = Number(v);
                            return next;
                          });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="— not mapped —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— not mapped —</SelectItem>
                          {importColumns.map((col, idx) => (
                            <SelectItem key={idx} value={String(idx)}>{col || `Column ${idx + 1}`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setImportStep("upload")}>Back</Button>
                <Button onClick={runImport} disabled={importLoading || !importProgramId}>
                  {importLoading ? "Importing…" : `Import ${importTotalRows} rows`}
                </Button>
              </DialogFooter>
            </div>
          )}

          {importStep === "done" && importResult && (
            <div className="space-y-4 text-center py-4">
              <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-2xl font-bold">✓</div>
              <div>
                <p className="font-semibold text-lg">Import Complete</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {importResult.inserted} new · {importResult.updated} updated · {importResult.skipped} skipped
                </p>
              </div>
              <DialogFooter className="justify-center">
                <Button onClick={() => setImportDialogOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Candidate Dialog */}
      <Dialog open={!!viewCandidate} onOpenChange={() => setViewCandidate(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Candidate Details</DialogTitle></DialogHeader>
          {viewCandidate && (
            <div className="space-y-3 text-sm">
              {[
                ["Code", viewCandidate.candidateCode],
                ["Name", viewCandidate.fullName],
                ["Email", viewCandidate.email],
                ["Phone", viewCandidate.phone ?? "—"],
                ["Date of Birth", viewCandidate.dateOfBirth ?? "—"],
                ["Gender", viewCandidate.gender ?? "—"],
                ["Qualification", viewCandidate.qualification ?? "—"],
                ["PG Qualification", viewCandidate.pgQualifications ?? "—"],
                ["College", viewCandidate.collegeName ?? "—"],
                ["Address", viewCandidate.address ?? "—"],
                ["Status", viewCandidate.status.replace(/_/g, " ")],
                ["Preferred Center", viewCandidate.centerPreference ?? "—"],
                ["MCQ Score", viewCandidate.mcqScore != null ? String(viewCandidate.mcqScore) : "—"],
                ["Psychometric Score", viewCandidate.psychometricScore != null ? String(viewCandidate.psychometricScore) : "—"],
              ].filter(([, v]) => v && v !== "—").map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-2 last:border-0">
                  <span className="font-medium text-muted-foreground shrink-0 mr-3">{k}</span>
                  <span className="text-right max-w-64 break-words">{v}</span>
                </div>
              ))}
              {viewCandidate.specializations.length > 0 && (
                <div className="border-b pb-2">
                  <span className="font-medium text-muted-foreground block mb-1.5">Specialization(s)</span>
                  <div className="flex flex-wrap gap-1">
                    {viewCandidate.specializations.map((s) => (
                      <span key={s} className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SPEC_COLORS[s] ?? "bg-gray-100 text-gray-700"}`}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {viewCandidate.documents && viewCandidate.documents.length > 0 && (
                <div className="border-b pb-2">
                  <span className="font-medium text-muted-foreground block mb-2">Documents</span>
                  <div className="space-y-2">
                    {viewCandidate.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{doc.docType}</span>
                        {doc.fileUrl ? (
                          <SecureFileLink url={doc.fileUrl} />
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No file</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                const info = getInterviewInfo(viewCandidate.specializations);
                if (!info) return null;
                return (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarDays className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Interview Schedule</span>
                    </div>
                    <p className="text-sm font-medium">{info.displayDate}</p>
                    <p className="text-xs text-muted-foreground">{info.category} • {info.venue}</p>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Unit Dialog */}
      <Dialog open={!!assignUnitCandidate} onOpenChange={(o) => { if (!o) { setAssignUnitCandidate(null); setAssignUnitId(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Assign Unit
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Candidate: <strong>{assignUnitCandidate?.fullName}</strong></p>
            {assignUnitCandidate?.unitName && (
              <p className="text-xs text-muted-foreground">Current unit: <span className="font-medium">{assignUnitCandidate.unitName}</span></p>
            )}
            <div className="space-y-1.5">
              <Label>Select Unit</Label>
              <Select value={assignUnitId} onValueChange={setAssignUnitId}>
                <SelectTrigger><SelectValue placeholder="Choose a unit…" /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignUnitCandidate(null); setAssignUnitId(""); }}>Cancel</Button>
            <Button
              disabled={!assignUnitId || assignUnitMutation.isPending}
              onClick={() => assignUnitMutation.mutate({ candidateId: assignUnitCandidate!.id, unitId: Number(assignUnitId) })}
            >
              {assignUnitMutation.isPending ? "Assigning…" : "Assign Unit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => { if (!o) setDeleteConfirm(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.ids.length === 1 ? "Candidate" : "Candidates"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteConfirm?.label}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl" onClick={executeDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Batch Assignment Dialog */}
      <Dialog open={bulkBatchModalOpen} onOpenChange={setBulkBatchModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
              <CalendarDays className="h-5 w-5 text-orange-500" />
              Bulk Assign Interview Batch
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-500">
              Assign all <span className="font-bold text-slate-900">{selected.size}</span> selected candidate(s) to an interview batch session.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Select Target Batch</Label>
              <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="— Choose an Interview Batch —" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name} — {fmtDate(b.date)} ({b.startTime || '09:00 AM'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl text-xs font-bold" onClick={() => setBulkBatchModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold gap-2 cursor-pointer"
              disabled={!selectedBatchId}
              onClick={executeBulkBatchAssign}
            >
              <Check className="h-4 w-4" />
              Confirm Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit / Modify Candidate Dialog (Super Admin) ─── */}
      <Dialog open={!!editCandidate} onOpenChange={(o) => { if (!o) setEditCandidate(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2.5">
              <Edit3 className="h-5 w-5 text-blue-600" />
              Modify Candidate — {editCandidate?.fullName}
            </DialogTitle>
          </DialogHeader>
          {editCandidate && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Candidate Code</Label>
                <Input
                  value={editForm.candidateCode}
                  onChange={(e) => setEditForm(f => ({ ...f, candidateCode: e.target.value }))}
                  className="h-10 rounded-xl text-xs font-mono font-bold"
                  placeholder="e.g. SAV-2026-001"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Full Name</Label>
                <Input
                  value={editForm.fullName}
                  onChange={(e) => setEditForm(f => ({ ...f, fullName: e.target.value }))}
                  className="h-10 rounded-xl text-xs font-bold"
                  placeholder="Dr. Full Name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Email Address</Label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                  className="h-10 rounded-xl text-xs font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Phone Number</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                  className="h-10 rounded-xl text-xs font-medium"
                  placeholder="10-digit mobile number"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Date of Birth</Label>
                <Input
                  type="date"
                  value={editForm.dateOfBirth}
                  onChange={(e) => setEditForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  className="h-10 rounded-xl text-xs font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Gender</Label>
                <Select value={editForm.gender} onValueChange={(v) => setEditForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger className="h-10 rounded-xl text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Qualification</Label>
                <Input
                  value={editForm.qualification}
                  onChange={(e) => setEditForm(f => ({ ...f, qualification: e.target.value }))}
                  className="h-10 rounded-xl text-xs font-medium"
                  placeholder="e.g. MBBS, MS Ophthalmology"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Medical College / Institution</Label>
                <Input
                  value={editForm.collegeName}
                  onChange={(e) => setEditForm(f => ({ ...f, collegeName: e.target.value }))}
                  className="h-10 rounded-xl text-xs font-medium"
                  placeholder="College Name"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs font-bold text-slate-700">Permanent Address</Label>
                <Input
                  value={editForm.address}
                  onChange={(e) => setEditForm(f => ({ ...f, address: e.target.value }))}
                  className="h-10 rounded-xl text-xs font-medium"
                  placeholder="Permanent Address"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Allocated Unit</Label>
                <Select value={editForm.unitId} onValueChange={(v) => setEditForm(f => ({ ...f, unitId: v }))}>
                  <SelectTrigger className="h-10 rounded-xl text-xs font-medium">
                    <SelectValue placeholder="— Select Unit —" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="none">No Unit Assigned</SelectItem>
                    {units.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name} — {u.city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Application Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-10 rounded-xl text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="pending">Pending Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="interview_completed">Interview Completed</SelectItem>
                    <SelectItem value="allocated">Allocated (Selected)</SelectItem>
                    <SelectItem value="waitlisted">Waitlisted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">MCQ Score</Label>
                <Input
                  type="number"
                  value={editForm.mcqScore}
                  onChange={(e) => setEditForm(f => ({ ...f, mcqScore: e.target.value }))}
                  className="h-10 rounded-xl text-xs font-medium"
                  placeholder="MCQ Marks"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700">Psychometric Score (/10)</Label>
                <Input
                  type="number"
                  step="0.5"
                  max="10"
                  value={editForm.psychometricScore}
                  onChange={(e) => setEditForm(f => ({ ...f, psychometricScore: e.target.value }))}
                  className="h-10 rounded-xl text-xs font-medium"
                  placeholder="Psychometry (/10)"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditCandidate(null)} className="rounded-xl h-10 px-5 text-xs font-bold">
              Cancel
            </Button>
            <Button
              onClick={handleSaveEditCandidate}
              disabled={editMutation.isPending || !editForm.fullName || !editForm.email}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-6 font-bold text-xs gap-2 cursor-pointer"
            >
              {editMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Merge Duplicate Candidates Dialog ─── */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2.5">
              <GitMerge className="h-5 w-5 text-orange-600" />
              Merge Duplicate Candidates
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-slate-500 leading-relaxed">
              Select the <strong>Primary Candidate</strong> (profile to keep) and the <strong>Secondary Candidate</strong> (duplicate to merge into primary). All submitted applications, documents, interview scores, and preferences will be unified, and the secondary candidate will be removed.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* Primary Selection */}
              <div className="space-y-1.5 p-4 rounded-2xl border-2 border-emerald-500/30 bg-emerald-50/20">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-black uppercase tracking-wider text-emerald-800">
                    Primary (Keep this record)
                  </Label>
                  <Badge className="bg-emerald-100 text-emerald-800 border-none text-[10px]">Target</Badge>
                </div>
                <Select 
                  value={primaryMergeId ? String(primaryMergeId) : ""} 
                  onValueChange={(v) => setPrimaryMergeId(Number(v))}
                >
                  <SelectTrigger className="h-10 rounded-xl text-xs font-bold bg-white">
                    <SelectValue placeholder="— Select Primary Candidate —" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 rounded-xl">
                    {candidates
                      .filter(c => c.id !== secondaryMergeId)
                      .map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.fullName} ({c.candidateCode}) — {c.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {primaryCandidate && (
                  <div className="mt-2.5 space-y-1 text-xs text-slate-600 border-t border-emerald-200/60 pt-2 font-medium">
                    <p><strong>Code:</strong> {primaryCandidate.candidateCode}</p>
                    <p><strong>Email:</strong> {primaryCandidate.email}</p>
                    <p><strong>Phone:</strong> {primaryCandidate.phone || "—"}</p>
                    <p><strong>Status:</strong> <span className="uppercase font-bold text-emerald-700">{primaryCandidate.status}</span></p>
                  </div>
                )}
              </div>

              {/* Secondary Selection */}
              <div className="space-y-1.5 p-4 rounded-2xl border-2 border-rose-500/30 bg-rose-50/20">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-black uppercase tracking-wider text-rose-800">
                    Secondary (Merge & Remove)
                  </Label>
                  <Badge className="bg-rose-100 text-rose-800 border-none text-[10px]">Duplicate</Badge>
                </div>
                <Select 
                  value={secondaryMergeId ? String(secondaryMergeId) : ""} 
                  onValueChange={(v) => setSecondaryMergeId(Number(v))}
                >
                  <SelectTrigger className="h-10 rounded-xl text-xs font-bold bg-white">
                    <SelectValue placeholder="— Select Secondary Candidate —" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 rounded-xl">
                    {candidates
                      .filter(c => c.id !== primaryMergeId)
                      .map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.fullName} ({c.candidateCode}) — {c.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {secondaryCandidate && (
                  <div className="mt-2.5 space-y-1 text-xs text-slate-600 border-t border-rose-200/60 pt-2 font-medium">
                    <p><strong>Code:</strong> {secondaryCandidate.candidateCode}</p>
                    <p><strong>Email:</strong> {secondaryCandidate.email}</p>
                    <p><strong>Phone:</strong> {secondaryCandidate.phone || "—"}</p>
                    <p><strong>Status:</strong> <span className="uppercase font-bold text-rose-700">{secondaryCandidate.status}</span></p>
                  </div>
                )}
              </div>
            </div>

            {primaryMergeId && secondaryMergeId && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tmp = primaryMergeId;
                    setPrimaryMergeId(secondaryMergeId);
                    setSecondaryMergeId(tmp);
                  }}
                  className="text-xs font-bold gap-1.5 rounded-xl border-slate-300"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 text-slate-500" /> Swap Primary & Secondary
                </Button>
              </div>
            )}

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                Applications, LORs, documents, and interview marks from the secondary record will be reassigned to the primary candidate. The duplicate record will be deleted.
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setMergeOpen(false)} className="rounded-xl h-10 px-5 text-xs font-bold">
              Cancel
            </Button>
            <Button
              onClick={() => mergeMutation.mutate()}
              disabled={mergeMutation.isPending || !primaryMergeId || !secondaryMergeId || primaryMergeId === secondaryMergeId}
              className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl h-10 px-6 font-bold text-xs gap-2 cursor-pointer"
            >
              {mergeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              Confirm & Merge Candidates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

