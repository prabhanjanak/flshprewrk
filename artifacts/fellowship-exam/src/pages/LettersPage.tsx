import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useToast } from "../hooks/use-toast";
import {
  Download,
  Mail,
  Send,
  Sparkles,
  Search,
  Building2,
  GraduationCap,
  Calendar,
  Clock,
  MapPin,
  Eye,
  IndianRupee,
  Loader2,
  RefreshCw,
  Award,
  Users,
  Edit3,
  CheckCircle2,
  FileCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import sefLogoUrl from "/assets/sankara_eye_foundation_logo.png";
import savLogoUrl from "/assets/sankara_academy_vision_logo.png";

interface Candidate {
  id: number;
  candidateCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: string;
  unitId: number | null;
  address: string | null;
  dateOfBirth: string | null;
  specialization?: string | null;
  reviewNotes?: string | null;
}

interface Unit {
  id: number;
  name: string;
  code: string;
}

const UNIT_CMO_MAP: Record<string, string> = {
  Jaipur: "Dr. Neeraj Shah - Chief Medical Officer",
  Bangalore: "Dr. Kaushik Murali - Chief Medical Officer",
  Coimbatore: "Dr. R. V. Ramani - Founder & Managing Trustee",
  Kanpur: "Dr. S. K. Rastogi - Chief Medical Officer",
  Chennai: "Dr. Prema Raman - Senior Consultant & CMO",
  Anand: "Dr. Bhaskar Srinivasan - Chief Medical Officer",
  Guntur: "Dr. J. Ramaswamy - Chief Medical Officer",
  Shimoga: "Dr. P. Hegde - Chief Medical Officer",
  Ludhiana: "Dr. G. S. Gill - Chief Medical Officer",
  Varanasi: "Dr. A. K. Singh - Chief Medical Officer",
  Hyderabad: "Dr. M. S. Reddy - Chief Medical Officer",
  Indore: "Dr. V. Sharma - Chief Medical Officer",
  Panvel: "Dr. N. Kulkarni - Chief Medical Officer",
  Krishnankoil: "Dr. S. Meenakshi - Chief Medical Officer",
};

const DEFAULT_CANDIDATE: Candidate = {
  id: 0,
  candidateCode: "SAV-2027-001",
  fullName: "Tejaswini",
  email: "tejaswini@sankaraeye.com",
  phone: "+91 98765 43210",
  status: "approved",
  unitId: 1,
  address: "Sankara Eye Hospital Campus, Kundalahalli Gate, Bangalore – 560037",
  dateOfBirth: null,
  specialization: "Vitreo Retina",
};

function cleanDoctorName(rawName: string | null | undefined): string {
  if (!rawName) return "";
  return rawName.replace(/^(?:\s*(?:dr\.?|doctor)\s*)+/gi, "").trim();
}

export default function LettersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"call_letters" | "offer_letters">("call_letters");

  // Call letters search & filter
  const [searchTerm, setSearchTerm] = useState("");
  const [streamFilter, setStreamFilter] = useState<"all" | "retina" | "anterior">("all");

  // Customizer state
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(0);
  const [customName, setCustomName] = useState<string>("Tejaswini");
  const [customCandidateCode, setCustomCandidateCode] = useState<string>("SAV-2027-001");
  const [customAddress, setCustomAddress] = useState<string>("Sankara Eye Hospital Campus, Kundalahalli Gate, Bangalore – 560037");
  const [customPhone, setCustomPhone] = useState<string>("+91 98765 43210");
  const [customEmail, setCustomEmail] = useState<string>("tejaswini@sankaraeye.com");
  const [customSpecialty, setCustomSpecialty] = useState<string>("Vitreo Retina");
  const [customUnitId, setCustomUnitId] = useState<number>(1); // Default Bangalore
  const [customUnitName, setCustomUnitName] = useState<string>("Bangalore");
  const [customCmo, setCustomCmo] = useState<string>("Dr. Kaushik Murali - Chief Medical Officer");
  const [customStipend, setCustomStipend] = useState<string>("40000");
  const [customEffectiveDate, setCustomEffectiveDate] = useState<string>("1st January 2027");
  const [customDuration, setCustomDuration] = useState<number>(24);
  const [customInterviewDate, setCustomInterviewDate] = useState<string>("1st June 2026, Monday");
  const [customReportingTime, setCustomReportingTime] = useState<string>("8:00 AM Sharp");
  const [customVenue, setCustomVenue] = useState<string>(
    "Sankara Eye Hospital, Varthur Main Road, Kundalahalli Gate, Bangalore – 560037"
  );
  const [customInductionDate, setCustomInductionDate] = useState<string>(
    "2nd & 3rd July 2026 at Bangalore Main Hospital (For Testing Only)"
  );

  // Loading states
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

  // Fetch Candidates
  const { data: candidates = [], isLoading: loadingCandidates, refetch: refetchCandidates } = useQuery<Candidate[]>({
    queryKey: ["candidates"],
    queryFn: async () => {
      const res: any = await api.get("/candidates");
      return res || [];
    },
  });

  // Fetch Units
  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["units"],
    queryFn: async () => {
      const res: any = await api.get("/units");
      return res || [];
    },
  });

  const isRetina = (c: Candidate) => {
    const spec = (c.specialization || c.reviewNotes || "").toLowerCase();
    return spec.includes("retina") || spec.includes("vrs") || spec.includes("vitreo");
  };

  const getCandidateSpecialty = (c: Candidate) => {
    if (c.reviewNotes && c.reviewNotes.includes("Allocated to ")) {
      return c.reviewNotes.replace("Allocated to ", "").split(" [")[0];
    }
    if (c.specialization) {
      try {
        const parsed = JSON.parse(c.specialization);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
      } catch (e) {
        return c.specialization;
      }
    }
    return "Cataract & IOL";
  };

  // Sync first candidate on load if candidates exist and no candidate was explicitly chosen
  useEffect(() => {
    if (candidates.length > 0 && selectedCandidateId && selectedCandidateId > 0) {
      const found = candidates.find((c) => c.id === selectedCandidateId);
      if (found) handleSelectCandidate(found);
    }
  }, [candidates]);

  const handleSelectCandidate = (cand: Candidate) => {
    setSelectedCandidateId(cand.id);
    setCustomCandidateCode(cand.candidateCode || "SAV-2027-001");
    setCustomName(cleanDoctorName(cand.fullName));
    setCustomAddress(cand.address || "Sankara Eye Hospital Campus, Kundalahalli Gate, Bangalore – 560037");
    setCustomPhone(cand.phone || "");
    setCustomEmail(cand.email || "");

    const spec = getCandidateSpecialty(cand);
    setCustomSpecialty(spec);

    const isRet = isRetina(cand);
    setCustomDuration(isRet ? 24 : 18);
    setCustomInterviewDate(isRet ? "1st June 2026, Monday" : "8th June 2026, Monday");

    const uId = cand.unitId || 1;
    setCustomUnitId(uId);
    const uName = units.find((u) => u.id === uId)?.name || "Bangalore";
    setCustomUnitName(uName);
    setCustomCmo(UNIT_CMO_MAP[uName] || "Dr. Kaushik Murali - Chief Medical Officer");
  };

  const handleUnitChange = (uId: number) => {
    setCustomUnitId(uId);
    const uName = units.find((u) => u.id === uId)?.name || "Bangalore";
    setCustomUnitName(uName);
    setCustomCmo(UNIT_CMO_MAP[uName] || "Chief Medical Officer");
  };

  const filteredCandidates = candidates.filter((c) => {
    const matchesSearch =
      c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.candidateCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getCandidateSpecialty(c).toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (streamFilter === "retina") return isRetina(c);
    if (streamFilter === "anterior") return !isRetina(c);
    return true;
  });

  const retinaCount = candidates.filter((c) => isRetina(c)).length;
  const anteriorCount = candidates.filter((c) => !isRetina(c)).length;

  const activeCandidate = (selectedCandidateId && selectedCandidateId !== 0)
    ? (candidates.find((c) => c.id === selectedCandidateId) || DEFAULT_CANDIDATE)
    : DEFAULT_CANDIDATE;

  // Download Call Letter PDF Handler
  const handleDownloadCallLetter = async (candidate?: Candidate) => {
    const target = candidate || activeCandidate || DEFAULT_CANDIDATE;
    const targetId = target?.id ?? 0;

    const key = `call_${targetId}`;
    setDownloadingId(key);
    try {
      const token = localStorage.getItem("fellowship_token") || "";
      const isRet = target.specialization ? isRetina(target) : customSpecialty.toLowerCase().includes("retina");
      const docName = targetId === 0 ? customName : target.fullName;
      const code = targetId === 0 ? customCandidateCode : target.candidateCode;

      const queryParams = new URLSearchParams({
        token,
        candidateName: docName ? `Dr. ${cleanDoctorName(docName)}` : "Dr. Candidate",
        candidateCode: code || "SAV-2027-001",
        interviewDate: customInterviewDate,
        reportingTime: customReportingTime,
        venue: customVenue,
        specialization: customSpecialty || getCandidateSpecialty(target),
        email: target.email || customEmail,
        phone: target.phone || customPhone,
        address: target.address || customAddress,
      });

      const res = await fetch(`/api/candidates/${targetId}/call-letter-pdf?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to download Call Letter" }));
        throw new Error(err.error || "Failed to download Call Letter");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Interview_Call_Letter_${isRet ? "Retina" : "Anterior"}_${code || "SAV-2027-001"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Official Call Letter Downloaded",
        description: `Generated with official Sankara branding for Dr. ${cleanDoctorName(docName)}.`,
      });
    } catch (e: any) {
      toast({ title: "Download Failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  // Send Call Letter Email Handler
  const handleSendCallLetter = async (candidate?: Candidate) => {
    const target = candidate || activeCandidate;
    if (!target || target.id === 0) {
      toast({
        title: "Registration Required",
        description: "Email dispatch requires a registered candidate with an email address.",
        variant: "destructive"
      });
      return;
    }

    const key = `send_call_${target.id}`;
    setSendingEmailId(key);
    try {
      await api.post(`/candidates/${target.id}/send-call-letter`, {
        interviewDate: customInterviewDate,
        reportingTime: customReportingTime,
        venue: customVenue,
        specialization: customSpecialty,
      });

      toast({
        title: "Call Letter Dispatched",
        description: `Official Call Letter with PDF sent to ${target.email} via SMTP.`,
      });
      qc.invalidateQueries({ queryKey: ["candidates"] });
    } catch (e: any) {
      toast({ title: "Failed to Send Email", description: e.response?.data?.error || e.message, variant: "destructive" });
    } finally {
      setSendingEmailId(null);
    }
  };

  // Download Offer Letter PDF Handler
  const handleDownloadOfferLetter = async (candidate?: Candidate) => {
    const target = candidate || activeCandidate || DEFAULT_CANDIDATE;
    const targetId = target?.id ?? 0;

    const key = `offer_${targetId}`;
    setDownloadingId(key);
    try {
      const token = localStorage.getItem("fellowship_token") || "";
      const stipendNum = Number(customStipend.replace(/[^0-9]/g, "") || 40000);
      const docName = targetId === 0 ? customName : (customName || target.fullName);
      const code = targetId === 0 ? customCandidateCode : target.candidateCode;

      const queryParams = new URLSearchParams({
        token,
        candidateName: docName ? `Dr. ${cleanDoctorName(docName)}` : "Dr. Candidate",
        candidateCode: code || "SAV-2027-001",
        address: customAddress || target.address || "",
        specialization: customSpecialty,
        unitName: customUnitName,
        cmoName: customCmo,
        stipend: `Rs ${stipendNum.toLocaleString("en-IN")}`,
        duration: String(customDuration),
        effectiveDate: customEffectiveDate,
        interviewDate: customInterviewDate,
        inductionDate: customInductionDate,
      });

      const res = await fetch(`/api/candidates/${targetId}/offer-letter-pdf?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to download Offer Letter" }));
        throw new Error(err.error || "Failed to download Offer Letter");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Fellowship_Offer_Letter_${code || "SAV-2027-001"}_${customSpecialty.replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Official Offer Letter Downloaded",
        description: `Generated with official SEF & SAV logos for Dr. ${cleanDoctorName(docName)} (Stipend: ₹${stipendNum.toLocaleString("en-IN")}).`,
      });
    } catch (e: any) {
      toast({ title: "Download Failed", description: e.message, variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  // Send Offer Letter Email Handler
  const handleSendOfferLetter = async (candidate?: Candidate) => {
    const target = candidate || activeCandidate;
    if (!target) return;

    const key = `send_offer_${target.id}`;
    setSendingEmailId(key);
    try {
      const stipendNum = Number(customStipend.replace(/[^0-9]/g, "") || 40000);

      await api.post(`/candidates/${target.id}/send-offer-letter`, {
        candidateName: customName || target.fullName,
        address: customAddress || target.address || "",
        specialization: customSpecialty,
        unitName: customUnitName,
        cmoName: customCmo,
        stipend: stipendNum,
        duration: customDuration,
        interviewDate: customInterviewDate,
        effectiveDate: customEffectiveDate,
        inductionDate: customInductionDate,
      });

      toast({
        title: "Offer Letter Sent",
        description: `Formal Fellowship Offer Letter emailed to ${target.email}.`,
      });
      qc.invalidateQueries({ queryKey: ["candidates"] });
    } catch (e: any) {
      toast({ title: "Failed to Send Email", description: e.response?.data?.error || e.message, variant: "destructive" });
    } finally {
      setSendingEmailId(null);
    }
  };

  return (
    <div className="p-6 lg:p-10 space-y-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#0b4a8f] text-[10px] font-black uppercase tracking-widest mb-2">
            <Award className="w-3.5 h-3.5" />
            Admissions & Communications Center
          </div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
            Official Letters & Communications Hub
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 font-medium mt-1">
            Generate and dispatch official <strong>Interview Call Letters</strong> and{" "}
            <strong>Fellowship Offer Letters</strong> featuring authentic institutional logos & headers.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => refetchCandidates()}
          className="rounded-xl border-slate-200 text-xs font-bold self-start sm:self-auto gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Records
        </Button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-slate-200/80 bg-white shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Doctors</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{candidates.length}</p>
          <span className="text-[10px] text-slate-500 font-medium">Eligible candidates</span>
        </Card>

        <Card className="rounded-2xl border-purple-100 bg-purple-50/40 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-purple-600">Retina Stream</span>
            <Eye className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-2xl font-black text-purple-900 mt-2">{retinaCount}</p>
          <span className="text-[10px] text-purple-700 font-semibold">1st June 2026 (8:00 AM)</span>
        </Card>

        <Card className="rounded-2xl border-blue-100 bg-blue-50/40 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Anterior Stream</span>
            <GraduationCap className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-blue-900 mt-2">{anteriorCount}</p>
          <span className="text-[10px] text-blue-700 font-semibold">8th June 2026 (8:00 AM)</span>
        </Card>

        <Card className="rounded-2xl border-emerald-100 bg-emerald-50/40 shadow-sm p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">SEF Hospital Units</span>
            <Building2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-900 mt-2">{units.length || 13}</p>
          <span className="text-[10px] text-emerald-700 font-semibold">All India Centers</span>
        </Card>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-6">
        <TabsList className="grid grid-cols-2 max-w-md h-12 p-1 bg-slate-100/80 rounded-2xl border border-slate-200">
          <TabsTrigger
            value="call_letters"
            className="rounded-xl font-bold text-xs data-[state=active]:bg-[#0b4a8f] data-[state=active]:text-white transition-all flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            Interview Call Letters
          </TabsTrigger>
          <TabsTrigger
            value="offer_letters"
            className="rounded-xl font-bold text-xs data-[state=active]:bg-[#0b4a8f] data-[state=active]:text-white transition-all flex items-center justify-center gap-2"
          >
            <Award className="w-4 h-4" />
            Fellowship Offer Letters
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════ SUB-PANEL 1: INTERVIEW CALL LETTERS ═══════════════════ */}
        <TabsContent value="call_letters" className="space-y-6">
          {/* Stream Schedule Legend Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-purple-50/80 border border-purple-200/80 flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-purple-600 text-white shrink-0 shadow-sm">
                <Eye className="w-5 h-5" />
              </div>
              <div className="space-y-1 text-xs">
                <span className="font-black text-purple-950 block text-sm">Retina Fellowship Interviews</span>
                <p className="text-purple-900 font-semibold flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-purple-700" />
                  <strong>Date:</strong> 1st June 2026, Monday · 8:00 AM Sharp
                </p>
                <p className="text-purple-800 text-[11px]">
                  <strong>Streams:</strong> Vitreo Retina (24 Months) & Medical Retina (18 Months)
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200/80 flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-[#0b4a8f] text-white shrink-0 shadow-sm">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div className="space-y-1 text-xs">
                <span className="font-black text-blue-950 block text-sm">Anterior Segment & Subspecialties</span>
                <p className="text-blue-900 font-semibold flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-blue-700" />
                  <strong>Date:</strong> 8th June 2026, Monday · 8:00 AM Sharp
                </p>
                <p className="text-blue-800 text-[11px]">
                  <strong>Streams:</strong> Cornea, Glaucoma, Cataract/IOL, Paediatrics, Refractive, Oculoplasty
                </p>
              </div>
            </div>
          </div>

          {/* ══════════════ ON-DEMAND CALL LETTER GENERATOR CARD ══════════════ */}
          <Card className="rounded-2xl border-2 border-purple-200/80 bg-white shadow-md overflow-hidden">
            <CardHeader className="pb-4 bg-gradient-to-r from-purple-50/70 via-slate-50 to-white border-b border-purple-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-purple-700" />
                    Interactive Interview Call Letter Generator & Customizer
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 font-medium mt-0.5">
                    Generate official institutional <strong>Interview Call Letters</strong> with Sankara Academy of Vision branding, interview schedule, reporting instructions, and venue details.
                  </CardDescription>
                </div>

                <Badge className="bg-purple-700 text-white font-black text-[10px] uppercase tracking-wider px-3 py-1.5 self-start sm:self-auto shadow-sm">
                  Official Hall Ticket / Call Letter
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Candidate Selection (or On-Demand Test Doctor) */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Candidate / Target Mode *
                  </Label>
                  <select
                    value={selectedCandidateId || 0}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (val === 0) {
                        setSelectedCandidateId(0);
                        setCustomName("Tejaswini");
                        setCustomCandidateCode("SAV-2027-001");
                        setCustomSpecialty("Vitreo Retina");
                        setCustomDuration(24);
                        setCustomInterviewDate("1st June 2026, Monday");
                      } else {
                        const c = candidates.find((x) => x.id === val);
                        if (c) handleSelectCandidate(c);
                      }
                    }}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-sm"
                  >
                    <option value={0}>✨ On-Demand / Custom Doctor (Dr. {cleanDoctorName(customName) || "Tejaswini"})</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.candidateCode})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Doctor Name */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Doctor Full Name *
                  </Label>
                  <Input
                    value={customName}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/^(?:\s*(?:dr\.?|doctor)\s*)+/gi, "");
                      setCustomName(clean);
                    }}
                    placeholder="e.g. Tejaswini"
                    className="rounded-xl border-slate-200 text-xs font-bold h-10"
                  />
                  <span className="text-[10px] text-slate-400 font-medium block">
                    In Call Letter: <strong>Dr. {cleanDoctorName(customName || activeCandidate?.fullName)}</strong>
                  </span>
                </div>

                {/* 3. Candidate Code */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Registration Code *
                  </Label>
                  <Input
                    value={customCandidateCode}
                    onChange={(e) => setCustomCandidateCode(e.target.value)}
                    placeholder="e.g. SAV-2027-001"
                    className="rounded-xl border-slate-200 text-xs font-bold font-mono h-10 uppercase"
                  />
                </div>

                {/* 4. Subspecialty */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Interview Subspecialty *
                  </Label>
                  <select
                    value={customSpecialty}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomSpecialty(val);
                      const isRet = val.toLowerCase().includes("retina");
                      setCustomDuration(isRet ? 24 : 18);
                      setCustomInterviewDate(isRet ? "1st June 2026, Monday" : "8th June 2026, Monday");
                    }}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-sm"
                  >
                    <option value="Vitreo Retina">Vitreo Retina (Retina Stream)</option>
                    <option value="Medical Retina">Medical Retina (Retina Stream)</option>
                    <option value="Cataract & IOL">Cataract & IOL (Anterior Stream)</option>
                    <option value="Cornea & External Eye Diseases">Cornea & External Eye (Anterior Stream)</option>
                    <option value="Glaucoma">Glaucoma (Anterior Stream)</option>
                    <option value="Pediatric Ophthalmology & Strabismus">Pediatric Ophthalmology (Anterior Stream)</option>
                    <option value="Orbit & Oculoplasty">Orbit & Oculoplasty (Anterior Stream)</option>
                    <option value="Phaco Refractive">Phaco Refractive (Anterior Stream)</option>
                    <option value="Comprehensive Ophthalmology">Comprehensive (Anterior Stream)</option>
                  </select>
                </div>

                {/* 5. Interview Date */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Interview Date *
                  </Label>
                  <Input
                    value={customInterviewDate}
                    onChange={(e) => setCustomInterviewDate(e.target.value)}
                    placeholder="e.g. 1st June 2026, Monday"
                    className="rounded-xl border-slate-200 text-xs font-medium h-10"
                  />
                </div>

                {/* 6. Reporting Time */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Reporting Time *
                  </Label>
                  <Input
                    value={customReportingTime}
                    onChange={(e) => setCustomReportingTime(e.target.value)}
                    placeholder="e.g. 8:00 AM Sharp"
                    className="rounded-xl border-slate-200 text-xs font-medium h-10"
                  />
                </div>

                {/* 7. Interview Venue */}
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Interview Venue *
                  </Label>
                  <Input
                    value={customVenue}
                    onChange={(e) => setCustomVenue(e.target.value)}
                    placeholder="Venue Address"
                    className="rounded-xl border-slate-200 text-xs font-medium h-10"
                  />
                </div>
              </div>

              {/* Call Letter Action Strip */}
              <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-600 text-white shrink-0 shadow-xs">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="text-xs">
                    <p className="font-black text-purple-950">
                      Ready to generate Call Letter for Dr. {cleanDoctorName(customName || "Tejaswini")}
                    </p>
                    <p className="text-purple-800 font-medium">
                      Stream: <strong>{customSpecialty.toLowerCase().includes("retina") ? "Retina Stream (1st June 2026)" : "Anterior Stream (8th June 2026)"}</strong> &bull; Code: <strong>{customCandidateCode}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    onClick={() => handleDownloadCallLetter()}
                    disabled={downloadingId === `call_${activeCandidate?.id || 0}`}
                    className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs h-10 px-5 rounded-xl shadow-sm cursor-pointer w-full sm:w-auto gap-2"
                  >
                    {downloadingId === `call_${activeCandidate?.id || 0}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Download Official Call Letter PDF
                  </Button>
                </div>
              </div>

              {/* Live Visual Call Letter Mockup Box (With Real Header Logos) */}
              <div className="p-6 rounded-2xl bg-slate-50 border-2 border-slate-200/80 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-[#0b4a8f]" />
                    Official Call Letter Layout Preview
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">Standard A4 Document Preview</span>
                </div>

                {/* Document Paper Mockup */}
                <div className="bg-white p-6 md:p-8 rounded-xl border border-slate-200 shadow-sm space-y-4 max-w-3xl mx-auto font-sans text-slate-800 text-xs">
                  {/* Logos Header Bar */}
                  <div className="flex items-center justify-between border-b-2 border-[#0b4a8f] pb-3">
                    <img src={sefLogoUrl} alt="Sankara Eye Foundation" className="h-10 object-contain" />
                    <div className="text-center px-4">
                      <h2 className="text-sm font-black text-[#0b4a8f] tracking-wide uppercase">
                        Sankara Academy of Vision
                      </h2>
                      <p className="text-[9px] text-slate-600">
                        Educational unit of Sankara Eye Foundation, India · Sri Kanchi Kamakoti Medical Trust
                      </p>
                      <p className="text-[8px] text-slate-400">
                        www.sankaraeye.com · radhika@sankaraeye.com
                      </p>
                    </div>
                    <img src={savLogoUrl} alt="Academy of Vision" className="h-12 object-contain" />
                  </div>

                  {/* Title Banner */}
                  <div className="bg-[#0b4a8f] text-white text-center py-2 px-3 rounded-md font-bold text-xs uppercase tracking-wide">
                    {customSpecialty.toLowerCase().includes("retina")
                      ? "FELLOWSHIP INTERVIEW CALL LETTER — VITREO RETINA (VR) & MEDICAL RETINA (MR)"
                      : "FELLOWSHIP INTERVIEW CALL LETTER — ANTERIOR SEGMENT & SUBSPECIALTIES"}
                  </div>

                  {/* Candidate Greeting Box */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <p className="font-bold text-sm text-[#0b4a8f]">
                      Dear Dr. {cleanDoctorName(customName || activeCandidate?.fullName || "Tejaswini")},
                    </p>
                    <p className="text-[11px] text-slate-600 font-medium">
                      Registration Code: <strong className="text-slate-900">{customCandidateCode}</strong> &bull; Subspecialty Stream: <strong className="text-slate-900">{customSpecialty}</strong> &bull; Email: <strong className="text-slate-900">{activeCandidate?.email || customEmail}</strong>
                    </p>
                  </div>

                  {/* Intro text */}
                  <div className="space-y-2 text-[11px] text-slate-700 leading-relaxed">
                    <p>
                      Thank you for your interest in the Fellowship programme at Sankara Eye Foundation, India (www.sankaraeye.com).
                    </p>
                    <p>
                      Sankara Eye Foundation is a group of 13 hospitals across the country with a medical and support team of 3000, performing over 200,000 vision restoring surgeries every year. Training at Sankara is coordinated by the Sankara Academy of Vision with state of the art diagnostic and surgical facilities.
                    </p>
                  </div>

                  {/* Subspecialty Phase Structure Table */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                    <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 font-bold text-[11px] text-[#0b4a8f] uppercase tracking-wider">
                      Subspecialty Training Structure & Timeline
                    </div>
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black text-slate-600 uppercase border-b border-slate-200">
                          <th className="py-1.5 px-3">Subspecialty</th>
                          <th className="py-1.5 px-3">Phase#1 (IOL) Duration</th>
                          <th className="py-1.5 px-3">Phase#2 Speciality</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr className="bg-white"><td className="py-1 px-3 font-semibold">Cataract & IOL</td><td className="py-1 px-3">18 Months</td><td className="py-1 px-3 text-slate-400">Not applicable</td></tr>
                        <tr className="bg-slate-50/50"><td className="py-1 px-3 font-semibold">Medical Retina*</td><td className="py-1 px-3">18 months</td><td className="py-1 px-3 text-slate-400">Not applicable</td></tr>
                        <tr className="bg-white"><td className="py-1 px-3 font-semibold">Vitreo Retina</td><td className="py-1 px-3 text-slate-400">Not applicable</td><td className="py-1 px-3 font-bold text-[#0b4a8f]">24 months</td></tr>
                        <tr className="bg-slate-50/50"><td className="py-1 px-3 font-semibold">Glaucoma</td><td className="py-1 px-3">6 months</td><td className="py-1 px-3 font-bold text-[#0b4a8f]">18 months</td></tr>
                        <tr className="bg-white"><td className="py-1 px-3 font-semibold">Pediatric Ophthalmology & Strabismus</td><td className="py-1 px-3">6 months</td><td className="py-1 px-3 font-bold text-[#0b4a8f]">18 months</td></tr>
                        <tr className="bg-slate-50/50"><td className="py-1 px-3 font-semibold">Cornea</td><td className="py-1 px-3">6 months</td><td className="py-1 px-3 font-bold text-[#0b4a8f]">18 months</td></tr>
                        <tr className="bg-white"><td className="py-1 px-3 font-semibold">Phaco Refractive</td><td className="py-1 px-3">6 months</td><td className="py-1 px-3 font-bold text-[#0b4a8f]">18 months</td></tr>
                        <tr className="bg-slate-50/50"><td className="py-1 px-3 font-semibold">Oculoplasty</td><td className="py-1 px-3">6 months</td><td className="py-1 px-3 font-bold text-[#0b4a8f]">18 months</td></tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Selection Assessment & Interview Schedule Card */}
                  <div className="rounded-xl border-2 border-[#0b4a8f] overflow-hidden bg-slate-50/60 shadow-xs">
                    <div className="bg-[#0b4a8f] text-white px-3 py-1.5 font-bold text-xs uppercase tracking-wider flex items-center justify-between">
                      <span>Selection Assessment & Interview Schedule</span>
                      <span className="text-[10px] text-blue-200">Mandatory In-Person Presence</span>
                    </div>
                    <div className="p-3 space-y-2 text-xs">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-500 w-28 uppercase text-[10px]">Date & Day:</span>
                        <span className="font-black text-sm text-[#0b4a8f]">{customInterviewDate}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-500 w-28 uppercase text-[10px]">Reporting Time:</span>
                        <span className="font-bold text-slate-900">{customReportingTime}</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="font-bold text-slate-500 w-28 uppercase text-[10px] shrink-0">Venue Address:</span>
                        <span className="font-medium text-slate-800">{customVenue}</span>
                      </div>
                    </div>
                  </div>

                  {/* Key Updates */}
                  <div className="space-y-1 text-[11px] text-slate-700">
                    <p className="font-bold text-xs text-[#0b4a8f] uppercase tracking-wide">
                      Key Updates & Mandatory Regulations
                    </p>
                    <ol className="list-decimal pl-5 space-y-1 text-slate-600">
                      <li>PG (MS/MD/DNB) results must be cleared prior to final fellowship admission.</li>
                      <li>Applicants under Government bond or Compulsory Rural Service must submit 'No Objection Certificate' (NOC).</li>
                      <li>Selected fellows must submit State Medical Council NOC within 3 days of accepting the offer.</li>
                      <li>Mandatory 2-day induction program scheduled at Bangalore on 2nd & 3rd January 2027.</li>
                      <li>Unit reporting scheduled for 6th January 2027 with applicable monthly stipend.</li>
                    </ol>
                  </div>

                  {/* Coordinator Clarification banner */}
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-center font-bold text-xs text-amber-900">
                    For clarifications contact Radhika (Course Coordinator) on 9666677505.
                  </div>

                  {/* Document Footer */}
                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Sankara Academy of Vision · Educational unit of Sankara Eye Foundation, India</span>
                    <span>Official Institutional Document</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search doctor name, reg code, or specialty..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 rounded-xl border-slate-200 text-xs font-medium"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">Stream Filter:</span>
              <Button
                size="sm"
                variant={streamFilter === "all" ? "default" : "outline"}
                onClick={() => setStreamFilter("all")}
                className={`rounded-xl text-xs font-bold ${streamFilter === "all" ? "bg-slate-900 text-white" : ""}`}
              >
                All ({candidates.length})
              </Button>
              <Button
                size="sm"
                variant={streamFilter === "retina" ? "default" : "outline"}
                onClick={() => setStreamFilter("retina")}
                className={`rounded-xl text-xs font-bold ${
                  streamFilter === "retina" ? "bg-purple-700 text-white" : "text-purple-700"
                }`}
              >
                Retina ({retinaCount})
              </Button>
              <Button
                size="sm"
                variant={streamFilter === "anterior" ? "default" : "outline"}
                onClick={() => setStreamFilter("anterior")}
                className={`rounded-xl text-xs font-bold ${
                  streamFilter === "anterior" ? "bg-blue-700 text-white" : "text-blue-700"
                }`}
              >
                Anterior ({anteriorCount})
              </Button>
            </div>
          </div>

          {/* Candidates Call Letters Table */}
          <Card className="rounded-2xl border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-3.5 px-4">Doctor Profile</th>
                    <th className="py-3.5 px-4">Stream & Specialty</th>
                    <th className="py-3.5 px-4">Interview Schedule</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Official Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loadingCandidates ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#0b4a8f]" />
                        Loading candidate records...
                      </td>
                    </tr>
                  ) : filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center">
                        <div className="max-w-md mx-auto space-y-3">
                          <div className="w-12 h-12 rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center mx-auto text-purple-700">
                            <Calendar className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-sm">No registered candidate rows found.</p>
                            <p className="text-xs text-slate-500 mt-1">
                              Use the <strong>Interactive Generator above</strong> to customize dates, venues, or streams and download official Call Letters on-demand.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleDownloadCallLetter()}
                            className="bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl text-xs gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download Dr. {cleanDoctorName(customName) || "Tejaswini"} Call Letter PDF
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredCandidates.map((cand) => {
                      const retinaStream = isRetina(cand);
                      const specialty = getCandidateSpecialty(cand);
                      const isDownloading = downloadingId === `call_${cand.id}`;
                      const isSending = sendingEmailId === `send_call_${cand.id}`;

                      return (
                        <tr key={cand.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 text-sm">{cand.fullName}</div>
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                              <span className="font-bold text-[#0b4a8f]">{cand.candidateCode}</span>
                              <span>•</span>
                              <span>{cand.email}</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{specialty}</div>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider mt-1 ${
                                retinaStream
                                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                                  : "bg-blue-100 text-blue-800 border border-blue-200"
                              }`}
                            >
                              {retinaStream ? "🟣 Retina Stream (24 mo)" : "🔵 Anterior Stream (18-24 mo)"}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-black text-slate-900">
                              {retinaStream ? "1st June 2026, Monday" : "8th June 2026, Monday"}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>8:00 AM Sharp · Bangalore Main Hospital</span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                              ✓ Approved
                            </Badge>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isDownloading}
                                onClick={() => handleDownloadCallLetter(cand)}
                                className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 text-xs font-bold h-8 px-3 cursor-pointer"
                              >
                                {isDownloading ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                ) : (
                                  <Download className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                                )}
                                Download Call Letter
                              </Button>

                              <Button
                                size="sm"
                                disabled={isSending}
                                onClick={() => handleSendCallLetter(cand)}
                                className="rounded-xl bg-[#0b4a8f] hover:bg-[#08386b] text-white text-xs font-bold h-8 px-3 shadow-sm cursor-pointer"
                              >
                                {isSending ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                ) : (
                                  <Mail className="w-3.5 h-3.5 mr-1.5" />
                                )}
                                Send Gmail / SMTP
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ═══════════════════ SUB-PANEL 2: FELLOWSHIP OFFER LETTERS ═══════════════════ */}
        <TabsContent value="offer_letters" className="space-y-6">
          {/* Full Customizer Card with Live Visual Preview */}
          <Card className="rounded-2xl border-2 border-[#0b4a8f]/20 bg-white shadow-md overflow-hidden">
            <CardHeader className="pb-4 bg-gradient-to-r from-blue-50/60 via-slate-50 to-white border-b border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#0b4a8f]" />
                    Interactive Fellowship Offer Letter Generator & Customizer
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 font-medium mt-0.5">
                    Select a candidate, edit any detail (<strong>Name, Address, Specialty, Hospital Unit, Stipend ₹, CMO</strong>), and download the official PDF.
                  </CardDescription>
                </div>

                <Badge className="bg-[#0b4a8f] text-white font-black text-[10px] uppercase tracking-wider px-3 py-1.5 self-start sm:self-auto shadow-sm">
                  Official Institutional Format
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              {/* Form Input Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Candidate Select */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Select Candidate / Target Mode *
                  </Label>
                  <select
                    value={selectedCandidateId || 0}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (val === 0) {
                        setSelectedCandidateId(0);
                        setCustomName("Tejaswini");
                        setCustomCandidateCode("SAV-2027-001");
                        setCustomSpecialty("Vitreo Retina");
                        setCustomDuration(24);
                        setCustomInterviewDate("1st June 2026, Monday");
                      } else {
                        const c = candidates.find((x) => x.id === val);
                        if (c) handleSelectCandidate(c);
                      }
                    }}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-sm"
                  >
                    <option value={0}>✨ On-Demand / Custom Doctor (Dr. {cleanDoctorName(customName) || "Tejaswini"})</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.candidateCode})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Doctor Name (Editable) */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Doctor Full Name (Exclude 'Dr.') *
                  </Label>
                  <Input
                    value={customName}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/^(?:\s*(?:dr\.?|doctor)\s*)+/gi, "");
                      setCustomName(clean);
                    }}
                    placeholder="e.g. Aakanksha Bindal (do not type Dr.)"
                    className="rounded-xl border-slate-200 text-xs font-bold h-10"
                  />
                  <span className="text-[10px] text-slate-400 font-medium block">
                    In Letter: <strong>Dr. {cleanDoctorName(customName || activeCandidate?.fullName)}</strong>
                  </span>
                </div>

                {/* 3. Specialty (Dropdown) */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Allocated Subspecialty *
                  </Label>
                  <select
                    value={customSpecialty}
                    onChange={(e) => {
                      setCustomSpecialty(e.target.value);
                      const isRet = e.target.value.toLowerCase().includes("retina");
                      setCustomDuration(isRet ? 24 : 18);
                    }}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-sm"
                  >
                    <option value="Cataract & IOL">Cataract & IOL (18 Months)</option>
                    <option value="Vitreo Retina">Vitreo Retina (24 Months)</option>
                    <option value="Medical Retina">Medical Retina (18 Months)</option>
                    <option value="Cornea & External Eye Diseases">Cornea & Refractive (24 Months)</option>
                    <option value="Glaucoma">Glaucoma (24 Months)</option>
                    <option value="Pediatric Ophthalmology & Strabismus">Pediatric & Strabismus (24 Months)</option>
                    <option value="Orbit & Oculoplasty">Orbit & Oculoplasty (24 Months)</option>
                    <option value="Phaco Refractive">Phaco Refractive (24 Months)</option>
                    <option value="Comprehensive Ophthalmology">Comprehensive Ophthalmology (18 Months)</option>
                  </select>
                </div>

                {/* 4. Hospital Unit (Dropdown) */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Hospital Unit / Center *
                  </Label>
                  <select
                    value={customUnitId}
                    onChange={(e) => handleUnitChange(Number(e.target.value))}
                    className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 shadow-sm"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        Sankara Eye Hospital – {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. Address (Editable) */}
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Candidate Residential Address *
                  </Label>
                  <Input
                    value={customAddress}
                    onChange={(e) => setCustomAddress(e.target.value)}
                    placeholder="e.g. HINDI VIDHYA BHAWAN KE PASS, WARD NO 32, SIKAR"
                    className="rounded-xl border-slate-200 text-xs font-medium h-10"
                  />
                </div>

                {/* 6. Monthly Stipend (Editable Blank Box in INR) */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-[#0b4a8f] flex items-center gap-1">
                    <IndianRupee className="w-3 h-3" />
                    Monthly Stipend (INR ₹) *
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">₹</span>
                    <Input
                      type="number"
                      placeholder="e.g. 40000"
                      value={customStipend}
                      onChange={(e) => setCustomStipend(e.target.value)}
                      className="pl-7 rounded-xl border-blue-300 bg-white text-xs font-black text-[#0b4a8f] shadow-sm h-10"
                    />
                  </div>
                </div>

                {/* 7. Chief Medical Officer (Editable) */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Reporting Chief Medical Officer *
                  </Label>
                  <Input
                    value={customCmo}
                    onChange={(e) => setCustomCmo(e.target.value)}
                    placeholder="e.g. Dr. Neeraj Shah - Chief Medical Officer"
                    className="rounded-xl border-slate-200 text-xs font-medium h-10"
                  />
                </div>

                {/* 8. Mandatory Induction (Editable & Marked for Testing) */}
                <div className="sm:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Mandatory Induction Program *
                    </Label>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                      For Testing Only
                    </span>
                  </div>
                  <Input
                    value={customInductionDate}
                    onChange={(e) => setCustomInductionDate(e.target.value)}
                    placeholder="e.g. 2nd & 3rd July 2026 at Bangalore Main Hospital (For Testing Only)"
                    className="rounded-xl border-amber-300 bg-amber-50/20 text-xs font-semibold h-10"
                  />
                </div>
              </div>

              {/* Live Visual Letter Mockup Box (With Real Header Logos) */}
              <div className="p-6 rounded-2xl bg-slate-50 border-2 border-slate-200/80 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-[#0b4a8f]" />
                    Official Document Layout Preview
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">Standard Letter Size (612 × 792 pt)</span>
                </div>

                {/* Document Paper Mockup */}
                <div className="bg-white p-6 md:p-8 rounded-xl border border-slate-200 shadow-sm space-y-4 max-w-3xl mx-auto font-serif text-slate-800 text-xs">
                  {/* Logos Header Bar */}
                  <div className="flex items-center justify-between border-b-2 border-[#0b4a8f] pb-3">
                    <img src={sefLogoUrl} alt="Sankara Eye Foundation" className="h-10 object-contain" />
                    <div className="text-center px-4">
                      <h2 className="text-sm font-black text-[#0b4a8f] tracking-wide font-sans uppercase">
                        Sankara Academy of Vision
                      </h2>
                      <p className="text-[9px] text-slate-600 font-sans">
                        Educational unit of Sankara Eye Foundation, India
                      </p>
                    </div>
                    <img src={savLogoUrl} alt="Academy of Vision" className="h-12 object-contain" />
                  </div>

                  {/* Letter Body Preview */}
                  <div className="text-right text-[11px] font-bold text-slate-700">
                    Date: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  </div>

                  <div className="space-y-0.5">
                    <p className="font-bold text-sm text-slate-900">Dear Dr. {cleanDoctorName(customName || activeCandidate?.fullName)}</p>
                    <p className="text-[11px] text-slate-600 uppercase">{customAddress}</p>
                  </div>

                  <div className="text-center py-1">
                    <h3 className="font-bold text-sm text-[#0b4a8f] underline underline-offset-4">
                      Sub: Fellowship Offer Letter
                    </h3>
                  </div>

                  <p className="text-[11px] leading-relaxed">
                    This refers to your interview dated for our Fellowship program on <strong>{customInterviewDate}</strong>.
                  </p>

                  <p className="text-[11px] leading-relaxed">
                    <strong>Sankara Academy of Vision</strong>, Educational unit of{" "}
                    <strong>Sankara Eye Foundation, India</strong> is pleased to offer you fellowship in{" "}
                    <strong>{customSpecialty}</strong> at{" "}
                    <strong>Sankara Eye Hospital – {customUnitName}</strong> for a period of{" "}
                    <strong>{customDuration} Months</strong> effective <strong>{customEffectiveDate}</strong>. You shall
                    report to duty on <strong>{customEffectiveDate}</strong>.
                  </p>

                  {/* Structured Appointment & Reporting Authority Table */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                    <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 font-bold text-xs text-[#0b4a8f] uppercase tracking-wider font-sans">
                      Fellowship Appointment & Reporting Details
                    </div>
                    <table className="w-full text-left text-xs font-sans">
                      <tbody className="divide-y divide-slate-100">
                        <tr className="bg-white">
                          <td className="py-2 px-3 font-bold text-slate-500 w-1/3">Selected Doctor</td>
                          <td className="py-2 px-3 font-bold text-slate-900">Dr. {cleanDoctorName(customName || activeCandidate?.fullName)}</td>
                        </tr>
                        <tr className="bg-slate-50/60">
                          <td className="py-2 px-3 font-bold text-slate-500">Allocated Subspecialty</td>
                          <td className="py-2 px-3 font-bold text-[#0b4a8f]">{customSpecialty}</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="py-2 px-3 font-bold text-slate-500">Assigned Hospital Unit</td>
                          <td className="py-2 px-3 font-bold text-slate-900">Sankara Eye Hospital – {customUnitName}</td>
                        </tr>
                        <tr className="bg-slate-50/60">
                          <td className="py-2 px-3 font-bold text-slate-500">Reporting Authority</td>
                          <td className="py-2 px-3 font-bold text-emerald-800">{customCmo}</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="py-2 px-3 font-bold text-slate-500">Tenure & Start Date</td>
                          <td className="py-2 px-3 font-bold text-slate-900">{customDuration} Months (Effective from {customEffectiveDate})</td>
                        </tr>
                        <tr className="bg-slate-50/60">
                          <td className="py-2 px-3 font-bold text-slate-500">Monthly Stipend</td>
                          <td className="py-2 px-3 font-bold text-[#0b4a8f]">₹ {Number(customStipend || 40000).toLocaleString("en-IN")}/- per month</td>
                        </tr>
                        <tr className="bg-white">
                          <td className="py-2 px-3 font-bold text-slate-500">Mandatory Induction</td>
                          <td className="py-2 px-3 font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                            <span>{customInductionDate}</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                              For Testing Only
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Section A */}
                  <div className="space-y-1.5 pt-2">
                    <h4 className="font-bold text-xs text-[#0b4a8f] uppercase tracking-wide font-sans">
                      Section A: Stipend, Deposit & Core Leave Rules
                    </h4>
                    <ol className="list-decimal pl-5 space-y-1 text-[11px] leading-relaxed text-slate-700 font-sans">
                      <li><strong>Induction Program:</strong> Mandatory 2-day induction program scheduled at Sankara Eye Hospital, Bangalore on <strong>{customInductionDate}</strong>.</li>
                      <li><strong>Monthly Stipend:</strong> Stipend of ₹ {Number(customStipend || 40000).toLocaleString("en-IN")}/- per month subject to statutory deductions.</li>
                      <li><strong>Security Deposit:</strong> Entire 1st month stipend + 15 days of 2nd & 3rd months held interest-free until completion.</li>
                      <li><strong>Earned Leave:</strong> 1-day leave earned per month of tenure apart from declared holidays.</li>
                      <li><strong>Compliance:</strong> Strict adherence to the policies of Sankara Eye Foundation, India.</li>
                    </ol>
                  </div>

                  {/* Section B & C */}
                  <div className="space-y-1.5 pt-2">
                    <h4 className="font-bold text-xs text-[#0b4a8f] uppercase tracking-wide font-sans">
                      Section B: Hospital Regulations & Mandatory Documents
                    </h4>
                    <ol className="list-decimal pl-5 space-y-1 text-[11px] leading-relaxed text-slate-700 font-sans" start={6}>
                      <li><strong>Reporting CMO:</strong> Report to <strong>{customCmo}</strong> at Sankara Eye Hospital – {customUnitName}.</li>
                      <li><strong>Deputation:</strong> Possible deputation to other Sankara units (up to 3 months) to maximize surgical volume.</li>
                      <li><strong>SAV Uniform Policy:</strong> Mandatory wearing of institute-issued apron or scrubs while on duty.</li>
                      <li><strong>Mandatory Documents:</strong> Bring 3 photos, MBBS, DOMS/MS/DNB Degrees, Medical Council Registration, Fitness, and ID proofs.</li>
                      <li><strong>Acceptance Validation:</strong> Validate acceptance within 3 days via email to <strong>radhika@sankaraeye.com</strong>.</li>
                    </ol>
                  </div>

                  <p className="text-xs font-bold text-slate-800 pt-2 font-sans">
                    Our journey together will certainly be inspiring, challenging, rewarding and satisfying.
                  </p>

                  <div className="pt-3 flex items-end justify-between border-t border-slate-100">
                    <div>
                      <p className="text-xs font-sans">Wishing you the very best,</p>
                      <p className="font-bold text-sm text-[#0b4a8f] mt-1 font-sans">Dr. Kaushik Murali</p>
                      <p className="text-[10px] text-slate-500 font-sans">
                        President &bull; Medical Administration, Quality & Education
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={downloadingId === `offer_${activeCandidate?.id}`}
                        onClick={() => handleDownloadOfferLetter()}
                        className="rounded-xl border-slate-300 text-slate-800 font-bold hover:bg-slate-100 text-xs h-9 px-4 cursor-pointer font-sans"
                      >
                        {downloadingId === `offer_${activeCandidate?.id}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Download Offer PDF
                      </Button>

                      <Button
                        size="sm"
                        disabled={sendingEmailId === `send_offer_${activeCandidate?.id}`}
                        onClick={() => handleSendOfferLetter()}
                        className="rounded-xl bg-[#0b4a8f] hover:bg-[#08386b] text-white font-bold text-xs h-9 px-4 shadow-sm cursor-pointer font-sans"
                      >
                        {sendingEmailId === `send_offer_${activeCandidate?.id}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        ) : (
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Send Email with PDF
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Directory of Approved Doctors for Offer Letters */}
          <Card className="rounded-2xl border-slate-200/80 bg-white shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#0b4a8f]" />
                    Approved Doctors Directory — 1-Click Offer Actions
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 font-medium mt-0.5">
                    Click <strong>"Configure"</strong> to populate the generator above, or 1-click download/email the official Offer Letter PDF.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs font-bold bg-white text-slate-700">
                  {candidates.length} Total Candidates
                </Badge>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Doctor Name</th>
                    <th className="py-3 px-4">Allocated Specialty</th>
                    <th className="py-3 px-4">Assigned Hospital Unit</th>
                    <th className="py-3 px-4">Duration & Stipend</th>
                    <th className="py-3 px-4 text-right">Offer Letter Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {candidates.length === 0 ? (
                    <tr className="bg-blue-50/30">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          Dr. {cleanDoctorName(customName || "Tejaswini")}
                          <Badge className="bg-purple-100 text-purple-700 text-[9px] font-black uppercase">
                            On-Demand Doctor
                          </Badge>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                          <span className="font-bold text-[#0b4a8f]">{customCandidateCode || "SAV-2027-001"}</span>
                          <span>•</span>
                          <span>{customEmail}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{customSpecialty}</div>
                        <span className="text-[10px] text-slate-500">{customDuration} Months</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          Sankara Eye Hospital – {customUnitName}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-black text-[#0b4a8f] flex items-center gap-1">
                          <IndianRupee className="w-3 h-3" />
                          {Number(customStipend || 40000).toLocaleString("en-IN")} / month
                        </div>
                        <span className="text-[10px] text-slate-400">Customizable in editor</span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            className="rounded-xl text-xs font-bold h-8 px-3 bg-[#0b4a8f] text-white"
                          >
                            <Edit3 className="w-3.5 h-3.5 mr-1" />
                            Active in Preview
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={downloadingId === `offer_0`}
                            onClick={() => handleDownloadOfferLetter()}
                            className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold h-8 px-3 cursor-pointer"
                          >
                            {downloadingId === `offer_0` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                            ) : (
                              <Download className="w-3.5 h-3.5 mr-1 text-slate-500" />
                            )}
                            PDF
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    candidates.map((cand) => {
                      const specialty = getCandidateSpecialty(cand);
                      const isRet = isRetina(cand);
                      const unitName = units.find((u) => u.id === cand.unitId)?.name || "Jaipur";
                      const isSelected = selectedCandidateId === cand.id;
                      const isDownloading = downloadingId === `offer_${cand.id}`;
                      const isSending = sendingEmailId === `send_offer_${cand.id}`;

                      return (
                      <tr key={cand.id} className={`hover:bg-slate-50/60 transition-colors ${isSelected ? "bg-blue-50/40" : ""}`}>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{cand.fullName}</div>
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                            <span className="font-bold text-[#0b4a8f]">{cand.candidateCode}</span>
                            <span>•</span>
                            <span>{cand.email}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">{specialty}</div>
                          <span className="text-[10px] text-slate-500">{isRet ? "24 Months" : "18 Months"}</span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            Sankara Eye Hospital – {unitName}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-black text-[#0b4a8f] flex items-center gap-1">
                            <IndianRupee className="w-3 h-3" />
                            40,000 / month
                          </div>
                          <span className="text-[10px] text-slate-400">Standard institutional rate</span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant={isSelected ? "default" : "outline"}
                              onClick={() => handleSelectCandidate(cand)}
                              className={`rounded-xl text-xs font-bold h-8 px-3 cursor-pointer ${
                                isSelected ? "bg-[#0b4a8f] text-white" : "border-slate-200 text-slate-700"
                              }`}
                            >
                              <Edit3 className="w-3.5 h-3.5 mr-1" />
                              {isSelected ? "Active in Preview" : "Configure"}
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isDownloading}
                              onClick={() => {
                                handleSelectCandidate(cand);
                                handleDownloadOfferLetter(cand);
                              }}
                              className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold h-8 px-3 cursor-pointer"
                            >
                              {isDownloading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                              ) : (
                                <Download className="w-3.5 h-3.5 mr-1 text-slate-500" />
                              )}
                              PDF
                            </Button>

                            <Button
                              size="sm"
                              disabled={isSending}
                              onClick={() => {
                                handleSelectCandidate(cand);
                                handleSendOfferLetter(cand);
                              }}
                              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold h-8 px-3 shadow-sm cursor-pointer"
                            >
                              {isSending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                              ) : (
                                <Mail className="w-3.5 h-3.5 mr-1" />
                              )}
                              Send Gmail
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
