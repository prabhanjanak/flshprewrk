import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { Button } from "../../components/ui/button";
import { BookOpen, Upload, FileText, XIcon, ImageIcon, ShieldCheck, CreditCard, CheckCircle2, Loader2 } from "lucide-react";
import { Separator } from "../../components/ui/separator";

export default function Step3({ 
  form, set, err, 
  lor1File, setLor1File, lor1Error, handleLorFile, 
  lor2File, setLor2File, lor2Error, 
  photoFile, setPhotoFile, photoError, handlePhotoFile, 
  paymentFile, setPaymentFile, paymentError, handlePaymentFile,
  onInitiatePayment, paymentVerified, isPaying
}: any) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4" /> Section 11: Letters of Recommendation</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm font-semibold mb-3">Reference 1</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name & Designation <span className="text-destructive">*</span></Label>
                <Input placeholder="Dr. Name, Designation" value={form.lor1RefName || ""} onChange={(e) => set("lor1RefName", e.target.value)} />
                {err("lor1RefName")}
              </div>
              <div className="space-y-1.5">
                <Label>Contact Number <span className="text-destructive">*</span></Label>
                <Input placeholder="Phone Number" value={form.lor1RefContact || ""} onChange={(e) => set("lor1RefContact", e.target.value)} />
                {err("lor1RefContact")}
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" placeholder="Email Address" value={form.lor1RefEmail || ""} onChange={(e) => set("lor1RefEmail", e.target.value)} />
                {err("lor1RefEmail")}
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Upload LOR 1 <span className="text-destructive">*</span> <span className="text-muted-foreground text-xs">(PDF, JPG, PNG — images auto-formatted to standard PDF)</span></Label>
                <label className={`flex items-center gap-3 border-2 border-dashed rounded-lg p-3 cursor-pointer transition-colors ${lor1File ? "border-green-500/50 bg-green-500/10 dark:bg-green-500/20" : "border-border hover:border-primary/50"}`}>
                  <input type="file" accept=".pdf,application/pdf,image/jpeg,image/jpg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLorFile(f, "lor1"); }} />
                  {lor1File ? (
                    <><FileText className="h-5 w-5 text-green-600 shrink-0" /><span className="text-sm truncate">{lor1File.name}</span><button type="button" onClick={(e) => { e.preventDefault(); setLor1File(null); }} className="ml-auto text-muted-foreground hover:text-destructive"><XIcon className="h-4 w-4" /></button></>
                  ) : (
                    <><Upload className="h-5 w-5 text-muted-foreground shrink-0" /><span className="text-sm text-muted-foreground">Select PDF or Image</span></>
                  )}
                </label>
                {lor1Error && <p className="text-xs text-destructive">{lor1Error}</p>}
                {!lor1File && err("lor1File")}
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-semibold mb-3">Reference 2</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name & Designation <span className="text-destructive">*</span></Label>
                <Input placeholder="Dr. Name, Designation" value={form.lor2RefName || ""} onChange={(e) => set("lor2RefName", e.target.value)} />
                {err("lor2RefName")}
              </div>
              <div className="space-y-1.5">
                <Label>Contact Number <span className="text-destructive">*</span></Label>
                <Input placeholder="Phone Number" value={form.lor2RefContact || ""} onChange={(e) => set("lor2RefContact", e.target.value)} />
                {err("lor2RefContact")}
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" placeholder="Email Address" value={form.lor2RefEmail || ""} onChange={(e) => set("lor2RefEmail", e.target.value)} />
                {err("lor2RefEmail")}
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Upload LOR 2 <span className="text-destructive">*</span> <span className="text-muted-foreground text-xs">(PDF, JPG, PNG — images auto-formatted to standard PDF)</span></Label>
                <label className={`flex items-center gap-3 border-2 border-dashed rounded-lg p-3 cursor-pointer transition-colors ${lor2File ? "border-green-500/50 bg-green-500/10 dark:bg-green-500/20" : "border-border hover:border-primary/50"}`}>
                  <input type="file" accept=".pdf,application/pdf,image/jpeg,image/jpg,image/png,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLorFile(f, "lor2"); }} />
                  {lor2File ? (
                    <><FileText className="h-5 w-5 text-green-600 shrink-0" /><span className="text-sm truncate">{lor2File.name}</span><button type="button" onClick={(e) => { e.preventDefault(); setLor2File(null); }} className="ml-auto text-muted-foreground hover:text-destructive"><XIcon className="h-4 w-4" /></button></>
                  ) : (
                    <><Upload className="h-5 w-5 text-muted-foreground shrink-0" /><span className="text-sm text-muted-foreground">Select PDF or Image</span></>
                  )}
                </label>
                {lor2Error && <p className="text-xs text-destructive">{lor2Error}</p>}
                {!lor2File && err("lor2File")}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Section 12: Final Declaration</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <Label>Additional Information</Label>
            <Textarea rows={3} placeholder="Any other relevant information..." value={form.additionalInfo || ""} onChange={(e) => set("additionalInfo", e.target.value)} />
          </div>

          <Separator />

          <div className="bg-orange-50/50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/50 p-5 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-bold flex items-center gap-2 text-orange-700 dark:text-orange-400">
                  <CreditCard className="h-4 w-4" /> Payment via Razorpay
                </p>
                <p className="text-xs text-muted-foreground">Pay the application fee securely using UPI, Card, or Netbanking.</p>
              </div>
              {paymentVerified ? (
                <div className="flex items-center gap-2 bg-green-500/10 text-green-600 px-3 py-1.5 rounded-full border border-green-500/20">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">Payment Verified</span>
                </div>
              ) : (
                <Button 
                  onClick={(e) => { e.preventDefault(); onInitiatePayment(); }} 
                  disabled={isPaying}
                  size="sm"
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 shadow-md"
                >
                  {isPaying ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</> : "Pay Now"}
                </Button>
              )}
            </div>
            {!paymentVerified && (
              <p className="text-[10px] text-muted-foreground italic text-center border-t border-orange-100 dark:border-orange-900/30 pt-2">
                Click "Pay Now" to open the secure Razorpay payment window.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Payment Proof <span className="text-destructive">*</span> <span className="text-muted-foreground text-xs">(JPG, PNG, PDF — auto-normalized)</span></Label>
              <label className={`flex items-center gap-3 border-2 border-dashed rounded-lg p-3 cursor-pointer transition-colors ${paymentFile ? "border-green-500/50 bg-green-500/10 dark:bg-green-500/20" : "border-border hover:border-primary/50"}`}>
                <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf,.pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePaymentFile(f); }} />
                {paymentFile ? (
                  <><ImageIcon className="h-5 w-5 text-green-600 shrink-0" /><span className="text-sm truncate">{paymentFile.name}</span><button type="button" onClick={(e) => { e.preventDefault(); setPaymentFile(null); }} className="ml-auto text-muted-foreground hover:text-destructive"><XIcon className="h-4 w-4" /></button></>
                ) : (
                  <><Upload className="h-5 w-5 text-muted-foreground shrink-0" /><span className="text-sm text-muted-foreground">Select payment proof</span></>
                )}
              </label>
              <p className="text-[10px] text-muted-foreground italic">Upload a screenshot or receipt of your payment.</p>
              {paymentError && <p className="text-xs text-destructive">{paymentError}</p>}
              {!paymentFile && err("paymentFile")}
            </div>

            <div className="space-y-1.5">
              <Label>Passport Photo <span className="text-destructive">*</span> <span className="text-muted-foreground text-xs">(JPG, PNG, WebP — auto-cropped to passport format)</span></Label>
              <label className={`flex items-center gap-3 border-2 border-dashed rounded-lg p-3 cursor-pointer transition-colors ${photoFile ? "border-green-500/50 bg-green-500/10 dark:bg-green-500/20" : "border-border hover:border-primary/50"}`}>
                <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); }} />
                {photoFile ? (
                  <><ImageIcon className="h-5 w-5 text-green-600 shrink-0" /><span className="text-sm truncate">{photoFile.name}</span><button type="button" onClick={(e) => { e.preventDefault(); setPhotoFile(null); }} className="ml-auto text-muted-foreground hover:text-destructive"><XIcon className="h-4 w-4" /></button></>
                ) : (
                  <><Upload className="h-5 w-5 text-muted-foreground shrink-0" /><span className="text-sm text-muted-foreground">Select passport photo</span></>
                )}
              </label>
              {photoError && <p className="text-xs text-destructive">{photoError}</p>}
              {!photoFile && err("photoFile")}
            </div>
          </div>

          <Separator />

          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-3 cursor-pointer bg-muted/20 dark:bg-muted/10 p-4 rounded-lg border border-border">
              <Checkbox className="mt-1" checked={form.declarationChecked} onCheckedChange={(v) => set("declarationChecked", !!v)} />
              <div className="space-y-1">
                <p className="text-sm font-medium">Declaration <span className="text-destructive">*</span></p>
                <p className="text-xs text-muted-foreground">"I declare that the information provided is true to the best of my knowledge."</p>
              </div>
            </label>
            {err("declarationChecked")}
          </div>

        </CardContent>
      </Card>
    </div>
  );
}


