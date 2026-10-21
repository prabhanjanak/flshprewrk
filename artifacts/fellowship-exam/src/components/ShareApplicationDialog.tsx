import { useState } from "react";
import QRCode from "react-qr-code";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";
import {
  Copy,
  Check,
  ExternalLink,
  Share2,
  Mail,
  MessageCircle,
  QrCode,
  GraduationCap,
  CalendarCheck2,
} from "lucide-react";

interface ShareApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token?: string;
  title?: string;
  subtitle?: string;
}

export function ShareApplicationDialog({
  open,
  onOpenChange,
  token = "JAN2027",
  title = "Fellowship Program - January 2027",
  subtitle = "Entrance Examination: December 2026 • Sankara Academy of Vision",
}: ShareApplicationDialogProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const getCanonicalUrl = (t: string) => {
    if (typeof window !== "undefined") {
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        return `${window.location.origin}/apply/${t}`;
      }
    }
    return `https://learn.sankaraeye.in/apply/${t}`;
  };

  const applyUrl = getCanonicalUrl(token);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(applyUrl);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = applyUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast({
        title: "Link Copied!",
        description: "Official applicant link has been copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Please manually copy the URL.",
      });
    }
  };

  const handleWhatsAppShare = () => {
    const message = `*Sankara Academy of Vision — Fellowship Admissions*\n\nProgram: ${title}\nEntrance Exam: 07.12.2026 (Retina) & 08.12.2026 (Anterior Segment)\nReporting & Induction: January 2027\n\nApply Online Here:\n${applyUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank");
  };

  const handleEmailShare = () => {
    const subject = `Fellowship Admissions Application Link — ${title}`;
    const body = `Dear Candidate,\n\nPlease find the official application link for the Sankara Academy of Vision Fellowship Program:\n\nProgram: ${title}\nEntrance Examination: 07.12.2026 (Retina) & 08.12.2026 (Anterior Segment)\nInduction: January 2027\n\nOnline Application Portal:\n${applyUrl}\n\nKey Highlights:\n- 65 Fellowship seats across 13 hospital locations nationwide\n- Cornea, Glaucoma, IOL, Medical Retina, Oculoplasty, Pediatric Ophthalmology, Phaco Refractive, Vitreo Retina\n\nAdmissions Desk:\nSankara Academy of Vision\nradhika@sankaraeye.com | +91 9666677505\nhttps://www.sankaraeye.com\n`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: `Apply for ${title} (${subtitle})`,
          url: applyUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg p-0 overflow-hidden rounded-3xl border-slate-200 shadow-2xl">
        <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-6 text-white text-center relative">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-orange-400 shadow-inner">
            <Share2 className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-black tracking-tight text-white">
            Share Application Portal
          </DialogTitle>
          <DialogDescription className="text-xs text-blue-200 mt-1 max-w-sm mx-auto font-medium">
            Distribute official admissions registration link for candidate intake
          </DialogDescription>

          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold text-orange-300">
            <CalendarCheck2 className="w-3.5 h-3.5" />
            Exam: December 2026 • Intake: January 2027
          </div>
        </div>

        <div className="p-6 space-y-6 bg-slate-50/50">
          {/* Target Program Info Card */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-black text-slate-800 truncate">{title}</h4>
              <p className="text-[11px] text-slate-500 font-medium truncate">{subtitle}</p>
            </div>
          </div>

          {/* Canonical Link Display & Copy */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Official Applicant Link
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Active Link
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 font-mono text-xs text-slate-800 truncate select-all shadow-inner">
                {applyUrl}
              </div>
              <Button
                variant={copied ? "default" : "outline"}
                className={`h-10 px-4 rounded-xl font-bold text-xs gap-1.5 shrink-0 ${
                  copied
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "border-slate-300 hover:bg-slate-100 text-slate-700"
                }`}
                onClick={handleCopy}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          {/* Social & Direct Sharing Channels */}
          <div className="grid grid-cols-3 gap-2.5">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex flex-col items-center justify-center gap-1 py-1"
              onClick={handleWhatsAppShare}
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span>WhatsApp</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-800 font-bold text-xs flex flex-col items-center justify-center gap-1 py-1"
              onClick={handleEmailShare}
            >
              <Mail className="w-4 h-4 text-blue-600" />
              <span>Email</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-slate-200 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs flex flex-col items-center justify-center gap-1 py-1"
              onClick={() => window.open(applyUrl, "_blank")}
            >
              <ExternalLink className="w-4 h-4 text-slate-600" />
              <span>Open Form</span>
            </Button>
          </div>

          {/* QR Code Container */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center gap-5">
            <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-inner shrink-0">
              <QRCode value={applyUrl} size={110} />
            </div>
            <div className="text-center sm:text-left space-y-1.5 flex-1">
              <div className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-slate-700">
                <QrCode className="w-3.5 h-3.5 text-orange-600" />
                Scan & Apply on Mobile
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Candidates can scan this QR code directly with any smartphone camera or Google Lens to immediately begin their fellowship registration.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-100/80 border-t border-slate-200 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500 font-medium">
            Token: <span className="font-mono font-bold text-slate-700">{token}</span>
          </p>
          <div className="flex items-center gap-2">
            {"share" in navigator && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleNativeShare}
                className="h-8 rounded-lg text-xs font-bold border-slate-300"
              >
                <Share2 className="w-3.5 h-3.5 mr-1" /> System Share
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
