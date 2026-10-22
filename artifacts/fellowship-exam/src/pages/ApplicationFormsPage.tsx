import { useState, useEffect, useRef } from "react";
import { fmtDate, fmtTime } from "../lib/dateUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useProgram } from "../contexts/ProgramContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { Separator } from "../components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Plus, Link2, Copy, Check, Eye, EyeOff, Users, Clock, ChevronRight, ArrowLeft, ExternalLink,
  FileCheck, FileX, Loader2, Trash2, Download, CreditCard, GripVertical, Settings2, X,
  RefreshCw, CheckCheck, Ban, FileText, ImageIcon, ChevronDown, ChevronUp, Building2, Printer,
  Edit3 as Edit, Save, AlertCircle, FileJson, CheckCircle2, LayoutDashboard, CalendarDays,
  FileSignature, ExternalLink as ExtLink, FileType, CheckCircle, UserPlus, GitMerge,
  Mail, Send, Search, Phone, IndianRupee, ShieldCheck, Zap,
  Share2
} from "lucide-react";
import { ShareApplicationDialog } from "../components/ShareApplicationDialog";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "../hooks/use-toast";
import QRCode from "react-qr-code";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  BookOpen,
  Award,
  ClipboardList,
  Activity,
  Sparkles,
  Briefcase,
  TrendingUp,
  Percent,
} from "lucide-react";
import { getCleanObjectPath } from "../lib/utils";


interface CustomField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "checkbox_group" | "date" | "time" | "file" | "number" | "email" | "phone" | "heading" | "static_text";
  options?: string[];
  required: boolean;
  placeholder?: string;
  description?: string;
}

interface ApplicationForm {
  id: number; token: string; programId: number; programName: string | null;
  title: string; description: string | null; deadline: string | null;
  isActive: boolean; createdAt: string; submissionCount: number; pendingCount: number;
  customFields?: CustomField[];
  sectionsConfig?: any[];
}
interface Submission {
  [key: string]: any;
  id: number; formId: number; status: string; fullName: string; email: string;
  phone: string | null; specialization: string | null; centerPreference: string | null;
  permanentAddress: string | null; mailingAddress: string | null;
  dateOfBirth: string | null; maritalStatus: string | null; spouseDetails: string | null;
  healthDeclaration: string | null;
  referralSource: string | null; referredByName: string | null;
  degree: string | null; medicalCollege: string | null; university: string | null;
  pgQualifications: string | null;
  doQualification: boolean | null; doDetails: string | null;
  msMdQualification: boolean | null; msMdDetails: string | null;
  dnbQualification: boolean | null; dnbDetails: string | null;
  otherTraining: string | null;
  medicalCouncilNumber: string | null;
  totalSurgeries: string | null;
  diagnosticSkills: string | null;
  surgicalExperience: string | null;
  publications: string | null; presentations: string | null;
  lor1Url: string | null; lor1RefName: string | null; lor1RefContact: string | null; lor1RefEmail: string | null;
  lor2Url: string | null; lor2RefName: string | null; lor2RefContact: string | null; lor2RefEmail: string | null;
  paymentUrl: string | null; photoUrl: string | null;
  otherInformation: string | null;
  declarationAccepted: boolean | null; submittedAt: string;
  reviewNotes: string | null; customAnswers?: Record<string, string>;
  readyForReview?: boolean; source?: string;
  formData?: any;
  candidateCode?: string | null;
  paymentId?: string | null;
  paidAmount?: number | null;
}
interface Program { id: number; name: string; }

/** Parse specialization field — may be a JSON array, PostgreSQL array or plain comma-separated string */
function parseSpecializations(spec: string | null | undefined): string[] {
  if (!spec) return [];
  let s = spec.trim();
  
  // Handle PostgreSQL curly-brace array format: {"Cornea", "Phaco Refractive"}
  if (s.startsWith("{") && s.endsWith("}")) {
    s = s.substring(1, s.length - 1);
    const list: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < s.length; i++) {
      const char = s[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        list.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim() || list.length > 0) {
      list.push(current.trim());
    }
    return list.map(item => {
      let cleaned = item;
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }
      return cleaned.trim();
    }).filter(Boolean);
  }

  try {
    const parsed: unknown = JSON.parse(s);
    if (Array.isArray(parsed)) return (parsed as unknown[]).map(String).filter(Boolean);
  } catch { /* not JSON */ }
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/** Parse center preference field — may be JSON or needs fallback to customAnswers */
function parseCenterPreferences(cp: string | null | undefined, customAnswers?: any, sections?: any[]): Record<string, string> {
  if (cp) {
    try {
      const parsed: unknown = JSON.parse(cp);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, string>;
    } catch { /* not JSON or invalid */ }
  }

  // Fallback: search customAnswers for unit_* fields
  if (customAnswers && typeof customAnswers === "object") {
    const prefs: Record<string, string> = {};
    Object.entries(customAnswers).forEach(([key, val]) => {
      if (key.startsWith("unit_") && val) {
        let label = key.replace("unit_", "").replace(/_/g, " ").toUpperCase();
        // Try to find the real label from sectionsConfig
        if (sections) {
          sections.forEach(sec => {
            sec.fields?.forEach((f: any) => {
              if (f.id === key) label = f.label.replace(" Preferred Center", "");
            });
          });
        }
        prefs[label] = Array.isArray(val) ? val.join(", ") : String(val);
      }
    });
    return prefs;
  }
  return {};
}

/** Unified function to match and format all candidate specializations with their selected center preferences */
function getFormattedSpecialityPrefs(
  specializationStr: string | null | undefined,
  centerPreferenceStr: string | null | undefined,
  formData: any,
  customAnswers: any,
  sectionsConfig?: any[]
): { spec: string; location: string | null }[] {
  const specs = parseSpecializations(specializationStr);
  if (specs.length === 0) return [];

  const prefs: Record<string, string> = {};

  if (centerPreferenceStr) {
    try {
      const parsed = JSON.parse(centerPreferenceStr);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.entries(parsed).forEach(([k, v]) => {
          prefs[k] = Array.isArray(v) ? v.join(", ") : String(v);
        });
      }
    } catch { /* not JSON */ }
  }

  const extractUnitFields = (obj: any) => {
    if (obj && typeof obj === "object") {
      Object.entries(obj).forEach(([key, val]) => {
        if (key.startsWith("unit_") && val) {
          let label = key.replace("unit_", "").replace(/_/g, " ").toUpperCase();
          if (sectionsConfig) {
            sectionsConfig.forEach((sec: any) => {
              sec.fields?.forEach((f: any) => {
                if (f.id === key && f.label) {
                  label = f.label.replace(" Preferred Center", "");
                }
              });
            });
          }
          prefs[label] = Array.isArray(val) ? val.join(", ") : String(val);
        }
      });
    }
  };

  extractUnitFields(formData);
  extractUnitFields(customAnswers);
  if (formData && formData.formData) {
    extractUnitFields(formData.formData);
  }

  const normalize = (str: string): string => {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
  };

  const normalizedPrefs: Record<string, string> = {};
  Object.entries(prefs).forEach(([k, v]) => {
    normalizedPrefs[normalize(k)] = v;
    if (k.startsWith("unit_")) {
      normalizedPrefs[normalize(k.substring(5))] = v;
    }
  });

  const result: { spec: string; location: string | null }[] = [];
  specs.forEach(spec => {
    const normSpec = normalize(spec);
    let loc = normalizedPrefs[normSpec];

    if (!loc) {
      const key = Object.keys(normalizedPrefs).find(k => k.includes(normSpec) || normSpec.includes(k));
      if (key) {
        loc = normalizedPrefs[key];
      }
    }

    if (!loc && centerPreferenceStr) {
      const trimmedCp = centerPreferenceStr.trim();
      if (!trimmedCp.startsWith("{") && !trimmedCp.startsWith("[") && trimmedCp !== "0" && trimmedCp.toLowerCase() !== "not applicable") {
        loc = trimmedCp;
      }
    }

    if (loc && (loc.toLowerCase().trim() === "not applicable" || loc.toLowerCase().trim() === "not_applicable")) {
      loc = "";
    }

    result.push({
      spec,
      location: loc ? loc.trim() : null
    });
  });

  return result;
}

/** Retrieve all valid, applied-for specializations by looking at center preference locations */
function parseActualSpecializations(s: any): string[] {
  if (!s) return [];
  return parseSpecializations(s.specialization);
}

function cleanDoctorName(rawName: string | null | undefined): string {
  if (!rawName) return "";
  return rawName.replace(/^(?:\s*(?:dr\.?|doctor)\s*)+/gi, "").trim();
}

function isRetinaSpecialty(spec: string | null | undefined): boolean {
  if (!spec) return false;
  const s = spec.toLowerCase();
  return s.includes("retina") || s.includes("vrs") || s.includes("vitreo");
}

function SubmissionFormDataEditor({ sectionsConfig, formData, onChange, onFileUpload }: { sectionsConfig: any[], formData: any, onChange: (newData: any) => void, onFileUpload?: (field: string, url: string) => void }) {
  const updateField = (id: string, mapping: string | undefined, value: any, isStandard?: boolean) => {
    if (isStandard && mapping) {
      onChange({ ...formData, [mapping]: value });
    } else {
      const currentFormData = formData.formData || {};
      onChange({ ...formData, formData: { ...currentFormData, [id]: value } });
    }
  };

  const getFieldValue = (id: string | undefined, mapping: string | undefined, isStandard?: boolean) => {
    if (isStandard && mapping) {
      return formData[mapping];
    }
    return id ? formData.formData?.[id] : undefined;
  };

  return (
    <div className="space-y-12">
      {sectionsConfig.map((section: any) => (
        <motion.div 
          key={section.id} 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1 h-5 bg-orange-500 rounded-full"></span>
              {section.title}
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {section.fields?.map((field: any) => {
              if (field.type === 'heading' || field.type === 'static_text' || field.type === 'info') return null;
              
              const val = getFieldValue(field.id, field.mapping, field.isStandard);

              // Conditional visibility logic
              if (field.visibleIf) {
                const targetVal = getFieldValue(field.visibleIf.field, undefined, false);
                const standardTargetVal = getFieldValue(undefined, field.visibleIf.field, true);
                const actualTargetVal = targetVal !== undefined ? targetVal : standardTargetVal;

                const conditionValue = field.visibleIf.contains || field.visibleIf.equals;
                
                if (field.visibleIf.key) {
                   if (actualTargetVal?.[field.visibleIf.key] !== conditionValue) return null;
                } else if (field.visibleIf.contains) {
                   if (!actualTargetVal || !actualTargetVal.includes(conditionValue)) return null;
                } else if (field.visibleIf.equals) {
                   if (actualTargetVal !== conditionValue) return null;
                }
              }

              const isFullWidth = ['skills_table', 'surgery_table', 'qualification_matrix', 'textarea', 'checkbox_group', 'file'].includes(field.type);
              
              return (
                <div key={field.id} className={`space-y-2.5 ${isFullWidth ? 'md:col-span-2' : ''}`}>
                  <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">{field.label}</Label>
                  
                  {field.type === 'text' || field.type === 'email' || field.type === 'number' || field.type === 'phone' ? (
                    <Input 
                      type={field.type === 'phone' ? 'text' : field.type}
                      value={val || ""} 
                      onChange={(e) => updateField(field.id, field.mapping, e.target.value, field.isStandard)}
                      className="bg-white/50 backdrop-blur-sm border-slate-200 focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 h-10 transition-all rounded-xl"
                      placeholder={field.placeholder || field.label}
                    />
                  ) : field.type === 'textarea' ? (
                    <Textarea 
                      value={val || ""} 
                      onChange={(e) => updateField(field.id, field.mapping, e.target.value, field.isStandard)}
                      className="bg-white/50 backdrop-blur-sm border-slate-200 focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 min-h-[120px] transition-all rounded-xl"
                      placeholder={field.label}
                    />
                  ) : field.type === 'select' ? (
                    <Select value={val || ""} onValueChange={(v) => updateField(field.id, field.mapping, v, field.isStandard)}>
                      <SelectTrigger className="bg-white/50 border-slate-200 h-11 rounded-xl transition-all">
                        <SelectValue placeholder="Select Option" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {field.options?.map((opt: string) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'radio' ? (
                    <RadioGroup value={val || ""} onValueChange={(v) => updateField(field.id, field.mapping, v, field.isStandard)} className="flex flex-wrap gap-4 pt-1">
                      {field.options?.map((opt: string) => (
                        <div key={opt} className={`flex items-center space-x-3 bg-slate-50 px-4 py-2.5 rounded-xl border transition-all cursor-pointer ${val === opt ? 'border-orange-200 bg-orange-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                          <RadioGroupItem value={opt} id={`${field.id}-${opt}`} />
                          <Label htmlFor={`${field.id}-${opt}`} className="text-sm font-bold text-slate-700 cursor-pointer">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  ) : field.type === 'date' ? (
                    <Input 
                      type="date" 
                      value={val || ""} 
                      onChange={(e) => updateField(field.id, field.mapping, e.target.value, field.isStandard)}
                      className="bg-white/50 border-slate-200 h-10 rounded-xl"
                    />
                  ) : field.type === 'checkbox' ? (
                    <div className={`flex items-center space-x-3 p-4 rounded-xl border transition-all ${!!val ? 'border-orange-200 bg-orange-50/50' : 'border-slate-100 bg-slate-50/50'}`}>
                      <Checkbox 
                        id={field.id} 
                        checked={!!val} 
                        onCheckedChange={(checked) => updateField(field.id, field.mapping, !!checked, field.isStandard)} 
                      />
                      <Label htmlFor={field.id} className="text-sm font-bold text-slate-700 leading-none cursor-pointer">{field.label}</Label>
                    </div>
                  ) : field.type === 'checkbox_group' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                      {field.options?.map((opt: string) => (
                        <div key={opt} className={`flex items-center space-x-3 p-4 rounded-xl border transition-all ${val?.includes(opt) ? 'border-orange-200 bg-orange-50/50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                          <Checkbox 
                            id={`${field.id}-${opt}`} 
                            checked={val?.includes(opt)} 
                            onCheckedChange={(checked) => {
                              let current = Array.isArray(val) ? [...val] : [];
                              if (checked) {
                                if (opt === "None of the Above") current = [opt];
                                else {
                                  current = current.filter(i => i !== "None of the Above");
                                  current.push(opt);
                                }
                              } else {
                                current = current.filter(i => i !== opt);
                              }
                              updateField(field.id, field.mapping, current, field.isStandard);
                            }} 
                          />
                          <Label htmlFor={`${field.id}-${opt}`} className="text-sm font-bold text-slate-700 cursor-pointer">{opt}</Label>
                        </div>
                      ))}
                    </div>
                  ) : field.type === 'skills_table' ? (
                    <div className="overflow-hidden border border-slate-100 rounded-2xl shadow-sm bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                          <tr>
                            <th className="px-6 py-4 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Skill</th>
                            {field.options?.map((opt: string) => (
                              <th key={opt} className="px-6 py-4 text-center font-black text-slate-500 uppercase tracking-widest text-[10px]">{opt}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {field.rows?.map((row: string) => (
                            <tr key={row} className="hover:bg-slate-50/30 transition-colors">
                              <td className="px-6 py-4 font-bold text-slate-800">{row}</td>
                              {field.options?.map((opt: string) => {
                                const isChecked = (typeof val === 'string' ? JSON.parse(val || "{}") : (val || {}))[row] === opt;
                                return (
                                  <td key={opt} className="px-6 py-4 text-center">
                                    <input
                                      type="radio"
                                      name={`${field.id}_${row}`}
                                      checked={isChecked}
                                      onChange={() => {
                                        const current = typeof val === 'string' ? JSON.parse(val || "{}") : (val || {});
                                        updateField(field.id, field.mapping, { ...current, [row]: opt }, field.isStandard);
                                      }}
                                      className="w-4 h-4 text-orange-600 border-slate-300 focus:ring-orange-500 transition-all"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : field.type === 'surgery_table' ? (
                    <div className="overflow-hidden border border-slate-100 rounded-2xl shadow-sm bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                          <tr>
                            <th className="px-6 py-4 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Surgery Type</th>
                            <th className="px-6 py-4 text-center font-black text-orange-600 bg-orange-50/30 uppercase tracking-widest text-[10px]">Supervision</th>
                            <th className="px-6 py-4 text-center font-black text-emerald-600 bg-emerald-50/30 uppercase tracking-widest text-[10px]">Independent</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {field.rows?.map((row: string) => {
                            const data = (typeof val === 'string' ? JSON.parse(val || "{}") : (val || {}))[row] || {};
                            return (
                              <tr key={row} className="hover:bg-slate-50/30 transition-colors">
                                <td className="px-6 py-4 font-bold text-slate-800">{row}</td>
                                <td className="px-6 py-4 bg-orange-50/5">
                                  <Input 
                                    type="number"
                                    value={data.supervision || ""}
                                    onChange={(e) => {
                                      const current = typeof val === 'string' ? JSON.parse(val || "{}") : (val || {});
                                      updateField(field.id, field.mapping, { ...current, [row]: { ...data, supervision: parseInt(e.target.value) || 0 } }, field.isStandard);
                                    }}
                                    className="w-24 mx-auto h-9 text-center rounded-lg border-slate-200 focus:ring-orange-500/20"
                                  />
                                </td>
                                <td className="px-6 py-4 bg-emerald-50/5">
                                  <Input 
                                    type="number"
                                    value={data.independent || ""}
                                    onChange={(e) => {
                                      const current = typeof val === 'string' ? JSON.parse(val || "{}") : (val || {});
                                      updateField(field.id, field.mapping, { ...current, [row]: { ...data, independent: parseInt(e.target.value) || 0 } }, field.isStandard);
                                    }}
                                    className="w-24 mx-auto h-9 text-center rounded-lg border-slate-200 focus:ring-emerald-500/20"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : field.type === 'qualification_matrix' ? (
                    <div className="overflow-hidden border border-slate-100 rounded-2xl shadow-sm bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                          <tr>
                            <th className="px-6 py-4 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Qualification</th>
                            <th className="px-6 py-4 text-center font-black text-slate-500 uppercase tracking-widest text-[10px]">Yes</th>
                            <th className="px-6 py-4 text-center font-black text-slate-500 uppercase tracking-widest text-[10px]">No</th>
                            <th className="px-6 py-4 text-center font-black text-slate-500 uppercase tracking-widest text-[10px]">N/A</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {['DO (Diploma Ophthlmology)', 'MS/MD ( Masters in Ophthalmology)', 'DNB'].map((q: string) => {
                            const current = typeof val === 'string' ? JSON.parse(val || "{}") : (val || {});
                            return (
                              <tr key={q} className="hover:bg-slate-50/30 transition-colors">
                                <td className="px-6 py-4 font-bold text-slate-800">{q}</td>
                                {['Yes', 'No', 'N/A'].map((option: string) => (
                                  <td key={option} className="px-6 py-4 text-center">
                                    <input
                                      type="radio"
                                      name={`${field.id}_${q}`}
                                      checked={current[q] === option}
                                      onChange={() => {
                                        updateField(field.id, field.mapping, { ...current, [q]: option }, field.isStandard);
                                      }}
                                      className="w-4 h-4 text-orange-600 border-slate-300 focus:ring-orange-500"
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : field.type === 'file' ? (
                    <FileFieldEditor
                      label={field.label}
                      currentUrl={val ? String(val) : null}
                      onUploaded={(url) => {
                        updateField(field.id, field.mapping, url, field.isStandard);
                        onFileUpload?.(field.id, url);
                      }}
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground italic p-4 border rounded-xl border-dashed bg-slate-50">
                      {val ? String(val) : 'No data'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/**
 * Inline file upload editor for LOR / Passport photo inside the edit submission form.
 * Uses the same two-step presigned-URL flow as the candidate apply form.
 */
function FileFieldEditor({ label, currentUrl, onUploaded }: { label: string; currentUrl: string | null; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPhoto = label.toLowerCase().includes('photo');
  const isLor = label.toLowerCase().includes('lor') || label.toLowerCase().includes('recommendation');

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const token = localStorage.getItem('fellowship_token');

      // Step 1: Request presigned upload URL
      const urlRes = await fetch('/api/storage/uploads/request-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: file.name, contentType: file.type, size: file.size }),
      });
      if (!urlRes.ok) throw new Error(`Failed to get upload URL: ${urlRes.status}`);
      const { uploadURL, objectPath } = await urlRes.json();

      // Step 2: PUT file to presigned URL
      const uploadHeaders: Record<string, string> = { 'Content-Type': file.type };
      if (token && uploadURL.startsWith('/api/')) {
        uploadHeaders['Authorization'] = `Bearer ${token}`;
      }

      const putRes = await fetch(uploadURL, {
        method: 'PUT',
        headers: uploadHeaders,
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

      onUploaded(objectPath);
      setUploadedName(file.name);

      if (isPhoto) {
        const blobUrl = URL.createObjectURL(file);
        setPreview(blobUrl);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {(uploadedName || currentUrl) && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-emerald-600 font-bold">✓ {uploadedName ? 'Uploaded:' : 'File on record:'}</span>
          <span className="text-slate-500 truncate max-w-[220px] font-mono">
            {uploadedName || currentUrl?.split('/').pop()}
          </span>
        </div>
      )}
      {preview && isPhoto && (
        <img src={preview} alt="Preview" className="h-24 w-20 object-cover rounded-lg border-2 border-orange-200 shadow-sm" />
      )}
      <div
        className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
          uploading ? 'border-orange-300 bg-orange-50/30' : 
          uploadedName ? 'border-emerald-300 bg-emerald-50/20' :
          'border-slate-200 hover:border-orange-400 hover:bg-orange-50/10'
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={isLor ? '.pdf,.jpg,.jpeg,.png,.webp,application/pdf' : isPhoto ? '.jpg,.jpeg,.png,.webp,.heic,image/*' : '.pdf,.jpg,.jpeg,.png,.webp,image/*'}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-orange-600 font-bold">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Uploading & Formatting...
          </div>
        ) : (
          <p className="text-xs text-slate-500 font-medium">
            {uploadedName ? '✓ Replace again?' : currentUrl ? `Click to replace ${label}` : `Click to upload ${label}`}
            <span className="block text-[10px] mt-1 text-slate-400">
              {isLor ? 'PDF, JPG, PNG (Images auto-formatted to standard PDF)' : isPhoto ? 'JPG, PNG, WebP (Auto-cropped to passport size)' : 'PDF, JPG, PNG (Auto-compressed)'}
            </span>
          </p>
        )}
      </div>
      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
    </div>
  );
}

const SPEC_BADGE_COLORS: Record<string, string> = {
  "Vitreo Retina": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "Medical Retina": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  "Cornea": "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  "Glaucoma": "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  "IOL Fellowship": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "Oculoplasty": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "Pediatric Ophthalmology": "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  "Phaco Refractive": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

const getSpecColorClass = (sp: string) => {
  const norm = sp.trim().toLowerCase();
  for (const [k, v] of Object.entries(SPEC_BADGE_COLORS)) {
    const kNorm = k.toLowerCase();
    if (kNorm === norm || kNorm.includes(norm) || norm.includes(kNorm)) {
      return v;
    }
  }
  return "bg-slate-100 text-slate-600";
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800", reviewed: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800",
};

function buildFormLink(token: string) {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return `${window.location.origin}/apply/${token}`;
  }
  return `https://learn.sankaraeye.in/apply/${token}`;
}

function genId() {
  return `cf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const FIELD_TYPE_LABELS: Record<CustomField["type"], string> = {
  text: "Short Text",
  textarea: "Paragraph",
  email: "Email Address",
  phone: "Mobile Number",
  number: "Number",
  date: "Date Picker",
  time: "Time Picker",
  radio: "Radio Button (Select One)",
  checkbox_group: "Checkbox Group (Select Multiple)",
  select: "Dropdown / Select",
  file: "File Upload",
  checkbox: "Single Checkbox (Yes/No)",
  heading: "Section Heading",
  static_text: "Static Text / Description",
};

function getStorageUrl(objectPath: string): string {
  return `/api/storage${objectPath}`;
}

function DocValue({ label, url }: { label: string; url: string | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!url || url === "nil" || url === "null") {
    return <span className="text-xs text-muted-foreground">Not provided</span>;
  }

  if (url.startsWith("razorpay:")) {
    const refId = url.slice("razorpay:".length);
    if (refId.startsWith("pay_")) {
      return (
        <a
          href={`https://dashboard.razorpay.com/app/payments/${refId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          {refId}
        </a>
      );
    }
    return <Badge variant="outline" className="text-xs font-mono py-0">{refId}</Badge>;
  }

  // Object storage path — fetch with auth and show inline
  // Handle both relative (/objects/...) and absolute (https://domain/objects/...) URLs
  const cleanObjectPath = getCleanObjectPath(url);
  if (cleanObjectPath) {
    const isPhoto = label.toLowerCase().includes("photo");
    const isLor = label.toLowerCase().includes("lor") || label.toLowerCase().includes("recommendation");
    const verifyUrl = typeof window !== 'undefined' ? (window.location.origin + "/verify-lor?path=" + encodeURIComponent(cleanObjectPath)) : "";
    const token = localStorage.getItem("fellowship_token");
    const secureUrl = `/api/storage${cleanObjectPath}?token=${token}`;

    return (
      <div className="w-full mt-1 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1 no-print" onClick={() => setExpanded(!expanded)}>
            {isPhoto ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
            {expanded ? "Hide" : "View"} {label}
          </Button>
          <button
            className="text-xs text-primary hover:underline flex items-center gap-0.5 no-print"
            onClick={() => window.open(secureUrl, "_blank")}
          >
            <ExternalLink className="h-3 w-3" /> Open
          </button>
        </div>
        {expanded && isPhoto && (
          <img src={secureUrl} alt={label} className="rounded-lg border max-h-48 max-w-full object-contain" />
        )}
        {expanded && !isPhoto && (
          <iframe
            src={secureUrl}
            className="w-full rounded-lg border bg-white"
            style={{ height: 380 }}
            title={label}
          />
        )}
        {isLor && verifyUrl && (
          <div className="mt-3 p-3 bg-slate-50 border border-slate-150 rounded-2xl flex flex-col md:flex-row gap-4 items-center print:bg-white print:border-none print:p-0 print:mt-2 print:gap-2">
            <div className="flex-1 space-y-1 text-center md:text-left print:hidden">
              <p className="text-xs font-black text-slate-800 flex items-center gap-1.5 justify-center md:justify-start">
                <CheckCircle className="w-3.5 h-3.5 text-[#0b4a8f]" />
                Access-Secured LOR QR
              </p>
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                Scan this code to verify authenticity. Access requires an authorized admin login.
              </p>
            </div>
            <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-sm flex-shrink-0 print:shadow-none print:border-slate-350 print:p-1">
              <QRCode value={verifyUrl} size={90} className="w-[90px] h-[90px] print:w-[80px] print:h-[80px]" />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return (
      <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1"
        onClick={() => window.open(url, "_blank")}>
        <ExternalLink className="h-3 w-3" /> Open
      </Button>
    );
  }

  return <span className="text-xs font-mono break-all text-right max-w-48">{url}</span>;
}

function CustomFieldEditor({
  field,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  field: CustomField;
  onChange: (updated: CustomField) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const needsOptions = ["select", "radio", "checkbox_group"].includes(field.type);
  const isDisplayOnly = ["heading", "static_text"].includes(field.type);

  const addOption = () => {
    const newOptions = [...(field.options || []), `Option ${(field.options?.length || 0) + 1}`];
    onChange({ ...field, options: newOptions });
  };

  const updateOption = (index: number, val: string) => {
    const newOptions = [...(field.options || [])];
    newOptions[index] = val;
    onChange({ ...field, options: newOptions });
  };

  const removeOption = (index: number) => {
    const newOptions = (field.options || []).filter((_, i) => i !== index);
    onChange({ ...field, options: newOptions });
  };

  return (
    <div className="border rounded-xl p-4 space-y-4 bg-white shadow-sm dark:bg-slate-950 transition-all">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-1 mt-1 shrink-0">
          {onMoveUp && (
            <button onClick={onMoveUp} disabled={isFirst} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ChevronUp className="h-4 w-4" />
            </button>
          )}
          {onMoveDown && (
            <button onClick={onMoveDown} disabled={isLast} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-8 space-y-1.5">
              <Input
                placeholder={isDisplayOnly ? "Enter Section Title or Text..." : "Question / Field Label"}
                value={field.label}
                onChange={(e) => onChange({ ...field, label: e.target.value })}
                className="h-10 text-base font-medium bg-muted/50"
              />
            </div>
            <div className="md:col-span-4 space-y-1.5">
              <Select
                value={field.type}
                onValueChange={(v) => {
                  const newType = v as CustomField["type"];
                  const needsOpts = ["select", "radio", "checkbox_group"].includes(newType);
                  onChange({
                    ...field,
                    type: newType,
                    options: needsOpts && (!field.options || field.options.length === 0) ? ["Option 1"] : field.options
                  });
                }}
              >
                <SelectTrigger className="h-10 bg-muted/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {(Object.entries(FIELD_TYPE_LABELS) as [CustomField["type"], string][]).map(([val, lbl]) => (
                    <SelectItem key={val} value={val}>{lbl}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isDisplayOnly && (
            <div className="space-y-1.5">
              <Input
                placeholder="Help text or description (optional)"
                value={field.description || ""}
                onChange={(e) => onChange({ ...field, description: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
          )}

          {!needsOptions && !isDisplayOnly && field.type !== "checkbox" && field.type !== "file" && (
            <div className="space-y-1.5">
              <Input
                placeholder="Placeholder Text (optional)"
                value={field.placeholder ?? ""}
                onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
          )}

          {needsOptions && (
            <div className="space-y-2 mt-2 pl-2 border-l-2 border-muted">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Options</Label>
              {(field.options || []).map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2 group">
                  {field.type === 'radio' ? (
                    <div className="h-4 w-4 rounded-full border shrink-0 bg-muted/30" />
                  ) : field.type === 'checkbox_group' ? (
                    <div className="h-4 w-4 rounded-sm border shrink-0 bg-muted/30" />
                  ) : (
                    <span className="text-xs text-muted-foreground w-4 text-center">{idx + 1}.</span>
                  )}
                  <Input
                    value={opt}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    className="h-8 text-sm focus-visible:ring-1"
                    placeholder={`Option ${idx + 1}`}
                  />
                  <button
                    onClick={() => removeOption(idx)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0 transition-opacity"
                    title="Remove option"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                {field.type === 'radio' ? (
                  <div className="h-4 w-4 rounded-full border shrink-0 bg-muted/10" />
                ) : field.type === 'checkbox_group' ? (
                  <div className="h-4 w-4 rounded-sm border shrink-0 bg-muted/10" />
                ) : (
                  <span className="text-xs text-muted-foreground w-4 text-center">{((field.options?.length) || 0) + 1}.</span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 justify-start px-2"
                  onClick={addOption}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Option
                </Button>
              </div>
            </div>
          )}

          <Separator className="my-2" />

          <div className="flex items-center justify-between">
            {!isDisplayOnly ? (
              <div className="flex items-center gap-2">
                <Switch
                  id={`req-${field.id}`}
                  checked={field.required}
                  onCheckedChange={(v) => onChange({ ...field, required: !!v })}
                />
                <Label htmlFor={`req-${field.id}`} className="text-sm cursor-pointer font-medium">Required field</Label>
              </div>
            ) : <div />}

            <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5">
              <Trash2 className="h-4 w-4" /> Delete Field
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RichTextArea({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);

  const execCommand = (command: string, value: string = "") => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  // Sync external value to editor (only if different to avoid cursor jumps)
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  return (
    <div className="space-y-1.5">
      {label && <Label className="text-[10px] font-bold text-muted-foreground uppercase">{label}</Label>}
      <div className="border rounded-md overflow-hidden bg-white dark:bg-slate-950 flex flex-col">
        <div className="flex items-center gap-0.5 p-1 bg-muted/30 border-b flex-wrap">
          <Button variant="ghost" size="sm" className="h-7 px-2 font-bold hover:bg-muted" onClick={() => execCommand("bold")}>B</Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 italic hover:bg-muted" onClick={() => execCommand("italic")}>I</Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 underline hover:bg-muted" onClick={() => execCommand("underline")}>U</Button>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Button variant="ghost" size="sm" className="h-7 px-2 hover:bg-muted" onClick={() => execCommand("insertOrderedList")}>1.</Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 hover:bg-muted" onClick={() => execCommand("insertUnorderedList")}>•</Button>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px] uppercase font-bold hover:bg-muted" onClick={() => execCommand("removeFormat")}>Clear</Button>
        </div>
        <div
          ref={editorRef}
          contentEditable
          onInput={(e) => onChange(e.currentTarget.innerHTML)}
          className="min-h-[120px] p-3 text-sm focus:outline-none overflow-y-auto prose prose-sm max-w-none dark:prose-invert"
          style={{ whiteSpace: "pre-wrap" }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground italic">Tip: Use the toolbar to format. No need to type HTML tags.</p>
    </div>
  );
}

export default function ApplicationFormsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { activeProgram, activeProgramId } = useProgram();
  const qc = useQueryClient();

  const [viewSubId, setViewSubId] = useState<number | null>(null);
  const [viewFormId, setViewFormId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdForm, setCreatedForm] = useState<ApplicationForm | null>(null);
  const [editForm, setEditForm] = useState<ApplicationForm | null>(null);
  const [activeSubDetail, setActiveSubDetail] = useState<any | null>(null);
  const [isEditingData, setIsEditingData] = useState(false);
  const [tempFormData, setTempFormData] = useState<any>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [createFormData, setCreateFormData] = useState({ programId: "", title: "", description: "", deadline: "", loadDefaults: true, customToken: "" });
  const [createCustomFields, setCreateCustomFields] = useState<CustomField[]>([]);
  const [editCustomFields, setEditCustomFields] = useState<CustomField[]>([]);
  const [editSectionsConfig, setEditSectionsConfig] = useState<any[]>([]);
  const [photoBlobUrl, setPhotoBlobUrl] = useState<string | null>(null);
  const [specFilter, setSpecFilter] = useState<string>("all");
  const [sortFilter, setSortFilter] = useState<"time_desc" | "time_asc" | "name_asc" | "name_desc">("time_desc");

  // Google Sheets integration state (per edit dialog + success dialog)
  const [googleSheetsConfig, setGoogleSheetsConfig] = useState({ spreadsheetId: "", sheetName: "Form Responses 1", serviceAccountJson: "" });
  const [savingGsConfig, setSavingGsConfig] = useState(false);
  const [createdFormGsOpen, setCreatedFormGsOpen] = useState(false);
  const [createdFormGsConfig, setCreatedFormGsConfig] = useState({ spreadsheetId: "", sheetName: "Form Responses 1", serviceAccountJson: "" });
  const [savingCreatedGs, setSavingCreatedGs] = useState(false);

  // Load existing GS config when edit dialog opens
  const { data: editFormGsData } = useQuery<{ spreadsheetId: string; sheetName: string; hasServiceAccount: boolean }>({
    queryKey: ["gs-config", editForm?.id],
    queryFn: () => api.get<{ spreadsheetId: string; sheetName: string; hasServiceAccount: boolean }>(`/application-forms/${editForm!.id}/google-sheets-config`),
    enabled: editForm !== null,
  });
  // Populate GS config fields when data loads for edit dialog
  useEffect(() => {
    if (editFormGsData && editForm) {
      setGoogleSheetsConfig({
        spreadsheetId: editFormGsData.spreadsheetId || "",
        sheetName: editFormGsData.sheetName || "Form Responses 1",
        serviceAccountJson: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editFormGsData, editForm?.id]);

  // Razorpay payment settings state for edit form
  const [editPaymentConfig, setEditPaymentConfig] = useState({
    razorpayKeyId: "",
    razorpayKeySecret: "",
    amountRs: 2750,
    currency: "INR",
    description: "Fellowship Application Fee",
    mode: "live",
    upiId: "sankaraeye@hdfcbank",
    isActive: true,
  });
  const [showPaymentSecret, setShowPaymentSecret] = useState(false);
  const [savingPaymentConfig, setSavingPaymentConfig] = useState(false);

  // Load existing payment config when edit dialog opens
  const { data: editFormPaymentData } = useQuery<any>({
    queryKey: ["form-payment-config", editForm?.id],
    queryFn: () => api.get<any>(`/application-forms/${editForm!.id}/payment-settings`),
    enabled: editForm !== null,
  });

  useEffect(() => {
    if (editFormPaymentData && editForm) {
      setEditPaymentConfig({
        razorpayKeyId: editFormPaymentData.razorpayKeyId || "",
        razorpayKeySecret: editFormPaymentData.razorpayKeySecret || "",
        amountRs: editFormPaymentData.amountRs || 2750,
        currency: editFormPaymentData.currency || "INR",
        description: editFormPaymentData.description || "Fellowship Application Fee",
        mode: editFormPaymentData.mode || "live",
        upiId: editFormPaymentData.upiId || "sankaraeye@hdfcbank",
        isActive: editFormPaymentData.isActive !== false,
      });
    }
  }, [editFormPaymentData, editForm?.id]);

  const saveFormPaymentConfig = async (formId: number) => {
    try {
      setSavingPaymentConfig(true);
      await api.put(`/application-forms/${formId}/payment-settings`, editPaymentConfig);
      toast({ title: "Razorpay payment settings saved successfully" });
      qc.invalidateQueries({ queryKey: ["form-payment-config", formId] });
      qc.invalidateQueries({ queryKey: ["payment-settings"] });
    } catch (err: any) {
      toast({ title: "Failed to save payment settings", description: err.message, variant: "destructive" });
    } finally {
      setSavingPaymentConfig(false);
    }
  };

  // Submissions list UI state
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergePair, setMergePair] = useState<{ subA: Submission; subB: Submission } | null>(null);
  const [mergePrimaryId, setMergePrimaryId] = useState<number | null>(null);
  const [mergeDeleteSecondary, setMergeDeleteSecondary] = useState(false);


  // Admissions pipeline main sub-tab & letter states
  const [admissionsTab, setAdmissionsTab] = useState<"applications" | "call_letters" | "offer_letters" | "settings">("applications");
  const [callLetterSearch, setCallLetterSearch] = useState("");
  const [offerLetterSearch, setOfferLetterSearch] = useState("");
  const [callStreamFilter, setCallStreamFilter] = useState<"all" | "retina" | "anterior">("all");
  const [offerUnitOverrides, setOfferUnitOverrides] = useState<Record<number, string>>({});
  const [downloadingLetterId, setDownloadingLetterId] = useState<number | null>(null);
  const [sendingEmailId, setSendingEmailId] = useState<number | null>(null);
  const [downloadingDirectoryPdf, setDownloadingDirectoryPdf] = useState(false);
  const [shareForm, setShareForm] = useState<ApplicationForm | null>(null);
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [reconcileData, setReconcileData] = useState({
    paymentId: "",
    fullName: "",
    email: "",
    phone: "",
    specialization: "IOL",
    notes: "",
  });
  const [reconciling, setReconciling] = useState(false);

  const handleReconcilePayment = async () => {
    if (!reconcileData.paymentId.trim()) {
      toast({ title: "Error", description: "Razorpay Payment ID is required", variant: "destructive" });
      return;
    }
    setReconciling(true);
    try {
      const res = await api.post("/application-forms/reconcile-payment", {
        ...reconcileData,
        formToken: viewedForm?.token || "JAN2027",
      });
      toast({ 
        title: "Payment Reconciled & Recovered!", 
        description: (res as any)?.message || "Submission created successfully." 
      });
      setReconcileModalOpen(false);
      setReconcileData({ paymentId: "", fullName: "", email: "", phone: "", specialization: "IOL", notes: "" });
      qc.invalidateQueries({ queryKey: ["submissions", viewFormId] });
      qc.invalidateQueries({ queryKey: ["application-forms"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    } catch (err: any) {
      toast({ title: "Reconciliation Failed", description: err.message, variant: "destructive" });
    } finally {
      setReconciling(false);
    }
  };

  const { data: units = [] } = useQuery<any[]>({
    queryKey: ["units"],
    queryFn: () => api.get("/units"),
  });

  const { data: specialities = [] } = useQuery<any[]>({
    queryKey: ["specialities"],
    queryFn: () => api.get("/specialities"),
  });

  const { data: forms = [], isLoading } = useQuery<ApplicationForm[]>({
    queryKey: ["application-forms"],
    queryFn: () => api.get<ApplicationForm[]>("/application-forms"),
  });
  const filteredForms = forms
    .filter((f) => f.token !== "JULY2026" && !/july\s*2026/i.test(f.title || ""))
    .filter((f) => (activeProgramId ? f.programId === activeProgramId : true));
  const { data: programs = [] } = useQuery<Program[]>({
    queryKey: ["programs"],
    queryFn: () => api.get<Program[]>("/programs"),
  });
  const { data: submissions = [], isLoading: subsLoading } = useQuery<Submission[]>({
    queryKey: ["submissions", viewFormId],
    queryFn: () => api.get<Submission[]>(`/application-forms/${viewFormId}/submissions`),
    enabled: viewFormId !== null,
  });

  // Auto-select active form if none selected
  useEffect(() => {
    if (viewFormId === null && filteredForms.length > 0) {
      const active = filteredForms.find((f) => f.isActive) || filteredForms[0];
      if (active) setViewFormId(active.id);
    }
  }, [filteredForms, viewFormId]);

  const createMutation = useMutation({
    mutationFn: (data: { programId: number; title: string; description?: string; deadline?: string; customFields: CustomField[]; loadDefaults?: boolean; customToken?: string }) =>
      api.post<ApplicationForm>("/application-forms", data),
    onSuccess: (form) => {
      qc.invalidateQueries({ queryKey: ["application-forms"] });
      setCreateOpen(false);
      setCreateFormData({ programId: "", title: "", description: "", deadline: "", loadDefaults: true, customToken: "" });
      setCreateCustomFields([]);
      setCreatedForm(form);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      api.patch<ApplicationForm>(`/application-forms/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["application-forms"] }),
  });

  const updateFormMutation = useMutation({
    mutationFn: async (data: { id: number; title?: string; description?: string; deadline?: string; customFields?: CustomField[]; sectionsConfig?: any[] }) => {
      const { id, ...body } = data;
      const res = await api.patch<ApplicationForm>(`/application-forms/${id}`, body);
      try {
        await api.put(`/application-forms/${id}/payment-settings`, editPaymentConfig);
      } catch (err) {
        console.error("Auto-saving payment settings failed", err);
      }
      return res;
    },
    onSuccess: () => {
      toast({ title: "Form and payment gateway settings updated successfully" });
      qc.invalidateQueries({ queryKey: ["application-forms"] });
      qc.invalidateQueries({ queryKey: ["form-payment-config"] });
      qc.invalidateQueries({ queryKey: ["payment-settings"] });
      setEditForm(null);
      setEditCustomFields([]);
      setEditSectionsConfig([]);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteForm = useMutation({
    mutationFn: (id: number) => api.delete(`/application-forms/${id}`),
    onSuccess: () => {
      toast({ title: "Form deleted" });
      qc.invalidateQueries({ queryKey: ["application-forms"] });
      setDeleteConfirmId(null);
      if (viewFormId === deleteConfirmId) setViewFormId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateSubmission = useMutation({
    mutationFn: (payload: any) => {
      const { id, ...body } = payload;
      return api.patch<any>(`/application-forms/submissions/${id}`, body);
    },
    onSuccess: (updated) => {
      // Directly update the cached submissions list so the UI sees the change instantly
      qc.setQueryData(["submissions", viewFormId], (old: any[]) =>
        old ? old.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)) : old
      );
      qc.invalidateQueries({ queryKey: ["submissions", viewFormId] });
      qc.invalidateQueries({ queryKey: ["application-forms"] });
    },
  });

  const approveSubmission = useMutation({
    mutationFn: (id: number) => api.post<{ message: string; candidateId: number }>(`/application-forms/submissions/${id}/approve`, {}),
    onSuccess: (data) => {
      toast({ title: "Approved", description: `${data.message} (ID: ${data.candidateId})` });
      qc.invalidateQueries({ queryKey: ["submissions", viewFormId] });
      qc.invalidateQueries({ queryKey: ["application-forms"] });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      setViewSubId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const syncGoogleSheets = useMutation({
    mutationFn: (formId: number) =>
      api.post<{ imported: number; total: number }>(
        `/application-forms/${formId}/sync-google-sheets`, {}
      ),
    onSuccess: (data, formId) => {
      toast({
        title: `Sync complete`,
        description: data.imported > 0 ? `${data.imported} new submissions imported.` : "No new responses.",
      });
      qc.invalidateQueries({ queryKey: ["submissions", formId] });
      qc.invalidateQueries({ queryKey: ["application-forms"] });
    },
    onError: (e: Error) => toast({ title: "Sync failed", description: e.message, variant: "destructive" }),
  });

  const bulkAction = useMutation({
    mutationFn: ({ formId, action, ids }: { formId: number; action: "approve" | "reject"; ids: number[] }) =>
      api.post<{ processed: number }>(`/application-forms/${formId}/submissions/bulk-action`, { action, ids }),
    onSuccess: (data, { formId, action }) => {
      toast({ title: `Bulk ${action} done`, description: `${data.processed} submissions processed.` });
      qc.invalidateQueries({ queryKey: ["submissions", formId] });
      qc.invalidateQueries({ queryKey: ["application-forms"] });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      setSelectedIds([]);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSubMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/application-submissions/${id}`),
    onSuccess: () => {
      toast({ title: "Submission deleted" });
      qc.invalidateQueries({ queryKey: ["submissions", viewFormId] });
      qc.invalidateQueries({ queryKey: ["application-forms"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkDeleteSubsMutation = useMutation({
    mutationFn: (ids: number[]) => api.post(`/application-submissions/bulk-delete`, { ids }),
    onSuccess: () => {
      toast({ title: "Submissions deleted" });
      qc.invalidateQueries({ queryKey: ["submissions", viewFormId] });
      qc.invalidateQueries({ queryKey: ["application-forms"] });
      setSelectedIds([]);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const mergeApplicationsMutation = useMutation({
    mutationFn: async ({ primaryId, secondaryId, deleteSecondary }: { primaryId: number; secondaryId: number; deleteSecondary?: boolean }) => {
      return api.post(`/application-submissions/merge`, { primaryId, secondaryId, deleteSecondary });
    },
    onSuccess: (data: any, vars) => {
      toast({
        title: "Applications Merged",
        description: data.message || "Applications successfully consolidated into one record.",
      });
      // Immediately remove secondary submission from frontend state
      qc.setQueryData(["submissions", viewFormId], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old
          .filter((s: any) => s.id !== vars.secondaryId)
          .map((s: any) => (s.id === vars.primaryId && data.primarySubmission ? { ...s, ...data.primarySubmission } : s));
      });
      setSelectedIds([]);
      setMergePair(null);
      setMergeDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["submissions", viewFormId] });
      qc.invalidateQueries({ queryKey: ["submissions"] });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["application-forms"] });
    },
    onError: (e: Error) => toast({ title: "Merge Failed", description: e.message, variant: "destructive" }),
  });

  const saveGoogleSheetsConfig = async (formId: number) => {
    setSavingGsConfig(true);
    try {
      await api.put(`/application-forms/${formId}/google-sheets-config`, googleSheetsConfig);
      toast({ title: "Google Sheets integration saved" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to save", variant: "destructive" });
    } finally {
      setSavingGsConfig(false);
    }
  };

  const safeCopyToClipboard = async (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.error("Clipboard API failed, falling back", err);
      }
    }

    // Fallback for non-secure contexts or older browsers
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error("Fallback copy failed", err);
      return false;
    }
  };

  const copyLink = async (form: ApplicationForm) => {
    const success = await safeCopyToClipboard(buildFormLink(form.token));
    if (success) {
      setCopiedId(form.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast({ title: "Link copied to clipboard" });
    } else {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  const exportExcel = async (formId: number) => {
    setExporting(true);
    try {
      const token = localStorage.getItem("fellowship_token");
      const res = await fetch(`/api/application-forms/${formId}/export`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disp = res.headers.get("Content-Disposition") ?? "";
      const fname = disp.match(/filename="([^"]+)"/)?.[1] ?? `submissions-${formId}.xlsx`;
      a.href = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "Submissions exported to Excel" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const downloadStudentListPdf = async (formId: number) => {
    setDownloadingDirectoryPdf(true);
    try {
      const token = localStorage.getItem("fellowship_token");
      const res = await fetch(`/api/application-forms/${formId}/student-list-pdf`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to download Student List PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Student_Directory_December_2026.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded Roster", description: "Official December 2026 Candidate Directory PDF saved." });
    } catch (e: any) {
      toast({ title: "Download Failed", description: e.message || "Failed to download", variant: "destructive" });
    } finally {
      setDownloadingDirectoryPdf(false);
    }
  };

  const downloadCallLetter = async (submissionId: number, candidateCode: string) => {
    setDownloadingLetterId(submissionId);
    try {
      const token = localStorage.getItem("fellowship_token");
      const res = await fetch(`/api/application-forms/submissions/${submissionId}/call-letter-pdf`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to download Call Letter PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Interview_Call_Letter_${candidateCode}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Call Letter Downloaded", description: `Official Call Letter for ${candidateCode} downloaded.` });
    } catch (e: any) {
      toast({ title: "Download Failed", description: e.message || "Failed to download", variant: "destructive" });
    } finally {
      setDownloadingLetterId(null);
    }
  };

  const sendCallLetterEmail = async (submissionId: number, candidateName: string) => {
    setSendingEmailId(submissionId);
    try {
      const res: any = await api.post(`/application-forms/submissions/${submissionId}/send-call-letter`, {});
      if (res?.emailSent) {
        toast({ title: "Call Letter Dispatched", description: `Call Letter with PDF attachment emailed to ${candidateName}.` });
      } else {
        toast({ title: "Call Letter Issued", description: res?.message || `PDF generated successfully. Download PDF directly.` });
      }
    } catch (e: any) {
      toast({ title: "Email Failed", description: e.message || "Failed to send email", variant: "destructive" });
    } finally {
      setSendingEmailId(null);
    }
  };

  const downloadOfferLetter = async (submissionId: number, candidateCode: string, unitName?: string) => {
    setDownloadingLetterId(submissionId);
    try {
      const token = localStorage.getItem("fellowship_token");
      const q = unitName ? `?unitName=${encodeURIComponent(unitName)}` : "";
      const res = await fetch(`/api/application-forms/submissions/${submissionId}/offer-letter-pdf${q}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to download Offer Letter PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Fellowship_Offer_Letter_${candidateCode}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Offer Letter Downloaded", description: `Official 2-Page Offer Letter for ${candidateCode} downloaded.` });
    } catch (e: any) {
      toast({ title: "Download Failed", description: e.message || "Failed to download", variant: "destructive" });
    } finally {
      setDownloadingLetterId(null);
    }
  };

  const sendOfferLetterEmail = async (submissionId: number, candidateName: string, unitName?: string) => {
    setSendingEmailId(submissionId);
    try {
      await api.post(`/application-forms/submissions/${submissionId}/send-offer-letter`, { unitName });
      toast({ title: "Offer Letter Dispatched", description: `Official 2-Page Offer Letter emailed to ${candidateName}.` });
    } catch (e: any) {
      toast({ title: "Email Failed", description: e.message || "Failed to send email", variant: "destructive" });
    } finally {
      setSendingEmailId(null);
    }
  };

  const viewedSub = submissions.find((s) => s.id === viewSubId);
  const viewedForm = forms.find((f) => f.id === viewFormId);

  // Convert any image URL/Blob into a standard scannable and printable JPG data url!
  const convertToJpg = (srcUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/jpeg", 0.9));
        } else {
          resolve(srcUrl);
        }
      };
      img.onerror = () => {
        resolve(srcUrl);
      };
      img.src = srcUrl;
    });
  };

  useEffect(() => {
    let active = true;
    let localUrl: string | null = null;

    if (viewedSub?.photoUrl) {
      // Handle both relative /objects/ paths and absolute https://domain/objects/ URLs
      const cleanPhotoPath = getCleanObjectPath(viewedSub.photoUrl);
      if (cleanPhotoPath) {
        // Use direct token-authenticated URL — avoids blob: URL restrictions in production
        const token = localStorage.getItem("fellowship_token");
        const securePhotoUrl = `/api/storage${cleanPhotoPath}?token=${token}`;
        if (active) {
          convertToJpg(securePhotoUrl).then(jpgDataUrl => {
            if (active) setPhotoBlobUrl(jpgDataUrl);
          }).catch(() => {
            if (active) setPhotoBlobUrl(securePhotoUrl);
          });
        }
      } else if (viewedSub.photoUrl.startsWith("http://") || viewedSub.photoUrl.startsWith("https://")) {
        convertToJpg(viewedSub.photoUrl).then(jpgDataUrl => {
          if (active) setPhotoBlobUrl(jpgDataUrl);
        }).catch(() => {
          if (active) setPhotoBlobUrl(viewedSub.photoUrl);
        });
      } else {
        setPhotoBlobUrl(null);
      }
    } else {
      setPhotoBlobUrl(null);
    }

    return () => {
      active = false;
      if (localUrl) {
        URL.revokeObjectURL(localUrl);
      }
    };
  }, [viewedSub?.photoUrl]);

  const addCustomField = (fields: CustomField[], setFields: (f: CustomField[]) => void) => {
    setFields([...fields, { id: genId(), label: "", type: "text", required: false }]);
  };

  const updateCustomField = (fields: CustomField[], setFields: (f: CustomField[]) => void, id: string, updated: CustomField) => {
    setFields(fields.map((f) => f.id === id ? updated : f));
  };

  const deleteCustomField = (fields: CustomField[], setFields: (f: CustomField[]) => void, id: string) => {
    setFields(fields.filter((f) => f.id !== id));
  };
  
  // Reset editing state when submission changes
  useEffect(() => {
    setIsEditingData(false);
    setTempFormData({});
  }, [viewSubId]);

  const handleEditData = () => {
    if (!viewedSub) return;
    setTempFormData({ 
      ...viewedSub,
      formData: { ...viewedSub.formData }
    });
    setIsEditingData(true);
  };

  const handleSaveData = () => {
    if (!viewedSub) return;
    // Send ALL fields via tempFormData, the backend will filter out non-allowed fields
    updateSubmission.mutate(tempFormData, {
      onSuccess: () => {
        setIsEditingData(false);
        toast({ title: "Submission Updated", description: "Changes saved successfully." });
      },
      onError: (e: any) => {
        toast({ title: "Save Failed", description: e.message, variant: "destructive" });
      }
    });
  };

  // Helper to format center preferences as a string matching specialities
  const formatCenterPreferences = () => {
    if (!viewedSub) return "";
    const prefs = parseCenterPreferences(viewedSub.centerPreference, viewedSub.formData, viewedForm?.sectionsConfig);
    const entries = Object.entries(prefs).map(([specName, loc]) => `${specName}: ${loc}`);
    if (entries.length === 0) {
      return viewedSub.centerPreference ? cleanArrayValue(viewedSub.centerPreference) : "";
    }
    return entries.join(", ");
  };

  const cleanArrayValue = (val: string): string => {
    if (!val) return "";
    const trimmed = val.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return parseSpecializations(trimmed).join(", ");
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.join(", ");
    } catch { /* not JSON */ }
    return val;
  };

  // Extract all standard and dynamic fields into a compact list of key-value pairs
  const getCompactPrintFields = () => {
    if (!viewedSub || !viewedForm) return [];
    const fields: { label: string; value: string }[] = [];
    
    // Core demographic details
    if (viewedSub.dateOfBirth) fields.push({ label: "Date of Birth", value: new Date(viewedSub.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) });
    if (viewedSub.maritalStatus) fields.push({ label: "Marital Status", value: viewedSub.maritalStatus });
    if (viewedSub.phone) fields.push({ label: "Contact Number", value: viewedSub.phone });
    if (viewedSub.centerPreference) fields.push({ label: "Center Preference", value: formatCenterPreferences() });
    
    // Read dynamic non-file fields
    for (const s of viewedForm.sectionsConfig || []) {
      for (const f of s.fields) {
        if (f.type !== "file" && f.type !== "info" && f.type !== "heading" && f.type !== "static_text") {
          const val = f.isStandard && f.mapping ? viewedSub[f.mapping] : viewedSub.formData?.[f.id];
          if (val && typeof val !== "object" && String(val).trim() !== "") {
            const cleanedVal = cleanArrayValue(String(val));
            if (!fields.some(item => item.label.toLowerCase() === f.label.toLowerCase())) {
              fields.push({ label: f.label, value: cleanedVal });
            }
          }
        }
      }
    }
    return fields;
  };

  const getPrintLorFields = () => {
    if (!viewedSub || !viewedForm) return [];
    const list: { label: string; value: string }[] = [];
    for (const s of viewedForm.sectionsConfig || []) {
      for (const f of s.fields) {
        if (f.type === "file") {
          const isLor = f.label.toLowerCase().includes("lor") || f.label.toLowerCase().includes("recommendation");
          if (isLor) {
            const val = f.isStandard && f.mapping ? viewedSub[f.mapping] : viewedSub.formData?.[f.id];
            if (val && String(val) !== "nil" && String(val) !== "null") {
              if (!list.some(item => item.value === String(val))) {
                list.push({ label: f.label, value: String(val) });
              }
            }
          }
        }
      }
    }
    return list;
  };

  // Submission detail view
  if (viewFormId !== null && viewSubId !== null && viewedSub) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="detail-overlay fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex flex-col print:relative print:inset-auto print:bg-white print:z-0 print:h-auto print:overflow-visible"
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            /* Standard Letter portrait dimensions with crisp, compact margins */
            @page { 
              size: letter portrait; 
              margin: 8mm 10mm; 
            }

            body, html, #root { 
               background: white !important; 
               margin: 0 !important; 
               padding: 0 !important; 
               width: 100% !important;
               height: auto !important;
               overflow: visible !important;
               font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
               -webkit-print-color-adjust: exact !important; 
               print-color-adjust: exact !important; 
            }
            
            /* Remove all overflow restrictions that truncate pages */
            * {
               overflow: visible !important;
            }
            
            aside, .md\\:hidden, .main-sidebar, .main-header, .no-print, header, nav { 
               display: none !important; 
            }

            .flex.h-screen, .flex.h-screen > main {
               display: block !important;
               height: auto !important;
               overflow: visible !important;
               position: static !important;
            }
            
            /* Make the overlay flow naturally on letter pages without clipping */
            .detail-overlay { 
               position: static !important; 
               background: white !important; 
               height: auto !important; 
               width: 100% !important;
               display: block !important;
               margin: 0 !important;
               padding: 0 !important;
               z-index: 1 !important;
            }
            
            table {
               table-layout: fixed !important;
               width: 100% !important;
               max-width: 100% !important;
               word-wrap: break-word !important;
               page-break-inside: avoid !important;
               break-inside: avoid !important;
            }

            td, th {
               word-break: break-word !important;
               white-space: normal !important;
            }
            
            /* Compact Letter Fit Components */
            .print-card, .border-slate-350, .print-avoid-break {
               break-inside: avoid !important;
               page-break-inside: avoid !important;
               box-shadow: none !important;
            }
            
            * { 
               -webkit-print-color-adjust: exact !important; 
               print-color-adjust: exact !important; 
            }
          }
        `}} />
        <div className="flex-1 flex flex-col bg-slate-50/50 print:bg-white print:h-auto print:overflow-visible">
          {/* Glass Header */}
          <div className="glass-header px-8 py-5 flex items-center justify-between border-b border-slate-200 bg-white/90 backdrop-blur-xl no-print">
            <div className="flex items-center gap-5">
               <Button 
                 variant="ghost" 
                 size="icon" 
                 onClick={() => setViewSubId(null)} 
                 className="rounded-full hover:bg-slate-100 transition-all hover:scale-110 active:scale-95"
               >
                  <ArrowLeft className="w-5 h-5 text-slate-600" />
               </Button>
               <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{viewedSub.fullName}</h2>
                  <div className="flex items-center gap-3 mt-1">
                     <Badge className={`${STATUS_COLORS[viewedSub.status] || "bg-slate-100"} rounded-full px-3 py-0.5 text-[10px] font-black uppercase tracking-widest border-none shadow-sm`}>
                       {viewedSub.status}
                     </Badge>
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                       <Clock className="w-3 h-3" /> 
                       Submitted {new Date(viewedSub.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                     </span>
                  </div>
               </div>
            </div>
            
            <div className="flex items-center gap-3">
               <Button variant="outline" size="sm" onClick={() => window.print()} className="rounded-xl border-slate-200 hover:bg-slate-50 transition-all font-bold px-4">
                  <Printer className="w-4 h-4 mr-2" /> Print PDF
               </Button>
               
               {isEditingData ? (
                 <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setIsEditingData(false)} className="rounded-xl font-bold px-4">Cancel</Button>
                    <Button size="sm" onClick={handleSaveData} disabled={updateSubmission.isPending} className="rounded-xl orange-gradient text-white border-none shadow-lg shadow-orange-500/20 px-6 font-bold hover:scale-[1.02] active:scale-[0.98] transition-all">
                      {updateSubmission.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Save Changes
                    </Button>
                 </div>
               ) : (
                 <Button size="sm" onClick={handleEditData} className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white shadow-xl hover:shadow-2xl px-6 font-bold transition-all hover:-translate-y-0.5">
                   <Edit className="w-4 h-4 mr-2" /> Edit Submission
                 </Button>
               )}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-8 fancy-scrollbar print:overflow-visible print:h-auto print:p-0">
             {/* Formal Print Header Title */}
             <div className="hidden print:flex items-start justify-between border-b-2 border-[#0b4a8f] pb-4 mb-6">
                <div className="space-y-0.5">
                   <h1 className="text-3xl font-black uppercase tracking-tight text-[#0b4a8f]">Sankara Academy of Vision</h1>
                   <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Fellowship Application Record</p>
                </div>
                <div className="text-right">
                   <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-right">Date Printed</p>
                   <p className="text-xs font-bold text-slate-950 text-right">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
             </div>

             {/* Candidate Details & Photo Placement (Below Header, Photo on the Right) */}
             <div className="hidden print:grid grid-cols-12 gap-6 items-start pb-6 mb-6 border-b border-slate-200">
                <div className="col-span-8 space-y-4">
                    {viewedSub.candidateCode && viewedSub.candidateCode !== "PENDING" && (
                       <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-[#0b4a8f] leading-none mb-1">Applicant Registration Number</p>
                          <p className="text-xl font-black text-slate-900 font-mono tracking-wider">{viewedSub.candidateCode}</p>
                       </div>
                    )}
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                         <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Full Name of Applicant</p>
                         <p className="text-sm font-black text-slate-900">{viewedSub.fullName}</p>
                      </div>
                      <div>
                         <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">E-Mail Address</p>
                         <p className="text-sm font-semibold text-slate-700 break-all">{viewedSub.email}</p>
                      </div>
                   </div>
                   <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1.5">Specialization Applied For</p>
                      <div className="flex flex-wrap gap-1.5">
                         {(() => {
                            const centerPrefs = parseCenterPreferences(viewedSub.centerPreference, viewedSub.formData, viewedForm?.sectionsConfig);
                            return parseSpecializations(viewedSub.specialization).map((spec, idx) => {
                               const matchKey = Object.keys(centerPrefs).find(k => 
                                  k.toLowerCase().trim() === spec.toLowerCase().trim() ||
                                  spec.toLowerCase().trim().includes(k.toLowerCase().trim()) ||
                                  k.toLowerCase().trim().includes(spec.toLowerCase().trim())
                               );
                               const loc = matchKey ? centerPrefs[matchKey] : "";
                               const displayName = loc ? `${spec} (${loc})` : spec;
                               return (
                            <span key={idx} className="text-[10px] font-black text-[#0b4a8f] bg-[#0b4a8f]/5 border border-[#0b4a8f]/10 px-2.5 py-0.5 rounded-lg shadow-sm">
                               {displayName}
                            </span>
                               );
                            });
                         })()}
                      </div>
                   </div>
                </div>
                
                <div className="col-span-4 flex justify-end">
                   <div className="w-28 h-32 border-2 border-slate-300 bg-white p-1 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
                      {photoBlobUrl ? (
                         <img src={photoBlobUrl} alt="Candidate Photo" className="w-full h-full object-cover rounded" />
                      ) : (
                         <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center text-center p-2 rounded">
                            <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Passport size</span>
                            <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Photograph</span>
                         </div>
                      )}
                   </div>
                </div>
             </div>

             <div className="no-print">
             <AnimatePresence mode="wait">
              <motion.div
                key={isEditingData ? 'edit' : 'view'}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="max-w-5xl mx-auto"
              >
                {isEditingData ? (
                  <Card className="border-none shadow-2xl rounded-3xl overflow-hidden glass-card">
                     <div className="bg-slate-900/5 px-8 py-8 border-b border-white/20">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg">
                              <Edit className="w-5 h-5" />
                           </div>
                           <div>
                              <h3 className="text-xl font-black text-slate-900 tracking-tight">Response Editor</h3>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Modify candidate details and form responses</p>
                           </div>
                        </div>
                     </div>
                     <CardContent className="p-10 space-y-10">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="space-y-2">
                              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Full Name</Label>
                              <Input 
                                value={tempFormData.fullName || ""} 
                                onChange={(e) => setTempFormData({ ...tempFormData, fullName: e.target.value })}
                                className="rounded-xl bg-slate-50/50 border-slate-200 focus:ring-4 focus:ring-orange-500/10"
                              />
                           </div>
                           <div className="space-y-2">
                              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Email</Label>
                              <Input 
                                value={tempFormData.email || ""} 
                                onChange={(e) => setTempFormData({ ...tempFormData, email: e.target.value })}
                                className="rounded-xl bg-slate-50/50 border-slate-200 focus:ring-4 focus:ring-orange-500/10"
                              />
                           </div>
                           <div className="space-y-2">
                              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Status</Label>
                              <Select value={tempFormData.status || "pending"} onValueChange={(v) => setTempFormData({ ...tempFormData, status: v })}>
                                <SelectTrigger className="rounded-xl bg-slate-50/50 border-slate-200">
                                   <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="reviewed">Reviewed</SelectItem>
                                  <SelectItem value="approved">Approved</SelectItem>
                                  <SelectItem value="rejected">Rejected</SelectItem>
                                </SelectContent>
                              </Select>
                           </div>
                        </div>
                        
                        <Separator className="opacity-50" />
                        
                        <SubmissionFormDataEditor 
                          sectionsConfig={viewedForm?.sectionsConfig || []} 
                          formData={tempFormData} 
                          onChange={(newData) => setTempFormData(newData)}
                          onFileUpload={(fieldId, url) => {
                             // Also update standard top-level fields if field is a known mapped one
                             const fieldLower = fieldId.toLowerCase();
                             if (fieldLower.includes('lor1') || fieldLower === 'lor1url') {
                               setTempFormData((prev: any) => ({ ...prev, lor1Url: url }));
                             } else if (fieldLower.includes('lor2') || fieldLower === 'lor2url') {
                               setTempFormData((prev: any) => ({ ...prev, lor2Url: url }));
                             } else if (fieldLower.includes('photo') || fieldLower === 'photourl') {
                               setTempFormData((prev: any) => ({ ...prev, photoUrl: url }));
                             }
                           }}
                        />
                     </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Metadata & Actions */}
                    <div className="lg:col-span-1 space-y-8">
                       <Card className="border-none shadow-premium rounded-3xl p-8 bg-white overflow-hidden relative">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-full -mr-16 -mt-16 pointer-events-none"></div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                             <FileText className="w-3 h-3" /> Candidate Summary
                          </h4>
                          <div className="space-y-6">
                             <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm">
                                   <FileType className="w-6 h-6" />
                                </div>
                                <div>
                                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</p>
                                   <p className="text-sm font-bold text-slate-900 break-all">{viewedSub.email}</p>
                                </div>
                             </div>
                             <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 shadow-sm">
                                   <CalendarDays className="w-6 h-6" />
                                </div>
                                <div>
                                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone Number</p>
                                   <p className="text-sm font-bold text-slate-900">{viewedSub.phone || "Not Provided"}</p>
                                </div>
                             </div>
                          </div>
                       </Card>
                       
                       <Card className="border-none shadow-premium rounded-3xl p-8 bg-white overflow-hidden">
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                             <FileSignature className="w-3 h-3" /> Internal Review Notes
                          </h4>
                          <Textarea 
                            className="text-sm border-none bg-slate-50/50 rounded-2xl focus:ring-0 min-h-[180px] resize-none font-medium placeholder:text-slate-300" 
                            placeholder="Add internal evaluation notes, interview results, or credential verification status..."
                            value={viewedSub.reviewNotes || ""}
                            onChange={(e) => updateSubmission.mutate({ id: viewedSub.id, reviewNotes: e.target.value })}
                          />
                       </Card>
                       <Card className="border-none shadow-premium rounded-3xl p-8 bg-white overflow-hidden no-print">
                           <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                              <CheckCircle2 className="w-3 h-3" /> Management Actions
                           </h4>
                           <div className="space-y-4">
                              <div className="space-y-2">
                                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Update Status</Label>
                                <Select value={viewedSub.status} onValueChange={(v) => updateSubmission.mutate({ id: viewedSub.id, status: v })}>
                                  <SelectTrigger className="rounded-xl bg-slate-50 border-slate-100 h-11 font-bold text-xs uppercase tracking-wider">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-2xl">
                                    <SelectItem value="pending">PENDING</SelectItem>
                                    <SelectItem value="reviewed">REVIEWED</SelectItem>
                                    <SelectItem value="rejected">REJECTED</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              <Separator className="opacity-50 my-2" />
                              
                              <Button 
                                className="w-full h-12 rounded-xl orange-gradient text-white border-none shadow-lg shadow-orange-500/20 font-bold hover:scale-[1.02] active:scale-[0.98] transition-all gap-2"
                                onClick={() => approveSubmission.mutate(viewedSub.id)}
                                disabled={approveSubmission.isPending || viewedSub.status === "approved"}
                              >
                                {approveSubmission.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                                {viewedSub.status === "approved" ? "ALREADY APPROVED" : "APPROVE & ENROLL"}
                              </Button>
                              
                              <Button 
                                variant="outline" 
                                className="w-full h-11 rounded-xl border-slate-200 text-slate-600 font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all gap-2"
                                onClick={() => updateSubmission.mutate({ id: viewedSub.id, status: "rejected" })}
                                disabled={updateSubmission.isPending}
                              >
                                <Ban className="h-4 w-4" /> REJECT APPLICATION
                              </Button>
                           </div>
                        </Card>
                    </div>
                     
                     {/* Right Column: Form Responses */}
                     <div className="lg:col-span-2 space-y-8">
                        {(viewedForm?.sectionsConfig || []).map((section: any) => {
                          const visibleFields = section.fields.filter((f: any) => 
                            f.type !== 'info' && f.type !== 'heading' && f.type !== 'static_text'
                          );
                          
                          return (
                            <Card key={section.id} className="border-none shadow-premium rounded-3xl overflow-hidden bg-white">
                              <div className="bg-slate-50/50 px-8 py-5 border-b border-slate-100 flex items-center justify-between">
                                  <h4 className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">{section.title}</h4>
                              </div>
                              <div className="divide-y divide-slate-50">
                                {visibleFields.map((field: any) => {
                                  const val = field.isStandard && field.mapping ? viewedSub[field.mapping] : viewedSub.formData?.[field.id];
                                  if (val === undefined || val === null || val === "") return null;
                                  
                                  return (
                                    <div key={field.id} className="px-8 py-5 grid grid-cols-1 md:grid-cols-3 gap-4 hover:bg-slate-50/30 transition-colors">
                                       <div className="md:col-span-1">
                                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider pt-1 leading-tight">{field.label}</p>
                                       </div>
                                       <div className="md:col-span-2">
                                          {(() => {
                                            if (field.type === 'file') {
                                              return <DocValue label={field.label} url={String(val)} />;
                                            }
                                            
                                            let parsed = val;
                                            if (typeof val === 'string') {
                                              const trimmed = val.trim();
                                              if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                                                try {
                                                  parsed = JSON.parse(trimmed);
                                                } catch (e) {}
                                              }
                                            }

                                            if (Array.isArray(parsed)) {
                                              return (
                                                <div className="flex flex-wrap gap-2 pt-0.5">
                                                  {parsed.map((item: any, idx: number) => (
                                                    <span
                                                      key={idx}
                                                      className="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-100 shadow-2xs hover:bg-orange-100 transition-colors uppercase tracking-tight"
                                                    >
                                                      {String(item)}
                                                    </span>
                                                  ))}
                                                </div>
                                              );
                                            }

                                            if (parsed && typeof parsed === 'object') {
                                              const entries = Object.entries(parsed);
                                              if (entries.length === 0) return <span className="text-sm text-slate-400 italic">—</span>;
                                              return (
                                                <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-2xs bg-slate-50/50 max-w-lg">
                                                  <table className="w-full text-xs text-left divide-y divide-slate-100">
                                                    <thead className="bg-slate-100/70 text-slate-500">
                                                      <tr>
                                                        <th className="px-4 py-2 font-bold uppercase tracking-wider">Item / Speciality</th>
                                                        <th className="px-4 py-2 font-bold uppercase tracking-wider">Response / Rating</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                                                      {entries.map(([k, v]) => (
                                                        <tr key={k} className="hover:bg-slate-50/50">
                                                          <td className="px-4 py-2.5 font-semibold text-slate-600">{k}</td>
                                                          <td className="px-4 py-2.5 font-bold text-slate-900">
                                                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              );
                                            }

                                            if (typeof parsed === 'boolean') {
                                              return (
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${parsed ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                                                  {parsed ? 'YES' : 'NO'}
                                                </span>
                                              );
                                            }

                                            if (typeof parsed === 'string' && parsed.includes('\n')) {
                                              return <p className="text-sm font-semibold text-slate-800 break-words leading-relaxed whitespace-pre-line">{parsed}</p>;
                                            }

                                            return <p className="text-sm font-bold text-slate-800 break-words leading-relaxed">{String(parsed)}</p>;
                                          })()}
                                       </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </Card>
                          );
                        })}
                     </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            </div>

            {/* Dedicated 1-Page A4 Print View (Hidden on Screen, Visible on Print) */}
            <div className="hidden print:block space-y-4 print:text-slate-900 mt-2">
               {/* Academic & Personal Grid */}
               <div className="border border-slate-350 rounded-xl overflow-hidden bg-white shadow-sm">
                  <div className="bg-[#0b4a8f]/5 px-4 py-1.5 border-b border-slate-350">
                     <p className="text-[10px] font-black text-[#0b4a8f] uppercase tracking-wider">I. Candidate Profile & Academic Overview</p>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 text-xs">
                     {getCompactPrintFields().map((field, idx) => (
                        <div key={idx} className="p-2 flex items-center justify-between min-h-[36px]">
                           <span className="font-bold text-slate-500 uppercase text-[9px] tracking-wider">{field.label}</span>
                           <span className="font-black text-slate-800 break-all pl-2 text-right">{field.value}</span>
                        </div>
                     ))}
                  </div>
               </div>

               {/* Secure Letters of Recommendation Verification (LORs side-by-side) */}
               {getPrintLorFields().length > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                     {getPrintLorFields().map((lor, idx) => {
                        const verifyUrl = typeof window !== 'undefined' ? (window.location.origin + "/verify-lor?path=" + encodeURIComponent(lor.value)) : "";
                        return (
                           <div key={idx} className="border border-slate-350 rounded-xl p-3.5 bg-white flex items-center justify-between gap-4 shadow-sm min-h-[110px]">
                              <div className="space-y-1">
                                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Verified Reference</p>
                                 <p className="text-xs font-black text-slate-900 leading-snug">{lor.label}</p>
                                 <div className="pt-1.5 flex items-center gap-1 text-[8px] font-black text-[#0b4a8f] uppercase tracking-wider">
                                    <span>🔒 Secure Verification QR</span>
                                 </div>
                                 <p className="text-[7.5px] text-slate-455 font-medium leading-tight max-w-[130px]">
                                    Administrative review required. Scanning validates credential authenticity.
                                 </p>
                              </div>
                              <div className="p-1 bg-white border border-slate-200 rounded-lg flex-shrink-0">
                                 {verifyUrl && <QRCode value={verifyUrl} size={65} className="w-[65px] h-[65px]" />}
                              </div>
                           </div>
                        );
                     })}
                  </div>
               )}

               {/* Print Verification Sign-off Box */}
               <div className="border border-slate-350 rounded-xl p-4 bg-white/50 grid grid-cols-3 gap-6 items-end pt-12 mt-4">
                  <div className="space-y-1">
                     <div className="border-t border-slate-400 w-full pt-1.5">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Signature of Reviewer</p>
                     </div>
                  </div>
                  <div className="space-y-1 text-center">
                     <div className="border-t border-slate-400 w-full pt-1.5">
                        <p className="text-[9px] font-black text-[#0b4a8f] uppercase tracking-wider font-mono opacity-20">SAV OFFICIAL SEAL</p>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Authorized Seal / Stamp</p>
                     </div>
                  </div>
                  <div className="space-y-1 text-right">
                     <div className="border-t border-slate-400 w-full pt-1.5">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Date of Verification</p>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Submissions list view
  if (viewFormId !== null) {
    if (subsLoading) {
      return (
        <div className="flex items-center justify-center min-h-[500px]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-orange-600" />
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest animate-pulse">
              Loading Submissions Queue...
            </p>
          </div>
        </div>
      );
    }

    const filteredSubs = submissions.filter((s) => {
      const statusMatch = statusFilter === "all" ? true : s.status === statusFilter;
      const specMatch = specFilter === "all" ? true : parseActualSpecializations(s).includes(specFilter);
      return statusMatch && specMatch;
    });

    const sortedSubs = [...filteredSubs].sort((a, b) => {
      if (sortFilter === "time_desc") {
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      } else if (sortFilter === "time_asc") {
        return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      } else if (sortFilter === "name_asc") {
        return a.fullName.localeCompare(b.fullName);
      } else if (sortFilter === "name_desc") {
        return b.fullName.localeCompare(a.fullName);
      }
      return 0;
    });
    
    // Get unique specializations for filter
    const allSpecs = Array.from(new Set(submissions.flatMap(s => parseActualSpecializations(s)))).sort();

    const allFilteredSelected = filteredSubs.length > 0 && filteredSubs.every((s) => selectedIds.includes(s.id));
    const toggleSelectAll = () => {
      if (allFilteredSelected) setSelectedIds([]);
      else setSelectedIds(filteredSubs.map((s) => s.id));
    };
    const totalApplications = submissions.reduce((acc, s) => acc + parseActualSpecializations(s).length, 0);
    const totalApplicants = submissions.length;
    const approvedCandidatesCount = submissions.filter(s => ['approved', 'verified', 'scheduled', 'interviewed', 'completed'].includes(s.status)).length;
    const pendingCount = submissions.filter(s => s.status === 'pending').length;

    const today = new Date().toLocaleDateString("en-IN");
    const todayApplications = submissions.filter((s) => new Date(s.submittedAt).toLocaleDateString("en-IN") === today).length;

    // Retina vs Anterior Segment calculations
    let vrsCount = 0;
    let mrCount = 0;
    let corneaCount = 0;
    let cataractCount = 0;
    let glaucomaCount = 0;
    let pediatricCount = 0;
    let orbitCount = 0;

    submissions.forEach(s => {
      const specs = parseActualSpecializations(s);
      specs.forEach(spec => {
        const lower = spec.toLowerCase();
        if (lower.includes("vitreo retina") || lower.includes("vitreoretinal")) {
          vrsCount++;
        } else if (lower.includes("medical retina")) {
          mrCount++;
        } else if (lower.includes("cornea")) {
          corneaCount++;
        } else if (lower.includes("cataract") || lower.includes("refractive") || lower.includes("phaco") || lower.includes("iol")) {
          cataractCount++;
        } else if (lower.includes("glaucoma")) {
          glaucomaCount++;
        } else if (lower.includes("pediatric")) {
          pediatricCount++;
        } else if (lower.includes("orbit") || lower.includes("oculoplast") || lower.includes("oculoplasty")) {
          orbitCount++;
        } else {
          cataractCount++;
        }
      });
    });

    const retinaTotal = vrsCount + mrCount;
    const anteriorTotal = corneaCount + cataractCount + glaucomaCount + pediatricCount + orbitCount;

    // Chart Data for Subspecialties
    const subspecialtiesChartData = [
      { name: "Vitreo Retina", count: vrsCount, fill: "#8b5cf6" },
      { name: "Medical Retina", count: mrCount, fill: "#a78bfa" },
      { name: "Cornea", count: corneaCount, fill: "#10b981" },
      { name: "Cataract/Phaco", count: cataractCount, fill: "#14b8a6" },
      { name: "Glaucoma", count: glaucomaCount, fill: "#0ea5e9" },
      { name: "Pediatric", count: pediatricCount, fill: "#f59e0b" },
      { name: "Orbit/Oculoplasty", count: orbitCount, fill: "#ec4899" },
    ];

    // Status breakdown data for Donut Chart
    const statusCounts = {
      pending: submissions.filter(s => s.status === 'pending').length,
      approved: submissions.filter(s => ['approved', 'verified', 'scheduled', 'interviewed', 'completed'].includes(s.status)).length,
      rejected: submissions.filter(s => s.status === 'rejected').length,
    };
    const statusChartData = [
      { name: "Pending Review", value: statusCounts.pending, color: "#f59e0b" },
      { name: "Approved / Scheduled", value: statusCounts.approved, color: "#10b981" },
      { name: "Rejected / Declined", value: statusCounts.rejected, color: "#ef4444" },
    ].filter(item => item.value > 0);

    const conversionRate = totalApplicants > 0 ? Math.round((statusCounts.approved / totalApplicants) * 100) : 0;

    const toggleSelect = (id: number) =>
      setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

    return (
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="p-8 space-y-8"
      >
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-5">
            <Button variant="ghost" size="icon" onClick={() => { setViewFormId(null); setViewSubId(null); setStatusFilter("all"); setSelectedIds([]); }} className="rounded-full hover:bg-slate-100">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </Button>
            <div>
               <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-orange-500 text-white border-none rounded-full px-3 py-0.5 text-[10px] font-black uppercase tracking-widest">
                     December 2026 Intake
                  </Badge>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                     <FileText className="w-3 h-3" /> {viewedForm?.title}
                  </span>
               </div>
               <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">Applications & Admissions</h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 font-bold px-4 shadow-sm"
              onClick={() => viewFormId && downloadStudentListPdf(viewFormId)}
              disabled={downloadingDirectoryPdf || submissions.length === 0}
            >
              {downloadingDirectoryPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-indigo-600" /> : <Printer className="w-4 h-4 mr-2 text-indigo-600" />}
              Download Student List (PDF)
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl border-slate-200 font-bold px-4"
               onClick={() => syncGoogleSheets.mutate(viewFormId)}
               disabled={syncGoogleSheets.isPending}>
              {syncGoogleSheets.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Sync Sheets
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl border-slate-200 font-bold px-4" onClick={() => exportExcel(viewFormId)} disabled={exporting || submissions.length === 0}>
              {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Excel Export
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="rounded-xl border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold px-4 shadow-sm"
              onClick={() => {
                setReconcileData(prev => ({ ...prev, paymentId: "" }));
                setReconcileModalOpen(true);
              }}
            >
              <CreditCard className="w-4 h-4 mr-2 text-emerald-600" />
              Recover Paid Application
            </Button>
            <Button size="sm" className="rounded-xl orange-gradient text-white border-none shadow-lg shadow-orange-500/20 font-bold px-6 hover:scale-[1.02] active:scale-[0.98] transition-all" onClick={() => {
              if (viewedForm?.token) {
                window.open(`/application-forms/${viewedForm.token}/manual-entry`, "_blank");
              } else {
                toast({ title: "Error", description: "No active form selected or form token is missing.", variant: "destructive" });
              }
            }}>
              <UserPlus className="w-4 h-4 mr-2" />
              Manual Entry
            </Button>
          </div>
        </div>

        {/* Today's Live Performance Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-[28px] p-6 relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl">
          <div className="absolute top-0 left-0 w-2 h-full bg-orange-500" />
          <div className="flex items-center gap-4">
            <div className="relative">
              <span className="absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-70 animate-ping" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </div>
            <div>
              <div className="text-[10px] font-black text-orange-400 uppercase tracking-widest">TODAY'S ASSESSMENT PROGRESS</div>
              <h4 className="text-lg font-black text-slate-200">Real-time submissions & conversions overview</h4>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 md:gap-12 w-full md:w-auto">
            <div className="text-center md:text-left">
              <div className="text-2xl font-black text-slate-100">{todayApplications}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Today's Apps</div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-2xl font-black text-indigo-400">{submissions.filter(s => new Date(s.submittedAt).toLocaleDateString("en-IN") === today && parseActualSpecializations(s).some(sp => sp.toLowerCase().includes("retina"))).length}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Retina Today</div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-2xl font-black text-emerald-400">{submissions.filter(s => new Date(s.submittedAt).toLocaleDateString("en-IN") === today && !parseActualSpecializations(s).some(sp => sp.toLowerCase().includes("retina"))).length}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Anterior Today</div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-2xl font-black text-amber-400">{conversionRate}%</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Conversion Rate</div>
            </div>
          </div>
        </div>

        {/* Main Overall Statistics Cards */}
        <div className="grid gap-6 grid-cols-1 md:grid-cols-4">
          <div className="group relative overflow-hidden rounded-[32px] p-6 bg-white border border-slate-100 shadow-premium transition-all duration-300 hover:shadow-md">
            <div className="flex justify-between items-start">
              <div className="p-3 bg-blue-500/10 text-blue-600 rounded-2xl"><Users className="h-6 w-6" /></div>
              <Badge className="bg-blue-500/10 text-blue-600 border border-blue-500/20 text-[9px] px-2 h-5 uppercase tracking-widest font-black">Cohort Scale</Badge>
            </div>
            <div className="mt-6">
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">{totalApplicants}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Unique Applicants Registered</p>
            </div>
          </div>
          <div className="group relative overflow-hidden rounded-[32px] p-6 bg-white border border-slate-100 shadow-premium transition-all duration-300 hover:shadow-md">
            <div className="flex justify-between items-start">
              <div className="p-3 bg-indigo-500/10 text-indigo-600 rounded-2xl"><ClipboardList className="h-6 w-6" /></div>
              <Badge className="bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 text-[9px] px-2 h-5 uppercase tracking-widest font-black">Applications</Badge>
            </div>
            <div className="mt-6">
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">{totalApplications}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Specializations Applied</p>
            </div>
          </div>
          <div className="group relative overflow-hidden rounded-[32px] p-6 bg-white border border-slate-100 shadow-premium transition-all duration-300 hover:shadow-md">
            <div className="flex justify-between items-start">
              <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-2xl"><CheckCircle2 className="h-6 w-6" /></div>
              <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[9px] px-2 h-5 uppercase tracking-widest font-black">Approved</Badge>
            </div>
            <div className="mt-6">
              <h3 className="text-3xl font-black text-emerald-600 tracking-tight">{approvedCandidatesCount}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Approved & Verified Candidates</p>
            </div>
          </div>
          <div className="group relative overflow-hidden rounded-[32px] p-6 bg-white border border-slate-100 shadow-premium transition-all duration-300 hover:shadow-md">
            <div className="flex justify-between items-start">
              <div className="p-3 bg-amber-500/10 text-amber-600 rounded-2xl"><Clock className="h-6 w-6" /></div>
              <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[9px] px-2 h-5 uppercase tracking-widest font-black">Pending</Badge>
            </div>
            <div className="mt-6">
              <h3 className="text-3xl font-black text-amber-600 tracking-tight">{pendingCount}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Awaiting Academic Review</p>
            </div>
          </div>
        </div>

        {/* Segment-wise Split cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* RETINA SEGMENT CARD */}
          <div className="rounded-[36px] bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 p-8 shadow-premium text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex justify-between items-center border-b border-slate-800 pb-5 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-100 tracking-tight">RETINA SEGMENT</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Vitreoretinal & Medical Retina</p>
                </div>
              </div>
              <Badge className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-black px-3.5 py-1 text-[11px] rounded-full">
                {retinaTotal} Applications
              </Badge>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-900/60 p-4 rounded-2xl border border-slate-800/40">
                <span className="text-slate-300 text-xs font-bold">Vitreoretinal Surgery (Retina - Surgical)</span>
                <Badge className="bg-indigo-500/20 text-indigo-300 font-bold px-3 py-0.5 rounded-lg border border-indigo-500/30">
                  {vrsCount}
                </Badge>
              </div>
              <div className="flex justify-between items-center bg-slate-900/60 p-4 rounded-2xl border border-slate-800/40">
                <span className="text-slate-300 text-xs font-bold">Medical Retina (Retina - Non-Surgical)</span>
                <Badge className="bg-violet-500/20 text-violet-300 font-bold px-3 py-0.5 rounded-lg border border-violet-500/30">
                  {mrCount}
                </Badge>
              </div>
            </div>
            <div className="mt-8 flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-800/60 pt-4">
              <span>Dynamic tracking active</span>
              <span>Unique Segment Candidates: {submissions.filter(s => parseActualSpecializations(s).some(sp => sp.toLowerCase().includes("retina"))).length}</span>
            </div>
          </div>

          {/* ANTERIOR SEGMENT CARD */}
          <div className="rounded-[36px] bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-900 p-8 shadow-premium text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex justify-between items-center border-b border-slate-800 pb-5 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-100 tracking-tight">ANTERIOR SEGMENT</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Cornea, Cataract, Glaucoma, Pediatric, Orbit</p>
                </div>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-black px-3.5 py-1 text-[11px] rounded-full">
                {anteriorTotal} Applications
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex justify-between items-center bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/40">
                <span className="text-slate-300 text-[11px] font-bold">Cornea & External Disease</span>
                <Badge className="bg-emerald-500/20 text-emerald-300 font-bold px-2 rounded-lg">{corneaCount}</Badge>
              </div>
              <div className="flex justify-between items-center bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/40">
                <span className="text-slate-300 text-[11px] font-bold">Cataract & Refractive</span>
                <Badge className="bg-teal-500/20 text-teal-300 font-bold px-2 rounded-lg">{cataractCount}</Badge>
              </div>
              <div className="flex justify-between items-center bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/40">
                <span className="text-slate-300 text-[11px] font-bold">Glaucoma</span>
                <Badge className="bg-sky-500/20 text-sky-400 font-bold px-2 rounded-lg">{glaucomaCount}</Badge>
              </div>
              <div className="flex justify-between items-center bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/40">
                <span className="text-slate-300 text-[11px] font-bold">Pediatric Ophthalmology</span>
                <Badge className="bg-amber-500/20 text-amber-400 font-bold px-2 rounded-lg">{pediatricCount}</Badge>
              </div>
              <div className="flex justify-between items-center bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/40 sm:col-span-2">
                <span className="text-slate-300 text-[11px] font-bold">Orbit & Oculoplastics</span>
                <Badge className="bg-rose-500/20 text-rose-400 font-bold px-2 rounded-lg">{orbitCount}</Badge>
              </div>
            </div>
            <div className="mt-8 flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-800/60 pt-4">
              <span>Dynamic tracking active</span>
              <span>Unique Segment Candidates: {submissions.filter(s => !parseActualSpecializations(s).some(sp => sp.toLowerCase().includes("retina"))).length}</span>
            </div>
          </div>
        </div>

        {/* Visual Analytics Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Subspecialty Distribution Chart */}
          <div className="lg:col-span-2 rounded-[36px] border border-slate-150 bg-white p-6 shadow-premium flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Activity className="h-5 w-5 text-orange-500" /> Specialty Distribution Fill Rate
              </h3>
              <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-wider">Number of candidates applying for each specialization</p>
            </div>
            <div className="h-[280px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subspecialtiesChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <RechartsTooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '16px', border: '1px solid #f1f5f9', fontSize: 11, fontWeight: 'bold' }}
                  />
                  <Bar dataKey="count" name="Applicants Count" fill="#f97316" radius={[6, 6, 0, 0]}>
                    {subspecialtiesChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Conversion Pipeline Donut Chart */}
          <div className="rounded-[36px] border border-slate-150 bg-white p-6 shadow-premium flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Percent className="h-5 w-5 text-orange-500" /> Application Pipeline
              </h3>
              <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-wider">Admissions funnel & approvals conversion</p>
            </div>
            <div className="h-[180px] w-full relative flex items-center justify-center mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9', fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-slate-800">{conversionRate}%</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Conversion</span>
              </div>
            </div>
            <div className="space-y-2 mt-4">
              {statusChartData.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-50 pb-1.5 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">{item.name}</span>
                  </div>
                  <span className="font-extrabold text-slate-800">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>


        <Tabs value={admissionsTab} onValueChange={(v: any) => setAdmissionsTab(v)} className="space-y-6">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3 flex-wrap">
            <TabsList className="bg-slate-100 p-1 rounded-2xl h-12 gap-1 border border-slate-200/60 shadow-inner">
              <TabsTrigger 
                value="applications" 
                className="rounded-xl px-5 h-10 font-bold text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md transition-all gap-2"
              >
                <ClipboardList className="w-4 h-4 text-orange-500" />
                Applications & Scrutiny
                <Badge className="ml-1 bg-slate-200 text-slate-700 hover:bg-slate-200 rounded-full text-[10px] px-2 py-0 border-none font-black">
                  {submissions.length}
                </Badge>
              </TabsTrigger>

              <TabsTrigger 
                value="call_letters" 
                className="rounded-xl px-5 h-10 font-bold text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md transition-all gap-2"
              >
                <Award className="w-4 h-4 text-indigo-500" />
                Approved (Call Letters)
                <Badge className="ml-1 bg-indigo-100 text-indigo-800 hover:bg-indigo-100 rounded-full text-[10px] px-2 py-0 border-none font-black">
                  {approvedCandidatesCount}
                </Badge>
              </TabsTrigger>

              <TabsTrigger 
                value="offer_letters" 
                className="rounded-xl px-5 h-10 font-bold text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md transition-all gap-2"
              >
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Selected Fellows (Offer Letters)
                <Badge className="ml-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 rounded-full text-[10px] px-2 py-0 border-none font-black">
                  {submissions.filter(s => s.status === 'allocated' || (s.reviewNotes && s.reviewNotes.includes('Allocated'))).length || approvedCandidatesCount}
                </Badge>
              </TabsTrigger>

              <TabsTrigger 
                value="settings" 
                className="rounded-xl px-5 h-10 font-bold text-xs data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-md transition-all gap-2"
              >
                <Settings2 className="w-4 h-4 text-slate-500" />
                Form & Public Link
              </TabsTrigger>
            </TabsList>
            
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full">
                Session: December 2026
              </Badge>
            </div>
          </div>

          {/* Sub-tab 1: Applications & Scrutiny */}
          <TabsContent value="applications" className="space-y-6 focus:outline-none">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div className="flex items-center gap-4 flex-wrap">
                <div className="flex gap-1.5 p-1 bg-slate-100 rounded-2xl w-fit">
                  {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                    <Button 
                      key={f} 
                      size="sm" 
                      variant={statusFilter === f ? "default" : "ghost"}
                      className={`rounded-xl text-[10px] font-black uppercase tracking-widest px-4 h-9 ${statusFilter === f ? 'bg-white text-slate-900 shadow-sm hover:bg-white' : 'text-slate-500 hover:text-slate-900'}`}
                      onClick={() => { setStatusFilter(f); setSelectedIds([]); }}>
                      {f}
                      <Badge className="ml-2 bg-slate-200 text-slate-600 border-none group-hover:bg-slate-300">
                         {f === "all" ? submissions.length : submissions.filter((s) => s.status === f).length}
                      </Badge>
                    </Button>
                  ))}
                </div>

                <div className="flex items-center gap-2 bg-white/50 border border-slate-200 p-1.5 rounded-2xl shadow-sm">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Filter Specialty</span>
                   <Select value={specFilter} onValueChange={setSpecFilter}>
                     <SelectTrigger className="h-8 min-w-[180px] rounded-xl border-none bg-slate-100 hover:bg-slate-200 transition-all text-[10px] font-black uppercase tracking-widest focus:ring-0">
                        <SelectValue placeholder="All Specializations" />
                     </SelectTrigger>
                     <SelectContent className="rounded-2xl border-slate-100 shadow-2xl">
                        <SelectItem value="all" className="text-[10px] font-black uppercase tracking-widest">All Specializations</SelectItem>
                        {allSpecs.map(spec => (
                          <SelectItem key={spec} value={spec} className="text-[10px] font-black uppercase tracking-widest">{spec}</SelectItem>
                        ))}
                     </SelectContent>
                   </Select>
                </div>

                <div className="flex items-center gap-2 bg-white/50 border border-slate-200 p-1.5 rounded-2xl shadow-sm">
                   <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Sort By</span>
                   <Select value={sortFilter} onValueChange={(val: any) => setSortFilter(val)}>
                     <SelectTrigger className="h-8 min-w-[160px] rounded-xl border-none bg-slate-100 hover:bg-slate-200 transition-all text-[10px] font-black uppercase tracking-widest focus:ring-0">
                        <SelectValue placeholder="Sort Order" />
                     </SelectTrigger>
                     <SelectContent className="rounded-2xl border-slate-100 shadow-2xl">
                        <SelectItem value="time_desc" className="text-[10px] font-black uppercase tracking-widest">Time Applied: Newest</SelectItem>
                        <SelectItem value="time_asc" className="text-[10px] font-black uppercase tracking-widest">Time Applied: Oldest</SelectItem>
                        <SelectItem value="name_asc" className="text-[10px] font-black uppercase tracking-widest">Name: A to Z</SelectItem>
                        <SelectItem value="name_desc" className="text-[10px] font-black uppercase tracking-widest">Name: Z to A</SelectItem>
                     </SelectContent>
                   </Select>
                </div>

                <Button
                  size="sm"
                  onClick={() => {
                    const subList = (submissions || []).filter(Boolean);
                    if (subList.length < 2) {
                      toast({
                        title: "Cannot Merge Applications",
                        description: "At least 2 application submissions are required to perform a merge.",
                        variant: "destructive"
                      });
                      return;
                    }
                    const cand1 = subList[0];
                    const cand2 = subList.find(x => x.id !== cand1.id) || subList[1] || cand1;
                    setMergePair({ subA: cand1, subB: cand2 });
                    setMergePrimaryId(cand1.id);
                    setMergeDeleteSecondary(true);
                    setMergeDialogOpen(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest h-11 px-4 gap-2 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  Merge Applications
                </Button>
              </div>

             {selectedIds.length > 0 && (
                 <motion.div 
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   className="flex items-center gap-3 bg-slate-900 text-white rounded-2xl px-5 py-2 shadow-xl"
                 >
                   <span className="text-xs font-bold mr-2">{selectedIds.length} Selected</span>
                   {selectedIds.length === 2 && (
                     <Button 
                       size="sm" 
                       className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase h-8 px-3 gap-1.5 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
                       onClick={() => {
                         const idA = Number(selectedIds[0]);
                         const idB = Number(selectedIds[1]);
                         const subA = submissions.find(s => Number(s.id) === idA);
                         const subB = submissions.find(s => Number(s.id) === idB);
                         if (subA && subB) {
                           setMergePair({ subA, subB });
                           setMergePrimaryId(subA.id);
                           setMergeDeleteSecondary(true);
                           setMergeDialogOpen(true);
                         } else {
                           toast({
                             title: "Cannot find selected applications",
                             description: "Please ensure both selected applications belong to the current list.",
                             variant: "destructive"
                           });
                         }
                       }}
                     >
                       <GitMerge className="w-3.5 h-3.5" />
                       Merge 2 Applications
                     </Button>
                   )}
                   <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-[10px] font-black uppercase h-8 px-3"
                     onClick={() => bulkAction.mutate({ formId: viewFormId, action: "approve", ids: selectedIds })}
                     disabled={bulkAction.isPending}>
                     Approve
                   </Button>
                   <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 text-[10px] font-black uppercase h-8 px-3"
                     onClick={() => {
                       if (confirm(`Delete ${selectedIds.length} submissions?`)) bulkDeleteSubsMutation.mutate(selectedIds);
                     }}
                     disabled={bulkDeleteSubsMutation.isPending}>
                     Delete
                   </Button>
                 </motion.div>
               )}
            </div>

            <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-white">
              <div className="overflow-x-auto fancy-scrollbar">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-5 w-10">
                        <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAll} className="rounded-md border-slate-300" />
                      </th>
                      <th className="text-left px-6 py-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Candidate</th>
                      <th className="text-left px-6 py-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Applied For</th>
                      <th className="text-left px-6 py-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Status</th>
                      <th className="text-left px-6 py-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Payment Ref</th>
                      <th className="text-left px-6 py-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Submitted</th>
                      <th className="text-right px-6 py-5 font-black text-slate-400 uppercase tracking-widest text-[10px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sortedSubs.map((s) => (
                      <tr key={s.id} className={`group hover:bg-slate-50/50 transition-colors ${selectedIds.includes(s.id) ? "bg-orange-50/30" : ""}`}>
                        <td className="px-6 py-5">
                          <Checkbox checked={selectedIds.includes(s.id)} onCheckedChange={() => toggleSelect(s.id)} className="rounded-md border-slate-300" />
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex flex-col">
                            <span className="font-black text-slate-900 text-base leading-tight group-hover:text-orange-600 transition-colors cursor-pointer flex items-center gap-2" onClick={() => setViewSubId(s.id)}>
                               {s.fullName}
                               {s.readyForReview && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{s.email}</span>
                            {(() => {
                              const dupes = s.email ? submissions.filter(other => other.email?.toLowerCase().trim() === s.email?.toLowerCase().trim() && other.id !== s.id) : [];
                              if (dupes.length > 0) {
                                return (
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                                      <span>🔁</span> {dupes.length + 1} Submissions for Applicant
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMergePair({ subA: s, subB: dupes[0] });
                                        setMergePrimaryId(s.id);
                                        setMergeDeleteSecondary(false);
                                        setMergeDialogOpen(true);
                                      }}
                                      className="text-[9px] font-black uppercase tracking-wider text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-md transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                      <GitMerge className="w-2.5 h-2.5" />
                                      Merge
                                    </button>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            {(() => {
                              const prefs = getFormattedSpecialityPrefs(s.specialization, s.centerPreference, s.formData, s.customAnswers, viewedForm?.sectionsConfig);
                              if (prefs.length > 0) {
                                return (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {prefs.map(({ spec, location }) => (
                                      <span key={spec} className="text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-2 py-0.5">
                                        {location ? `${spec}: ${location}` : spec}
                                      </span>
                                    ))}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          {(() => {
                            const prefs = getFormattedSpecialityPrefs(s.specialization, s.centerPreference, s.formData, s.customAnswers, viewedForm?.sectionsConfig);
                            if (prefs.length > 0) {
                              return (
                                <div className="flex flex-wrap gap-1.5">
                                  {prefs.map(({ spec, location }) => (
                                    <Badge key={spec} className={`${getSpecColorClass(spec)} rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-tight border-none`}>
                                       {location ? `${spec}: ${location}` : spec}
                                    </Badge>
                                  ))}
                                </div>
                              );
                            }
                            return <span className="text-slate-400 text-xs">-</span>;
                          })()}
                        </td>
                        <td className="px-6 py-5">
                          <Badge className={`${STATUS_COLORS[s.status] ?? "bg-slate-100"} rounded-full px-3 py-0.5 text-[9px] font-black uppercase tracking-widest border-none`}>
                            {s.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-5">
                          <DocValue label="Payment" url={(s.paymentUrl || s.paymentId) ?? null} />
                        </td>
                        <td className="px-6 py-5">
                            <p className="text-xs font-bold text-slate-700">{fmtDate(s.submittedAt)}</p>
                            <p className="text-[10px] font-medium text-slate-400">{fmtTime(s.submittedAt)}</p>
                        </td>
                        <td className="px-6 py-5 text-right">
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             onClick={() => setViewSubId(s.id)}
                             className="rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-900 hover:text-white"
                           >
                              View Detail
                           </Button>
                         </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Sub-tab 2: Approved Candidates (Call Letters) */}
          <TabsContent value="call_letters" className="space-y-6 focus:outline-none">
            {/* Call Letter Notice Banner */}
            <div className="bg-gradient-to-r from-[#0b4a8f] via-[#103b70] to-[#0a2540] text-white rounded-[28px] p-6 shadow-xl border border-blue-400/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-amber-400 text-slate-950 font-black text-[9px] uppercase tracking-wider px-2.5 py-0.5 border-none">
                      Central Selection Board
                    </Badge>
                    <span className="text-[10px] font-bold text-blue-200 uppercase tracking-widest">
                      December 2026 Intake
                    </span>
                  </div>
                  <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-400" />
                    Interview Call Letters Hub (Approved Only)
                  </h3>
                  <p className="text-xs text-blue-100/80 max-w-2xl font-medium leading-relaxed">
                    Official call letters for physical scrutiny and faculty interviews at Sankara Eye Hospital, Bangalore. Download official PDF or dispatch directly to candidate email.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-white/10 p-3 rounded-2xl border border-white/10 shrink-0">
                  <div className="text-left">
                    <p className="text-[9px] font-black uppercase tracking-wider text-amber-300">Retina (VR & MR)</p>
                    <p className="text-xs font-bold text-white">7 Dec 2026 (Mon)</p>
                  </div>
                  <div className="w-px h-8 bg-white/20" />
                  <div className="text-left">
                    <p className="text-[9px] font-black uppercase tracking-wider text-emerald-300">Other Specialities</p>
                    <p className="text-xs font-bold text-white">8 Dec 2026 (Tue)</p>
                  </div>
                  <div className="w-px h-8 bg-white/20" />
                  <div className="text-left">
                    <p className="text-[9px] font-black uppercase tracking-wider text-blue-200">Reporting Time</p>
                    <p className="text-xs font-bold text-white">8:00 AM Sharp</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  placeholder="Search approved candidates by name, code, email..."
                  value={callLetterSearch}
                  onChange={(e) => setCallLetterSearch(e.target.value)}
                  className="pl-10 h-10 rounded-2xl bg-white border-slate-200 text-xs font-semibold"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stream:</span>
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                  {(["all", "retina", "anterior"] as const).map((mode) => (
                    <Button
                      key={mode}
                      size="sm"
                      variant={callStreamFilter === mode ? "default" : "ghost"}
                      onClick={() => setCallStreamFilter(mode)}
                      className={`h-8 rounded-lg text-[10px] font-black uppercase tracking-wider px-3 ${callStreamFilter === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    >
                      {mode === "all" ? "All Streams" : mode === "retina" ? "Retina VR & MR (7 Dec)" : "Other Specialities (8 Dec)"}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Approved Candidates Table */}
            {(() => {
              const approvedCandidates = submissions.filter(s => ['approved', 'verified', 'scheduled', 'interviewed', 'completed', 'allocated'].includes(s.status));
              const filteredList = approvedCandidates.filter(s => {
                const matchSearch = !callLetterSearch ||
                  s.fullName?.toLowerCase().includes(callLetterSearch.toLowerCase()) ||
                  s.email?.toLowerCase().includes(callLetterSearch.toLowerCase()) ||
                  (s.candidateCode && s.candidateCode.toLowerCase().includes(callLetterSearch.toLowerCase()));
                const isRet = parseActualSpecializations(s).some(sp => isRetinaSpecialty(sp));
                const matchStream = callStreamFilter === "all" ? true : (callStreamFilter === "retina" ? isRet : !isRet);
                return matchSearch && matchStream;
              });

              if (filteredList.length === 0) {
                return (
                  <Card className="border-none shadow-premium rounded-3xl p-12 text-center bg-white">
                    <Award className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="font-bold text-slate-800 text-base">No Approved Candidates Match Filters</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto font-medium">
                      {approvedCandidates.length === 0 
                        ? "No candidates have been approved yet. Review submissions in the Applications tab and click Approve to generate Call Letters."
                        : "Try adjusting your search query or stream filter to find approved candidates."}
                    </p>
                  </Card>
                );
              }

              return (
                <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-white">
                  <div className="overflow-x-auto fancy-scrollbar">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
                          <th className="px-6 py-4 w-12">#</th>
                          <th className="px-6 py-4">Reg Code</th>
                          <th className="px-6 py-4">Candidate Doctor</th>
                          <th className="px-6 py-4">Specialization</th>
                          <th className="px-6 py-4">Interview Schedule</th>
                          <th className="px-6 py-4">Contact</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredList.map((s, idx) => {
                          const isRet = parseActualSpecializations(s).some(sp => isRetinaSpecialty(sp));
                          const schedDate = isRet ? "7th Dec 2026 (Mon)" : "8th Dec 2026 (Tue)";
                          const candidateCode = s.candidateCode || `APP-${String(s.id).padStart(4, "0")}`;
                          const qual = [s.degree, s.medicalCollege].filter(Boolean).join(" · ") || "MBBS / MS";

                          return (
                            <tr key={s.id} className="hover:bg-slate-50/60 transition-colors group">
                              <td className="px-6 py-4 font-bold text-slate-400 text-xs">{idx + 1}</td>
                              <td className="px-6 py-4">
                                <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[10px] font-black px-2.5 py-0.5 rounded-lg">
                                  {candidateCode}
                                </Badge>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors cursor-pointer text-sm" onClick={() => setViewSubId(s.id)}>
                                    Dr. {cleanDoctorName(s.fullName)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium truncate max-w-xs">{qual}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1">
                                  {parseActualSpecializations(s).map(sp => (
                                    <Badge key={sp} className={`${getSpecColorClass(sp)} rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-tight border-none`}>
                                      {sp}
                                    </Badge>
                                  ))}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-800 text-xs flex items-center gap-1">
                                    <CalendarDays className="w-3 h-3 text-indigo-500" /> {schedDate}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium">8:00 AM · SEH Bangalore</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="text-xs font-semibold text-slate-700 truncate max-w-[180px]">{s.email}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">{s.phone || "—"}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => downloadCallLetter(s.id, candidateCode)}
                                    disabled={downloadingLetterId === s.id}
                                    className="rounded-xl border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100 text-indigo-900 font-bold text-xs h-8 gap-1 shadow-sm"
                                  >
                                    {downloadingLetterId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    Call Letter PDF
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => sendCallLetterEmail(s.id, s.fullName)}
                                    disabled={sendingEmailId === s.id}
                                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-8 gap-1 shadow-sm"
                                  >
                                    {sendingEmailId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                                    Send Email
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setViewSubId(s.id)}
                                    className="rounded-xl text-slate-600 hover:text-slate-900 font-bold text-xs h-8 gap-1"
                                    title="View Full Application"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })()}
          </TabsContent>

          {/* Sub-tab 3: Selected Fellows (Offer Letters) */}
          <TabsContent value="offer_letters" className="space-y-6 focus:outline-none">
            {/* Offer Letter Notice Banner */}
            <div className="bg-gradient-to-r from-[#064e3b] via-[#065f46] to-[#042f2e] text-white rounded-[28px] p-6 shadow-xl border border-emerald-400/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-emerald-400 text-slate-950 font-black text-[9px] uppercase tracking-wider px-2.5 py-0.5 border-none">
                      Fellowship Appointments
                    </Badge>
                    <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest">
                      December 2026 Intake
                    </span>
                  </div>
                  <h3 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-300" />
                    Selected Fellows · Official Offer Letters Hub
                  </h3>
                  <p className="text-xs text-emerald-100/80 max-w-2xl font-medium leading-relaxed">
                    Generate standard 2-page Fellowship Appointment & Offer Letters with monthly stipend (Rs 40,000/-), assigned hospital unit, Phase 1 & Phase 2 duration breakdown, and mandatory induction dates (2nd & 3rd January 2027). For clarifications contact Radhika (Course Coordinator) on 9666677505.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-white/10 p-3 rounded-2xl border border-white/10 shrink-0">
                  <div className="text-left">
                    <p className="text-[9px] font-black uppercase tracking-wider text-emerald-300">Effective Date</p>
                    <p className="text-xs font-bold text-white">6th Jan 2027</p>
                  </div>
                  <div className="w-px h-8 bg-white/20" />
                  <div className="text-left">
                    <p className="text-[9px] font-black uppercase tracking-wider text-amber-300">Induction Program</p>
                    <p className="text-xs font-bold text-white">2nd & 3rd Jan 2027</p>
                  </div>
                  <div className="w-px h-8 bg-white/20" />
                  <div className="text-left">
                    <p className="text-[9px] font-black uppercase tracking-wider text-teal-200">Monthly Stipend</p>
                    <p className="text-xs font-bold text-white">Rs 40,000/-</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  placeholder="Search selected candidates by name, code, or email..."
                  value={offerLetterSearch}
                  onChange={(e) => setOfferLetterSearch(e.target.value)}
                  className="pl-10 h-10 rounded-2xl bg-white border-slate-200 text-xs font-semibold"
                />
              </div>

              <div className="text-xs font-bold text-slate-500">
                Total Allocated / Eligible: <span className="text-slate-900 font-black">{approvedCandidatesCount} Fellows</span>
              </div>
            </div>

            {/* Selected Fellows Table */}
            {(() => {
              const eligibleSubs = submissions.filter(s => ['approved', 'verified', 'scheduled', 'interviewed', 'completed', 'allocated'].includes(s.status));
              const filteredList = eligibleSubs.filter(s => {
                if (!offerLetterSearch) return true;
                const q = offerLetterSearch.toLowerCase();
                return s.fullName?.toLowerCase().includes(q) ||
                  s.email?.toLowerCase().includes(q) ||
                  (s.candidateCode && s.candidateCode.toLowerCase().includes(q));
              });

              if (filteredList.length === 0) {
                return (
                  <Card className="border-none shadow-premium rounded-3xl p-12 text-center bg-white">
                    <Sparkles className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="font-bold text-slate-800 text-base">No Selected Candidates Found</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto font-medium">
                      Approve candidates from the Applications queue to generate and issue their 2-page Offer Letters.
                    </p>
                  </Card>
                );
              }

              return (
                <Card className="border-none shadow-2xl rounded-3xl overflow-hidden bg-white">
                  <div className="overflow-x-auto fancy-scrollbar">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
                          <th className="px-6 py-4 w-12">#</th>
                          <th className="px-6 py-4">Reg Code</th>
                          <th className="px-6 py-4">Fellow Doctor</th>
                          <th className="px-6 py-4">Specialization</th>
                          <th className="px-6 py-4">Assigned Hospital Unit</th>
                          <th className="px-6 py-4">Stipend & Joining</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredList.map((s, idx) => {
                          const candidateCode = s.candidateCode || `APP-${String(s.id).padStart(4, "0")}`;
                          const defaultPrefUnit = s.centerPreference ? String(s.centerPreference).replace(/[{}"[\]]/g, "").trim().split(",")[0] : "";
                          const assignedUnit = offerUnitOverrides[s.id] || defaultPrefUnit || "Bangalore";

                          return (
                            <tr key={s.id} className="hover:bg-slate-50/60 transition-colors group">
                              <td className="px-6 py-4 font-bold text-slate-400 text-xs">{idx + 1}</td>
                              <td className="px-6 py-4">
                                <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[10px] font-black px-2.5 py-0.5 rounded-lg">
                                  {candidateCode}
                                </Badge>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-black text-slate-900 group-hover:text-emerald-700 transition-colors cursor-pointer text-sm" onClick={() => setViewSubId(s.id)}>
                                    Dr. {cleanDoctorName(s.fullName)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-semibold">{s.email}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1">
                                  {parseActualSpecializations(s).map(sp => (
                                    <Badge key={sp} className={`${getSpecColorClass(sp)} rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-tight border-none`}>
                                      {sp}
                                    </Badge>
                                  ))}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="min-w-[190px]">
                                  <Select
                                    value={assignedUnit}
                                    onValueChange={(val) => setOfferUnitOverrides(prev => ({ ...prev, [s.id]: val }))}
                                  >
                                    <SelectTrigger className="h-8 rounded-xl border-slate-200 bg-slate-50 text-xs font-bold">
                                      <SelectValue placeholder="Select Unit" />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-2xl border-slate-100 shadow-2xl">
                                      {units.length > 0 ? (
                                        units.map((u: any) => (
                                          <SelectItem key={u.id} value={u.name} className="text-xs font-bold">
                                            {u.name}
                                          </SelectItem>
                                        ))
                                      ) : (
                                        ["Bangalore", "Jaipur", "Coimbatore", "Kanpur", "Shimoga", "Guntur", "Ludhiana", "Chennai", "Anand", "Varanasi", "Panvel", "Indore", "Hyderabad"].map((city) => (
                                          <SelectItem key={city} value={`Sankara Eye Hospital, ${city}`} className="text-xs font-bold">
                                            Sankara Eye Hospital, {city}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="font-extrabold text-slate-900 text-xs">Rs 40,000 / month</span>
                                  <span className="text-[10px] text-emerald-700 font-bold">Joining: 6th Jan 2027</span>
                                  {(() => {
                                    const actualSpecs = parseActualSpecializations(s);
                                    const isRetinaCand = actualSpecs.some(sp => isRetinaSpecialty(sp));
                                    const isCataractCand = actualSpecs.some(sp => sp.toLowerCase().includes("cataract") || sp.toLowerCase().includes("iol"));
                                    const phaseLabel = isCataractCand 
                                      ? "Phase 1: 18M (IOL)" 
                                      : actualSpecs.some(sp => sp.toLowerCase().includes("medical retina") || sp.toLowerCase().includes("mr"))
                                      ? "Phase 1: 18M (MR)"
                                      : isRetinaCand 
                                      ? "Phase 2: 24M (VR)"
                                      : "Phase 1: 6M (IOL) + Phase 2: 18M";
                                    return (
                                      <span className="text-[9px] text-slate-500 font-semibold mt-0.5">
                                        {phaseLabel}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => downloadOfferLetter(s.id, candidateCode, assignedUnit)}
                                    disabled={downloadingLetterId === s.id}
                                    className="rounded-xl border-emerald-300 bg-emerald-50/60 hover:bg-emerald-100 text-emerald-900 font-bold text-xs h-8 gap-1 shadow-sm"
                                  >
                                    {downloadingLetterId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    Offer Letter (PDF)
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => sendOfferLetterEmail(s.id, s.fullName, assignedUnit)}
                                    disabled={sendingEmailId === s.id}
                                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 gap-1 shadow-sm"
                                  >
                                    {sendingEmailId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                                    Send Email
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setViewSubId(s.id)}
                                    className="rounded-xl text-slate-600 hover:text-slate-900 font-bold text-xs h-8 gap-1"
                                    title="View Full Application"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })()}
          </TabsContent>

          {/* Sub-tab 4: Form & Public Link */}
          <TabsContent value="settings" className="space-y-6 focus:outline-none">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2 border-none shadow-premium rounded-3xl p-8 bg-white space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={viewedForm?.isActive ? "bg-emerald-500" : "bg-slate-400"}>
                      {viewedForm?.isActive ? "Intake Active" : "Paused"}
                    </Badge>
                    <Badge className="bg-orange-500 text-white font-bold text-[9px] uppercase tracking-wider">
                      December 2026 Cycle
                    </Badge>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900">{viewedForm?.title}</h3>
                  <p className="text-sm text-slate-500 font-medium mt-1">
                    {viewedForm?.description || "Official candidate registration and admissions form for December 2026 fellowship intake."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">Public Applicant Entry Link</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 font-mono text-xs text-slate-700 truncate">
                      {viewedForm ? buildFormLink(viewedForm.token) : "—"}
                    </div>
                    {viewedForm && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => copyLink(viewedForm)}
                          className="rounded-2xl border-slate-200 font-bold text-xs h-10 px-4"
                        >
                          {copiedId === viewedForm.id ? <Check className="w-4 h-4 mr-1 text-emerald-600" /> : <Copy className="w-4 h-4 mr-1" />}
                          {copiedId === viewedForm.id ? "Copied" : "Copy Link"}
                        </Button>
                        <Button
                          variant="default"
                          onClick={() => setShareForm(viewedForm)}
                          className="rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-10 px-4 gap-1.5 shadow-sm"
                        >
                          <Share2 className="w-4 h-4" /> Share Link
                        </Button>
                      </>
                    )}
                    {viewedForm?.token && (
                      <Button
                        variant="ghost"
                        onClick={() => window.open(buildFormLink(viewedForm.token), "_blank")}
                        className="rounded-2xl font-bold text-xs h-10 px-3 hover:bg-slate-100"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Applicants</span>
                    <p className="text-xl font-black text-slate-900">{totalApplicants}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Application Deadline</span>
                    <p className="text-sm font-bold text-slate-700">
                      {viewedForm?.deadline ? new Date(viewedForm.deadline).toLocaleDateString("en-IN") : "Open Registration"}
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <Button
                    variant="outline"
                    className="rounded-2xl border-slate-200 font-bold text-xs"
                    onClick={() => {
                      if (viewedForm) {
                        setEditForm(viewedForm);
                        setEditCustomFields(viewedForm.customFields ?? []);
                        setEditSectionsConfig(viewedForm.sectionsConfig ?? []);
                      }
                    }}
                  >
                    <Settings2 className="w-4 h-4 mr-2 text-slate-500" /> Edit Form Config & Fields
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl border-orange-200 bg-orange-50/50 hover:bg-orange-100 text-orange-700 font-bold text-xs"
                    onClick={() => {
                      if (viewedForm) {
                        setEditForm(viewedForm);
                        setEditCustomFields(viewedForm.customFields ?? []);
                        setEditSectionsConfig(viewedForm.sectionsConfig ?? []);
                      }
                    }}
                  >
                    <CreditCard className="w-4 h-4 mr-2 text-orange-600" /> Razorpay & Gateway Config
                  </Button>
                </div>
              </Card>

              {/* QR Code Card */}
              <Card className="border-none shadow-premium rounded-3xl p-8 bg-white flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-3xl shadow-inner">
                  {viewedForm ? (
                    <QRCode value={buildFormLink(viewedForm.token)} size={160} />
                  ) : (
                    <div className="w-40 h-40 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-xs">No Form</div>
                  )}
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">Scan to Apply</h4>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">Mobile-friendly applicant entry portal</p>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Merge Applications Dialog */}
        <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-8 bg-white shadow-2xl border-none">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <GitMerge className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-black text-slate-900 tracking-tight">Merge 2 Applications</DialogTitle>
                  <p className="text-xs font-semibold text-slate-500">Combine duplicate or multi-specialty applications into a single master record.</p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6 my-2">
              {(() => {
                const subA = mergePair?.subA || (submissions && submissions[0]) || null;
                const subB = mergePair?.subB || (submissions && submissions.find(x => x.id !== subA?.id)) || (submissions && submissions[1]) || null;

                if (!subA || !subB) {
                  return (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
                      <p className="text-sm font-bold text-slate-700">No applicant submissions found to merge.</p>
                      <p className="text-xs text-slate-400 mt-1">This form requires at least 2 application submissions to perform a merge.</p>
                    </div>
                  );
                }

                const primId = mergePrimaryId || subA.id;
                const primarySub = primId === subB.id ? subB : subA;
                const secondarySub = primId === subB.id ? subA : subB;

                const specsA = parseActualSpecializations(subA);
                const specsB = parseActualSpecializations(subB);
                const combinedSpecs = Array.from(new Set([...specsA, ...specsB]));

                return (
                  <>
                    {/* Step 1: Application Selectors */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        Step 1: Choose Two Applications to Merge
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-600">Application 1</Label>
                          <Select
                            value={String(subA.id)}
                            onValueChange={(val) => {
                              const s = submissions.find(item => item.id === Number(val));
                              if (s) {
                                const other = (subB && subB.id !== s.id) ? subB : (submissions.find(x => x.id !== s.id) || s);
                                setMergePair({ subA: s, subB: other });
                                setMergePrimaryId(s.id);
                              }
                            }}
                          >
                            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white">
                              <SelectValue placeholder="Select Application 1..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-60 rounded-xl">
                              {submissions.map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  #APP-{s.id} — {s.fullName} ({s.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-slate-600">Application 2</Label>
                          <Select
                            value={String(subB.id)}
                            onValueChange={(val) => {
                              const s = submissions.find(item => item.id === Number(val));
                              if (s) {
                                const other = (subA && subA.id !== s.id) ? subA : (submissions.find(x => x.id !== s.id) || s);
                                setMergePair({ subA: other, subB: s });
                              }
                            }}
                          >
                            <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white">
                              <SelectValue placeholder="Select Application 2..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-60 rounded-xl">
                              {submissions.map((s) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  #APP-{s.id} — {s.fullName} ({s.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Step 2: Master Applicant Selection Cards */}
                    <div className="space-y-2">
                      <div className="text-xs font-black text-indigo-950 uppercase tracking-widest flex items-center gap-2">
                        <span>👑</span> Step 2: Click the card to designate as the MASTER (Primary) Application:
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Option A Card */}
                        <div 
                          onClick={() => {
                            setMergePrimaryId(subA.id);
                            setMergePair({ subA, subB });
                          }}
                          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                            primarySub.id === subA.id 
                              ? "border-indigo-600 bg-indigo-50/70 shadow-lg ring-4 ring-indigo-500/20 scale-[1.01]" 
                              : "border-slate-200 bg-white hover:border-slate-300 opacity-75 hover:opacity-100"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md">
                                  #APP-{subA.id}
                                </span>
                                {primarySub.id === subA.id && (
                                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                                    <span>★</span> MASTER
                                  </span>
                                )}
                              </div>
                              <h3 className="text-base font-black text-slate-900 mt-1">{subA.fullName}</h3>
                              <p className="text-xs text-slate-500">{subA.email}</p>
                            </div>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${primarySub.id === subA.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"}`}>
                              {primarySub.id === subA.id && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                          </div>
                          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                            <div>
                              <span className="text-slate-400 font-bold text-[10px] uppercase block">Specializations:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {specsA.map((s, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                                ))}
                              </div>
                            </div>
                            <div className="flex justify-between text-[11px] pt-1">
                              <span className="text-slate-500">Paid: ₹{subA.paidAmount || 0}</span>
                              <span className="text-slate-500 font-mono">{subA.paymentId ? `Pay ID: ${subA.paymentId}` : "Unpaid"}</span>
                            </div>
                          </div>
                        </div>

                        {/* Option B Card */}
                        <div 
                          onClick={() => {
                            setMergePrimaryId(subB.id);
                            setMergePair({ subA, subB });
                          }}
                          className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative ${
                            primarySub.id === subB.id 
                              ? "border-indigo-600 bg-indigo-50/70 shadow-lg ring-4 ring-indigo-500/20 scale-[1.01]" 
                              : "border-slate-200 bg-white hover:border-slate-300 opacity-75 hover:opacity-100"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-md">
                                  #APP-{subB.id}
                                </span>
                                {primarySub.id === subB.id && (
                                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                                    <span>★</span> MASTER
                                  </span>
                                )}
                              </div>
                              <h3 className="text-base font-black text-slate-900 mt-1">{subB.fullName}</h3>
                              <p className="text-xs text-slate-500">{subB.email}</p>
                            </div>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${primarySub.id === subB.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"}`}>
                              {primarySub.id === subB.id && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                          </div>
                          <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                            <div>
                              <span className="text-slate-400 font-bold text-[10px] uppercase block">Specializations:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {specsB.map((s, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                                ))}
                              </div>
                            </div>
                            <div className="flex justify-between text-[11px] pt-1">
                              <span className="text-slate-500">Paid: ₹{subB.paidAmount || 0}</span>
                              <span className="text-slate-500 font-mono">{subB.paymentId ? `Pay ID: ${subB.paymentId}` : "Unpaid"}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Consolidated Result Preview */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-black text-slate-700 uppercase tracking-wider">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        Step 3: Consolidated Master Record Preview
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-slate-400 font-bold text-[10px] uppercase">Retained Master Application:</span>
                          <p className="font-bold text-slate-900 mt-0.5">#APP-{primarySub.id} — {primarySub.fullName}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold text-[10px] uppercase">Unified Specializations:</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {combinedSpecs.map((s, i) => (
                              <Badge key={i} className="bg-indigo-600 text-white text-[10px]">{s}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed pt-2 border-t border-slate-200/80">
                        Documents, payment verification, LORs, and exam preferences from #APP-{secondarySub.id} will be merged into master record #APP-{primarySub.id}.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <Checkbox 
                        id="delSec" 
                        checked={mergeDeleteSecondary} 
                        onCheckedChange={(c) => setMergeDeleteSecondary(!!c)} 
                        className="rounded-md border-slate-300"
                      />
                      <Label htmlFor="delSec" className="text-xs text-slate-600 cursor-pointer">
                        Permanently delete secondary application (#APP-{secondarySub.id}) after merge so old submission is removed from list
                      </Label>
                    </div>
                  </>
                );
              })()}
            </div>

            <DialogFooter className="gap-3 pt-4 border-t border-slate-100">
              <Button variant="outline" className="rounded-xl font-bold" onClick={() => setMergeDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 shadow-lg shadow-indigo-600/20"
                disabled={mergeApplicationsMutation.isPending || !submissions || submissions.length < 2}
                onClick={() => {
                  const subA = mergePair?.subA || (submissions && submissions[0]);
                  const subB = mergePair?.subB || (submissions && submissions.find(x => x.id !== subA?.id)) || submissions?.[1];
                  if (subA && subB && subA.id !== subB.id) {
                    const primId = mergePrimaryId || subA.id;
                    const secId = subA.id === primId ? subB.id : subA.id;
                    mergeApplicationsMutation.mutate({
                      primaryId: primId,
                      secondaryId: secId,
                      deleteSecondary: mergeDeleteSecondary,
                    });
                  }
                }}
              >
                {mergeApplicationsMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Merging Records...
                  </>
                ) : (
                  <>
                    <GitMerge className="w-4 h-4 mr-2" />
                    Confirm & Merge Applications
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    );
  }

  // Forms list view
  return (
    <div className="p-10 space-y-10">
      <div className="flex items-center justify-between gap-6 flex-wrap">
        <div>
           <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-orange-500 text-white border-none rounded-full px-3 py-0.5 text-[10px] font-black uppercase tracking-widest">
                 System
              </Badge>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                 <Settings2 className="w-3 h-3" /> Configuration
              </span>
           </div>
           <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
              {activeProgram ? `${activeProgram.name} Application Forms` : "Application Forms"}
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-2">
              {activeProgram ? `Manage ${activeProgram.name} dynamic application forms, links, and submissions` : "Manage dynamic application entry points and program enrollment"}
            </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="rounded-2xl orange-gradient text-white border-none shadow-xl shadow-orange-500/20 px-8 py-6 font-bold hover:scale-[1.02] active:scale-[0.98] transition-all gap-2">
          <Plus className="h-5 w-5" /> NEW FORM
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading forms…</div>
      ) : filteredForms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Link2 className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg">No forms configured for this program</h3>
            <p className="text-muted-foreground text-sm mt-1 mb-4">Create an application form and share the link with applicants</p>
            <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Create First Form</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {filteredForms.map((form) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              key={form.id}
            >
              <Card className="border-none shadow-premium rounded-3xl overflow-hidden bg-white group hover:shadow-2xl transition-all duration-300">
                <CardContent className="p-0">
                  <div className="p-8">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={`${form.isActive ? "bg-emerald-500" : "bg-slate-400"} text-white border-none rounded-full px-3 py-0.5 text-[9px] font-black uppercase tracking-widest shadow-sm`}>
                            {form.isActive ? "Active" : "Paused"}
                          </Badge>
                          {form.pendingCount > 0 && (
                            <Badge className="bg-orange-500 text-white border-none rounded-full px-3 py-0.5 text-[9px] font-black uppercase tracking-widest shadow-sm">
                              {form.pendingCount} Pending
                            </Badge>
                          )}
                        </div>
                        <h3 className="text-xl font-black text-slate-900 tracking-tight group-hover:text-orange-600 transition-colors">{form.title}</h3>
                        {form.description && (
                          <p className="text-sm text-slate-500 font-medium line-clamp-1 mt-1">{form.description}</p>
                        )}
                        
                        <div className="flex items-center gap-5 mt-5 flex-wrap">
                           <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center border border-blue-100">
                                 <Users className="w-4 h-4" />
                              </div>
                              <div>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Submissions</p>
                                 <p className="text-sm font-bold text-slate-700">{form.submissionCount}</p>
                              </div>
                           </div>
                           {form.deadline && (
                              <div className="flex items-center gap-2">
                                 <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center border border-orange-100">
                                    <Clock className="w-4 h-4" />
                                 </div>
                                 <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Deadline</p>
                                    <p className="text-sm font-bold text-slate-700">{new Date(form.deadline).toLocaleDateString("en-IN")}</p>
                                 </div>
                              </div>
                           )}
                           <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center border border-slate-100">
                                 <Building2 className="w-4 h-4" />
                              </div>
                              <div>
                                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Program</p>
                                 <p className="text-sm font-bold text-slate-700 truncate max-w-[120px]">{form.programName ?? `#${form.programId}`}</p>
                              </div>
                           </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 shrink-0">
                         <Button variant="ghost" size="icon" className="rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all" onClick={() => setDeleteConfirmId(form.id)}>
                            <Trash2 className="w-4 h-4" />
                         </Button>
                         <Switch checked={form.isActive} onCheckedChange={(v) => toggleActive.mutate({ id: form.id, isActive: v })} className="data-[state=checked]:bg-emerald-500" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50/80 px-8 py-5 border-t border-slate-100 flex items-center justify-between gap-4">
                     <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2 truncate">
                           <Link2 className="w-3 h-3 text-slate-400 shrink-0" />
                           <code className="text-[10px] font-bold text-slate-600 truncate">{buildFormLink(form.token)}</code>
                        </div>
                        <Button variant="ghost" size="sm" className="rounded-xl h-8 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200" onClick={() => copyLink(form)}>
                           {copiedId === form.id ? <Check className="w-3 h-3 mr-1.5 text-emerald-600" /> : <Copy className="w-3 h-3 mr-1.5" />}
                           {copiedId === form.id ? "Copied" : "Copy"}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="rounded-xl h-8 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-wider px-3 shadow-xs flex items-center gap-1.5 shrink-0"
                          onClick={() => setShareForm(form)}
                        >
                          <Share2 className="w-3 h-3" />
                          Share Link
                        </Button>
                     </div>
                     <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="rounded-xl h-9 border-slate-200 font-bold px-4" onClick={() => {
                          setEditForm(form);
                          setEditCustomFields(form.customFields ?? []);
                          setEditSectionsConfig(form.sectionsConfig ?? []);
                        }}>
                           <Settings2 className="w-4 h-4 mr-2 text-slate-500" /> Config
                        </Button>
                        <Button size="sm" className="rounded-xl h-9 bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 shadow-lg shadow-slate-200" onClick={() => setViewFormId(form.id)}>
                           Submissions <ChevronRight className="w-3.5 h-3.5 ml-1.5" />
                        </Button>
                     </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setCreateCustomFields([]); setCreateFormData({ programId: "", title: "", description: "", deadline: "", loadDefaults: true, customToken: "" }); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Application Form</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Program</Label>
                <Select value={createFormData.programId} onValueChange={(v) => setCreateFormData((f) => ({ ...f, programId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select program" /></SelectTrigger>
                  <SelectContent>
                    {programs.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Application Deadline (optional)</Label>
                <Input type="datetime-local" value={createFormData.deadline}
                  onChange={(e) => setCreateFormData((f) => ({ ...f, deadline: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Form Title</Label>
              <Input placeholder="e.g., Fellowship Application Jan 2026"
                value={createFormData.title} onChange={(e) => setCreateFormData((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea placeholder="Instructions or notes for candidates…"
                value={createFormData.description} onChange={(e) => setCreateFormData((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Custom Link Code (optional)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap bg-muted px-3 py-2 rounded-md border">{window.location.origin}/apply/</span>
                <Input placeholder="e.g., JAN2027"
                  value={createFormData.customToken} onChange={(e) => setCreateFormData((f) => ({ ...f, customToken: e.target.value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase() }))} />
              </div>
              <p className="text-xs text-muted-foreground">Leave blank to auto-generate a random link.</p>
            </div>

            <Separator />

            <div className="space-y-2 bg-blue-50/50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-blue-800 dark:text-blue-300">Standard Fellowship Template</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-blue-600 font-bold uppercase">Include?</span>
                  <Switch
                    checked={createFormData.loadDefaults}
                    onCheckedChange={(v) => setCreateFormData(f => ({ ...f, loadDefaults: v }))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">This template includes core sections like Specialization, Units, Medical History, etc. You can fully edit them later.</p>
              {createFormData.loadDefaults && (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground list-disc pl-4">
                  <li>Personal Details & Contact</li>
                  <li>Specialization & Unit Preferences</li>
                  <li>Medical & Surgical History</li>
                  <li>Educational Qualifications</li>
                  <li>Document Uploads</li>
                </ul>
              )}
            </div>

            <Separator />

            {/* Custom Fields Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-2"><Settings2 className="h-4 w-4" /> Custom Fields</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Add extra questions that appear in the "References" step of the form</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => addCustomField(createCustomFields, setCreateCustomFields)}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Field
                </Button>
              </div>

              {createCustomFields.length === 0 ? (
                <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                  No custom fields added yet. Click "Add Field" to add dropdown, text, or other input types.
                </div>
              ) : (
                <div className="space-y-2">
                  {createCustomFields.map((cf, idx) => (
                    <CustomFieldEditor
                      key={cf.id}
                      field={cf}
                      isFirst={idx === 0}
                      isLast={idx === createCustomFields.length - 1}
                      onMoveUp={() => {
                        const newFields = [...createCustomFields];
                        [newFields[idx - 1], newFields[idx]] = [newFields[idx], newFields[idx - 1]];
                        setCreateCustomFields(newFields);
                      }}
                      onMoveDown={() => {
                        const newFields = [...createCustomFields];
                        [newFields[idx + 1], newFields[idx]] = [newFields[idx], newFields[idx + 1]];
                        setCreateCustomFields(newFields);
                      }}
                      onChange={(updated) => updateCustomField(createCustomFields, setCreateCustomFields, cf.id, updated)}
                      onDelete={() => deleteCustomField(createCustomFields, setCreateCustomFields, cf.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!createFormData.programId || !createFormData.title || createMutation.isPending}
              onClick={() => createMutation.mutate({
                programId: Number(createFormData.programId), title: createFormData.title,
                description: createFormData.description || undefined, deadline: createFormData.deadline || undefined,
                customFields: createCustomFields,
                loadDefaults: createFormData.loadDefaults,
                customToken: createFormData.customToken || undefined,
              })}>
              {createMutation.isPending ? "Creating…" : "Create & Get Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit / Configure Dialog */}
      <Dialog open={editForm !== null} onOpenChange={(o) => { if (!o) { setEditForm(null); setEditCustomFields([]); setGoogleSheetsConfig({ spreadsheetId: "", sheetName: "Form Responses 1", serviceAccountJson: "" }); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Configure Form — {editForm?.title}</DialogTitle></DialogHeader>
          {editForm && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Form Title</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm((f) => f ? { ...f, title: e.target.value } : f)} />
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Textarea rows={2} value={editForm.description ?? ""} onChange={(e) => setEditForm((f) => f ? { ...f, description: e.target.value } : f)} />
              </div>
              <div className="space-y-1.5">
                <Label>Application Deadline (optional)</Label>
                <Input
                  type="datetime-local"
                  value={editForm.deadline ? new Date(editForm.deadline).toISOString().slice(0, 16) : ""}
                  onChange={(e) => setEditForm((f) => f ? { ...f, deadline: e.target.value || null } : f)}
                />
              </div>

              <Separator />

              {/* Razorpay Gateway & Application Payment Configuration */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-orange-600" />
                      Razorpay Payment Gateway & Fee Settings
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Configure live/test Razorpay API keys, application fees, and gateway status directly for this form
                    </p>
                  </div>
                  <Badge variant={editPaymentConfig.isActive ? "default" : "secondary"} className={editPaymentConfig.isActive ? (editPaymentConfig.mode === "live" ? "bg-emerald-600 text-white font-bold" : "bg-blue-600 text-white font-bold") : "bg-slate-200 text-slate-700 font-bold"}>
                    {editPaymentConfig.isActive ? (editPaymentConfig.mode === "live" ? "Live Gateway Active" : "Test Mode Active") : "Payment Disabled"}
                  </Badge>
                </div>

                <div className="space-y-3 rounded-2xl border border-orange-200/80 p-4 bg-orange-50/40 dark:bg-slate-900/40 shadow-sm">
                  <div className="flex items-center justify-between pb-3 border-b border-orange-200/60 dark:border-slate-800">
                    <div>
                      <Label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        Enable Online Application Fee Collection
                      </Label>
                      <p className="text-[11px] text-muted-foreground">When enabled, candidates must pay before submitting or provide UTR proof</p>
                    </div>
                    <Switch
                      checked={editPaymentConfig.isActive}
                      onCheckedChange={(checked) => setEditPaymentConfig((c) => ({ ...c, isActive: checked }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Gateway Mode</Label>
                      <Select
                        value={editPaymentConfig.mode}
                        onValueChange={(val) => setEditPaymentConfig((c) => ({ ...c, mode: val }))}
                      >
                        <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-800 font-semibold border-slate-300">
                          <SelectValue placeholder="Mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="live" className="text-emerald-700 font-bold">🟢 Live (Production Checkout)</SelectItem>
                          <SelectItem value="test" className="text-blue-700 font-bold">🔵 Test (Sandbox / Simulation)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1">
                        <IndianRupee className="h-3.5 w-3.5 text-slate-500" /> Fee per Specialization (₹ INR)
                      </Label>
                      <Input
                        type="number"
                        value={editPaymentConfig.amountRs}
                        onChange={(e) => setEditPaymentConfig((c) => ({ ...c, amountRs: Number(e.target.value) }))}
                        className="h-9 text-xs bg-white dark:bg-slate-800 font-bold border-slate-300"
                        placeholder="2750"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Razorpay Key ID</Label>
                    <Input
                      placeholder="rzp_live_... or rzp_test_..."
                      value={editPaymentConfig.razorpayKeyId}
                      onChange={(e) => setEditPaymentConfig((c) => ({ ...c, razorpayKeyId: e.target.value }))}
                      className="h-9 text-xs font-mono bg-white dark:bg-slate-800 border-slate-300"
                    />
                    <p className="text-[10px] text-muted-foreground">Find this in Razorpay Dashboard → Settings → API Keys</p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Razorpay Key Secret</Label>
                      <button
                        type="button"
                        onClick={() => setShowPaymentSecret(!showPaymentSecret)}
                        className="text-[11px] text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        {showPaymentSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {showPaymentSecret ? "Hide Secret" : "Reveal Secret"}
                      </button>
                    </div>
                    <Input
                      type={showPaymentSecret ? "text" : "password"}
                      placeholder="Paste Razorpay Secret Key here"
                      value={editPaymentConfig.razorpayKeySecret}
                      onChange={(e) => setEditPaymentConfig((c) => ({ ...c, razorpayKeySecret: e.target.value }))}
                      className="h-9 text-xs font-mono bg-white dark:bg-slate-800 border-slate-300"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Institutional UPI ID (for QR Code & UTR payment fallback)</Label>
                    <Input
                      placeholder="e.g. sankaraeye@hdfcbank"
                      value={editPaymentConfig.upiId}
                      onChange={(e) => setEditPaymentConfig((c) => ({ ...c, upiId: e.target.value }))}
                      className="h-9 text-xs font-mono bg-white dark:bg-slate-800 border-slate-300"
                    />
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-orange-200/50 dark:border-slate-800">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3 text-orange-500" /> Saved directly to institutional database; active immediately for all applicants.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingPaymentConfig}
                      onClick={() => saveFormPaymentConfig(editForm.id)}
                      className="h-8 gap-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-sm self-end sm:self-auto shrink-0"
                    >
                      {savingPaymentConfig ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Save Payment Settings
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Google Sheets Integration */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Google Sheets Integration</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Auto-import responses from a Google Sheet into this application form</p>
                </div>
                <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Spreadsheet ID</Label>
                    <Input
                      placeholder="e.g., 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                      value={googleSheetsConfig.spreadsheetId}
                      onChange={(e) => setGoogleSheetsConfig((c) => ({ ...c, spreadsheetId: e.target.value }))}
                      className="text-xs font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Find this in the Google Sheet URL after /d/</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Sheet Name</Label>
                    <Input
                      placeholder="e.g., Form Responses 1"
                      value={googleSheetsConfig.sheetName}
                      onChange={(e) => setGoogleSheetsConfig((c) => ({ ...c, sheetName: e.target.value }))}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Service Account JSON {editFormGsData?.hasServiceAccount && <span className="text-muted-foreground font-normal">(leave blank to keep existing)</span>}</Label>
                    <Textarea
                      placeholder={editFormGsData?.hasServiceAccount ? '(saved) — paste new JSON to replace' : '{"type":"service_account","project_id":"..."}'}
                      rows={4}
                      value={googleSheetsConfig.serviceAccountJson}
                      onChange={(e) => setGoogleSheetsConfig((c) => ({ ...c, serviceAccountJson: e.target.value }))}
                      className="text-xs font-mono"
                    />
                  </div>
                  <Button size="sm" className="gap-1.5" onClick={() => saveGoogleSheetsConfig(editForm.id)} disabled={savingGsConfig || !googleSheetsConfig.spreadsheetId}>
                    {savingGsConfig ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Save Integration
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2"><FileCheck className="h-4 w-4" /> Form Sections (Standard)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Enable/disable or rename built-in form sections and fields</p>
                  </div>
                  {editSectionsConfig.length === 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={async () => {
                        try {
                          const res = await api.get<any[]>("/application-forms/default-sections");
                          setEditSectionsConfig(res);
                          toast({ title: "Template loaded" });
                        } catch (e) {
                          toast({ title: "Failed to load template", variant: "destructive" });
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Load Standard Template
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  {editSectionsConfig.map((section, sIdx) => (
                    <div key={section.id} className="border rounded-xl p-4 bg-muted/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 mr-4">
                          <Input
                            value={section.title}
                            onChange={(e) => {
                              const newCfg = [...editSectionsConfig];
                              newCfg[sIdx].title = e.target.value;
                              setEditSectionsConfig(newCfg);
                            }}
                            className="h-8 font-bold text-sm bg-transparent border-none focus-visible:ring-0 px-0"
                          />
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Section ID: {section.id}</p>
                        </div>
                        <Switch
                          checked={section.enabled}
                          onCheckedChange={(v) => {
                            const newCfg = [...editSectionsConfig];
                            newCfg[sIdx].enabled = v;
                            setEditSectionsConfig(newCfg);
                          }}
                        />
                      </div>

                      {section.enabled && (
                        <div className="space-y-3 mt-2">
                          <RichTextArea
                            label="Section Description"
                            placeholder="Add instructions or details for this section..."
                            value={section.description || ""}
                            onChange={(v) => {
                              const newCfg = [...editSectionsConfig];
                              newCfg[sIdx].description = v;
                              setEditSectionsConfig(newCfg);
                            }}
                          />
                        </div>
                      )}

                      {section.enabled && section.fields && (
                        <div className="pl-4 border-l-2 border-muted space-y-3 mt-2">
                          {section.fields.map((field: any, fIdx: number) => (
                            <div key={field.id} className="flex items-start gap-3 bg-white dark:bg-slate-900 p-2 rounded-lg border shadow-sm group relative">
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Field Label</Label>
                                    <Select
                                      value={field.type}
                                      onValueChange={(v) => {
                                        const newCfg = [...editSectionsConfig];
                                        newCfg[sIdx].fields[fIdx].type = v;
                                        if (["select", "radio", "checkbox_group"].includes(v) && !newCfg[sIdx].fields[fIdx].options) {
                                          newCfg[sIdx].fields[fIdx].options = ["Option 1"];
                                        }
                                        setEditSectionsConfig(newCfg);
                                      }}
                                    >
                                      <SelectTrigger className="h-6 text-[10px] py-0 w-36"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="text">Short Text</SelectItem>
                                        <SelectItem value="textarea">Paragraph</SelectItem>
                                        <SelectItem value="phone">Mobile Number</SelectItem>
                                        <SelectItem value="email">Email Address</SelectItem>
                                        <SelectItem value="date">Date Picker</SelectItem>
                                        <SelectItem value="select">Dropdown / Select</SelectItem>
                                        <SelectItem value="radio">Radio Button</SelectItem>
                                        <SelectItem value="checkbox_group">Checkbox Group</SelectItem>
                                        <SelectItem value="checkbox">Single Checkbox (Yes/No)</SelectItem>
                                        <SelectItem value="file">File Upload</SelectItem>
                                        <SelectItem value="info">Information block</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity"
                                    onClick={() => {
                                      const newCfg = [...editSectionsConfig];
                                      newCfg[sIdx].fields.splice(fIdx, 1);
                                      setEditSectionsConfig(newCfg);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                                <Input
                                  value={field.label}
                                  onChange={(e) => {
                                    const newCfg = [...editSectionsConfig];
                                    newCfg[sIdx].fields[fIdx].label = e.target.value;
                                    setEditSectionsConfig(newCfg);
                                  }}
                                  className="h-7 text-xs"
                                />
                                {field.type === 'info' && (
                                  <div className="mt-2">
                                    <RichTextArea
                                      label="Instruction Content"
                                      value={field.defaultValue || ""}
                                      onChange={(v) => {
                                        const newCfg = [...editSectionsConfig];
                                        newCfg[sIdx].fields[fIdx].defaultValue = v;
                                        setEditSectionsConfig(newCfg);
                                      }}
                                    />
                                  </div>
                                )}
                                {field.options && ["select", "radio", "checkbox_group"].includes(field.type) && (
                                  <div className="mt-2 space-y-1.5 p-2 bg-muted/20 border rounded text-xs">
                                    <Label className="text-[10px] font-bold text-muted-foreground uppercase">Options</Label>
                                    {(field.options || []).map((opt: string, oIdx: number) => (
                                      <div key={oIdx} className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded-full border border-muted-foreground/30 flex items-center justify-center shrink-0">
                                          {field.type === 'checkbox_group' ? <Check className="h-2.5 w-2.5 text-muted-foreground/30" /> : <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />}
                                        </div>
                                        <Input
                                          value={opt}
                                          onChange={(e) => {
                                            const newCfg = [...editSectionsConfig];
                                            newCfg[sIdx].fields[fIdx].options[oIdx] = e.target.value;
                                            setEditSectionsConfig(newCfg);
                                          }}
                                          className="h-7 text-xs flex-1"
                                          placeholder={`Option ${oIdx + 1}`}
                                        />
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600 shrink-0"
                                          onClick={() => {
                                            const newCfg = [...editSectionsConfig];
                                            newCfg[sIdx].fields[fIdx].options.splice(oIdx, 1);
                                            setEditSectionsConfig(newCfg);
                                          }}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ))}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-[10px] gap-1 px-2 mt-1 hover:bg-muted"
                                      onClick={() => {
                                        const newCfg = [...editSectionsConfig];
                                        if (!newCfg[sIdx].fields[fIdx].options) newCfg[sIdx].fields[fIdx].options = [];
                                        newCfg[sIdx].fields[fIdx].options.push(`Option ${(newCfg[sIdx].fields[fIdx].options.length || 0) + 1}`);
                                        setEditSectionsConfig(newCfg);
                                      }}
                                    >
                                      <Plus className="h-3 w-3" /> Add Option
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-8 border-dashed border-2 text-[10px] uppercase tracking-wider font-bold gap-2"
                            onClick={() => {
                              const newCfg = [...editSectionsConfig];
                              newCfg[sIdx].fields.push({
                                id: `field_${Date.now()}`,
                                type: "text",
                                label: "New Field",
                                required: false
                              });
                              setEditSectionsConfig(newCfg);
                            }}
                          >
                            <Plus className="h-3 w-3" /> Add Field to Section
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Custom Fields Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-2"><Settings2 className="h-4 w-4" /> Custom Fields</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Add dropdown, text, checkbox, or multiple-choice questions for candidates</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={() => addCustomField(editCustomFields, setEditCustomFields)}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Field
                  </Button>
                </div>

                {editCustomFields.length === 0 ? (
                  <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                    No custom fields. Click "Add Field" to add dropdown, text, or multiple-choice inputs.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editCustomFields.map((cf, idx) => (
                      <CustomFieldEditor
                        key={cf.id}
                        field={cf}
                        isFirst={idx === 0}
                        isLast={idx === editCustomFields.length - 1}
                        onMoveUp={() => {
                          const newFields = [...editCustomFields];
                          [newFields[idx - 1], newFields[idx]] = [newFields[idx], newFields[idx - 1]];
                          setEditCustomFields(newFields);
                        }}
                        onMoveDown={() => {
                          const newFields = [...editCustomFields];
                          [newFields[idx + 1], newFields[idx]] = [newFields[idx], newFields[idx + 1]];
                          setEditCustomFields(newFields);
                        }}
                        onChange={(updated) => updateCustomField(editCustomFields, setEditCustomFields, cf.id, updated)}
                        onDelete={() => deleteCustomField(editCustomFields, setEditCustomFields, cf.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditForm(null); setEditCustomFields([]); setGoogleSheetsConfig({ spreadsheetId: "", sheetName: "Form Responses 1", serviceAccountJson: "" }); }}>Cancel</Button>
            <Button
              disabled={updateFormMutation.isPending || !editForm?.title}
              onClick={() => editForm && updateFormMutation.mutate({
                id: editForm.id,
                title: editForm.title,
                description: editForm.description ?? undefined,
                deadline: editForm.deadline ?? undefined,
                customFields: editCustomFields,
                sectionsConfig: editSectionsConfig,
              })}
            >
              {updateFormMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Form Created Success Dialog */}
      <Dialog open={createdForm !== null} onOpenChange={(o) => { if (!o) { setCreatedForm(null); setCreatedFormGsOpen(false); setCreatedFormGsConfig({ spreadsheetId: "", sheetName: "Form Responses 1", serviceAccountJson: "" }); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Check className="h-5 w-5" /> Form Created Successfully
            </DialogTitle>
          </DialogHeader>
          {createdForm && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your application form <strong className="text-foreground">"{createdForm.title}"</strong> is ready. Share the link below with candidates.
              </p>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Application Form Link</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted rounded-md px-3 py-2 break-all">
                    {buildFormLink(createdForm.token)}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    onClick={async () => {
                      const success = await safeCopyToClipboard(buildFormLink(createdForm.token));
                      if (success) toast({ title: "Link copied to clipboard" });
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => window.open(buildFormLink(createdForm.token), "_blank")}>
                  <ExternalLink className="h-3.5 w-3.5" /> Preview Form
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => { setViewFormId(createdForm.id); setCreatedForm(null); }}>
                  <Eye className="h-3.5 w-3.5" /> View Submissions
                </Button>
              </div>

              {/* Google Sheets Integration Section */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium bg-muted/50 hover:bg-muted transition-colors"
                  onClick={() => setCreatedFormGsOpen((v) => !v)}
                >
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    Connect Google Sheets (optional)
                  </span>
                  {createdFormGsOpen
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {createdFormGsOpen && (
                  <div className="p-4 space-y-3 border-t">
                    <p className="text-xs text-muted-foreground">Link a Google Sheet to automatically sync responses as submissions.</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Spreadsheet ID</Label>
                      <Input
                        placeholder="e.g. 1BxiMVs0XRA5..."
                        className="h-8 text-xs font-mono"
                        value={createdFormGsConfig.spreadsheetId}
                        onChange={(e) => setCreatedFormGsConfig((c) => ({ ...c, spreadsheetId: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Sheet Name</Label>
                      <Input
                        placeholder="Form Responses 1"
                        className="h-8 text-xs"
                        value={createdFormGsConfig.sheetName}
                        onChange={(e) => setCreatedFormGsConfig((c) => ({ ...c, sheetName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Service Account JSON</Label>
                      <Textarea
                        placeholder='{"type":"service_account",...}'
                        className="text-xs font-mono h-24 resize-none"
                        value={createdFormGsConfig.serviceAccountJson}
                        onChange={(e) => setCreatedFormGsConfig((c) => ({ ...c, serviceAccountJson: e.target.value }))}
                      />
                    </div>
                    <Button
                      size="sm"
                      className="gap-1.5 w-full"
                      disabled={savingCreatedGs || !createdFormGsConfig.spreadsheetId}
                      onClick={async () => {
                        setSavingCreatedGs(true);
                        try {
                          await api.put(`/application-forms/${createdForm.id}/google-sheets-config`, createdFormGsConfig);
                          toast({ title: "Google Sheets integration saved" });
                          setCreatedFormGsOpen(false);
                        } catch (e) {
                          toast({ title: "Failed to save", description: (e as Error).message, variant: "destructive" });
                        } finally { setSavingCreatedGs(false); }
                      }}
                    >
                      {savingCreatedGs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Save Integration
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setCreatedForm(null); setCreatedFormGsOpen(false); }}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Form?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the form and all its submissions. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteForm.isPending}
              onClick={() => deleteConfirmId !== null && deleteForm.mutate(deleteConfirmId)}>
              {deleteForm.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareApplicationDialog
        open={!!shareForm}
        onOpenChange={(open) => {
          if (!open) setShareForm(null);
        }}
        token={shareForm?.token || "JAN2027"}
        title={shareForm?.title || "Fellowship Program - January 2027"}
        subtitle="Entrance Examination: December 2026 • Sankara Academy of Vision"
      />

      {/* Reconcile / Recover Paid Application Dialog */}
      <Dialog open={reconcileModalOpen} onOpenChange={setReconcileModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 border-slate-200 shadow-2xl">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-2">
              <CreditCard className="w-5 h-5" />
            </div>
            <DialogTitle className="text-xl font-black text-slate-900">
              Recover Paid Application
            </DialogTitle>
            <p className="text-xs text-slate-500 leading-relaxed">
              If an applicant's bank account was debited or payment was captured on Razorpay, but the application was not posted, enter their Payment ID below to immediately link and create their submission.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">
                Razorpay Payment ID <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="e.g. pay_TqwyGtNqnIluit"
                value={reconcileData.paymentId}
                onChange={(e) => setReconcileData(d => ({ ...d, paymentId: e.target.value.trim() }))}
                className="font-mono font-bold text-xs bg-slate-50 border-slate-300"
              />
              <p className="text-[10px] text-slate-400">
                Visible on candidate's screen or in Razorpay Dashboard → Transactions
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Candidate Name</Label>
                <Input
                  placeholder="Applicant Name"
                  value={reconcileData.fullName}
                  onChange={(e) => setReconcileData(d => ({ ...d, fullName: e.target.value }))}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Specialization</Label>
                <Select
                  value={reconcileData.specialization}
                  onValueChange={(val) => setReconcileData(d => ({ ...d, specialization: val }))}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue placeholder="Specialization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IOL">IOL Fellowship</SelectItem>
                    <SelectItem value="Vitreo Retina">Vitreo Retina</SelectItem>
                    <SelectItem value="Medical Retina">Medical Retina</SelectItem>
                    <SelectItem value="Cornea">Cornea</SelectItem>
                    <SelectItem value="Glaucoma">Glaucoma</SelectItem>
                    <SelectItem value="Pediatric Ophthalmology">Pediatric Ophthalmology</SelectItem>
                    <SelectItem value="Phaco Refractive">Phaco Refractive</SelectItem>
                    <SelectItem value="Oculoplasty">Oculoplasty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Email Address</Label>
                <Input
                  type="email"
                  placeholder="applicant@email.com"
                  value={reconcileData.email}
                  onChange={(e) => setReconcileData(d => ({ ...d, email: e.target.value }))}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Mobile Number</Label>
                <Input
                  type="tel"
                  placeholder="10-digit mobile"
                  value={reconcileData.phone}
                  onChange={(e) => setReconcileData(d => ({ ...d, phone: e.target.value }))}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Admin Recovery Notes</Label>
              <Input
                placeholder="e.g. Candidate paid Rs 2,750, verified on Razorpay dashboard"
                value={reconcileData.notes}
                onChange={(e) => setReconcileData(d => ({ ...d, notes: e.target.value }))}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReconcileModalOpen(false)}
              className="rounded-xl border-slate-300 text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={reconciling || !reconcileData.paymentId.trim()}
              onClick={handleReconcilePayment}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 gap-1.5 shadow-md shadow-emerald-500/20"
            >
              {reconciling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {reconciling ? "Recovering..." : "Recover & Link Submission"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

