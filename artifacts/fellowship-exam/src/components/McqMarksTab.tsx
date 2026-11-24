import React, { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Sparkles, Search, Check, Save, RotateCcw, Download,
  AlertCircle, CheckCircle2, Filter, Users, FileSpreadsheet,
  ArrowUpDown, Hash, HelpCircle, Loader2
} from "lucide-react";

interface Candidate {
  id: number;
  candidateCode: string;
  fullName: string;
  email?: string;
  phone?: string;
  status: string;
  mcqScore?: number | string | null;
  psychometricScore?: number | string | null;
  specializations?: string[];
  applications?: any[];
  preferences?: any[];
}

interface McqMarksTabProps {
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
  qc: ReturnType<typeof useQueryClient>;
  candidates: Candidate[];
  specialities: { id: number; name: string; code: string }[];
}

export function McqMarksTab({ toast, qc, candidates, specialities }: McqMarksTabProps) {
  // Local state for entered marks: candidateId -> string value
  const [marks, setMarks] = useState<Record<number, string>>({});
  // Set of dirty candidate IDs that have unsaved changes
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  // Set of candidate IDs saved in the current session
  const [justSaved, setJustSaved] = useState<Set<number>>(new Set());

  // Search & Filters
  const [search, setSearch] = useState("");
  const [selectedSpec, setSelectedSpec] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "missing" | "entered">("all");
  const [sortBy, setSortBy] = useState<"code" | "name" | "score">("code");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Input refs for keyboard navigation (Tab/Enter moves to next row)
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Initialize local marks from candidates list whenever candidates change
  useEffect(() => {
    setMarks((prev) => {
      const next = { ...prev };
      for (const c of candidates) {
        // Only update if not currently modified/dirty in the editor
        if (!dirty.has(c.id)) {
          next[c.id] = c.mcqScore !== null && c.mcqScore !== undefined && c.mcqScore !== ""
            ? String(c.mcqScore)
            : "";
        }
      }
      return next;
    });
  }, [candidates, dirty]);

  // Batch save mutation
  const batchSaveMutation = useMutation({
    mutationFn: async (updates: Array<{ candidateId: number; mcqScore: number | null }>) => {
      return api.post<{ success: boolean; updatedCount: number }>("/candidates/batch-mcq-marks", { updates });
    },
    onSuccess: (data, variables) => {
      const savedIds = new Set(variables.map((v) => v.candidateId));
      setDirty((prev) => {
        const next = new Set(prev);
        savedIds.forEach((id) => next.delete(id));
        return next;
      });
      setJustSaved((prev) => {
        const next = new Set(prev);
        savedIds.forEach((id) => next.add(id));
        return next;
      });

      toast({
        title: "MCQ Marks Saved",
        description: `Successfully updated written MCQ marks for ${data.updatedCount ?? variables.length} candidate(s).`,
      });

      // Invalidate relevant queries so rankings and marksheet update immediately
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["interview-scores"] });
      qc.invalidateQueries({ queryKey: ["rankings"] });
      qc.invalidateQueries({ queryKey: ["doctor-stats"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to Save Marks",
        description: err.message || "An unexpected error occurred while saving marks.",
        variant: "destructive",
      });
    },
  });

  // Handle single candidate mark change
  const handleMarkChange = (candidateId: number, val: string) => {
    setMarks((prev) => ({ ...prev, [candidateId]: val }));
    setDirty((prev) => new Set(prev).add(candidateId));
    setJustSaved((prev) => {
      const next = new Set(prev);
      next.delete(candidateId);
      return next;
    });
  };

  // Save single candidate mark
  const handleSaveSingle = (candidateId: number) => {
    const rawVal = marks[candidateId]?.trim() ?? "";
    let scoreNum: number | null = null;
    if (rawVal !== "") {
      const parsed = parseFloat(rawVal);
      if (isNaN(parsed) || parsed < 0 || parsed > 50) {
        toast({
          title: "Invalid Score",
          description: "MCQ score must be a number between 0 and 50 marks.",
          variant: "destructive",
        });
        return;
      }
      scoreNum = Math.round(parsed * 10) / 10;
    }

    batchSaveMutation.mutate([{ candidateId, mcqScore: scoreNum }]);
  };

  // Save all dirty marks
  const handleSaveAll = () => {
    if (dirty.size === 0) return;

    const updates: Array<{ candidateId: number; mcqScore: number | null }> = [];
    for (const cid of Array.from(dirty)) {
      const rawVal = marks[cid]?.trim() ?? "";
      if (rawVal === "") {
        updates.push({ candidateId: cid, mcqScore: null });
      } else {
        const parsed = parseFloat(rawVal);
        if (isNaN(parsed) || parsed < 0 || parsed > 50) {
          const cand = candidates.find((c) => c.id === cid);
          toast({
            title: "Invalid Score Detected",
            description: `Score for ${cand?.fullName || `Candidate #${cid}`} must be between 0 and 50.`,
            variant: "destructive",
          });
          return;
        }
        updates.push({ candidateId: cid, mcqScore: Math.round(parsed * 10) / 10 });
      }
    }

    if (updates.length > 0) {
      batchSaveMutation.mutate(updates);
    }
  };

  // Helper to extract candidate specialties
  const getCandidateSpecs = (c: Candidate): string[] => {
    const set = new Set<string>();
    if (c.specializations && Array.isArray(c.specializations)) {
      c.specializations.forEach((s) => s && set.add(s));
    }
    if (c.applications && Array.isArray(c.applications)) {
      c.applications.forEach((a: any) => a.specialityName && set.add(a.specialityName));
    }
    if (c.preferences && Array.isArray(c.preferences)) {
      c.preferences.forEach((p: any) => p.specialityName && set.add(p.specialityName));
    }
    return Array.from(set);
  };

  // Filtered and sorted candidate list
  const filteredList = useMemo(() => {
    return candidates
      .filter((c) => {
        // Status filter: ignore rejected candidates
        if (c.status === "rejected") return false;

        // Search text
        if (search) {
          const q = search.toLowerCase();
          const matchName = c.fullName?.toLowerCase().includes(q);
          const matchCode = c.candidateCode?.toLowerCase().includes(q);
          const matchEmail = c.email?.toLowerCase().includes(q);
          if (!matchName && !matchCode && !matchEmail) return false;
        }

        // Speciality filter
        if (selectedSpec !== "all") {
          const cSpecs = getCandidateSpecs(c).map((s) => s.toLowerCase());
          const target = selectedSpec.toLowerCase();
          if (!cSpecs.some((s) => s === target || s.includes(target) || target.includes(s))) {
            return false;
          }
        }

        // Status filter
        const currentMark = marks[c.id];
        const hasScore = currentMark !== undefined && currentMark !== null && currentMark.trim() !== "";
        if (statusFilter === "missing" && hasScore) return false;
        if (statusFilter === "entered" && !hasScore) return false;

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortBy === "code") {
          cmp = (a.candidateCode || "").localeCompare(b.candidateCode || "");
        } else if (sortBy === "name") {
          cmp = (a.fullName || "").localeCompare(b.fullName || "");
        } else if (sortBy === "score") {
          const sA = parseFloat(marks[a.id] || "-1");
          const sB = parseFloat(marks[b.id] || "-1");
          cmp = sA - sB;
        }
        return sortOrder === "asc" ? cmp : -cmp;
      });
  }, [candidates, search, selectedSpec, statusFilter, sortBy, sortOrder, marks]);

  // KPI Calculations
  const stats = useMemo(() => {
    const activeCandidates = candidates.filter((c) => c.status !== "rejected");
    const total = activeCandidates.length;
    let enteredCount = 0;
    let sumScore = 0;
    let highest = 0;

    activeCandidates.forEach((c) => {
      const val = marks[c.id];
      if (val !== undefined && val !== null && val.trim() !== "") {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          enteredCount++;
          sumScore += num;
          if (num > highest) highest = num;
        }
      }
    });

    const pending = total - enteredCount;
    const avg = enteredCount > 0 ? (sumScore / enteredCount).toFixed(1) : "—";
    const pct = total > 0 ? Math.round((enteredCount / total) * 100) : 0;

    return { total, enteredCount, pending, avg, highest: enteredCount > 0 ? highest.toFixed(1) : "—", pct };
  }, [candidates, marks]);

  // Export to CSV
  const handleExportCsv = () => {
    const headers = ["Roll_No", "Candidate_Name", "Specialities", "Email", "Phone", "MCQ_Score_Max_50", "Status"];
    const rows = filteredList.map((c) => [
      `"${c.candidateCode || ""}"`,
      `"${c.fullName || ""}"`,
      `"${getCandidateSpecs(c).join(", ")}"`,
      `"${c.email || ""}"`,
      `"${c.phone || ""}"`,
      marks[c.id] ?? "",
      c.status,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SAV_MCQ_Marks_Sheet_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Keyboard navigation between rows
  const handleKeyDown = (e: React.KeyboardEvent, index: number, candidateId: number) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      // Auto-save current row if dirty
      if (dirty.has(candidateId)) {
        handleSaveSingle(candidateId);
      }
      // Focus next row
      const nextCandidate = filteredList[index + 1];
      if (nextCandidate && inputRefs.current[nextCandidate.id]) {
        inputRefs.current[nextCandidate.id]?.focus();
        inputRefs.current[nextCandidate.id]?.select();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevCandidate = filteredList[index - 1];
      if (prevCandidate && inputRefs.current[prevCandidate.id]) {
        inputRefs.current[prevCandidate.id]?.focus();
        inputRefs.current[prevCandidate.id]?.select();
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── KPI METRICS CARDS ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <Card className="border-slate-200 bg-white shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Users className="h-3 w-3 text-slate-500" /> Total Applicants
            </span>
            <p className="text-2xl font-black text-slate-900 font-mono">{stats.total}</p>
            <span className="text-[10px] text-slate-400 font-semibold">Active cohort</span>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/50 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Marks Entered
            </span>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-emerald-700 font-mono">{stats.enteredCount}</p>
              <Badge className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5">{stats.pct}%</Badge>
            </div>
            <div className="w-full bg-emerald-200/60 rounded-full h-1 mt-1 overflow-hidden">
              <div className="bg-emerald-600 h-1 rounded-full transition-all duration-500" style={{ width: `${stats.pct}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/50 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3 text-amber-600" /> Pending Entry
            </span>
            <p className="text-2xl font-black text-amber-700 font-mono">{stats.pending}</p>
            <span className="text-[10px] text-amber-700/80 font-semibold">Requires marks entry</span>
          </CardContent>
        </Card>

        <Card className="border-indigo-200 bg-indigo-50/50 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-[10px] font-black text-indigo-800 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-indigo-600" /> Average MCQ
            </span>
            <p className="text-2xl font-black text-indigo-700 font-mono">{stats.avg}</p>
            <span className="text-[10px] text-indigo-600/80 font-semibold">Out of 50.0 marks</span>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50/50 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-[10px] font-black text-orange-800 uppercase tracking-widest flex items-center gap-1.5">
              <Hash className="h-3 w-3 text-orange-600" /> Highest Mark
            </span>
            <p className="text-2xl font-black text-orange-700 font-mono">{stats.highest}</p>
            <span className="text-[10px] text-orange-600/80 font-semibold">Top entrance score</span>
          </CardContent>
        </Card>
      </div>

      {/* ── TOOLBAR & CONTROLS ─────────────────────────────────────── */}
      <Card className="border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden">
        <CardContent className="p-4 md:p-5 space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3.5">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search candidate by name, roll no, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10 rounded-xl border-slate-200 font-medium text-xs focus:ring-orange-500"
              />
            </div>

            {/* Specialty Filter */}
            <Select value={selectedSpec} onValueChange={setSelectedSpec}>
              <SelectTrigger className="w-full md:w-[220px] h-10 rounded-xl border-slate-200 text-xs font-bold">
                <SelectValue placeholder="All Specialities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Specialities</SelectItem>
                {specialities.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="w-full md:w-[180px] h-10 rounded-xl border-slate-200 text-xs font-bold">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Candidates</SelectItem>
                <SelectItem value="missing">Pending Entry ({stats.pending})</SelectItem>
                <SelectItem value="entered">Marks Entered ({stats.enteredCount})</SelectItem>
              </SelectContent>
            </Select>

            {/* Export & Save Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="h-10 px-3.5 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs gap-1.5"
                title="Download CSV for offline recording"
              >
                <Download className="h-3.5 w-3.5 text-slate-600" /> Export CSV
              </Button>

              <Button
                size="sm"
                onClick={handleSaveAll}
                disabled={dirty.size === 0 || batchSaveMutation.isPending}
                className={`h-10 px-5 rounded-xl font-bold text-xs gap-2 shadow-sm transition-all ${
                  dirty.size > 0
                    ? "bg-orange-600 hover:bg-orange-700 text-white animate-pulse"
                    : "bg-slate-150 text-slate-400 cursor-not-allowed"
                }`}
              >
                {batchSaveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save All {dirty.size > 0 ? `(${dirty.size})` : ""}
              </Button>
            </div>
          </div>

          {/* Quick instructions bar */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900 font-medium">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-[#000080] text-white">
                <HelpCircle className="h-3.5 w-3.5" />
              </span>
              <span>
                Enter candidate MCQ entrance score (out of 50.0). Press <kbd className="px-1.5 py-0.5 bg-white border border-blue-200 rounded text-[10px] font-mono font-bold text-slate-800">Enter</kbd> or <kbd className="px-1.5 py-0.5 bg-white border border-blue-200 rounded text-[10px] font-mono font-bold text-slate-800">↓ Down Arrow</kbd> to jump directly to the next row.
              </span>
            </div>
            {dirty.size > 0 && (
              <Badge className="bg-amber-500 text-white font-black text-[10px]">
                {dirty.size} unsaved changes
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── CANDIDATE MARKS ENTRY TABLE ────────────────────────────── */}
      <Card className="border-slate-200 bg-white shadow-xs rounded-2xl overflow-hidden">
        <CardHeader className="p-4 md:px-6 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-orange-600" />
              Written MCQ Marks List
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Showing {filteredList.length} of {candidates.length} candidates
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredList.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Users className="h-10 w-10 mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">No candidates found</p>
              <p className="text-xs text-slate-400">Try adjusting your search criteria or filter options.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4 w-28">Roll No</th>
                    <th className="py-3 px-4">Candidate Name</th>
                    <th className="py-3 px-4">Applied Speciality</th>
                    <th className="py-3 px-4 w-48 text-center">MCQ Score (/50)</th>
                    <th className="py-3 px-4 w-32 text-center">Status</th>
                    <th className="py-3 px-4 w-24 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredList.map((c, idx) => {
                    const currentVal = marks[c.id] ?? "";
                    const isDirty = dirty.has(c.id);
                    const wasJustSaved = justSaved.has(c.id);
                    const specs = getCandidateSpecs(c);
                    const hasValidNum = currentVal !== "" && !isNaN(parseFloat(currentVal));
                    const numVal = hasValidNum ? parseFloat(currentVal) : null;
                    const isOutOfBounds = numVal !== null && (numVal < 0 || numVal > 50);

                    return (
                      <tr
                        key={c.id}
                        className={`transition-colors hover:bg-slate-50/80 ${
                          isDirty ? "bg-amber-50/30" : wasJustSaved ? "bg-emerald-50/30" : ""
                        }`}
                      >
                        {/* Index */}
                        <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>

                        {/* Roll Number */}
                        <td className="py-3 px-4 font-mono font-black text-slate-800">
                          <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px] text-[#000080]">
                            {c.candidateCode || "—"}
                          </span>
                        </td>

                        {/* Candidate Name & Contact */}
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900 text-sm">{c.fullName}</p>
                          <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                            {c.email || c.phone || "No contact info"}
                          </p>
                        </td>

                        {/* Applied Specialities */}
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1 max-w-[280px]">
                            {specs.length === 0 ? (
                              <span className="text-slate-400 text-[11px]">General</span>
                            ) : (
                              specs.map((sp, sIdx) => (
                                <Badge
                                  key={sIdx}
                                  variant="outline"
                                  className="text-[10px] font-bold bg-indigo-50/70 border-indigo-200 text-indigo-700 px-2 py-0.5 rounded"
                                >
                                  {sp}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>

                        {/* Editable MCQ Score Input */}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <div className="relative w-28">
                              <Input
                                ref={(el) => { inputRefs.current[c.id] = el; }}
                                type="number"
                                min={0}
                                max={50}
                                step={0.5}
                                placeholder="0.0 - 50.0"
                                value={currentVal}
                                onChange={(e) => handleMarkChange(c.id, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, idx, c.id)}
                                onBlur={() => {
                                  if (isDirty) {
                                    handleSaveSingle(c.id);
                                  }
                                }}
                                className={`h-10 text-center font-mono font-black text-sm rounded-xl transition-all shadow-inner ${
                                  isOutOfBounds
                                    ? "border-red-400 bg-red-50 text-red-700 focus:ring-red-500"
                                    : isDirty
                                    ? "border-amber-400 bg-amber-50/80 text-amber-900 focus:ring-amber-500 font-extrabold"
                                    : hasValidNum
                                    ? "border-emerald-300 bg-emerald-50/30 text-emerald-900 font-black"
                                    : "border-slate-200 bg-white text-slate-800"
                                }`}
                              />
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">
                                /50
                              </span>
                            </div>
                          </div>
                          {isOutOfBounds && (
                            <p className="text-[10px] font-bold text-red-600 text-center mt-1">Must be 0 – 50</p>
                          )}
                        </td>

                        {/* Status Indicator */}
                        <td className="py-3 px-4 text-center">
                          {isDirty ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold px-2 py-0.5">
                              Unsaved
                            </Badge>
                          ) : wasJustSaved ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold px-2 py-0.5 flex items-center gap-1 justify-center w-fit mx-auto">
                              <Check className="h-3 w-3 text-emerald-600" /> Saved
                            </Badge>
                          ) : hasValidNum ? (
                            <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-bold px-2 py-0.5">
                              Recorded
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-400 border-dashed text-[10px] font-normal px-2 py-0.5">
                              Pending
                            </Badge>
                          )}
                        </td>

                        {/* Row Action */}
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!isDirty || batchSaveMutation.isPending}
                            onClick={() => handleSaveSingle(c.id)}
                            className={`h-8 px-2.5 rounded-lg text-xs font-bold gap-1 transition-all ${
                              isDirty
                                ? "text-orange-600 hover:text-orange-700 hover:bg-orange-50 bg-orange-50/50"
                                : "text-slate-300 hover:bg-transparent cursor-not-allowed"
                            }`}
                          >
                            <Save className="h-3.5 w-3.5" /> Save
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
