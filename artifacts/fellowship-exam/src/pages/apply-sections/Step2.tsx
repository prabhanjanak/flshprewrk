import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { GraduationCap, HeartPulse, Activity, BookOpen } from "lucide-react";
import { Separator } from "../../components/ui/separator";

export default function Step2({ form, set, err }: any) {
  const toggleMedical = (condition: string) => {
    const current = form.medicalConditions || [];
    if (condition === "None of the Above") {
      set("medicalConditions", ["None of the Above"]);
      return;
    }
    const filtered = current.filter((c: string) => c !== "None of the Above");
    if (filtered.includes(condition)) {
      set("medicalConditions", filtered.filter((c: string) => c !== condition));
    } else {
      set("medicalConditions", [...filtered, condition]);
    }
  };

  const handleSurgicalExp = (key: string, value: string) => {
    set("surgicalExperience", { ...(form.surgicalExperience || {}), [key]: value });
  };

  const handleDiagnosticSkills = (key: string, value: string) => {
    set("diagnosticSkills", { ...(form.diagnosticSkills || {}), [key]: value });
  };

  const handleMatrix = (key: string, value: string) => {
    set("qualificationMatrix", { ...(form.qualificationMatrix || {}), [key]: value });
  };

  const skillsList = [
    "Slit Lamp", "Fundus Exam (+90D)", "Indirect Ophthalmoscopy", "Applanation Tonometry",
    "Gonioscopy", "Biometry (Keratometry, A Scan)", "Ultrasound B Scan", "Corneal Topography",
    "Specular Microscopy", "Visual Fields (HFA)", "Fundus Fluorescein Angiography (FFA)",
    "Optical Coherence Tomography (OCT)", "YAG Capsulotomy / Iridotomy", "Argon Laser", "Hess Charting"
  ];

  const surgicalList = [
    "ECCE", "SICS", "PHACO", "Trabeculectomy", "Retina Lasers", "DCR"
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><HeartPulse className="h-4 w-4" /> Section 7: Medical History</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>Medical Conditions <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {["Asthma", "Hypertension", "Diabetes", "Skin Allergy", "Hearing Impairment", "Tuberculosis", "Post Covid", "None of the Above"].map((cond) => (
                <label key={cond} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted dark:hover:bg-muted/50 p-2 rounded border border-border">
                  <Checkbox checked={(form.medicalConditions || []).includes(cond)} onCheckedChange={() => toggleMedical(cond)} />
                  {cond}
                </label>
              ))}
            </div>
            {err("medicalConditions")}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Section 8: Educational Qualifications</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Degree <span className="text-destructive">*</span></Label>
              <Input placeholder="Enter Degree" value={form.degree || ""} onChange={(e) => set("degree", e.target.value)} />
              {err("degree")}
            </div>
            <div className="space-y-1.5">
              <Label>Medical College (College, City, State, Country) <span className="text-destructive">*</span></Label>
              <Input placeholder="Enter College Details" value={form.medicalCollege || ""} onChange={(e) => set("medicalCollege", e.target.value)} />
              {err("medicalCollege")}
            </div>
            <div className="space-y-1.5">
              <Label>University (MBBS) <span className="text-destructive">*</span></Label>
              <Input placeholder="Enter University" value={form.university || ""} onChange={(e) => set("university", e.target.value)} />
              {err("university")}
            </div>
            <div className="space-y-1.5">
              <Label>Postgraduate Qualification <span className="text-destructive">*</span></Label>
              <Input placeholder="Enter PG Qualification" value={form.pgQualification || ""} onChange={(e) => set("pgQualification", e.target.value)} />
              {err("pgQualification")}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Medical Council Registration Number <span className="text-destructive">*</span></Label>
              <Input placeholder="Registration Number" value={form.medicalCouncilNumber || ""} onChange={(e) => set("medicalCouncilNumber", e.target.value)} />
              {err("medicalCouncilNumber")}
            </div>
          </div>

          <Separator />
          <div className="space-y-4">
            <Label className="text-base font-semibold">Qualification Matrix <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-1 gap-4 bg-muted/20 dark:bg-muted/10 p-4 rounded-lg border border-border">
              {["DO", "MS/MD", "DNB"].map(qual => (
                <div key={qual} className="space-y-2">
                  <div className="flex items-center gap-4">
                    <Label className="w-16 font-medium">{qual}</Label>
                    <RadioGroup value={form.qualificationMatrix?.[qual] || ""} onValueChange={(v) => handleMatrix(qual, v)} className="flex gap-3">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Yes" id={`${qual}-yes`} />
                        <Label htmlFor={`${qual}-yes`} className="font-normal cursor-pointer">Yes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="No" id={`${qual}-no`} />
                        <Label htmlFor={`${qual}-no`} className="font-normal cursor-pointer">No</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Not Applicable" id={`${qual}-na`} />
                        <Label htmlFor={`${qual}-na`} className="font-normal cursor-pointer">N/A</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  {form.qualificationMatrix?.[qual] === "Yes" && (
                    <div className="pl-20 max-w-sm pt-1">
                      <Input placeholder={`${qual === 'DNB' ? 'Institution' : 'College'} & Year`} value={form[`${qual.replace('/', '')}Details`] || ""} onChange={(e) => set(`${qual.replace('/', '')}Details`, e.target.value)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="space-y-1.5 pt-2">
              <Label>Other Certifications</Label>
              <Textarea rows={2} placeholder="List other certifications..." value={form.otherCertifications || ""} onChange={(e) => set("otherCertifications", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Section 9: Clinical Experience</CardTitle></CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-3">
            <Label>Skills <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {skillsList.map((skill) => (
                <div key={skill} className="flex flex-col sm:flex-row sm:items-center justify-between border border-border rounded px-3 py-2 gap-2 bg-background">
                  <span className="text-sm font-medium">{skill}</span>
                  <RadioGroup value={form.diagnosticSkills?.[skill] || ""} onValueChange={(v) => handleDiagnosticSkills(skill, v)} className="flex gap-3 shrink-0">
                    <div className="flex items-center space-x-1">
                      <RadioGroupItem value="Beginner" id={`${skill}-beg`} />
                      <Label htmlFor={`${skill}-beg`} className="text-xs font-normal cursor-pointer">Beginner</Label>
                    </div>
                    <div className="flex items-center space-x-1">
                      <RadioGroupItem value="Intermittent" id={`${skill}-int`} />
                      <Label htmlFor={`${skill}-int`} className="text-xs font-normal cursor-pointer">Intermittent</Label>
                    </div>
                    <div className="flex items-center space-x-1">
                      <RadioGroupItem value="Expert" id={`${skill}-exp`} />
                      <Label htmlFor={`${skill}-exp`} className="text-xs font-normal cursor-pointer">Expert</Label>
                    </div>
                  </RadioGroup>
                </div>
              ))}
            </div>
          </div>

          <Separator />
          
          <div className="space-y-3">
            <Label>Surgical Numbers <span className="text-destructive">*</span></Label>
            <div className="grid grid-cols-1 gap-3 max-w-3xl">
              <div className="grid grid-cols-[1fr_120px_120px] gap-4 mb-1 px-3">
                <span className="text-xs font-semibold text-muted-foreground">Procedure</span>
                <span className="text-xs font-semibold text-muted-foreground text-center">Under Supervision</span>
                <span className="text-xs font-semibold text-muted-foreground text-center">Independently</span>
              </div>
              
              {surgicalList.map((surg) => (
                <div key={surg} className="grid grid-cols-[1fr_120px_120px] items-center gap-4 border border-border rounded px-3 py-2 bg-background">
                  <span className="text-sm font-medium">{surg}</span>
                  <Input type="number" min="0" placeholder="Count" value={form.surgicalExperience?.[`${surg}_Supervision`] || ""} onChange={(e) => handleSurgicalExp(`${surg}_Supervision`, e.target.value)} className="h-8 text-center" />
                  <Input type="number" min="0" placeholder="Count" value={form.surgicalExperience?.[`${surg}_Independent`] || ""} onChange={(e) => handleSurgicalExp(`${surg}_Independent`, e.target.value)} className="h-8 text-center" />
                </div>
              ))}
              
              <div className="grid grid-cols-[1fr_120px] items-center gap-4 mt-2 px-3 py-2 bg-muted/50 dark:bg-muted/20 rounded font-semibold border border-border">
                <span>Total Surgeries</span>
                <Input type="number" min="0" placeholder="Total" value={form.surgicalExperience?.["Total Surgeries"] || ""} onChange={(e) => handleSurgicalExp("Total Surgeries", e.target.value)} className="h-8 text-center bg-background" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4" /> Section 10: Publications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Journal Publications <span className="text-destructive">*</span></Label>
            <Textarea rows={3} placeholder="List your publications..." value={form.publications || ""} onChange={(e) => set("publications", e.target.value)} />
            {err("publications")}
          </div>
          <div className="space-y-1.5">
            <Label>Presentations <span className="text-destructive">*</span></Label>
            <Textarea rows={3} placeholder="List your presentations..." value={form.presentations || ""} onChange={(e) => set("presentations", e.target.value)} />
            {err("presentations")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


