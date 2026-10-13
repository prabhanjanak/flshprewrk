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
  User, GraduationCap, Stethoscope, FileText,
  Star, ExternalLink, Loader2, CheckCircle2,
  AlertCircle, Building2, Phone, Mail,
  Calendar, MapPin, Award, BookOpen,
  Sparkles, Check, X, ShieldAlert
} from "lucide-react";

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
  
  // Marks state
  const [psychometricScore, setPsychometricScore] = useState<string>("");
  const [specialityMarks, setSpecialityMarks] = useState<Record<number, { score: string; remarks: string }>>({});

  const { data: candidate, isLoading, refetch } = useQuery<any>({
    queryKey: ["candidate-examination-detail", candidateId],
    queryFn: () => api.get(`/candidates/${candidateId}`),
    enabled: !!candidateId && open,
  });

  // Populate marks when candidate details load
  useEffect(() => {
    if (candidate) {
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

  const saveMarksMutation = useMutation({
    mutationFn: async () => {
      if (!candidateId) throw new Error("No candidate selected");

      // Validate psychometric score
      if (psychometricScore.trim() === "") {
        throw new Error("Psychometry score is mandatory. Please enter a score between 0 and 10.");
      }

      const psychoNum = parseFloat(psychometricScore);
      if (isNaN(psychoNum) || psychoNum < 0 || psychoNum > 10) {
        throw new Error("Psychometry score must be a number between 0 and 10.");
      }

      const specialityScores = Object.entries(specialityMarks).map(([specIdStr, data]) => {
        const specId = Number(specIdStr);
        const scoreVal = data.score.trim() !== "" ? parseFloat(data.score) : null;
        return {
          specialityId: specId,
          score: scoreVal !== null ? scoreVal : 0,
          remarks: data.remarks.trim() || undefined,
        };
      }).filter(item => item.score !== null && item.score >= 0);

      return api.post(`/candidates/${candidateId}/doctor-marks`, {
        psychometricScore: psychoNum,
        specialityScores,
      });
    },
    onSuccess: () => {
      toast({
        title: "Marks Saved Successfully",
        description: `Scores for ${candidate?.fullName || "Candidate"} updated.`,
      });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["doctor-assignments"] });
      qc.invalidateQueries({ queryKey: ["interview-scores"] });
      qc.invalidateQueries({ queryKey: ["candidate-examination-detail", candidateId] });
      refetch();
      if (onSaved) onSaved();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to Save Marks",
        description: err.response?.data?.error || err.message,
        variant: "destructive",
      });
    },
  });

  const sub = candidate?.submission;
  const token = typeof window !== "undefined" ? localStorage.getItem("fellowship_token") : "";

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
              onClick={() => {
                if (candidateId) {
                  window.open(`/api/candidates/${candidateId}/application-pdf?token=${token}`, "_blank");
                }
              }}
              className="text-xs bg-white/10 hover:bg-white/20 text-white border-white/20 font-bold gap-1.5 h-8 px-3 rounded-lg shadow-sm"
              title="Download official candidate application dossier as PDF"
            >
              <FileText className="h-3.5 w-3.5 text-orange-400" />
              Download Application PDF
            </Button>
            {candidate?.submissionId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(`/api/submission-view/${candidate.submissionId}?token=${token}`, "_blank")}
                className="text-xs text-orange-300 hover:text-white hover:bg-white/10 font-bold gap-1.5 h-8 px-3 rounded-lg"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Full Form Tab
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

            {/* RIGHT COLUMN: SMART MARKS ENTRY PANEL (5 cols) */}
            <div className="lg:col-span-5 bg-white flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/80 shrink-0 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    Examination Marks Entry
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                    Enter psychometry and candidate's applied specializations.
                  </p>
                </div>
                <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] font-black uppercase">
                  Candidate Exam
                </Badge>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5 fancy-scrollbar">
                
                {/* 1. MANDATORY PSYCHOMETRY SCORE */}
                <div className="p-4 rounded-2xl bg-amber-50/70 border-2 border-amber-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-black uppercase text-amber-950 tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                      Psychometry Marks (Mind Matters)
                    </Label>
                    <Badge className="bg-amber-600 text-white text-[9px] font-black uppercase tracking-wider h-4.5 px-2">
                      Mandatory
                    </Badge>
                  </div>
                  <p className="text-[11px] text-amber-800 font-semibold">
                    Mandatory psychometric evaluation score on a scale of <strong>0 to 10 marks</strong>.
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      step="0.5"
                      value={psychometricScore}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || (Number(val) >= 0 && Number(val) <= 10)) {
                          setPsychometricScore(val);
                        }
                      }}
                      placeholder="0 – 10"
                      className="h-11 border-2 border-amber-300 focus:border-amber-500 rounded-xl font-mono font-black text-xl text-center bg-white"
                    />
                    <span className="text-xs font-bold text-amber-900 shrink-0">/ 10 Marks</span>
                  </div>
                </div>

                {/* 2. APPLIED SPECIALIZATION(S) MARKS */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5">
                      <Stethoscope className="h-3.5 w-3.5 text-indigo-600" />
                      Applied Specialization Marks (Max 50)
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
                        <div key={spec.specialityId} className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="h-5 w-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <span className="font-black text-xs text-indigo-950">{spec.specialityName}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-bold border-indigo-300 text-indigo-800 bg-white">
                              Max 50 Marks
                            </Badge>
                          </div>

                          <div className="flex items-center gap-3">
                            <Input
                              type="number"
                              min={0}
                              max={50}
                              step="0.5"
                              value={current.score}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "" || (Number(val) >= 0 && Number(val) <= 50)) {
                                  setSpecialityMarks(prev => ({
                                    ...prev,
                                    [spec.specialityId]: { ...prev[spec.specialityId], score: val, remarks: prev[spec.specialityId]?.remarks || "" }
                                  }));
                                }
                              }}
                              placeholder="0 – 50"
                              className="h-11 border-2 border-indigo-200 focus:border-indigo-500 rounded-xl font-mono font-black text-xl text-center bg-white"
                            />
                            <span className="text-xs font-bold text-indigo-900 shrink-0">/ 50 Marks</span>
                          </div>

                          <Input
                            type="text"
                            placeholder="Viva feedback / remarks (optional)..."
                            value={current.remarks}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSpecialityMarks(prev => ({
                                ...prev,
                                [spec.specialityId]: { ...prev[spec.specialityId], remarks: val, score: prev[spec.specialityId]?.score || "" }
                              }));
                            }}
                            className="h-9 text-xs rounded-xl border-indigo-100 bg-white"
                          />
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 3. TOTAL SCORE SUMMARY PREVIEW */}
                <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2.5 shadow-md">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>MCQ Exam Score</span>
                    <span className="font-mono text-white">{candidate?.mcqScore != null ? candidate.mcqScore : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                    <span>Psychometry (Mind Matters)</span>
                    <span className="font-mono">{psychometricScore || "0"} / 10</span>
                  </div>
                  <div className="border-t border-white/10 pt-2 flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-orange-400">Total Merit Preview</span>
                    <span className="text-xl font-black font-mono text-white">
                      {(() => {
                        const mcq = candidate?.mcqScore ? Number(candidate.mcqScore) : 0;
                        const psy = psychometricScore ? Number(psychometricScore) : 0;
                        const specVals = Object.values(specialityMarks).map(v => Number(v.score) || 0);
                        const topSpec = specVals.length > 0 ? Math.max(...specVals) : 0;
                        return (mcq + psy + topSpec).toFixed(1);
                      })()}
                    </span>
                  </div>
                </div>

              </div>

              {/* Bottom Action Footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0 flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="rounded-xl h-11 px-5 font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => saveMarksMutation.mutate()}
                  disabled={saveMarksMutation.isPending || !psychometricScore}
                  className="rounded-xl h-11 px-6 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs uppercase tracking-wider gap-2 shadow-sm"
                >
                  {saveMarksMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Save & Confirm Marks
                </Button>
              </div>
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
