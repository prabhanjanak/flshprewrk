import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { User, Stethoscope, FileText, Info } from "lucide-react";
import { Badge } from "../../components/ui/badge";

export const specializationsMap: Record<string, string[]> = {
  "Cornea": ["Bangalore", "Guntur", "Shimoga", "Jaipur", "Not Applicable"],
  "Glaucoma": ["Bangalore", "Coimbatore", "Guntur", "Shimoga", "Not Applicable"],
  "IOL": ["Anand", "Bangalore", "Coimbatore", "Guntur", "Hyderabad", "Indore", "Jaipur", "Kanpur", "Krishnankoil", "Ludhiana", "Panvel", "Shimoga", "Varanasi", "Not Applicable"],
  "Oculoplasty": ["Bangalore", "Varanasi", "Not Applicable"],
  "Pediatric Ophthalmology": ["Bangalore", "Coimbatore", "Guntur", "Shimoga", "Not Applicable"],
  "Phaco Refractive": ["Coimbatore", "Not Applicable"],
};

export default function Step1({ form, set, err, formInfo }: any) {
  const toggleSpecialization = (spec: string) => {
    const current = form.specialization || [];
    if (current.includes(spec)) {
      set("specialization", current.filter((s: string) => s !== spec));
      // clear units for this spec
      const newCenters = { ...form.centerPreference };
      delete newCenters[spec];
      set("centerPreference", newCenters);
    } else {
      set("specialization", [...current, spec]);
    }
  };

  const toggleUnit = (spec: string, unit: string) => {
    const currentUnits = form.centerPreference?.[spec] || [];
    let newUnits;
    if (unit === "Not Applicable") {
      newUnits = ["Not Applicable"];
    } else {
      if (currentUnits.includes(unit)) {
        newUnits = currentUnits.filter((u: string) => u !== unit);
      } else {
        newUnits = [...currentUnits.filter((u: string) => u !== "Not Applicable"), unit];
      }
    }
    set("centerPreference", { ...form.centerPreference, [spec]: newUnits });
  };

  const specializationsList = [
    "IOL", "Cornea", "Glaucoma", "Oculoplasty", "Pediatric Ophthalmology", "Phaco Refractive"
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Section 1 & 2: Specializations & Units</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Specializations <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {specializationsList.map((s: string) => (
                <label key={s} className="flex items-center gap-2 border border-border p-3 rounded-lg cursor-pointer hover:bg-muted dark:hover:bg-muted/50 transition-colors">
                  <Checkbox checked={form.specialization?.includes(s)} onCheckedChange={() => toggleSpecialization(s)} />
                  <span className="text-sm">{s}</span>
                </label>
              ))}
            </div>
            {err("specialization")}
          </div>

          {(form.specialization || []).length > 0 && (
            <div className="space-y-4 p-4 bg-muted/30 dark:bg-muted/10 rounded-lg border border-border">
              <Label>Specialization Units <span className="text-destructive">*</span></Label>
              {(form.specialization || []).map((spec: string) => (
                <div key={spec} className="space-y-3 pb-3 border-b last:border-0 border-border">
                  <Badge variant="outline" className="bg-background">{spec}</Badge>
                  <div className="flex flex-wrap gap-2">
                    {(specializationsMap[spec] || []).map((u: string) => (
                      <label key={u} className="flex items-center gap-2 border border-border bg-background p-2 text-xs rounded cursor-pointer hover:bg-muted dark:hover:bg-muted/50 transition-colors">
                        <Checkbox checked={!!form.centerPreference?.[spec]?.includes(u)} onCheckedChange={() => toggleUnit(spec, u)} />
                        <span>{u}</span>
                      </label>
                    ))}
                  </div>
                  {err(`centerPreference_${spec}`)}
                  
                  {spec === "Oculoplasty" && (
                    <div className="pt-2 max-w-sm">
                      <Label className="text-xs text-muted-foreground mb-1 block">Other Unit (Optional)</Label>
                      <Input placeholder="Specify other unit..." value={form.otherOculoplastyUnit || ""} onChange={e => set("otherOculoplastyUnit", e.target.value)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Info className="h-4 w-4" /> Section 3 & 4: Source of Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>Where did you hear about this Fellowship? <span className="text-destructive">*</span></Label>
            <RadioGroup value={form.referralSource} onValueChange={(v) => set("referralSource", v)} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                "Sankara Website",
                "Word of Mouth",
                "Referred by faculty/trainee",
                "IJO Advertisement",
                "Social Media"
              ].map(src => (
                <div key={src} className="flex items-center space-x-2 border border-border p-3 rounded-lg">
                  <RadioGroupItem value={src} id={`src-${src}`} />
                  <Label htmlFor={`src-${src}`} className="cursor-pointer font-normal">{src}</Label>
                </div>
              ))}
            </RadioGroup>
            {err("referralSource")}
          </div>

          {form.referralSource === "Referred by faculty/trainee" && (
            <div className="space-y-1.5">
              <Label>Referral Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Enter Referral Name" value={form.referredByName || ""} onChange={(e) => set("referredByName", e.target.value)} />
              {err("referredByName")}
            </div>
          )}

          {form.referralSource === "Social Media" && (
            <div className="space-y-1.5">
              <Label>Platform Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. LinkedIn, Instagram, Facebook" value={form.mediaSource || ""} onChange={(e) => set("mediaSource", e.target.value)} />
              {err("mediaSource")}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> Section 5: Personal Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Enter Full Name" value={form.fullName || ""} onChange={(e) => set("fullName", e.target.value)} />
              {err("fullName")}
            </div>

            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input type="email" placeholder="name@example.com" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
              {err("email")}
            </div>

            <div className="space-y-1.5">
              <Label>Mobile Number <span className="text-destructive">*</span></Label>
              <Input placeholder="+919876543210" value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} maxLength={13} />
              {err("phone")}
            </div>

            <div className="space-y-1.5">
              <Label>Date of Birth <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.dateOfBirth || ""} onChange={(e) => set("dateOfBirth", e.target.value)} />
              {err("dateOfBirth")}
            </div>

            <div className="space-y-1.5">
              <Label>Marital Status <span className="text-destructive">*</span></Label>
              <RadioGroup value={form.maritalStatus} onValueChange={(v) => set("maritalStatus", v)} className="flex gap-4 mt-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Married" id="ms-married" />
                  <Label htmlFor="ms-married">Married</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Unmarried" id="ms-unmarried" />
                  <Label htmlFor="ms-unmarried">Unmarried</Label>
                </div>
              </RadioGroup>
              {err("maritalStatus")}
            </div>

            {form.maritalStatus === "Married" && (
              <div className="sm:col-span-2 space-y-1.5 mt-2">
                <Label>Spouse Details <span className="text-destructive">*</span></Label>
                <Input placeholder="Spouse Name & Occupation" value={form.spouseDetails || ""} onChange={(e) => set("spouseDetails", e.target.value)} />
                {err("spouseDetails")}
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2 mt-2">
              <Label>Permanent Address <span className="text-destructive">*</span></Label>
              <Textarea placeholder="Enter Permanent Address" rows={2} value={form.permanentAddress || ""} onChange={(e) => set("permanentAddress", e.target.value)} />
              {err("permanentAddress")}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Preferred Mailing Address <span className="text-destructive">*</span></Label>
              <Textarea placeholder="Enter Mailing Address" rows={2} value={form.mailingAddress || ""} onChange={(e) => set("mailingAddress", e.target.value)} />
              {err("mailingAddress")}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Section 6: Previous Application</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>Appeared for SAV Fellowship earlier?</Label>
            <RadioGroup value={form.appearedEarlier} onValueChange={(v) => set("appearedEarlier", v)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Yes" id="prev-yes" />
                <Label htmlFor="prev-yes">Yes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="No" id="prev-no" />
                <Label htmlFor="prev-no">No</Label>
              </div>
            </RadioGroup>
          </div>

          {form.appearedEarlier === "Yes" && (
            <div className="space-y-1.5 max-w-xs pt-2">
              <Label>Month & Year <span className="text-destructive">*</span></Label>
              <Input placeholder="MM/YYYY" value={form.previousApplicationMonthYear || ""} onChange={(e) => set("previousApplicationMonthYear", e.target.value)} />
              {err("previousApplicationMonthYear")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



