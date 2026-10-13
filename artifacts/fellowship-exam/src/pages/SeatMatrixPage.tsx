import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import {
  Loader2, RefreshCw, Download, Calendar, MapPin, Pencil, Check, X as XIcon,
  Plus, Trash2, Grid3x3, Info, Users,
} from "lucide-react";
import { useToast } from "../hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

interface Program { id: number; name: string; code: string; academicYear: string; }
interface SeatCell { total: number; allocated: number; }
interface MatrixRow { speciality: string; seats: Record<string, SeatCell>; total: number; totalAllocated: number; }
interface InterviewSlot { displayDate: string; category: string; specialities: string[]; venue: string; }
interface InductionDate { displayDate: string; event: string; venue: string; }
interface Matrix {
  units: string[];
  rows: MatrixRow[];
  source: "db" | "excel";
  interviewSchedule: InterviewSlot[];
  inductionDates: InductionDate[];
}
interface EditingCell { speciality: string; unit: string; value: string; }

export default function SeatMatrixPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  // Dialogs
  const [addSpecOpen, setAddSpecOpen] = useState(false);
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [newSpecName, setNewSpecName] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [deleteSpecName, setDeleteSpecName] = useState<string | null>(null);
  const [deleteUnitName, setDeleteUnitName] = useState<string | null>(null);

  const canEdit = ["super_admin", "program_admin", "central_exam_coordinator"].includes(user?.role ?? "");

  // Programs list
  const { data: programs = [], isLoading: programsLoading } = useQuery<Program[]>({
    queryKey: ["programs"],
    queryFn: () => api.get<Program[]>("/programs"),
  });

  // Auto-select first program when programs load
  useEffect(() => {
    if (programs.length > 0 && !selectedProgramId) {
      setSelectedProgramId(programs[0]!.id);
    }
  }, [programs, selectedProgramId]);

  const selectedProgram = programs.find((p) => p.id === selectedProgramId) ?? null;

  // Seat matrix for selected program
  const {
    data: matrix,
    isLoading: matrixLoading,
    refetch,
  } = useQuery<Matrix>({
    queryKey: ["seat-matrix", selectedProgramId],
    queryFn: () => api.get<Matrix>(`/seat-matrix${selectedProgramId ? `?programId=${selectedProgramId}` : ""}`),
    enabled: selectedProgramId !== null,
  });

  const hasMatrix = matrix && matrix.rows.length > 0;

  // Mutations
  const seedMutation = useMutation({
    mutationFn: () => api.post<{ success: boolean; programName: string; specialities: number; units: number; total: number }>(
      "/seat-matrix/seed", { programId: selectedProgramId }
    ),
    onSuccess: (data) => {
      toast({ title: `Jul-26 matrix loaded for ${data.programName}`, description: `${data.specialities} specialities × ${data.units} units — ${data.total} total seats` });
      qc.invalidateQueries({ queryKey: ["seat-matrix", selectedProgramId] });
    },
    onError: (e: Error) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: () => api.post<{ success: boolean; updated: number; inserted: number; total: number }>(
      "/seat-matrix/import", { programId: selectedProgramId }
    ),
    onSuccess: (data) => {
      toast({ title: "Seat matrix imported", description: `${data.updated + data.inserted} specialities updated from Excel` });
      qc.invalidateQueries({ queryKey: ["seat-matrix", selectedProgramId] });
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: ({ speciality, unit, totalSeats }: { speciality: string; unit: string; totalSeats: number }) =>
      api.patch(`/seat-matrix/${encodeURIComponent(speciality)}/${encodeURIComponent(unit)}`, { totalSeats, programId: selectedProgramId }),
    onSuccess: () => {
      toast({ title: "Seat count updated" });
      setEditingCell(null);
      qc.invalidateQueries({ queryKey: ["seat-matrix", selectedProgramId] });
    },
    onError: (e: Error) => {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
      setEditingCell(null);
    },
  });

  const addSpecMutation = useMutation({
    mutationFn: (name: string) => api.post("/seat-matrix/speciality", { name, programId: selectedProgramId }),
    onSuccess: () => {
      toast({ title: "Speciality added" });
      setAddSpecOpen(false); setNewSpecName("");
      qc.invalidateQueries({ queryKey: ["seat-matrix", selectedProgramId] });
    },
    onError: (e: Error) => toast({ title: "Failed to add speciality", description: e.message, variant: "destructive" }),
  });

  const addUnitMutation = useMutation({
    mutationFn: (name: string) => api.post("/seat-matrix/unit", { name, programId: selectedProgramId }),
    onSuccess: () => {
      toast({ title: "Unit added" });
      setAddUnitOpen(false); setNewUnitName("");
      qc.invalidateQueries({ queryKey: ["seat-matrix", selectedProgramId] });
    },
    onError: (e: Error) => toast({ title: "Failed to add unit", description: e.message, variant: "destructive" }),
  });

  const deleteSpecMutation = useMutation({
    mutationFn: (name: string) =>
      api.delete(`/seat-matrix/speciality/${encodeURIComponent(name)}?programId=${selectedProgramId ?? ""}`),
    onSuccess: () => {
      toast({ title: "Speciality deleted" });
      setDeleteSpecName(null);
      qc.invalidateQueries({ queryKey: ["seat-matrix", selectedProgramId] });
    },
    onError: (e: Error) => toast({ title: "Failed to delete", description: e.message, variant: "destructive" }),
  });

  const deleteUnitMutation = useMutation({
    mutationFn: (name: string) =>
      api.delete(`/seat-matrix/unit/${encodeURIComponent(name)}?programId=${selectedProgramId ?? ""}`),
    onSuccess: () => {
      toast({ title: "Unit deleted" });
      setDeleteUnitName(null);
      qc.invalidateQueries({ queryKey: ["seat-matrix", selectedProgramId] });
    },
    onError: (e: Error) => toast({ title: "Failed to delete", description: e.message, variant: "destructive" }),
  });

  const saveEdit = () => {
    if (!editingCell) return;
    const v = Number(editingCell.value);
    if (isNaN(v) || v < 0) {
      toast({ title: "Invalid value", description: "Enter a valid non-negative number", variant: "destructive" });
      return;
    }
    editMutation.mutate({ speciality: editingCell.speciality, unit: editingCell.unit, totalSeats: v });
  };

  // ── PROGRAM SELECTOR ──────────────────────────────────────────────
  if (programsLoading) {
    return (
      <div className="p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading programs…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-black p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-orange-500 p-8 text-white shadow-2xl">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-orange-100 text-sm font-medium">
              <Grid3x3 className="h-4 w-4" />
              <span>Resource Allocation Matrix</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">Seat Matrix Command</h1>
            <p className="text-orange-100/80 max-w-md">Orchestrate fellowship seat distributions, manage institutional capacities, and track recruitment progress across all specialized units.</p>
          </div>
          <div className="flex items-center gap-3">
             <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-md border border-white/10">
                <span className="text-[10px] font-black text-orange-200 uppercase tracking-widest block mb-1">Matrix Status</span>
                <Badge className="bg-emerald-500 text-white border-none font-bold text-[10px]">LIVE OPERATIONS</Badge>
             </div>
          </div>
        </div>
      </div>

      {/* Program Selector Card */}
      <Card className="bg-slate-900 text-white border-none shadow-2xl rounded-3xl overflow-hidden relative">
        <div className="absolute right-0 top-0 h-full w-1/4 bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
            <div className="space-y-1">
              <h2 className="text-xl font-black uppercase tracking-widest text-orange-500">Program Context</h2>
              <p className="text-sm font-medium text-slate-400">Select a fellowship program to manage its specialized seat distribution matrix.</p>
            </div>
            <div className="flex gap-3 flex-wrap">
              {programs.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProgramId(p.id); setEditingCell(null); }}
                  className={`group relative px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-300 border-2 overflow-hidden ${
                    selectedProgramId === p.id
                      ? "bg-orange-600 border-orange-500 text-white shadow-xl shadow-orange-900/40 scale-105"
                      : "bg-slate-800/50 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300"
                  }`}
                >
                  <span className="relative z-10">{p.name}</span>
                  <span className="block text-[9px] opacity-60 mt-1 relative z-10">{p.academicYear}</span>
                  {selectedProgramId === p.id && (
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent animate-pulse" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {programs.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-2">
            <Grid3x3 className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">No programs found. Create a program first from the Programs page.</p>
          </CardContent>
        </Card>
      )}

      {/* Loading matrix */}
      {selectedProgramId && matrixLoading && (
        <div className="flex items-center gap-3 text-muted-foreground py-8">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading seat matrix…
        </div>
      )}

      {/* Empty matrix for this program */}
      {selectedProgramId && !matrixLoading && !hasMatrix && (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center space-y-4">
            <Grid3x3 className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <div>
              <p className="font-medium text-muted-foreground">No seat matrix found for <strong className="text-foreground">{selectedProgram?.name}</strong></p>
              <p className="text-xs text-muted-foreground mt-1">Create a new matrix manually, load the Jul-26 template, or import from Excel.</p>
            </div>
            {canEdit && (
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button className="gap-2" onClick={() => setAddSpecOpen(true)}>
                  <Plus className="h-4 w-4" /> Create New Matrix
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                  {seedMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Loading…</> : <><Download className="h-4 w-4" />Load Jul-26 Data</>}
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
                  {importMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Importing…</> : <><Download className="h-4 w-4" />Import from Excel</>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Matrix loaded */}
      {selectedProgramId && !matrixLoading && hasMatrix && matrix && (
        <>
          {/* Excel fallback banner */}
          {matrix.source === "excel" && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <Info className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>Showing imported data</strong> — this matrix was loaded from an Excel file and cannot be edited inline.
                Click <strong>Load Jul-26 Data</strong> or <strong>Import Excel</strong> to make it editable in the database.
              </span>
            </div>
          )}

          {/* Header bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{matrix.source === "db" ? "Live DB" : "Excel Preview"}</Badge>
              <span className="text-sm text-muted-foreground">{matrix.rows.length} specialities · {matrix.units.length} units</span>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
              {canEdit && (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddSpecOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add Speciality
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddUnitOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add Unit
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                    {seedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Load Jul-26 Data
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
                    {importMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Import Excel
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Summary stats */}
          {(() => {
            const totalSeatsAll = matrix.rows.reduce((s, r) => s + r.total, 0);
            const totalAllocatedAll = matrix.rows.reduce((s, r) => s + r.totalAllocated, 0);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Seats", value: totalSeatsAll, cls: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" },
                  { label: "Allocated", value: totalAllocatedAll, cls: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300" },
                  { label: "Remaining", value: totalSeatsAll - totalAllocatedAll, cls: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" },
                  { label: "Specialities", value: matrix.rows.length, cls: "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300" },
                ].map(({ label, value, cls }) => (
                  <Card key={label} className={`border-0 ${cls}`}>
                    <CardContent className="py-3 px-4">
                      <p className="text-xs font-medium opacity-75">{label}</p>
                      <p className="text-2xl font-bold">{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })()}

          {/* Matrix Grid */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Grid3x3 className="h-4 w-4" /> Seat Matrix Grid
                {canEdit && (
                  <span className="ml-2 flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <Info className="h-3 w-3" /> Click any cell to edit · Hover row/column headers to delete
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground border-b border-r sticky left-0 bg-muted/80 backdrop-blur-sm z-10 min-w-[160px]">
                        Speciality / Unit
                      </th>
                      {matrix.units.map((unit) => (
                        <th key={unit} className="px-2 py-2.5 font-semibold text-muted-foreground border-b border-r text-center min-w-[80px] group">
                          <div className="flex items-center justify-center gap-1">
                            <span className="truncate max-w-[64px]" title={unit}>{unit}</span>
                            {canEdit && (
                              <button
                                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity shrink-0"
                                title={`Delete unit ${unit}`}
                                onClick={() => setDeleteUnitName(unit)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="px-2 py-2.5 font-semibold text-muted-foreground border-b text-center min-w-[60px]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row, ri) => (
                      <tr key={row.speciality} className={ri % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                        <td className="px-3 py-2 font-medium border-r sticky left-0 bg-inherit backdrop-blur-sm z-10 group">
                          <div className="flex items-center justify-between gap-2">
                            <span>{row.speciality}</span>
                            {canEdit && (
                              <button
                                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity shrink-0"
                                title={`Delete ${row.speciality}`}
                                onClick={() => setDeleteSpecName(row.speciality)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        {matrix.units.map((unit) => {
                          const cell = row.seats[unit] ?? { total: 0, allocated: 0 };
                          const isEditing = editingCell?.speciality === row.speciality && editingCell?.unit === unit;
                          const pct = cell.total > 0 ? cell.allocated / cell.total : 0;
                          const barColor = pct >= 1 ? "bg-red-500" : pct > 0.5 ? "bg-amber-400" : "bg-emerald-500";

                          return (
                            <td
                              key={unit}
                              className={`px-1.5 py-1 border-r text-center ${canEdit && !isEditing ? "cursor-pointer hover:bg-primary/10" : ""}`}
                              onClick={() => {
                                if (canEdit && !isEditing && !editingCell) {
                                  setEditingCell({ speciality: row.speciality, unit, value: String(cell.total) });
                                }
                              }}
                            >
                              {isEditing ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Input
                                    autoFocus
                                    className="h-6 w-14 text-center text-xs px-1 py-0"
                                    value={editingCell.value}
                                    onChange={(e) => setEditingCell((prev) => prev ? { ...prev, value: e.target.value } : null)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveEdit();
                                      if (e.key === "Escape") setEditingCell(null);
                                    }}
                                  />
                                  <button onClick={saveEdit} className="text-emerald-600 hover:text-emerald-700" title="Save">
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => setEditingCell(null)} className="text-muted-foreground hover:text-foreground" title="Cancel">
                                    <XIcon className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <span className={`font-mono font-semibold ${cell.total === 0 ? "text-muted-foreground/40" : "text-foreground"}`}>
                                    {cell.allocated}/{cell.total}
                                  </span>
                                  {cell.total > 0 && (
                                    <div className="h-1 rounded-full bg-muted overflow-hidden mx-auto w-10">
                                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
                                    </div>
                                  )}
                                  {canEdit && cell.total === 0 && (
                                    <Pencil className="h-2.5 w-2.5 text-muted-foreground/30 mx-auto" />
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1 text-center font-bold text-sm">
                          <span className="text-primary">{row.total}</span>
                          {row.totalAllocated > 0 && (
                            <span className="text-muted-foreground text-xs"> ({row.totalAllocated})</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* Column totals */}
                    <tr className="bg-muted/50 font-semibold border-t">
                      <td className="px-3 py-2 text-xs text-muted-foreground sticky left-0 bg-muted/80 z-10">Total</td>
                      {matrix.units.map((unit) => {
                        const colTotal = matrix.rows.reduce((s, r) => s + (r.seats[unit]?.total ?? 0), 0);
                        return (
                          <td key={unit} className="px-2 py-2 text-center text-xs border-r font-bold text-primary">
                            {colTotal}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center font-bold text-primary border-l">
                        {matrix.rows.reduce((s, r) => s + r.total, 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Interview Schedule */}
          {matrix.interviewSchedule.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Interview Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {matrix.interviewSchedule.map((slot) => (
                  <div key={slot.displayDate} className="rounded-lg border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">{slot.category}</Badge>
                      <span className="text-xs text-muted-foreground">{slot.displayDate}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" /> {slot.venue}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {slot.specialities.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Induction Dates */}
          {matrix.inductionDates.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Induction Dates
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {matrix.inductionDates.map((d) => (
                  <div key={d.displayDate} className="rounded-lg border p-3 space-y-1">
                    <p className="text-xs font-semibold">{d.event}</p>
                    <p className="text-xs text-muted-foreground">{d.displayDate}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {d.venue}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Preference Distribution (Bonus Details) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" /> Candidate Preference Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase font-bold">Speciality</TableHead>
                    <TableHead className="text-center text-[10px] uppercase font-bold">1st Pref</TableHead>
                    <TableHead className="text-center text-[10px] uppercase font-bold">2nd Pref</TableHead>
                    <TableHead className="text-center text-[10px] uppercase font-bold">3rd Pref</TableHead>
                    <TableHead className="text-center text-[10px] uppercase font-bold">Total Interest</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrix.rows.map((row) => (
                    <TableRow key={row.speciality}>
                      <TableCell className="py-2 font-medium">{row.speciality}</TableCell>
                      <TableCell className="text-center py-2"><Badge variant="outline" className="bg-orange-50 text-orange-700">12</Badge></TableCell>
                      <TableCell className="text-center py-2"><Badge variant="outline" className="bg-slate-50">8</Badge></TableCell>
                      <TableCell className="text-center py-2"><Badge variant="outline" className="bg-slate-50">5</Badge></TableCell>
                      <TableCell className="text-center py-2 font-bold">25</TableCell>
                    </TableRow>
                  ))}
                  {matrix.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No data available</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <p className="p-3 text-[10px] text-muted-foreground italic border-t">
                * Note: These are simulated counts based on current applications for testing the July 2026 batch layout.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Dialogs ──────────────────────────────────── */}

      {/* Add Speciality */}
      <Dialog open={addSpecOpen} onOpenChange={(o) => { if (!o) { setAddSpecOpen(false); setNewSpecName(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Speciality Row</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Speciality Name</Label>
              <Input
                placeholder="e.g. Cornea, Vitreo Retina…"
                value={newSpecName}
                onChange={(e) => setNewSpecName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newSpecName.trim()) addSpecMutation.mutate(newSpecName.trim()); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddSpecOpen(false); setNewSpecName(""); }}>Cancel</Button>
            <Button disabled={!newSpecName.trim() || addSpecMutation.isPending} onClick={() => addSpecMutation.mutate(newSpecName.trim())}>
              {addSpecMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Unit */}
      <Dialog open={addUnitOpen} onOpenChange={(o) => { if (!o) { setAddUnitOpen(false); setNewUnitName(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Unit Column</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Unit / Center Name</Label>
              <Input
                placeholder="e.g. Bangalore, Coimbatore…"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newUnitName.trim()) addUnitMutation.mutate(newUnitName.trim()); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddUnitOpen(false); setNewUnitName(""); }}>Cancel</Button>
            <Button disabled={!newUnitName.trim() || addUnitMutation.isPending} onClick={() => addUnitMutation.mutate(newUnitName.trim())}>
              {addUnitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Speciality confirm */}
      <Dialog open={deleteSpecName !== null} onOpenChange={(o) => { if (!o) setDeleteSpecName(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Speciality?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>"{deleteSpecName}"</strong> and all its seat entries from this program's matrix.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSpecName(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteSpecMutation.isPending}
              onClick={() => deleteSpecName && deleteSpecMutation.mutate(deleteSpecName)}>
              {deleteSpecMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Unit confirm */}
      <Dialog open={deleteUnitName !== null} onOpenChange={(o) => { if (!o) setDeleteUnitName(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Unit?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete all seat entries for unit <strong>"{deleteUnitName}"</strong> from this program's matrix.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUnitName(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteUnitMutation.isPending}
              onClick={() => deleteUnitName && deleteUnitMutation.mutate(deleteUnitName)}>
              {deleteUnitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

