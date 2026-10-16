import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useToast } from "../hooks/use-toast";
import { getCleanObjectPath } from "../lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "./ui/select";
import { Textarea } from "./ui/textarea";
import {
  User, GraduationCap, Stethoscope, FileText,
  Star, ExternalLink, Loader2, CheckCircle2,
  AlertCircle, Building2, Phone, Mail,
  Calendar, MapPin, Award, BookOpen,
  Sparkles, Check, X, ShieldAlert, Download,
  Heart, HeartPulse, Activity, Grid3x3
} from "lucide-react";
import { SeatMatrixModal } from "./SeatMatrixModal";

interface AppliedSpeciality {
  specialityId: number;
  specialityName: string;
  specialityCode: string;
  preferenceOrder: number;
  score?: number | null;
  remarks?: string | null;
  submittedAt?: string | null;
}

interface CandidateExamDialogProps {
  candidateId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function CandidateExamDialog({ candidateId, open, onClose, onSaved }: CandidateExamDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"profile" | "qualifications" | "clinical" | "lors" | "form">("profile");
  const [seatMatrixOpen, setSeatMatrixOpen] = useState(false);
  
  // Selection decision and notes
  const [decisionStatus, setDecisionStatus] = useState<string>("interview_completed");
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [overallRemarks, setOverallRemarks] = useState<string>("");
  const [psychometricScore, setPsychometricScore] = useState<string>("");
  const [specialityMarks, setSpecialityMarks] = useState<Record<number, { score: string; remarks: string }>>({});

  const { data: units = [] } = useQuery<any[]>({
    queryKey: ["units"],
    queryFn: () => api.get("/units"),
    enabled: open,
  });

  const { data: candidate, isLoading, refetch } = useQuery<any>({
    queryKey: ["candidate-examination-detail", candidateId],
    queryFn: () => api.get(`/candidates/${candidateId}`),
    enabled: !!candidateId && open,
  });

  // Populate decision & remarks when candidate details load
  useEffect(() => {
    if (candidate) {
      setDecisionStatus(candidate.status || "interview_completed");
      setSelectedUnitId(candidate.unitId || null);
      setOverallRemarks(candidate.reviewNotes || "");
      setPsychometricScore(
        candidate.psychometricScore != null ? String(candidate.psychometricScore) : ""
      );

      const initialSpecMarks: Record<number, { score: string; remarks: string }> = {};
      if (Array.isArray(candidate.appliedSpecialities)) {
        for (const spec of candidate.appliedSpecialities) {
          initialSpecMarks[spec.specialityId] = {
            score: spec.score != null ? String(spec.score) : "",
            remarks: spec.remarks || "",
          };
        }
      }
      setSpecialityMarks(initialSpecMarks);
    }
  }, [candidate]);

  const saveDecisionMutation = useMutation({
    mutationFn: async () => {
      if (!candidateId) throw new Error("No candidate selected");

      let psychoNum: number | null = null;
      if (psychometricScore.trim() !== "") {
        const parsed = parseFloat(psychometricScore);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 10) {
          psychoNum = parsed;
        }
      }

      const specialityScores = Object.entries(specialityMarks).map(([specIdStr, data]) => {
        const specId = Number(specIdStr);
        const scoreVal = data.score.trim() !== "" ? parseFloat(data.score) : 0;
        return {
          specialityId: specId,
          score: !isNaN(scoreVal) ? scoreVal : 0,
          remarks: data.remarks.trim() || undefined,
        };
      });

      return api.post(`/candidates/${candidateId}/doctor-marks`, {
        psychometricScore: psychoNum,
        specialityScores,
        status: decisionStatus,
        unitId: selectedUnitId,
        reviewNotes: overallRemarks ? overallRemarks : undefined,
      });
    },
    onSuccess: () => {
      toast({
        title: "Interview Assessment Saved",
        description: `Decision and notes for ${candidate?.fullName || "Candidate"} updated successfully.`,
      });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["doctor-assignments"] });
      qc.invalidateQueries({ queryKey: ["interview-scores"] });
      qc.invalidateQueries({ queryKey: ["candidate-examination-detail", candidateId] });
      refetch();
      if (onSaved) onSaved();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to Save Assessment",
        description: err.response?.data?.error || err.message,
        variant: "destructive",
      });
    },
  });

  const sub = candidate?.submission;
  const token = typeof window !== "undefined" ? localStorage.getItem("fellowship_token") : "";

  const handleDownloadCallLetter = async () => {
    if (!candidateId) return;
    try {
      toast({ title: "Generating Call Letter...", description: `Preparing official PDF for ${candidate?.fullName}` });
      const res = await fetch(`/api/candidates/${candidateId}/call-letter-pdf?token=${token}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to generate Call Letter PDF");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Interview_Call_Letter_${candidate?.fullName?.replace(/\s+/g, "_") || candidateId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      toast({ title: "Download Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDownloadOfferLetter = async () => {
    if (!candidateId) return;
    try {
      toast({ title: "Generating Offer Letter...", description: `Preparing official Fellowship Admission Letter for ${candidate?.fullName}` });
      const res = await fetch(`/api/candidates/${candidateId}/offer-letter-pdf?token=${token}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || "Failed to generate Offer Letter PDF");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Fellowship_Offer_Letter_${candidate?.fullName?.replace(/\s+/g, "_") || candidateId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      toast({ title: "Offer Letter Unavailable", description: err.message || "Candidate might not be marked as selected yet.", variant: "destructive" });
    }
  };

  // Helper to open secure files
  const openFile = (url?: string | null) => {
    if (!url) return;
    const cleanPath = getCleanObjectPath(url);
    const target = cleanPath ? `/api/storage${cleanPath}?token=${token}` : url;
    window.open(target, "_blank");
  };

  const getPhotoSrc = () => {
    if (candidate?.photoUrl || sub?.photoUrl) {
      const p = candidate?.photoUrl || sub?.photoUrl;
      const clean = getCleanObjectPath(p);
      return clean ? `/api/storage${clean}?token=${token}` : p;
    }
    const photoDoc = candidate?.documents?.find((d: any) =>
      d.docType?.toLowerCase().includes("photo") ||
      d.fileName?.toLowerCase().includes("photo")
    );
    if (photoDoc) {
      const clean = getCleanObjectPath(photoDoc.fileUrl);
      return clean ? `/api/storage${clean}?token=${token}` : `/api/documents/${photoDoc.id}?token=${token}`;
    }
    return null;
  };

  // Applied specialities list
  const appliedList: AppliedSpeciality[] = candidate?.appliedSpecialities || [];

  const [uploadingLor, setUploadingLor] = useState<string | null>(null);

  const handleUploadLorFile = async (docType: "LOR1" | "LOR2" | "OTHER", file: File) => {
    if (!candidateId) return;
    setUploadingLor(docType);
    try {
      // 1. Request upload URL
      const urlRes = await api.post("/storage/uploads/request-url", {
        name: file.name,
        contentType: file.type || "application/pdf",
        size: file.size,
      });

      const { uploadURL, objectPath } = urlRes as { uploadURL: string; objectPath: string };

      // 2. Put file
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      });
      if (!putRes.ok) throw new Error("Failed to upload file content to storage");

      // 3. Attach to candidate documents
      await api.post(`/candidates/${candidateId}/documents`, {
        docType,
        fileName: file.name,
        fileUrl: objectPath,
      });

      toast({
        title: "Document Uploaded",
        description: `${docType} has been successfully attached to ${candidate?.fullName || "candidate"}.`,
      });
      qc.invalidateQueries({ queryKey: ["candidate-examination-detail", candidateId] });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      refetch();
    } catch (e: any) {
      toast({
        title: "Upload Failed",
        description: e.response?.data?.error || e.message,
        variant: "destructive",
      });
    } finally {
      setUploadingLor(null);
    }
  };

  const hasLor1 = !!(sub?.lor1Url || candidate?.documents?.some((d: any) => d.docType?.includes("LOR1")));
  const hasLor2 = !!(sub?.lor2Url || candidate?.documents?.some((d: any) => d.docType?.includes("LOR2")));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-7xl w-[96vw] max-h-[92vh] p-0 rounded-[28px] overflow-hidden border border-slate-200 bg-white shadow-2xl flex flex-col">
        {/* Top Header */}
        <DialogHeader className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white px-6 py-4.5 shrink-0 border-b border-white/10 flex flex-row items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center font-black text-xl text-orange-400 overflow-hidden shadow-inner">
              {getPhotoSrc() ? (
                <img src={getPhotoSrc()!} alt="Candidate" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                candidate?.fullName?.charAt(0).toUpperCase() || "?"
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <DialogTitle className="text-xl font-black text-white tracking-tight">
                  {candidate?.fullName || "Candidate Evaluation"}
                </DialogTitle>
                <Badge className="bg-orange-500/20 text-orange-300 border border-orange-500/30 font-mono text-xs font-bold px-2.5 py-0.5">
                  {candidate?.candidateCode || "APP-CODE"}
                </Badge>
                {candidate?.unitName && (
                  <Badge variant="outline" className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-[10px] font-bold">
                    {candidate.unitName}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5 flex items-center gap-3">
                <span>{candidate?.email}</span>
                {candidate?.phone && <span>· {candidate.phone}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSeatMatrixOpen(true)}
              className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-400/30 font-bold gap-1.5 h-8 px-3 rounded-lg shadow-sm"
              title="View live fellowship seat matrix and vacancies"
            >
              <Grid3x3 className="h-3.5 w-3.5 text-emerald-300" />
              Seat Matrix
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCallLetter}
              className="text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border-blue-400/30 font-bold gap-1.5 h-8 px-3 rounded-lg shadow-sm"
              title="Download official Interview Call Letter PDF"
            >
              <Mail className="h-3.5 w-3.5 text-blue-300" />
              Call Letter PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadOfferLetter}
              className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border-purple-400/30 font-bold gap-1.5 h-8 px-3 rounded-lg shadow-sm"
              title="Download official Fellowship Offer Letter PDF"
            >
              <Award className="h-3.5 w-3.5 text-purple-300" />
              Offer Letter PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (candidateId) {
                  window.open(`/api/candidates/${candidateId}/application-pdf?token=${token}`, "_blank");
                }
              }}
              className="text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 font-bold gap-1.5 h-8 px-3 rounded-lg shadow-sm"
              title="Download official candidate application dossier as PDF"
            >
              <FileText className="h-3.5 w-3.5 text-orange-400" />
              Dossier PDF
            </Button>
            {candidate?.submissionId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(`/api/submission-view/${candidate.submissionId}?token=${token}`, "_blank")}
                className="text-xs text-orange-300 hover:text-white hover:bg-white/10 font-bold gap-1.5 h-8 px-3 rounded-lg"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Full Form Tab
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white/60 hover:text-white hover:bg-white/10 rounded-full h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <p className="font-bold text-sm">Loading Candidate Examination Dossier...</p>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden min-h-0">
            
            {/* LEFT COLUMN: VIEW-ONLY APPLICATION DETAILS (7 cols) */}
            <div className="lg:col-span-7 border-r border-slate-200 bg-slate-50/70 flex flex-col overflow-hidden">
              {/* Tab Navigation */}
              <div className="p-3 border-b border-slate-200 bg-white shrink-0">
                <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
                  <TabsList className="grid grid-cols-5 h-9 bg-slate-100 p-1 rounded-xl">
                    <TabsTrigger value="profile" className="text-[11px] font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900">
                      Profile
                    </TabsTrigger>
                    <TabsTrigger value="qualifications" className="text-[11px] font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900">
                      Academic
                    </TabsTrigger>
                    <TabsTrigger value="clinical" className="text-[11px] font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900">
                      Clinical Skills
                    </TabsTrigger>
                    <TabsTrigger value="lors" className="text-[11px] font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900">
                      LORs & Docs
                    </TabsTrigger>
                    <TabsTrigger value="form" className="text-[11px] font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900">
                      Form View
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Tab Content Container */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 fancy-scrollbar">
                
                {/* 1. PERSONAL PROFILE */}
                {activeTab === "profile" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 border-b pb-2">
                        <User className="h-3.5 w-3.5 text-orange-500" />
                        Personal Information
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Date of Birth</span>
                          <p className="font-bold text-slate-800 mt-0.5">{candidate?.dateOfBirth || sub?.dateOfBirth || "—"}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Gender</span>
                          <p className="font-bold text-slate-800 mt-0.5">{candidate?.gender || sub?.gender || "—"}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Marital Status</span>
                          <p className="font-bold text-slate-800 mt-0.5">{sub?.maritalStatus || "—"}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Spouse Details</span>
                          <p className="font-bold text-slate-800 mt-0.5">{sub?.spouseDetails || "—"}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 border-b pb-2">
                        <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                        Address Details
                      </h4>
                      <div className="space-y-3 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Permanent Address</span>
                          <p className="font-semibold text-slate-800 mt-0.5">{candidate?.address || sub?.permanentAddress || "—"}</p>
                        </div>
                        {sub?.mailingAddress && (
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Mailing Address</span>
                            <p className="font-semibold text-slate-800 mt-0.5">{sub.mailingAddress}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 border-b pb-2">
                        <Award className="h-3.5 w-3.5 text-emerald-500" />
                        Applied Specializations & Preferences
                      </h4>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {appliedList.map((spec, idx) => (
                          <div key={spec.specialityId || idx} className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                            <span className="h-5 w-5 rounded-full bg-orange-500 text-white font-black text-[10px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-xs text-slate-800">{spec.specialityName}</span>
                          </div>
                        ))}
                      </div>
                      {candidate?.centerPreference && (
                        <div className="pt-2 text-xs">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Center Preferences</span>
                          <p className="font-semibold text-slate-700 mt-0.5">{candidate.centerPreference}</p>
                        </div>
                      )}
                    </div>

                    {/* Medical History & Health Disclosures (Prominent Heart / Liver / Ailments) */}
                    {(() => {
                      const rawConditions = sub?.medicalConditions || candidate?.medicalConditions || "";
                      let conditionsList: string[] = [];
                      if (Array.isArray(rawConditions)) {
                        conditionsList = rawConditions;
                      } else if (typeof rawConditions === "string") {
                        try {
                          const parsed = JSON.parse(rawConditions);
                          if (Array.isArray(parsed)) conditionsList = parsed;
                          else conditionsList = rawConditions.split(",").map((s: string) => s.trim()).filter(Boolean);
                        } catch {
                          conditionsList = rawConditions.split(",").map((s: string) => s.trim()).filter(Boolean);
                        }
                      }

                      const hasHeartIssues = conditionsList.some((c) => /heart/i.test(c)) || /heart/i.test(sub?.healthDetails || "");
                      const hasLiverIssues = conditionsList.some((c) => /liver/i.test(c)) || /liver/i.test(sub?.healthDetails || "");

                      return (
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                          <div className="flex items-center justify-between border-b pb-2">
                            <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                              <HeartPulse className="h-3.5 w-3.5 text-rose-500" />
                              Medical History & Health Disclosures
                            </h4>
                            {hasHeartIssues || hasLiverIssues ? (
                              <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px] font-black uppercase">
                                Medical Issue Declared
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-black uppercase">
                                Medically Fit
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div className={`p-3 rounded-xl border flex items-center justify-between ${
                              hasHeartIssues
                                ? "bg-rose-50 border-rose-300 text-rose-950 shadow-xs"
                                : "bg-slate-50 border-slate-200 text-slate-700"
                            }`}>
                              <div>
                                <span className="text-[10px] font-black uppercase tracking-wider block">Heart Related Issues</span>
                                <p className="text-xs font-bold mt-0.5">
                                  {hasHeartIssues ? "⚠️ Declared by Candidate" : "None Reported"}
                                </p>
                              </div>
                              <Heart className={`h-5 w-5 ${hasHeartIssues ? "text-rose-600 animate-pulse" : "text-slate-300"}`} />
                            </div>

                            <div className={`p-3 rounded-xl border flex items-center justify-between ${
                              hasLiverIssues
                                ? "bg-amber-50 border-amber-300 text-amber-950 shadow-xs"
                                : "bg-slate-50 border-slate-200 text-slate-700"
                            }`}>
                              <div>
                                <span className="text-[10px] font-black uppercase tracking-wider block">Liver Related Issues</span>
                                <p className="text-xs font-bold mt-0.5">
                                  {hasLiverIssues ? "⚠️ Declared by Candidate" : "None Reported"}
                                </p>
                              </div>
                              <Activity className={`h-5 w-5 ${hasLiverIssues ? "text-amber-600 animate-pulse" : "text-slate-300"}`} />
                            </div>
                          </div>

                          <div className="pt-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">
                              Declared Ailments / Medical Conditions
                            </span>
                            {conditionsList.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {conditionsList.map((cond, idx) => (
                                  <Badge
                                    key={idx}
                                    variant="outline"
                                    className={`text-xs font-bold px-2.5 py-1 ${
                                      /heart/i.test(cond)
                                        ? "bg-rose-50 text-rose-800 border-rose-300 font-black"
                                        : /liver/i.test(cond)
                                        ? "bg-amber-50 text-amber-800 border-amber-300 font-black"
                                        : cond === "None of the Above"
                                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                        : "bg-slate-100 text-slate-800 border-slate-300"
                                    }`}
                                  >
                                    {cond}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400 italic">No specific ailments recorded.</p>
                            )}
                          </div>

                          {sub?.healthDetails && (
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                              <span className="text-[10px] font-bold text-slate-400 uppercase block">Additional Health Details</span>
                              <p className="font-semibold text-slate-800 mt-0.5">{sub.healthDetails}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 2. ACADEMIC & QUALIFICATIONS */}
                {activeTab === "qualifications" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 border-b pb-2">
                        <GraduationCap className="h-3.5 w-3.5 text-blue-500" />
                        Undergraduate Degree (MBBS)
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Degree</span>
                          <p className="font-bold text-slate-800 mt-0.5">{candidate?.qualification || sub?.degree || "MBBS"}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Medical Council Reg. No</span>
                          <p className="font-bold text-slate-800 mt-0.5 font-mono">{sub?.medicalCouncilNumber || "—"}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Medical College</span>
                          <p className="font-semibold text-slate-800 mt-0.5">{candidate?.collegeName || sub?.medicalCollege || "—"}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">University</span>
                          <p className="font-semibold text-slate-800 mt-0.5">{sub?.university || "—"}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 border-b pb-2">
                        <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
                        Post-Graduate Qualifications
                      </h4>
                      <div className="space-y-3 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">PG Overview</span>
                          <p className="font-bold text-slate-800 mt-0.5">{candidate?.pgQualifications || sub?.pgQualifications || "—"}</p>
                        </div>
                        {sub?.msMdQualification && (
                          <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                            <span className="font-black text-indigo-900 uppercase text-[10px]">MS / MD Details</span>
                            <p className="font-semibold text-slate-700 mt-0.5">{sub.msMdDetails || "Yes"}</p>
                          </div>
                        )}
                        {sub?.dnbQualification && (
                          <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100">
                            <span className="font-black text-emerald-900 uppercase text-[10px]">DNB Details</span>
                            <p className="font-semibold text-slate-700 mt-0.5">{sub.dnbDetails || "Yes"}</p>
                          </div>
                        )}
                        {sub?.doQualification && (
                          <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                            <span className="font-black text-amber-900 uppercase text-[10px]">DO Details</span>
                            <p className="font-semibold text-slate-700 mt-0.5">{sub.doDetails || "Yes"}</p>
                          </div>
                        )}
                        {sub?.otherTraining && (
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Other Training / Experience</span>
                            <p className="font-semibold text-slate-800 mt-0.5">{sub.otherTraining}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. CLINICAL SKILLS & SURGICAL EXPERIENCE */}
                {activeTab === "clinical" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 border-b pb-2">
                        <Stethoscope className="h-3.5 w-3.5 text-rose-500" />
                        Diagnostic & Clinical Skills
                      </h4>
                      <p className="text-xs font-semibold text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {sub?.diagnosticSkills || "No diagnostic skills provided."}
                      </p>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 border-b pb-2">
                        <Award className="h-3.5 w-3.5 text-orange-500" />
                        Surgical Experience & Surgeries Done
                      </h4>
                      <div className="space-y-3 text-xs">
                        {sub?.totalSurgeries && (
                          <div className="bg-orange-50 p-3 rounded-xl border border-orange-100">
                            <span className="text-[10px] font-black text-orange-800 uppercase">Total Surgeries Performed</span>
                            <p className="font-black text-lg text-orange-950 mt-0.5">{sub.totalSurgeries}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Surgical Details</span>
                          <p className="font-semibold text-slate-800 mt-0.5 whitespace-pre-wrap leading-relaxed">
                            {sub?.surgicalExperience || "No surgical details provided."}
                          </p>
                        </div>
                      </div>
                    </div>

                    {(sub?.publications || sub?.presentations) && (
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                        <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 border-b pb-2">
                          <BookOpen className="h-3.5 w-3.5 text-purple-500" />
                          Research & Publications
                        </h4>
                        <div className="space-y-3 text-xs">
                          {sub?.publications && (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Publications</span>
                              <p className="font-semibold text-slate-800 mt-0.5 whitespace-pre-wrap">{sub.publications}</p>
                            </div>
                          )}
                          {sub?.presentations && (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Presentations</span>
                              <p className="font-semibold text-slate-800 mt-0.5 whitespace-pre-wrap">{sub.presentations}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. LORS & DOCUMENTS */}
                {activeTab === "lors" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-indigo-500" />
                          Letters of Recommendation (LOR)
                        </h4>
                        <span className="text-[10px] font-semibold text-slate-500">Attach LOR PDF directly if not received in form</span>
                      </div>

                      {/* Referee 1 */}
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-indigo-900 uppercase text-[11px]">Referee 1</span>
                          <div className="flex items-center gap-2">
                            {hasLor1 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (sub?.lor1Url) openFile(sub.lor1Url);
                                  else {
                                    const d = candidate?.documents?.find((doc: any) => doc.docType?.includes("LOR1"));
                                    if (d) openFile(d.fileUrl);
                                  }
                                }}
                                className="h-7 text-[10px] font-bold uppercase gap-1 text-indigo-700 border-indigo-200 bg-white"
                              >
                                <ExternalLink className="h-3 w-3" /> View LOR 1
                              </Button>
                            )}
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadLorFile("LOR1", f);
                                }}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                disabled={uploadingLor === "LOR1"}
                                className="h-7 text-[10px] font-bold uppercase gap-1 text-slate-700 border-slate-300 bg-white hover:bg-slate-50 pointer-events-none"
                              >
                                {uploadingLor === "LOR1" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Award className="h-3 w-3 text-orange-500" />}
                                {hasLor1 ? "Replace LOR 1" : "Upload LOR 1"}
                              </Button>
                            </label>
                          </div>
                        </div>
                        <p className="font-bold text-slate-800">{sub?.lor1RefName || "Referee 1 Name"}</p>
                        <p className="text-slate-500">{sub?.lor1RefContact || sub?.lor1RefEmail || "Contact not specified"}</p>
                      </div>

                      {/* Referee 2 */}
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-indigo-900 uppercase text-[11px]">Referee 2</span>
                          <div className="flex items-center gap-2">
                            {hasLor2 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (sub?.lor2Url) openFile(sub.lor2Url);
                                  else {
                                    const d = candidate?.documents?.find((doc: any) => doc.docType?.includes("LOR2"));
                                    if (d) openFile(d.fileUrl);
                                  }
                                }}
                                className="h-7 text-[10px] font-bold uppercase gap-1 text-indigo-700 border-indigo-200 bg-white"
                              >
                                <ExternalLink className="h-3 w-3" /> View LOR 2
                              </Button>
                            )}
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadLorFile("LOR2", f);
                                }}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                type="button"
                                disabled={uploadingLor === "LOR2"}
                                className="h-7 text-[10px] font-bold uppercase gap-1 text-slate-700 border-slate-300 bg-white hover:bg-slate-50 pointer-events-none"
                              >
                                {uploadingLor === "LOR2" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Award className="h-3 w-3 text-orange-500" />}
                                {hasLor2 ? "Replace LOR 2" : "Upload LOR 2"}
                              </Button>
                            </label>
                          </div>
                        </div>
                        <p className="font-bold text-slate-800">{sub?.lor2RefName || "Referee 2 Name"}</p>
                        <p className="text-slate-500">{sub?.lor2RefContact || sub?.lor2RefEmail || "Contact not specified"}</p>
                      </div>
                    </div>

                    {/* All Uploaded Documents */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b pb-2">
                        <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                          <Award className="h-3.5 w-3.5 text-emerald-500" />
                          Uploaded Verification Documents
                        </h4>
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadLorFile("OTHER", f);
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            disabled={uploadingLor === "OTHER"}
                            className="h-6 text-[9px] font-bold uppercase gap-1 text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 pointer-events-none"
                          >
                            {uploadingLor === "OTHER" ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Award className="h-2.5 w-2.5" />}
                            Attach Additional Doc
                          </Button>
                        </label>
                      </div>
                      {candidate?.documents && candidate.documents.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {candidate.documents.map((doc: any) => (
                            <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50">
                              <div className="min-w-0 pr-2">
                                <span className="font-black text-[10px] text-slate-500 uppercase block truncate">{doc.docType}</span>
                                <p className="text-xs font-bold text-slate-800 truncate">{doc.fileName}</p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openFile(doc.fileUrl)}
                                className="h-7 w-7 p-0 shrink-0 text-slate-600 hover:text-indigo-600"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No additional documents recorded.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* 5. EMBEDDED FORM VIEW */}
                {activeTab === "form" && (
                  <div className="h-[520px] rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-inner">
                    {candidate?.submissionId ? (
                      <iframe
                        src={`/api/submission-view/${candidate.submissionId}?token=${token}`}
                        className="w-full h-full border-none"
                        title="Application Form Viewer"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-400 text-xs font-bold">
                        No online submission record found.
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>

            {/* RIGHT COLUMN: INTERVIEW ASSESSMENT & SELECTION PANEL (5 cols) */}
            <div className="lg:col-span-5 bg-white flex flex-col overflow-hidden border-l border-slate-200">
              <div className="p-4 border-b border-slate-200 bg-slate-50/80 shrink-0 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Stethoscope className="h-4 w-4 text-orange-600" />
                    Interview Evaluation & Decision
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                    Assess candidate dossier, record panel feedback & fellowship selection.
                  </p>
                </div>
                <Badge className={
                  decisionStatus === "allocated"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-black uppercase"
                    : decisionStatus === "interview_completed"
                    ? "bg-blue-100 text-blue-800 border-blue-300 text-[10px] font-black uppercase"
                    : decisionStatus === "waitlisted"
                    ? "bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-black uppercase"
                    : "bg-slate-100 text-slate-800 border-slate-300 text-[10px] font-black uppercase"
                }>
                  {decisionStatus === "allocated" ? "Selected" : decisionStatus === "interview_completed" ? "Interviewed" : decisionStatus}
                </Badge>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5 fancy-scrollbar">
                
                {/* 1. SELECTION DECISION SELECTOR */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <Label className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5 text-orange-600" />
                    Interview Selection Outcome
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDecisionStatus("allocated")}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        decisionStatus === "allocated"
                          ? "bg-emerald-50 border-emerald-500 text-emerald-950 font-black shadow-xs ring-2 ring-emerald-400/20"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs">Selected (Allocate)</span>
                        {decisionStatus === "allocated" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      </div>
                      <p className="text-[10px] text-emerald-700 font-medium mt-0.5">Offer Letter Ready</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDecisionStatus("interview_completed")}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        decisionStatus === "interview_completed"
                          ? "bg-blue-50 border-blue-500 text-blue-950 font-black shadow-xs ring-2 ring-blue-400/20"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs">Interview Completed</span>
                        {decisionStatus === "interview_completed" && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                      </div>
                      <p className="text-[10px] text-blue-700 font-medium mt-0.5">Reviewed by Panel</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDecisionStatus("waitlisted")}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        decisionStatus === "waitlisted"
                          ? "bg-amber-50 border-amber-500 text-amber-950 font-black shadow-xs ring-2 ring-amber-400/20"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs">Waitlisted</span>
                        {decisionStatus === "waitlisted" && <CheckCircle2 className="h-4 w-4 text-amber-600" />}
                      </div>
                      <p className="text-[10px] text-amber-700 font-medium mt-0.5">Under Consideration</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDecisionStatus("rejected")}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        decisionStatus === "rejected"
                          ? "bg-rose-50 border-rose-500 text-rose-950 font-black shadow-xs ring-2 ring-rose-400/20"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs">Not Selected</span>
                        {decisionStatus === "rejected" && <X className="h-4 w-4 text-rose-600" />}
                      </div>
                      <p className="text-[10px] text-rose-700 font-medium mt-0.5">Not Recommended</p>
                    </button>
                  </div>

                  {/* If Allocated / Selected: Hospital Location / Unit Picker */}
                  {decisionStatus === "allocated" && (
                    <div className="pt-2 border-t border-slate-200 space-y-2 animate-in fade-in duration-200">
                      <Label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                        <span>Assigned Hospital Unit / Location:</span>
                        <span className="text-emerald-700 text-[10px] font-extrabold uppercase">Required for Offer Letter</span>
                      </Label>
                      <Select
                        value={selectedUnitId ? String(selectedUnitId) : ""}
                        onValueChange={(val) => setSelectedUnitId(Number(val))}
                      >
                        <SelectTrigger className="h-10 rounded-xl border-slate-300 bg-white text-xs font-bold">
                          <SelectValue placeholder="Select Hospital Unit..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {units.map((u: any) => (
                            <SelectItem key={u.id} value={String(u.id)} className="text-xs font-semibold">
                              {u.name} {u.code ? `(${u.code})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Offer Letter Ready Card */}
                      <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 flex items-center justify-between mt-2">
                        <div>
                          <p className="text-xs font-extrabold text-purple-950 flex items-center gap-1.5">
                            <Award className="h-4 w-4 text-purple-600" />
                            Official Offer Letter Generated
                          </p>
                          <p className="text-[10px] text-purple-700">Official 2-page fellowship appointment letter</p>
                        </div>
                        <Button
                          size="sm"
                          type="button"
                          onClick={handleDownloadOfferLetter}
                          className="h-8 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg gap-1.5 shadow-2xs"
                        >
                          <Download className="h-3 w-3" /> Download Offer Letter
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. SPECIALIZATION INTERVIEW OBSERVATIONS & FEEDBACK */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                      <Stethoscope className="h-3.5 w-3.5 text-indigo-600" />
                      Specialization Interview Assessment
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">
                      {appliedList.length} Applied
                    </span>
                  </div>

                  {appliedList.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50 text-center text-slate-400 text-xs font-bold border border-slate-200">
                      No specialization preferences attached to this candidate.
                    </div>
                  ) : (
                    appliedList.map((spec, idx) => {
                      const current = specialityMarks[spec.specialityId] || { score: "", remarks: "" };
                      return (
                        <div key={spec.specialityId} className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="h-5 w-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <span className="font-black text-xs text-indigo-950">{spec.specialityName}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-bold border-indigo-300 text-indigo-800 bg-white">
                              Preference {spec.preferenceOrder || idx + 1}
                            </Badge>
                          </div>

                          <Textarea
                            placeholder="Doctor / Panel clinical & surgical remarks for this specialty..."
                            value={current.remarks}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSpecialityMarks(prev => ({
                                ...prev,
                                [spec.specialityId]: { ...prev[spec.specialityId], remarks: val, score: prev[spec.specialityId]?.score || "" }
                              }));
                            }}
                            className="text-xs rounded-xl border-indigo-100 bg-white min-h-[60px]"
                          />
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 3. OVERALL INTERVIEW NOTES */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Overall Panel Decision Notes & Allocation Remarks
                  </Label>
                  <Textarea
                    placeholder="Enter general candidate observations, panel agreement, or special instructions..."
                    value={overallRemarks}
                    onChange={(e) => setOverallRemarks(e.target.value)}
                    className="text-xs rounded-xl border-slate-200 bg-white min-h-[70px]"
                  />
                </div>

                {/* 4. CALL & OFFER LETTERS QUICK ACTIONS */}
                <div className="p-4 rounded-2xl bg-slate-100/80 border border-slate-200 space-y-2.5">
                  <span className="text-[11px] font-black uppercase text-slate-600 tracking-wider block">
                    Official Admission Letters
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadCallLetter}
                      className="h-9 text-xs font-bold rounded-xl bg-white border-slate-300 hover:bg-slate-50 text-slate-800 justify-start gap-2"
                    >
                      <Mail className="h-3.5 w-3.5 text-blue-600" /> Call Letter PDF
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadOfferLetter}
                      className="h-9 text-xs font-bold rounded-xl bg-white border-purple-300 hover:bg-purple-50 text-purple-900 justify-start gap-2"
                    >
                      <Award className="h-3.5 w-3.5 text-purple-600" /> Offer Letter PDF
                    </Button>
                  </div>
                </div>

              </div>

              {/* Bottom Action Footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="rounded-xl h-11 px-5 font-bold text-xs"
                >
                  Close
                </Button>
                <Button
                  onClick={() => saveDecisionMutation.mutate()}
                  disabled={saveDecisionMutation.isPending}
                  className="rounded-xl h-11 px-6 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs uppercase tracking-wider gap-2 shadow-sm"
                >
                  {saveDecisionMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Save Interview Decision
                </Button>
              </div>
            </div>

          </div>
        )}
      </DialogContent>

      <SeatMatrixModal
        open={seatMatrixOpen}
        onClose={() => setSeatMatrixOpen(false)}
      />
    </Dialog>
  );
}
