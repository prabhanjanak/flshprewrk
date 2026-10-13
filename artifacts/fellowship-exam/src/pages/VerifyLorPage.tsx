import React, { useEffect, useState } from "react";
import { Loader2, ShieldCheck, AlertCircle, ExternalLink, Lock } from "lucide-react";
import { getCleanObjectPath } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function VerifyLorPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const queryParams = new URLSearchParams(window.location.search);
  const rawPath = queryParams.get("path");

  useEffect(() => {
    if (!rawPath) {
      setError("No document path provided in the QR code link.");
      setLoading(false);
      return;
    }

    const token = localStorage.getItem("fellowship_token");
    if (!token) {
      setError("Access denied. Please log in to view this credential.");
      setLoading(false);
      return;
    }

    const cleanPath = getCleanObjectPath(rawPath);
    if (!cleanPath) {
      setError("Invalid or unsupported document path. Cannot verify credential.");
      setLoading(false);
      return;
    }
    const targetUrl = `/api/storage${cleanPath}`;

    setLoading(true);
    fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.status === 403 || res.status === 401
            ? "You do not have administrative permissions to view this credential."
            : "The requested LOR document could not be found."
          );
        }
        // Redirect/open using direct authorized URL query parameter
        const authorizedUrl = `/api/storage${cleanPath}?token=${token}`;
        setPdfUrl(authorizedUrl);
        setLoading(false);
        window.location.replace(authorizedUrl);
      })
      .catch((err) => {
        setError(err.message || "Failed to load the secure document.");
        setLoading(false);
      });
  }, [rawPath]);

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-6 bg-slate-50/50">
      <Card className="max-w-md w-full border-none shadow-2xl rounded-3xl overflow-hidden bg-white">
        <div className="bg-[#0b4a8f] px-8 py-8 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-4">
            {loading ? (
              <Loader2 className="w-8 h-8 animate-spin text-white" />
            ) : error ? (
              <AlertCircle className="w-8 h-8 text-red-300" />
            ) : (
              <ShieldCheck className="w-8 h-8 text-emerald-300" />
            )}
          </div>
          <CardTitle className="text-xl font-black uppercase tracking-tight">LOR Gatekeeper</CardTitle>
          <p className="text-[10px] font-bold text-slate-200 uppercase tracking-widest mt-1">Sankara Academy of Vision</p>
        </div>

        <CardContent className="p-8 space-y-6">
          {loading ? (
            <div className="space-y-3 text-center py-4">
              <p className="text-sm font-black text-slate-800">Verifying Administrative Access...</p>
              <p className="text-xs text-slate-500 font-medium leading-relaxed px-4">
                Decrypting and verifying credential authenticity. This will take just a second.
              </p>
            </div>
          ) : error ? (
            <div className="space-y-4 text-center py-2">
              <div className="bg-red-50 text-red-800 p-4 rounded-2xl text-xs font-semibold leading-relaxed border border-red-100 flex gap-2 items-start text-left">
                <Lock className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">Error Code: SEC_GATE_ERR</p>
            </div>
          ) : (
            <div className="space-y-6 text-center py-2">
              <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl text-xs font-semibold leading-relaxed border border-emerald-100 flex gap-2.5 items-start text-left">
                <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0 text-emerald-600" />
                <div>
                  <p className="font-bold text-emerald-900">Credential Access Authorized</p>
                  <p className="text-slate-500 font-medium mt-1 text-[11px]">
                    Your administrative login was successfully verified. The LOR document has been safely decrypted.
                  </p>
                </div>
              </div>
              {pdfUrl && (
                <Button 
                  onClick={() => window.open(pdfUrl, "_blank")}
                  className="w-full h-12 rounded-xl bg-[#0b4a8f] hover:bg-[#08386b] text-white font-bold tracking-wide shadow-lg shadow-[#0b4a8f]/20 transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" /> Open LOR Document
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
