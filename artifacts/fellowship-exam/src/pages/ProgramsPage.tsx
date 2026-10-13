import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Switch } from "../components/ui/switch";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { 
  Plus, GraduationCap, Users, Trash2, Edit2, FileText, Loader2, 
  Ticket, CreditCard, Sparkles, CheckCircle2, Building, Calendar,
  Download, Eye, AlertCircle, FileCheck, Stethoscope
} from "lucide-react";
import { useToast } from "../hooks/use-toast";

interface Program {
  id: number;
  name: string;
  code: string;
  description: string | null;
  academicYear: string;
  category: string; // fellowship, vct, optometry, nursing, paramedical, general_exam
  requiresApplicationForm: boolean;
  requiresPayment: boolean;
  feeAmount: number;
  feePricingModel: string; // per_specialty, flat, free
  requiresPsychometry: boolean;
  requiresTheoryExam: boolean;
  requiresInterviewViva: boolean;
  requiredUploads: string[];
  hallTicketEnabled: boolean;
  hallTicketReleased: boolean;
  hallTicketPrefix: string;
  examDate: string;
  examVenue: string;
  examInstructions: string;
  offerLetterTemplateId: string | null;
  totalSeats: number;
  specialityCount: number;
  candidateCount: number;
  filledSeats: number;
}

interface DocTemplate {
  id: number;
  programId: number;
  name: string;
  googleDocId: string;
}

const UPLOAD_OPTIONS = [
  { id: "photo", label: "Passport Photograph (Mandatory)" },
  { id: "id_proof", label: "Government Photo ID (Aadhaar / Passport)" },
  { id: "marksheet_10th", label: "10th Standard / Matriculation Marksheet" },
  { id: "marksheet_12th", label: "12th Standard / Higher Secondary Marksheet" },
  { id: "degree_certificate", label: "MBBS / Qualifying Degree Certificate" },
  { id: "medical_council_reg", label: "State / National Medical Council Registration" },
  { id: "lor1", label: "Letter of Recommendation (LOR 1)" },
  { id: "lor2", label: "Letter of Recommendation (LOR 2)" },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  fellowship: { label: "Clinical Fellowship", color: "bg-blue-100 text-blue-800 border-blue-200" },
  vct: { label: "Vision Care Technician (VCT)", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  optometry: { label: "Optometry & Refraction", color: "bg-purple-100 text-purple-800 border-purple-200" },
  nursing: { label: "Ophthalmic Nursing", color: "bg-rose-100 text-rose-800 border-rose-200" },
  paramedical: { label: "Paramedical Sciences", color: "bg-amber-100 text-amber-800 border-amber-200" },
  general_exam: { label: "General Examination", color: "bg-slate-100 text-slate-800 border-slate-200" },
};

export default function ProgramsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editProgram, setEditProgram] = useState<Program | null>(null);
  const [hallTicketManager, setHallTicketManager] = useState<Program | null>(null);
  const [templateManager, setTemplateManager] = useState<Program | null>(null);
  const [generatingHt, setGeneratingHt] = useState(false);
  const [downloadingBatch, setDownloadingBatch] = useState(false);

  const canManage = ["super_admin", "program_admin", "central_exam_coordinator"].includes(user?.role ?? "");

  const [form, setForm] = useState<Partial<Program>>({
    name: "",
    code: "",
    description: "",
    academicYear: "2026-2027",
    category: "fellowship",
    requiresApplicationForm: true,
    requiresPayment: false,
    feeAmount: 0,
    requiresPsychometry: false,
    requiresTheoryExam: true,
    requiresInterviewViva: true,
    requiredUploads: ["photo", "id_proof"],
    hallTicketEnabled: true,
    hallTicketReleased: false,
    hallTicketPrefix: "SAV-2026",
    examDate: "June 2026 Session · 09:00 AM IST",
    examVenue: "Sankara Academy of Vision Central Campus",
    examInstructions: "Please carry printed Admit Card along with original Government ID.",
  });

  const [tplForm, setTplForm] = useState({ name: "", googleDocId: "" });

  const { data: programs = [], isLoading } = useQuery<Program[]>({
    queryKey: ["programs"],
    queryFn: () => api.get<Program[]>("/programs"),
  });

  const { data: templates = [] } = useQuery<DocTemplate[]>({
    queryKey: ["document-templates", templateManager?.id],
    queryFn: () => templateManager ? api.get<DocTemplate[]>(`/programs/${templateManager.id}/templates`) : Promise.resolve([]),
    enabled: !!templateManager,
  });

  const addMutation = useMutation({
    mutationFn: (data: Partial<Program>) => api.post<Program>("/programs", data),
    onSuccess: () => {
      toast({ title: "Program created successfully" });
      qc.invalidateQueries({ queryKey: ["programs"] });
      setAddOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Program>) => api.patch<Program>(`/programs/${data.id}`, data),
    onSuccess: () => {
      toast({ title: "Program updated successfully" });
      qc.invalidateQueries({ queryKey: ["programs"] });
      setEditProgram(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateHtSettingsMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.patch(`/programs/${id}/hall-ticket-settings`, data),
    onSuccess: () => {
      toast({ title: "Hall ticket settings saved" });
      qc.invalidateQueries({ queryKey: ["programs"] });
    },
    onError: (e: Error) => toast({ title: "Failed to update hall ticket settings", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/programs/${id}`),
    onSuccess: () => {
      toast({ title: "Program removed" });
      qc.invalidateQueries({ queryKey: ["programs"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addTplMutation = useMutation({
    mutationFn: (data: any) => api.post("/document-templates", data),
    onSuccess: () => {
      toast({ title: "Template added" });
      qc.invalidateQueries({ queryKey: ["document-templates", templateManager?.id] });
      setTplForm({ name: "", googleDocId: "" });
    },
  });

  const deleteTplMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/document-templates/${id}`),
    onSuccess: () => {
      toast({ title: "Template removed" });
      qc.invalidateQueries({ queryKey: ["document-templates", templateManager?.id] });
    },
  });

  const handleGenerateHallTickets = async (programId: number) => {
    setGeneratingHt(true);
    try {
      const res: any = await api.post(`/programs/${programId}/generate-hall-tickets`, {});
      toast({ title: "Hall tickets generated", description: res.message || "Roll numbers assigned successfully" });
      qc.invalidateQueries({ queryKey: ["programs"] });
    } catch (err: any) {
      toast({ title: "Failed to generate hall tickets", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingHt(false);
    }
  };

  const handleDownloadBatch = async (programId: number, programCode: string) => {
    setDownloadingBatch(true);
    try {
      const token = localStorage.getItem("fellowship_token") || "";
      const res = await fetch(`/api/programs/${programId}/batch-hall-tickets-pdf?token=${encodeURIComponent(token)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to download batch hall tickets" }));
        throw new Error(err.error || "Failed to download batch hall tickets");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Batch_HallTickets_${programCode}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "Admit Cards Downloaded", description: "Batch Hall Tickets PDF downloaded successfully." });
    } catch (e: any) {
      toast({ title: "Download Failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloadingBatch(false);
    }
  };

  const handleToggleUploadOption = (formObj: any, setFormObj: any, optionId: string) => {
    const curr = formObj.requiredUploads || ["photo"];
    if (curr.includes(optionId)) {
      setFormObj({ ...formObj, requiredUploads: curr.filter((x: string) => x !== optionId) });
    } else {
      setFormObj({ ...formObj, requiredUploads: [...curr, optionId] });
    }
  };

  return (
    <div className="p-6 lg:p-10 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#0b4a8f] text-[10px] font-black uppercase tracking-widest mb-2">
            <Building className="w-3 h-3" />
            Central Examination & Admissions Management
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">ACADEMIC PROGRAMS & EXAMINATIONS</h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            Configure admissions workflows, fee payments, required uploads, evaluation stages, and hall ticket release engines across all programs.
          </p>
        </div>
        {canManage && (
          <Button 
            onClick={() => {
              setForm({
                name: "",
                code: "",
                description: "",
                academicYear: "2026-2027",
                category: "fellowship",
                requiresApplicationForm: true,
                requiresPayment: false,
                feeAmount: 0,
                requiresPsychometry: false,
                requiresTheoryExam: true,
                requiresInterviewViva: true,
                requiredUploads: ["photo", "id_proof"],
                hallTicketEnabled: true,
                hallTicketReleased: false,
                hallTicketPrefix: "SAV-2026",
                examDate: "June 2026 Session · 09:00 AM IST",
                examVenue: "Sankara Academy of Vision Central Campus",
                examInstructions: "Please carry printed Admit Card along with original Government ID.",
              });
              setAddOpen(true);
            }} 
            className="rounded-2xl bg-[#0b4a8f] hover:bg-[#08386b] text-white font-black text-xs uppercase tracking-widest h-11 px-6 shadow-md shadow-blue-900/10 gap-2 shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Program / Examination
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-16"><Loader2 className="h-8 w-8 animate-spin mx-auto text-[#0b4a8f]" /></div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {programs.map((p) => {
            const cat = CATEGORY_LABELS[p.category] || CATEGORY_LABELS.fellowship;
            return (
              <Card key={p.id} className="relative rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all overflow-hidden bg-white flex flex-col justify-between">
                <div className="p-7 space-y-6">
                  {/* Top Category & Year Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={`${cat.color} rounded-full text-[10px] font-black uppercase tracking-wider border`}>
                          {cat.label}
                        </Badge>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                          {p.code}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight pt-1 leading-snug">
                        {p.name}
                      </h3>
                      {p.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {p.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Modular Toggles Status Pills Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    {/* Application Form */}
                    <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Application Form</span>
                      <span className={`text-xs font-black mt-1 ${p.requiresApplicationForm ? "text-emerald-600" : "text-slate-400"}`}>
                        {p.requiresApplicationForm ? "✓ Enabled" : "✕ Direct Entry"}
                      </span>
                    </div>

                    {/* Fee Payment */}
                    <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Payment Gateway</span>
                      <span className={`text-xs font-black mt-1 ${p.requiresPayment ? "text-blue-700" : "text-slate-500"}`}>
                        {p.requiresPayment ? `₹${p.feeAmount}` : "Free / No Fee"}
                      </span>
                    </div>

                    {/* Hall Ticket Engine */}
                    <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Admit Cards</span>
                      <span className={`text-xs font-black mt-1 ${p.hallTicketReleased ? "text-emerald-600" : "text-amber-600"}`}>
                        {p.hallTicketReleased ? "🟢 Released" : "🔒 Draft / Locked"}
                      </span>
                    </div>

                    {/* Psychometry */}
                    <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Psychometry</span>
                      <span className={`text-xs font-black mt-1 ${p.requiresPsychometry ? "text-purple-600" : "text-slate-400"}`}>
                        {p.requiresPsychometry ? "✓ Required" : "✕ Skipped"}
                      </span>
                    </div>

                    {/* Theory Exam */}
                    <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Theory / MCQ</span>
                      <span className={`text-xs font-black mt-1 ${p.requiresTheoryExam ? "text-emerald-600" : "text-slate-400"}`}>
                        {p.requiresTheoryExam ? "✓ Active" : "✕ None"}
                      </span>
                    </div>

                    {/* Clinical Viva */}
                    <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Clinical Viva</span>
                      <span className={`text-xs font-black mt-1 ${p.requiresInterviewViva ? "text-indigo-600" : "text-slate-400"}`}>
                        {p.requiresInterviewViva ? "✓ Evaluators" : "✕ None"}
                      </span>
                    </div>
                  </div>

                  {/* Document Uploads Configured */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[9.5px] font-black uppercase tracking-widest text-slate-400 block">
                      Required Uploads:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {(p.requiredUploads || ["photo"]).map((uId: string) => {
                        const item = UPLOAD_OPTIONS.find((o) => o.id === uId);
                        return (
                          <Badge key={uId} variant="secondary" className="text-[9.5px] font-bold text-slate-700 bg-slate-100">
                            {item?.label.split("(")[0].trim() || uId}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setHallTicketManager(p)}
                      className="rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 border-slate-200 hover:bg-white hover:border-[#0b4a8f] gap-1.5 h-8.5"
                    >
                      <Ticket className="w-3.5 h-3.5 text-[#0b4a8f]" />
                      Hall Tickets
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTemplateManager(p)}
                      className="rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 border-slate-200 hover:bg-white gap-1.5 h-8.5"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      Templates
                    </Button>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditProgram(p)}
                        className="rounded-xl h-8.5 px-2.5 text-slate-600 hover:text-slate-900"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete '${p.name}'?`)) {
                            deleteMutation.mutate(p.id);
                          }
                        }}
                        className="rounded-xl h-8.5 px-2.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Dialog: Add / Create New Program ────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl rounded-3xl p-8 bg-white shadow-2xl border-none max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-[#0b4a8f]">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black text-slate-900 tracking-tight">Add New Academic Program / Exam</DialogTitle>
                <p className="text-xs font-semibold text-slate-500">Configure program category, modules, payments, uploads, and examination rules.</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-6 my-3">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Program / Examination Name *</Label>
                <Input
                  placeholder="e.g. Vision Care Technician (VCT) Entrance Exam 2026"
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="rounded-xl border-slate-200 text-xs font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Program Code *</Label>
                <Input
                  placeholder="e.g. SAV-VCT-2026"
                  value={form.code || ""}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="rounded-xl border-slate-200 text-xs font-bold uppercase font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Category *</Label>
                <select
                  value={form.category || "fellowship"}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800"
                >
                  <option value="fellowship">Clinical Fellowship</option>
                  <option value="vct">Vision Care Technician (VCT)</option>
                  <option value="optometry">Optometry & Refraction</option>
                  <option value="nursing">Ophthalmic Nursing</option>
                  <option value="paramedical">Paramedical Sciences</option>
                  <option value="general_exam">General Examination</option>
                </select>
              </div>
            </div>

            {/* Modular Workflow Toggles */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 block">
                Workflow Modules & Evaluation Toggles
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Application Form */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                  <div>
                    <span className="font-bold text-slate-900 block">Online Application Form</span>
                    <span className="text-[10px] text-slate-500">Candidate fills form online</span>
                  </div>
                  <Switch
                    checked={form.requiresApplicationForm !== false}
                    onCheckedChange={(c) => setForm({ ...form, requiresApplicationForm: c })}
                  />
                </div>

                {/* Payment Gateway */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                  <div>
                    <span className="font-bold text-slate-900 block">Fee Payment Required</span>
                    <span className="text-[10px] text-slate-500">Charge application/exam fee</span>
                  </div>
                  <Switch
                    checked={form.requiresPayment === true}
                    onCheckedChange={(c) => setForm({ ...form, requiresPayment: c })}
                  />
                </div>

                {/* Fee Amount & Pricing Model Input if Enabled */}
                {form.requiresPayment && (
                  <div className="sm:col-span-2 p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <Label className="text-xs font-bold text-[#0b4a8f]">Fee Pricing Model</Label>
                        <select
                          value={form.feePricingModel || "per_specialty"}
                          onChange={(e) => setForm({ ...form, feePricingModel: e.target.value })}
                          className="w-full h-9 rounded-lg border border-blue-200 bg-white px-2.5 text-xs font-bold text-slate-800"
                        >
                          <option value="per_specialty">Per-Specialty Multiplier (Fee × Streams, e.g. Fellowship)</option>
                          <option value="flat">Fixed Flat Fee (One-shot fixed total, e.g. VCT / Diploma)</option>
                          <option value="free">Free / No Fee (₹0)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-bold text-[#0b4a8f]">Base Fee (INR ₹)</Label>
                        <Input
                          type="number"
                          value={form.feeAmount || 0}
                          onChange={(e) => setForm({ ...form, feeAmount: Number(e.target.value) })}
                          className="w-32 h-9 rounded-lg bg-white border-blue-200 text-xs font-black"
                          placeholder="e.g. 2680"
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-blue-800/80 font-medium">
                      {form.feePricingModel === "per_specialty"
                        ? `💡 Example: If applicant selects 2 streams, fee will be ₹${((form.feeAmount || 2680) * 2).toLocaleString("en-IN")} (₹${(form.feeAmount || 2680).toLocaleString("en-IN")} × 2).`
                        : form.feePricingModel === "flat"
                        ? `💡 Fixed one-shot fee of ₹${(form.feeAmount || 500).toLocaleString("en-IN")} charged once, regardless of how many streams/centers selected.`
                        : `💡 Free application (₹0) — payment gateway step is bypassed.`}
                    </p>
                  </div>
                )}

                {/* Psychometry */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                  <div>
                    <span className="font-bold text-slate-900 block">Psychometry Assessment</span>
                    <span className="text-[10px] text-slate-500">Psychological test scoring</span>
                  </div>
                  <Switch
                    checked={form.requiresPsychometry === true}
                    onCheckedChange={(c) => setForm({ ...form, requiresPsychometry: c })}
                  />
                </div>

                {/* Theory Exam */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                  <div>
                    <span className="font-bold text-slate-900 block">Theory / MCQ Exam</span>
                    <span className="text-[10px] text-slate-500">Online computer exam</span>
                  </div>
                  <Switch
                    checked={form.requiresTheoryExam !== false}
                    onCheckedChange={(c) => setForm({ ...form, requiresTheoryExam: c })}
                  />
                </div>

                {/* Clinical Viva */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 sm:col-span-2">
                  <div>
                    <span className="font-bold text-slate-900 block">Clinical Viva / Interview Scoring</span>
                    <span className="text-[10px] text-slate-500">Doctor evaluator scoring panel</span>
                  </div>
                  <Switch
                    checked={form.requiresInterviewViva !== false}
                    onCheckedChange={(c) => setForm({ ...form, requiresInterviewViva: c })}
                  />
                </div>
              </div>
            </div>

            {/* Document Uploads Checklist */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 block">
                Required Document Uploads Checklist
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {UPLOAD_OPTIONS.map((opt) => {
                  const isChecked = (form.requiredUploads || []).includes(opt.id);
                  return (
                    <div
                      key={opt.id}
                      onClick={() => handleToggleUploadOption(form, setForm, opt.id)}
                      className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs transition-all ${
                        isChecked ? "bg-white border-[#0b4a8f] text-slate-900 font-bold" : "bg-white/50 border-slate-200 text-slate-500"
                      }`}
                    >
                      <Checkbox checked={isChecked} onCheckedChange={() => {}} className="rounded-md" />
                      <span className="text-[11px]">{opt.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" className="rounded-xl font-bold" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-[#0b4a8f] hover:bg-[#08386b] text-white font-bold px-6 shadow-md"
              disabled={addMutation.isPending || !form.name || !form.code}
              onClick={() => addMutation.mutate(form)}
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Create Program
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Edit Program Settings ────────────────────────────── */}
      <Dialog open={editProgram !== null} onOpenChange={(o) => { if (!o) setEditProgram(null); }}>
        <DialogContent className="max-w-2xl rounded-3xl p-8 bg-white shadow-2xl border-none max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-[#0b4a8f]">
                <Edit2 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black text-slate-900 tracking-tight">Edit Program: {editProgram?.name}</DialogTitle>
                <p className="text-xs font-semibold text-slate-500">Update workflow modules, fee payments, and upload requirements.</p>
              </div>
            </div>
          </DialogHeader>

          {editProgram && (
            <div className="space-y-6 my-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Program / Examination Name *</Label>
                  <Input
                    value={editProgram.name || ""}
                    onChange={(e) => setEditProgram({ ...editProgram, name: e.target.value })}
                    className="rounded-xl border-slate-200 text-xs font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Category *</Label>
                  <select
                    value={editProgram.category || "fellowship"}
                    onChange={(e) => setEditProgram({ ...editProgram, category: e.target.value })}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800"
                  >
                    <option value="fellowship">Clinical Fellowship</option>
                    <option value="vct">Vision Care Technician (VCT)</option>
                    <option value="optometry">Optometry & Refraction</option>
                    <option value="nursing">Ophthalmic Nursing</option>
                    <option value="paramedical">Paramedical Sciences</option>
                    <option value="general_exam">General Examination</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Academic Year</Label>
                  <Input
                    value={editProgram.academicYear || "2026-2027"}
                    onChange={(e) => setEditProgram({ ...editProgram, academicYear: e.target.value })}
                    className="rounded-xl border-slate-200 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Modular Toggles */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 block">
                  Workflow Modules & Evaluation Toggles
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900 block">Online Application Form</span>
                      <span className="text-[10px] text-slate-500">Candidate fills form online</span>
                    </div>
                    <Switch
                      checked={editProgram.requiresApplicationForm !== false}
                      onCheckedChange={(c) => setEditProgram({ ...editProgram, requiresApplicationForm: c })}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900 block">Fee Payment Required</span>
                      <span className="text-[10px] text-slate-500">Charge application/exam fee</span>
                    </div>
                    <Switch
                      checked={editProgram.requiresPayment === true}
                      onCheckedChange={(c) => setEditProgram({ ...editProgram, requiresPayment: c })}
                    />
                  </div>

                  {editProgram.requiresPayment && (
                    <div className="sm:col-span-2 p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <Label className="text-xs font-bold text-[#0b4a8f]">Fee Pricing Model</Label>
                          <select
                            value={editProgram.feePricingModel || "per_specialty"}
                            onChange={(e) => setEditProgram({ ...editProgram, feePricingModel: e.target.value })}
                            className="w-full h-9 rounded-lg border border-blue-200 bg-white px-2.5 text-xs font-bold text-slate-800"
                          >
                            <option value="per_specialty">Per-Specialty Multiplier (Fee × Streams, e.g. Fellowship)</option>
                            <option value="flat">Fixed Flat Fee (One-shot fixed total, e.g. VCT / Diploma)</option>
                            <option value="free">Free / No Fee (₹0)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-bold text-[#0b4a8f]">Base Fee (INR ₹)</Label>
                          <Input
                            type="number"
                            value={editProgram.feeAmount || 0}
                            onChange={(e) => setEditProgram({ ...editProgram, feeAmount: Number(e.target.value) })}
                            className="w-32 h-9 rounded-lg bg-white border-blue-200 text-xs font-black"
                            placeholder="e.g. 2680"
                          />
                        </div>
                      </div>

                      <p className="text-[10px] text-blue-800/80 font-medium">
                        {editProgram.feePricingModel === "per_specialty"
                          ? `💡 Example: If applicant selects 2 streams, fee will be ₹${((editProgram.feeAmount || 2680) * 2).toLocaleString("en-IN")} (₹${(editProgram.feeAmount || 2680).toLocaleString("en-IN")} × 2).`
                          : editProgram.feePricingModel === "flat"
                          ? `💡 Fixed one-shot fee of ₹${(editProgram.feeAmount || 500).toLocaleString("en-IN")} charged once, regardless of how many streams/centers selected.`
                          : `💡 Free application (₹0) — payment gateway step is bypassed.`}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900 block">Psychometry Assessment</span>
                      <span className="text-[10px] text-slate-500">Psychological test scoring</span>
                    </div>
                    <Switch
                      checked={editProgram.requiresPsychometry === true}
                      onCheckedChange={(c) => setEditProgram({ ...editProgram, requiresPsychometry: c })}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900 block">Theory / MCQ Exam</span>
                      <span className="text-[10px] text-slate-500">Online computer exam</span>
                    </div>
                    <Switch
                      checked={editProgram.requiresTheoryExam !== false}
                      onCheckedChange={(c) => setEditProgram({ ...editProgram, requiresTheoryExam: c })}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 sm:col-span-2">
                    <div>
                      <span className="font-bold text-slate-900 block">Clinical Viva / Interview Scoring</span>
                      <span className="text-[10px] text-slate-500">Doctor evaluator scoring panel</span>
                    </div>
                    <Switch
                      checked={editProgram.requiresInterviewViva !== false}
                      onCheckedChange={(c) => setEditProgram({ ...editProgram, requiresInterviewViva: c })}
                    />
                  </div>
                </div>
              </div>

              {/* Uploads Checklist */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-700 block">
                  Required Document Uploads Checklist
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {UPLOAD_OPTIONS.map((opt) => {
                    const isChecked = (editProgram.requiredUploads || []).includes(opt.id);
                    return (
                      <div
                        key={opt.id}
                        onClick={() => handleToggleUploadOption(editProgram, setEditProgram, opt.id)}
                        className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs transition-all ${
                          isChecked ? "bg-white border-[#0b4a8f] text-slate-900 font-bold" : "bg-white/50 border-slate-200 text-slate-500"
                        }`}
                      >
                        <Checkbox checked={isChecked} onCheckedChange={() => {}} className="rounded-md" />
                        <span className="text-[11px]">{opt.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" className="rounded-xl font-bold" onClick={() => setEditProgram(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-[#0b4a8f] hover:bg-[#08386b] text-white font-bold px-6 shadow-md"
              disabled={updateMutation.isPending || !editProgram?.name}
              onClick={() => editProgram && updateMutation.mutate(editProgram)}
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Hall Ticket Release & Venue Manager ──────────────────── */}
      <Dialog open={hallTicketManager !== null} onOpenChange={(o) => { if (!o) setHallTicketManager(null); }}>
        <DialogContent className="max-w-2xl rounded-3xl p-8 bg-white shadow-2xl border-none max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-700">
                <Ticket className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black text-slate-900 tracking-tight">
                  Hall Ticket Engine: {hallTicketManager?.name}
                </DialogTitle>
                <p className="text-xs font-semibold text-slate-500">Generate roll numbers, configure exam center venue, and release Admit Cards.</p>
              </div>
            </div>
          </DialogHeader>

          {hallTicketManager && (
            <div className="space-y-6 my-3">
              {/* Release Status Banner */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                hallTicketManager.hallTicketReleased ? "bg-emerald-50/70 border-emerald-200" : "bg-amber-50/70 border-amber-200"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${hallTicketManager.hallTicketReleased ? "bg-emerald-500 animate-ping" : "bg-amber-500"}`} />
                  <div>
                    <span className="text-xs font-black text-slate-900 block">
                      {hallTicketManager.hallTicketReleased ? "🟢 Hall Tickets Live & Released" : "🔒 Hall Tickets Locked (Draft Mode)"}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      {hallTicketManager.hallTicketReleased 
                        ? "Candidates can download their official Admit Card via Reference ID / Email" 
                        : "Admit cards are hidden from candidates until release is toggled on."}
                    </span>
                  </div>
                </div>

                <Switch
                  checked={hallTicketManager.hallTicketReleased}
                  onCheckedChange={(c) => {
                    setHallTicketManager({ ...hallTicketManager, hallTicketReleased: c });
                    updateHtSettingsMutation.mutate({
                      id: hallTicketManager.id,
                      data: { hallTicketReleased: c },
                    });
                  }}
                />
              </div>

              {/* Schedule & Venue Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Hall Ticket Prefix</Label>
                  <Input
                    value={hallTicketManager.hallTicketPrefix || "SAV-2026"}
                    onChange={(e) => setHallTicketManager({ ...hallTicketManager, hallTicketPrefix: e.target.value })}
                    className="rounded-xl border-slate-200 text-xs font-bold uppercase font-mono"
                    placeholder="e.g. SAV-VCT-2026"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Exam Date & Reporting Time</Label>
                  <Input
                    value={hallTicketManager.examDate || ""}
                    onChange={(e) => setHallTicketManager({ ...hallTicketManager, examDate: e.target.value })}
                    className="rounded-xl border-slate-200 text-xs font-bold"
                    placeholder="e.g. June 15, 2026 · 09:00 AM IST"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Assigned Exam Center / Venue</Label>
                  <Input
                    value={hallTicketManager.examVenue || ""}
                    onChange={(e) => setHallTicketManager({ ...hallTicketManager, examVenue: e.target.value })}
                    className="rounded-xl border-slate-200 text-xs font-bold"
                    placeholder="e.g. Sankara Academy of Vision Central Campus, Bangalore"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Special Instructions on Admit Card</Label>
                  <Textarea
                    rows={2}
                    value={hallTicketManager.examInstructions || ""}
                    onChange={(e) => setHallTicketManager({ ...hallTicketManager, examInstructions: e.target.value })}
                    className="rounded-xl border-slate-200 text-xs font-medium"
                    placeholder="e.g. Bring original Government Photo ID and 2 passport photos."
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-black text-slate-900 block">Generate Roll Numbers</span>
                  <span className="text-[10px] text-slate-500">Assigns sequential hall ticket numbers to all approved candidates.</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleGenerateHallTickets(hallTicketManager.id)}
                  disabled={generatingHt}
                  className="rounded-xl bg-[#0b4a8f] hover:bg-[#08386b] text-white font-black text-[10px] uppercase tracking-wider h-9 px-4 shrink-0"
                >
                  {generatingHt ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  Generate All Numbers
                </Button>
              </div>

              {/* Batch PDF Download */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs font-black text-slate-900 block">Batch Export Hall Tickets PDF</span>
                  <span className="text-[10px] text-slate-500">Print all approved candidate admit cards in one combined PDF.</span>
                </div>
                <Button
                  size="sm"
                  disabled={downloadingBatch}
                  onClick={() => handleDownloadBatch(hallTicketManager.id, hallTicketManager.code)}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider h-9 px-4 shrink-0 cursor-pointer"
                >
                  {downloadingBatch ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Download PDF
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            <Button variant="outline" className="rounded-xl font-bold" onClick={() => setHallTicketManager(null)}>
              Done
            </Button>
            <Button
              className="rounded-xl bg-[#0b4a8f] hover:bg-[#08386b] text-white font-bold px-6 shadow-md"
              disabled={updateHtSettingsMutation.isPending}
              onClick={() => {
                if (hallTicketManager) {
                  updateHtSettingsMutation.mutate({
                    id: hallTicketManager.id,
                    data: {
                      hallTicketPrefix: hallTicketManager.hallTicketPrefix,
                      examDate: hallTicketManager.examDate,
                      examVenue: hallTicketManager.examVenue,
                      examInstructions: hallTicketManager.examInstructions,
                    },
                  });
                }
              }}
            >
              {updateHtSettingsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Save Venue & Prefix
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Document Templates Manager ───────────────────────────── */}
      <Dialog open={templateManager !== null} onOpenChange={(o) => { if (!o) setTemplateManager(null); }}>
        <DialogContent className="max-w-xl rounded-3xl p-8 bg-white shadow-2xl border-none">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 tracking-tight">
              Document Templates: {templateManager?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="flex gap-2">
              <Input
                placeholder="Template Name (e.g. Offer Letter)"
                value={tplForm.name}
                onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
                className="rounded-xl text-xs"
              />
              <Input
                placeholder="Google Doc ID"
                value={tplForm.googleDocId}
                onChange={(e) => setTplForm({ ...tplForm, googleDocId: e.target.value })}
                className="rounded-xl text-xs font-mono"
              />
              <Button
                size="sm"
                onClick={() => templateManager && addTplMutation.mutate({ ...tplForm, programId: templateManager.id })}
                disabled={!tplForm.name || !tplForm.googleDocId}
                className="rounded-xl bg-[#0b4a8f] text-white font-black text-xs shrink-0"
              >
                Add
              </Button>
            </div>

            <div className="divide-y divide-slate-100">
              {templates.map((tpl) => (
                <div key={tpl.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 text-xs block">{tpl.name}</span>
                    <span className="text-[10px] font-mono text-slate-400">{tpl.googleDocId}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteTplMutation.mutate(tpl.id)}
                    className="text-rose-500 hover:text-rose-700 h-8 px-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              {templates.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-6">No custom document templates linked yet.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-xl font-bold" onClick={() => setTemplateManager(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
