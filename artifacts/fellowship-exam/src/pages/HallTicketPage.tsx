import { useState } from "react";
import logoUrl from "../assets/seh_sav_logo_1777703794142.jpg";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { 
  Search, Ticket, Download, Calendar, MapPin, CheckCircle2, 
  AlertCircle, Loader2, ArrowRight, ShieldCheck, UserCheck, Sparkles 
} from "lucide-react";

export default function HallTicketPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [candidateData, setCandidateData] = useState<any>(null);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setError("");
    setLoading(true);
    setSearched(true);
    setCandidateData(null);

    try {
      // Fetch candidate hall ticket metadata
      const cleanId = query.trim().replace("#APP-", "").replace("APP-", "");
      const res = await fetch(`/api/hall-tickets/download/${encodeURIComponent(cleanId)}`);
      
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("No verified application found matching this reference ID or email address.");
        }
        throw new Error("Unable to retrieve hall ticket. Please verify details or contact admissions.");
      }

      // If PDF stream returned successfully, we have a valid record
      setCandidateData({
        identifier: cleanId,
        downloadUrl: `/api/hall-tickets/download/${encodeURIComponent(cleanId)}`,
      });
    } catch (err: any) {
      setError(err.message || "Failed to find hall ticket");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-900 flex flex-col justify-between selection:bg-[#0b4a8f] selection:text-white">
      {/* Header */}
      <header className="w-full px-6 lg:px-12 py-4 flex items-center justify-between border-b border-slate-200/90 bg-white shadow-xs">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-center">
            <img 
              src={logoUrl} 
              alt="Sankara Academy of Vision" 
              className="h-12 sm:h-14 w-auto max-w-[280px] sm:max-w-[360px] object-contain"
            />
          </div>
          <div className="hidden md:block">
            <span className="text-xs font-black tracking-widest uppercase text-[#0b4a8f] block leading-none">
              Central Examination Portal
            </span>
            <span className="text-[10px] font-bold text-slate-500 block mt-1">
              Candidate Admit Card & Hall Ticket Service
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>Hall Tickets Active</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-8 py-12">
        <div className="w-full max-w-2xl space-y-8 text-center">
          
          {/* Title Ribbon */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-[#0b4a8f] text-[10px] font-black uppercase tracking-widest shadow-2xs">
              <Ticket className="w-3.5 h-3.5 text-[#0b4a8f]" />
              Official Examination Hall Ticket Download
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
              Download Your Examination Admit Card
            </h1>
            <p className="text-sm font-medium text-slate-500 max-w-lg mx-auto leading-relaxed">
              Enter your Application Reference Number or registered Email Address to verify your admit status and download your official Letter/A4 Hall Ticket.
            </p>
          </div>

          {/* Search Card */}
          <Card className="rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 p-6 sm:p-8">
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <Label htmlFor="searchId" className="text-[10px] font-black uppercase tracking-widest text-slate-600 pl-1">
                  Application Reference ID or Registered Email *
                </Label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                    <Search className="w-4 h-4" />
                  </div>
                  <Input
                    id="searchId"
                    placeholder="e.g. 102 or doctor@example.com"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    required
                    className="h-12 pl-13 rounded-2xl bg-slate-50/70 border-slate-200 text-slate-900 text-xs font-bold focus:border-[#0b4a8f] focus:ring-2 focus:ring-[#0b4a8f]/20 transition-all"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading || !query.trim()}
                className="w-full h-12 rounded-2xl bg-[#0b4a8f] hover:bg-[#08386b] text-white font-black text-xs uppercase tracking-widest shadow-md shadow-blue-900/10 transition-all duration-200 cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying Admit Status...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>Search & Generate Hall Ticket</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                )}
              </Button>
            </form>

            {/* Error Display */}
            {error && (
              <div className="mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-3 text-left">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success Download Card */}
            {candidateData && (
              <div className="mt-6 p-6 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-left space-y-4 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-black text-slate-900">Admit Card Ready for Download</span>
                  </div>
                  <Badge className="bg-emerald-600 text-white text-[10px] font-black uppercase">
                    Verified Eligible
                  </Badge>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Your official Hall Ticket has been generated. Please print this document on standard Letter/A4 paper and carry it to the examination center along with your original Government Photo ID.
                </p>

                <div className="pt-2">
                  <a
                    href={candidateData.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-widest shadow-md transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    Download Official Admit Card (PDF)
                  </a>
                </div>
              </div>
            )}
          </Card>

          {/* Institutional Note */}
          <div className="flex items-center justify-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            <span className="flex items-center gap-1 text-slate-600">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Official SAV Verification
            </span>
            <span>•</span>
            <span>Sri Kanchi Kamakoti Medical Trust</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-5 px-6 border-t border-slate-200 text-center space-y-1 bg-white">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
          Sri Kanchi Kamakoti Medical Trust · Sankara Eye Hospitals, India
        </p>
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
          Central Examination Portal
        </p>
      </footer>
    </div>
  );
}
