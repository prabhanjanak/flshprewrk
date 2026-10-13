import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Separator } from "../components/ui/separator";
import { useToast } from "../hooks/use-toast";
import { 
  Mail, 
  Settings, 
  ShieldCheck, 
  Send, 
  Loader2, 
  Save, 
  Bell,
  MailCheck,
} from "lucide-react";

export default function EmailSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testEmail, setTestEmail] = useState("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["email-settings"],
    queryFn: () => api.get<any>("/settings/email"),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.patch("/settings/email", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
      toast({ title: "Settings Saved", description: "Email configuration updated successfully." });
    },
    onError: (e: Error) => toast({ title: "Save Failed", description: e.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: (to: string) => api.post("/settings/email/test", { to }),
    onSuccess: () => toast({ title: "Test Email Sent", description: `Check ${testEmail} for the test message.` }),
    onError: (e: Error) => toast({ title: "Test Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>;

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = Object.fromEntries(fd.entries());
    // Convert switch values
    data.useSsl = fd.get("useSsl") === "on";
    data.enabled = fd.get("enabled") === "on";
    saveMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-black p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-orange-500 p-8 text-white shadow-2xl">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-orange-100 text-sm font-medium">
              <Mail className="h-4 w-4" />
              <span>Communication Infrastructure</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">Email Configuration</h1>
            <p className="text-orange-100/80 max-w-md">Manage institutional SMTP settings, configure notification protocols, and verify automated communication delivery.</p>
          </div>
          <MailCheck className="h-16 w-16 text-white/20" />
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <CardTitle className="font-black text-sm uppercase tracking-widest">SMTP Server Settings</CardTitle>
            </div>
            <CardDescription className="text-[10px] font-bold uppercase">Configure your outgoing mail server (SMTP) for system notifications.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-dashed border-slate-300">
              <div className="space-y-0.5">
                <Label className="text-sm font-black uppercase tracking-tight">Enable Email Notifications</Label>
                <p className="text-[10px] text-muted-foreground font-bold italic">Allow the system to send automated emails.</p>
              </div>
              <Switch name="enabled" defaultChecked={settings?.enabled} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="host" className="text-[10px] font-black uppercase text-slate-500">SMTP Host</Label>
                <Input id="host" name="host" defaultValue={settings?.host} placeholder="smtp.gmail.com" required className="font-bold" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port" className="text-[10px] font-black uppercase text-slate-500">Port</Label>
                <Input id="port" name="port" type="number" defaultValue={settings?.port} placeholder="465 or 587" required className="font-bold" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="user" className="text-[10px] font-black uppercase text-slate-500">Username / Email</Label>
                <Input id="user" name="user" defaultValue={settings?.user} placeholder="notifications@yourdomain.com" required className="font-bold" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pass" className="text-[10px] font-black uppercase text-slate-500">Password</Label>
                <Input id="pass" name="pass" type="password" defaultValue={settings?.pass} placeholder="••••••••" className="font-bold" />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Switch id="useSsl" name="useSsl" defaultChecked={settings?.useSsl} />
              <Label htmlFor="useSsl" className="text-[10px] font-black uppercase text-slate-500">Use SSL/TLS (Recommended for port 465)</Label>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle className="font-black text-sm uppercase tracking-widest">Sender Details</CardTitle>
            </div>
            <CardDescription className="text-[10px] font-bold uppercase">How the emails will appear in the candidate's inbox.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fromName" className="text-[10px] font-black uppercase text-slate-500">Sender Name</Label>
              <Input id="fromName" name="fromName" defaultValue={settings?.fromName} placeholder="Sankara Academy of Vision" required className="font-bold" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fromEmail" className="text-[10px] font-black uppercase text-slate-500">Sender Email</Label>
              <Input id="fromEmail" name="fromEmail" defaultValue={settings?.fromEmail} placeholder="admissions@sankaraeye.com" required className="font-bold" />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-md sticky bottom-6 z-50">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            <p className="text-sm font-black text-slate-700 uppercase tracking-tight">Verify your settings before sending offers.</p>
          </div>
          <Button type="submit" size="lg" className="gap-2 px-10 font-black uppercase tracking-widest text-xs h-12" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </Button>
        </div>
      </form>

      <Separator />

      <Card className="border-orange-100 bg-orange-50/20 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-orange-600" />
            <CardTitle className="text-orange-900 font-black text-sm uppercase tracking-widest">Test Connection</CardTitle>
          </div>
          <CardDescription className="text-[10px] font-bold uppercase text-orange-700/60">Send a test email to verify your SMTP settings are correct.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input 
              placeholder="Enter recipient email..." 
              value={testEmail} 
              onChange={(e) => setTestEmail(e.target.value)}
              className="max-w-md font-bold"
            />
            <Button 
              variant="secondary" 
              className="gap-2 bg-orange-600 text-white hover:bg-orange-700 font-black uppercase text-[10px] tracking-widest h-10 px-6" 
              onClick={() => testMutation.mutate(testEmail)}
              disabled={!testEmail || testMutation.isPending}
            >
              {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send Test Email
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
