import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import {
  CreditCard, Plus, Pencil, Trash2, Building2, Eye, EyeOff, Copy, Check,
  IndianRupee, Zap, AlertCircle, CheckCircle2, Smartphone, MapPin, Loader2
} from "lucide-react";
import QRCode from "react-qr-code";
import { useToast } from "../hooks/use-toast";

interface Program { id: number; name: string; }
interface PaymentSetting {
  id: number;
  programId: number | null;
  programName: string | null;
  razorpayKeyId: string | null;
  razorpayKeySecret: string | null;
  upiId: string | null;
  amount: number;
  amountRs: number;
  currency: string;
  description: string;
  mode: string;
  isActive: boolean;
}

const BLANK: Omit<PaymentSetting, "id" | "programName" | "amount"> = {
  programId: null,
  razorpayKeyId: "",
  razorpayKeySecret: "",
  upiId: "",
  amountRs: 2750,
  currency: "INR",
  description: "Fellowship Application Fee",
  mode: "test",
  isActive: true,
};

function buildUpiUrl(upiId: string, amount: number, name: string, note: string) {
  const params = new URLSearchParams({ pa: upiId, pn: name, am: String(amount), cu: "INR", tn: note });
  return `upi://pay?${params.toString()}`;
}

export default function PaymentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<PaymentSetting | null>(null);
  const [form, setForm] = useState({ ...BLANK, programId: null as number | null });
  const [showSecret, setShowSecret] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [bankForm, setBankForm] = useState({
    accountName: "",
    accountNumber: "",
    bankBranch: "",
    ifscCode: "",
    modes: ""
  });

  const canEdit = user?.role === "super_admin" || user?.role === "program_admin";

  const { data: settings = [] } = useQuery<PaymentSetting[]>({
    queryKey: ["payment-settings"],
    queryFn: () => api.get<PaymentSetting[]>("/payment-settings"),
  });

  const { data: programs = [] } = useQuery<Program[]>({
    queryKey: ["programs"],
    queryFn: () => api.get<Program[]>("/programs"),
  });

  const { data: bankSettings = [] } = useQuery<any[]>({
    queryKey: ["global-settings", "bank_details"],
    queryFn: () => api.get<any[]>("/global-settings"),
  });

  const bankDetails = (() => {
    const s = bankSettings.find(x => x.key === 'bank_details');
    if (!s) return null;
    try { return JSON.parse(s.value); } catch { return null; }
  })();

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) =>
      editItem
        ? api.patch(`/payment-settings/${editItem.id}`, data)
        : api.post("/payment-settings", data),
    onSuccess: () => {
      toast({ title: editItem ? "Payment settings updated" : "Payment settings created" });
      qc.invalidateQueries({ queryKey: ["payment-settings"] });
      setDialogOpen(false);
      setEditItem(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/payment-settings/${id}`),
    onSuccess: () => {
      toast({ title: "Configuration deleted" });
      qc.invalidateQueries({ queryKey: ["payment-settings"] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveBankMutation = useMutation({
    mutationFn: (data: typeof bankForm) => api.patch("/global-settings/bank_details", { value: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: "Bank details updated" });
      qc.invalidateQueries({ queryKey: ["global-settings"] });
      setBankDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => {
    setEditItem(null);
    setForm({ ...BLANK, programId: null });
    setShowSecret(false);
    setDialogOpen(true);
  };

  const openEdit = (s: PaymentSetting) => {
    setEditItem(s);
    setForm({
      programId: s.programId,
      razorpayKeyId: s.razorpayKeyId ?? "",
      razorpayKeySecret: s.razorpayKeySecret ?? "",
      upiId: s.upiId ?? "",
      amountRs: s.amountRs,
      currency: s.currency,
      description: s.description,
      mode: s.mode,
      isActive: s.isActive,
    });
    setShowSecret(false);
    setDialogOpen(true);
  };

  const copyKey = (id: number, key: string) => {
    navigator.clipboard.writeText(key).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const toggleActive = (s: PaymentSetting) => {
    api.patch(`/payment-settings/${s.id}`, { isActive: !s.isActive })
      .then(() => qc.invalidateQueries({ queryKey: ["payment-settings"] }))
      .catch((e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }));
  };

  useEffect(() => {
    if (!dialogOpen) setShowSecret(false);
  }, [dialogOpen]);

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-black p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-orange-500 p-8 text-white shadow-2xl">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-orange-100 text-sm font-medium">
              <IndianRupee className="h-4 w-4" />
              <span>Financial Infrastructure</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">Payments & Gateway</h1>
            <p className="text-orange-100/80 max-w-md">Configure Razorpay integrations, manage fee structures, and update institutional bank transfer protocols.</p>
          </div>
          {canEdit && (
            <Button 
              onClick={openAdd} 
              className="bg-white text-orange-700 hover:bg-orange-50 transition-all font-bold h-12 px-6 rounded-2xl shadow-xl hover:scale-105 active:scale-95 gap-2 border-none"
            >
              <Plus className="h-5 w-5" /> Add Configuration
            </Button>
          )}
        </div>
      </div>

      {/* Bank Transfer Details */}
      <Card className="border-none shadow-premium bg-gradient-to-br from-orange-50 to-amber-50 dark:from-slate-900 dark:to-slate-900/50 overflow-hidden relative group">
        <div className="absolute top-0 right-0 h-32 w-32 bg-orange-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700" />
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
            <div className="h-10 w-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm">
              <Building2 className="h-5 w-5 text-orange-600" />
            </div>
            Institutional Payment Hub
          </CardTitle>
          {canEdit && (
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-xl border-orange-200 bg-white/50 hover:bg-white font-black uppercase text-xs tracking-wider gap-2 h-9"
              onClick={() => {
                setBankForm({
                  accountName: bankDetails?.accountName || "Sankara Academy of Vision",
                  accountNumber: bankDetails?.accountNumber || "50100004642084",
                  bankBranch: bankDetails?.bankBranch || "HDFC Bank, Saravanampatti Branch, Coimbatore",
                  ifscCode: bankDetails?.ifscCode || "HDFC0002231",
                  modes: bankDetails?.modes || "Google Pay · PhonePe · Paytm · RTGS · NEFT",
                });
                setBankDialogOpen(true);
              }}
            >
              <Pencil className="h-3 w-3" /> Update Protocol
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 text-sm relative z-10">
            {[
              { label: "Account Name", value: bankDetails?.accountName || "Sankara Academy of Vision", icon: Building2 },
              { label: "Account Number", value: bankDetails?.accountNumber || "50100004642084", icon: CreditCard },
              { label: "Bank & Branch", value: bankDetails?.bankBranch || "HDFC Bank, Saravanampatti Branch, Coimbatore", icon: MapPin },
              { label: "IFSC Code", value: bankDetails?.ifscCode || "HDFC0002231", icon: Zap },
              { label: "Accepted Modes", value: bankDetails?.modes || "Google Pay · PhonePe · Paytm · RTGS · NEFT", icon: Smartphone },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="p-4 bg-white/40 dark:bg-slate-800/40 rounded-2xl border border-white/60 dark:border-slate-700/60 shadow-sm backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-3.5 w-3.5 text-orange-500 opacity-80" />
                  <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">{label}</p>
                </div>
                <p className="font-black text-slate-900 dark:text-slate-100 tracking-tight leading-tight">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-4 p-4 bg-orange-500/10 rounded-2xl border border-orange-500/20 shadow-inner">
            <div className="h-10 w-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 shrink-0">
              <Smartphone className="h-5 w-5 text-white" />
            </div>
            <p className="text-xs font-bold text-orange-900 dark:text-orange-200 tracking-wide leading-relaxed">
              Candidates must upload the payment screenshot in the application form as proof of payment.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Razorpay Configurations */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Razorpay Configurations</h2>

        {settings.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No Razorpay configuration yet.</p>
              {canEdit && (
                <Button variant="outline" className="mt-3 gap-2" onClick={openAdd}>
                  <Plus className="h-4 w-4" /> Add Configuration
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {settings.map((s) => {
              const hasCreds = !!(s.razorpayKeyId && s.razorpayKeySecret);
              return (
                <Card key={s.id} className={!s.isActive ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-sm">
                            {s.programName ? s.programName : "All Programs (Global)"}
                          </p>
                          <Badge variant="outline" className={s.mode === "live" ? "border-green-300 text-green-700" : "border-amber-300 text-amber-700"}>
                            {s.mode === "live" ? "Live" : "Test"}
                          </Badge>
                          {s.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                          )}
                          {!hasCreds && (
                            <Badge variant="outline" className="border-orange-300 text-orange-700 gap-1">
                              <AlertCircle className="h-3 w-3" /> No Keys — Mock Mode
                            </Badge>
                          )}
                          {hasCreds && (
                            <Badge variant="outline" className="border-orange-300 text-orange-700 gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Razorpay Connected
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <div className="flex items-center gap-1 text-lg font-bold text-primary">
                            <IndianRupee className="h-4 w-4" />
                            {s.amountRs.toLocaleString("en-IN")}
                          </div>
                          {s.razorpayKeyId && (
                            <div className="flex items-center gap-1">
                              <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {s.razorpayKeyId}
                              </code>
                              <Button
                                variant="ghost" size="sm" className="h-6 w-6 p-0"
                                onClick={() => copyKey(s.id, s.razorpayKeyId!)}
                              >
                                {copiedId === s.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                              </Button>
                            </div>
                          )}
                          {s.upiId && (
                            <Badge variant="outline" className="border-green-300 text-green-700 gap-1 text-xs">
                              <Smartphone className="h-3 w-3" /> UPI: {s.upiId}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {canEdit && (
                          <Switch checked={s.isActive} onCheckedChange={() => toggleActive(s)} />
                        )}
                        {canEdit && (
                          <Button variant="outline" size="sm" className="gap-1 h-8" onClick={() => openEdit(s)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteId(s.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Important Notices (for reference) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" /> Important Notices Shown on Application Form
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
            <li>More than one sub specialty candidates are requested to fill up the application form again with the required application fees.</li>
            <li>Kindly carry your basic and post-graduate educational certificates, current valid medical registration license, and passport-size photograph.</li>
            <li>Selection process involves a written test (MCQ pattern) and an interview.</li>
            <li>Application fee of Rs.2750/- can be paid only through online transfer to the HDFC Bank account detailed above.</li>
            <li>The age limit is 35 years; those beyond 35 years and those awaiting PG results are not eligible to apply.</li>
            <li>Applicants under Government bond or Compulsory Rural Service must submit a 'No Objection Certificate' during the time of examination.</li>
            <li>All selected fellows must submit NOC from their State Medical Council during Fellowship induction — mandatory for joining.</li>
            <li>Two Letters of Recommendation are required to be uploaded in the last page of the Application form.</li>
            <li>The receipt of online payment (screenshot) should be enclosed to the application form at the option enabled.</li>
          </ol>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditItem(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              {editItem ? "Edit Payment Configuration" : "Add Payment Configuration"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Applies To</Label>
              <Select
                value={form.programId != null ? String(form.programId) : "all"}
                onValueChange={(v) => setForm((f) => ({ ...f, programId: v === "all" ? null : Number(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Programs (Global)</SelectItem>
                  {programs.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={form.amountRs}
                  onChange={(e) => setForm((f) => ({ ...f, amountRs: Number(e.target.value) }))}
                  placeholder="2750"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Select value={form.mode} onValueChange={(v) => setForm((f) => ({ ...f, mode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Fellowship Application Fee"
              />
            </div>

            <div className="space-y-1.5">
              <Label>UPI ID</Label>
              <div className="relative">
                <Smartphone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={form.upiId ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, upiId: e.target.value }))}
                  placeholder="sankaraeye@hdfcbank"
                  className="pl-8 font-mono text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">Used to generate a scannable UPI QR code on the payment page</p>
              {form.upiId && (
                <div className="flex flex-col items-center gap-2 mt-2 p-3 bg-muted/30 rounded-lg border">
                  <p className="text-xs text-muted-foreground font-medium">QR Preview</p>
                  <div className="bg-white p-2 rounded">
                    <QRCode
                      value={buildUpiUrl(form.upiId, (form.amountRs ?? 2750), "Sankara Academy of Vision", "Fellowship Application Fee")}
                      size={120}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{form.upiId} · ₹{form.amountRs?.toLocaleString("en-IN")}</p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Razorpay Key ID</Label>
              <Input
                value={form.razorpayKeyId ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, razorpayKeyId: e.target.value }))}
                placeholder="rzp_test_XXXXXXXXXXXX"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Razorpay Key Secret</Label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={form.razorpayKeySecret ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, razorpayKeySecret: e.target.value }))}
                  placeholder="••••••••••••••••••••••••"
                  className="font-mono text-sm pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-7 w-7 p-0"
                  onClick={() => setShowSecret((v) => !v)}
                >
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Leave blank to use simulation/mock mode</p>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                id="active-toggle"
              />
              <Label htmlFor="active-toggle">Active (shown on application form)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditItem(null); }}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending}
              className="gap-2"
            >
              <Zap className="h-4 w-4" />
              {saveMutation.isPending ? "Saving…" : "Save Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Configuration?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove the payment configuration. Application forms using this setting will fall back to simulation mode.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Bank Details Edit Dialog */}
      <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Update Bank Transfer Protocol
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Account Name</Label>
              <Input 
                value={bankForm.accountName} 
                onChange={e => setBankForm(f => ({ ...f, accountName: e.target.value }))}
                placeholder="Sankara Academy of Vision"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account Number</Label>
              <Input 
                value={bankForm.accountNumber} 
                onChange={e => setBankForm(f => ({ ...f, accountNumber: e.target.value }))}
                placeholder="50100004642084"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bank & Branch</Label>
              <Input 
                value={bankForm.bankBranch} 
                onChange={e => setBankForm(f => ({ ...f, bankBranch: e.target.value }))}
                placeholder="HDFC Bank, Saravanampatti Branch, Coimbatore"
              />
            </div>
            <div className="space-y-1.5">
              <Label>IFSC Code</Label>
              <Input 
                value={bankForm.ifscCode} 
                onChange={e => setBankForm(f => ({ ...f, ifscCode: e.target.value }))}
                placeholder="HDFC0002231"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Accepted Modes</Label>
              <Input 
                value={bankForm.modes} 
                onChange={e => setBankForm(f => ({ ...f, modes: e.target.value }))}
                placeholder="Google Pay · PhonePe · Paytm · RTGS · NEFT"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => saveBankMutation.mutate(bankForm)}
              disabled={saveBankMutation.isPending}
              className="gap-2 bg-orange-600 hover:bg-orange-700"
            >
              {saveBankMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save Bank Protocol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

