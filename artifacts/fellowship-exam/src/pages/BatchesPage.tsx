import { useState } from "react";
import { fmtDate } from "../lib/dateUtils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Checkbox } from "../components/ui/checkbox";
import { Badge } from "../components/ui/badge";
import {
  Loader2,
  Plus,
  Users,
  Calendar,
  Clock,
  ClipboardCheck,
  Trophy,
  ArrowRight,
  MoreVertical,
  Trash2,
  Building2,
  Grid3x3,
  MapPin,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { api } from "../lib/api";

const HOURS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const PERIODS = ["AM", "PM"];

export default function BatchesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([]);
  const [viewingBatchId, setViewingBatchId] = useState<number | null>(null);
  const [marksDialogOpen, setMarksDialogOpen] = useState(false);
  const [marksUpdates, setMarksUpdates] = useState<Record<number, { mcq?: string; psych?: string; interview?: string }>>({});

  const [startHour, setStartHour] = useState("09");
  const [startMin, setStartMin] = useState("00");
  const [startPeriod, setStartPeriod] = useState("AM");
  const [endHour, setEndHour] = useState("01");
  const [endMin, setEndMin] = useState("00");
  const [endPeriod, setEndPeriod] = useState("PM");

  // Queries
  const { data: batches = [], isLoading: isLoadingBatches } = useQuery({
    queryKey: ["batches"],
    queryFn: () => api.get<any[]>("/batches"),
  });

  const { data: candidates = [], isLoading: isLoadingCandidates } = useQuery({
    queryKey: ["candidates"],
    queryFn: () => api.get<any[]>("/candidates"),
  });

  const { data: programs = [] } = useQuery({
    queryKey: ["programs"],
    queryFn: () => api.get<any[]>("/programs"),
  });

  const { data: specialitiesList = [] } = useQuery({
    queryKey: ["specialities-list"],
    queryFn: () => api.get<any[]>("/specialities"),
  });

  const uniqueSpecNames = Array.from(new Set(specialitiesList.map((s: any) => s.name)));

  const { data: units = [] } = useQuery({
    queryKey: ["units"],
    queryFn: () => api.get<any[]>("/units"),
  });

  const { data: batchCandidates = [] } = useQuery({
    queryKey: ["batch-candidates", viewingBatchId],
    queryFn: () => api.get<any[]>(`/batches/${viewingBatchId}/candidates`),
    enabled: !!viewingBatchId,
  });

  // Approved candidates not in a batch
  const approvedCandidates = candidates.filter((c: any) => c.status === "approved" || c.status === "pending");

  // Mutations
  const createBatchMutation = useMutation({
    mutationFn: (newBatch: any) => api.post("/batches", newBatch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Success", description: "Batch created successfully" });
    },
    onError: (e: any) => {
      toast({ 
        title: "Deployment Failed", 
        description: e.response?.data?.error || e.message || "An unexpected error occurred", 
        variant: "destructive" 
      });
    }
  });

  const assignCandidatesMutation = useMutation({
    mutationFn: ({ batchId, candidateIds }: { batchId: number; candidateIds: number[] }) => 
      api.post(`/batches/${batchId}/candidates`, { candidateIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      setSelectedCandidates([]);
      toast({ title: "Success", description: "Candidates assigned to batch" });
    },
  });

  const deleteBatchMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/batches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast({ title: "Batch deleted" });
      if (viewingBatchId === deleteBatchMutation.variables) setViewingBatchId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMarksMutation = useMutation({
    mutationFn: (data: { batchId: number; updates: any[] }) => 
      api.patch(`/batches/${data.batchId}/marks`, { updates: data.updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
      queryClient.invalidateQueries({ queryKey: ["batch-candidates", viewingBatchId] });
      setMarksDialogOpen(false);
      toast({ title: "Marks updated successfully" });
    },
  });

  const handleCreateBatch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const programIdRaw = formData.get("programId");
    const programId = programIdRaw ? parseInt(programIdRaw as string) : (programs[0]?.id || 1);

    const rawDate = formData.get("date") as string;
    let isoDate = rawDate;
    if (rawDate && rawDate.includes("-")) {
      const parts = rawDate.split("-");
      if (parts.length === 3 && parts[0].length === 2) {
        // DD-MM-YYYY -> YYYY-MM-DD
        isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    const data = {
      name: formData.get("name"),
      segment: formData.get("segment"),
      date: isoDate,
      timing: `${startHour}:${startMin} ${startPeriod} - ${endHour}:${endMin} ${endPeriod}`,
      venue: formData.get("venue"),
      programId: programId,
      mcqTotalMarks: parseFloat(formData.get("mcqTotal") as string) || 50,
      psychometricTotalMarks: parseFloat(formData.get("psychTotal") as string) || 50,
      interviewTotalMarks: parseFloat(formData.get("interviewTotal") as string) || 100,
    };

    if (isNaN(data.programId)) {
      toast({ title: "Error", description: "Invalid program selected", variant: "destructive" });
      return;
    }

    createBatchMutation.mutate(data);
  };

  if (isLoadingBatches) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50/50">
        <div className="flex flex-col items-center gap-6">
          <Loader2 className="h-16 w-16 animate-spin text-primary opacity-20" />
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em] animate-pulse">Initializing Command Center...</p>
        </div>
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
              <span>Assessment Logistics</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">Batch Command Center</h1>
            <p className="text-orange-100/80 max-w-md">Orchestrate candidate examination flows and specialized clinical interview rotations from a unified administrative matrix.</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-white text-orange-700 hover:bg-orange-50 transition-all font-bold h-12 px-6 rounded-2xl shadow-xl hover:scale-105 active:scale-95 gap-2 border-none"
              >
                <Plus className="h-5 w-5" /> Initialize New Batch
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[800px] rounded-[48px] border-none shadow-premium p-12 bg-white max-h-[90vh] overflow-y-auto">
              <form onSubmit={handleCreateBatch}>
                <DialogHeader className="mb-10">
                  <DialogTitle className="text-4xl font-black tracking-tight text-slate-900">Initialize Examination Cluster</DialogTitle>
                  <DialogDescription className="text-slate-500 font-medium text-lg">
                    Orchestrate the structural parameters and merit boundaries for this administrative cycle.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-8 py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Batch Descriptor</Label>
                      <Input id="name" name="name" placeholder="JULY 2026 - ALPHA CLUSTER" className="h-14 rounded-2xl border-2 border-slate-100 font-bold uppercase placeholder:text-slate-300 focus:border-primary/20 transition-all text-base" required />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Speciality Segment</Label>
                        <select name="segment" className="w-full h-14 rounded-2xl border-2 border-slate-100 bg-white px-4 text-sm font-bold uppercase focus:border-primary/20 transition-all outline-none" required>
                          <option value="General">General</option>
                          <option value="Retina">Retina</option>
                          <option value="Anterior Segment">Anterior Segment</option>
                          {uniqueSpecNames.map((name: any) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Academic Program</Label>
                        <select name="programId" className="w-full h-14 rounded-2xl border-2 border-slate-100 bg-white px-4 text-sm font-bold uppercase focus:border-primary/20 transition-all outline-none">
                          <option value="">Select Program (Optional)</option>
                          {programs.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Clinical Execution Venue</Label>
                      <select name="venue" className="w-full h-14 rounded-2xl border-2 border-slate-100 bg-white px-4 text-sm font-bold uppercase focus:border-primary/20 transition-all outline-none" required>
                        <option value="">Select Hospital Unit</option>
                        {units.map((u: any) => (
                          <option key={u.id} value={u.name}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Execution Date</Label>
                      <Input id="date" name="date" type="date" className="h-14 rounded-2xl border-2 border-slate-100 font-bold focus:border-primary/20 transition-all text-base bg-white dark:bg-black" required />
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Operational Timing</Label>
                    <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-4 rounded-[32px] border-2 border-slate-100">
                      {/* Start Time Row */}
                      <div className="flex flex-col gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                         <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-orange-600" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Starting From</p>
                         </div>
                         <div className="grid grid-cols-3 gap-2">
                            <Select value={startHour} onValueChange={setStartHour}>
                              <SelectTrigger className="h-10 rounded-xl border-2 border-slate-50 bg-slate-50 font-bold px-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Select value={startMin} onValueChange={setStartMin}>
                              <SelectTrigger className="h-10 rounded-xl border-2 border-slate-50 bg-slate-50 font-bold px-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Select value={startPeriod} onValueChange={setStartPeriod}>
                              <SelectTrigger className="h-10 rounded-xl border-2 border-orange-100 bg-orange-50 text-orange-700 font-bold px-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                              </SelectContent>
                            </Select>
                         </div>
                      </div>

                      {/* End Time Row */}
                      <div className="flex flex-col gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                         <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Concluding At</p>
                         </div>
                         <div className="grid grid-cols-3 gap-2">
                            <Select value={endHour} onValueChange={setEndHour}>
                              <SelectTrigger className="h-10 rounded-xl border-2 border-slate-50 bg-slate-50 font-bold px-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Select value={endMin} onValueChange={setEndMin}>
                              <SelectTrigger className="h-10 rounded-xl border-2 border-slate-50 bg-slate-50 font-bold px-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Select value={endPeriod} onValueChange={setEndPeriod}>
                              <SelectTrigger className="h-10 rounded-xl border-2 border-amber-100 bg-amber-50 text-amber-700 font-bold px-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PERIODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                              </SelectContent>
                            </Select>
                         </div>
                      </div>
                    </div>
                  </div>
                  <div className="pt-6 border-t-2 border-slate-50">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 mb-6 block">Merit Threshold Configuration (Max Scores)</Label>
                    <div className="grid grid-cols-3 gap-8">
                      <div className="bg-slate-50/50 p-6 rounded-3xl space-y-3 border-2 border-transparent hover:border-orange-200 transition-all">
                        <Label className="text-xs font-black text-slate-600 uppercase">MCQ Assessment</Label>
                        <Input name="mcqTotal" type="number" defaultValue="50" className="h-12 rounded-xl border-none shadow-inner font-bold text-lg" />
                      </div>
                      <div className="bg-slate-50/50 p-6 rounded-3xl space-y-3 border-2 border-transparent hover:border-amber-200 transition-all">
                        <Label className="text-xs font-black text-slate-600 uppercase">Psychometric</Label>
                        <Input name="psychTotal" type="number" defaultValue="50" className="h-12 rounded-xl border-none shadow-inner font-bold text-lg" />
                      </div>
                      <div className="bg-slate-50/50 p-6 rounded-3xl space-y-3 border-2 border-transparent hover:border-orange-400 transition-all">
                        <Label className="text-xs font-black text-slate-600 uppercase">Clinical Interview</Label>
                        <Input name="interviewTotal" type="number" defaultValue="100" className="h-12 rounded-xl border-none shadow-inner font-bold text-lg" />
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter className="mt-8">
                  <Button type="submit" disabled={createBatchMutation.isPending} className="w-full h-14 rounded-[20px] bg-primary text-white font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.01] transition-transform">
                    {createBatchMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Deploy Batch Protocol"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <Card className="border-none shadow-premium bg-white p-8 rounded-[40px] flex flex-col justify-center text-center hover:shadow-2xl transition-all group hover:-translate-y-2 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 h-32 w-32 bg-indigo-50 rounded-full group-hover:scale-150 transition-transform duration-700" />
          <div className="h-16 w-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform relative z-10">
            <Users className="w-8 h-8 text-indigo-500" />
          </div>
          <h3 className="text-4xl font-black text-slate-900 tracking-tighter leading-none relative z-10">{batches.length}</h3>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-3 relative z-10">Active Clusters</p>
        </Card>
        
        <Card className="border-none shadow-premium bg-white p-8 rounded-[40px] flex flex-col justify-center text-center hover:shadow-2xl transition-all group hover:-translate-y-2 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 h-32 w-32 bg-emerald-50 rounded-full group-hover:scale-150 transition-transform duration-700" />
          <div className="h-16 w-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform relative z-10">
            <ClipboardCheck className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-4xl font-black text-slate-900 tracking-tighter leading-none relative z-10">
            {candidates.filter((c: any) => c.status === 'completed' || c.status === 'allocated').length}
          </h3>
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-3 relative z-10">Scored Assets</p>
        </Card>

        <Card className="border-none shadow-premium bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[40px] flex flex-col justify-center text-center hover:shadow-2xl transition-all group hover:-translate-y-2 relative overflow-hidden md:col-span-2">
          <div className="absolute top-0 right-0 h-40 w-40 bg-white/5 rounded-full -mr-10 -mt-10 group-hover:scale-150 transition-transform duration-1000" />
          <div className="flex items-center justify-center gap-10 relative z-10">
            <div className="text-left">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 text-indigo-300">Next Cycle</p>
              <h3 className="text-3xl font-black text-white tracking-tight leading-none">
                {batches[0] ? fmtDate(batches[0].date) : 'No Pending'}
              </h3>
              {batches[0]?.timing && (
                <div className="flex items-center gap-2 mt-3 px-3 py-1 bg-white/10 rounded-full w-fit">
                  <Clock className="h-3 w-3 text-indigo-300" />
                  <p className="text-xs font-black text-white uppercase tracking-wider">{batches[0].timing}</p>
                </div>
              )}
            </div>
            <div className="h-16 w-[1px] bg-white/10" />
            <div className="text-left">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2 text-emerald-300">Target Venue</p>
              <h3 className="text-xl font-black text-white tracking-tight leading-none uppercase">
                {batches[0]?.venue || 'Sankara Academy'}
              </h3>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: Batches List */}
        <div className="lg:col-span-8 space-y-8">
          <Card className="border-none shadow-premium bg-white rounded-[48px] overflow-hidden">
            <CardHeader className="p-10 pb-4">
              <CardTitle className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-4">
                <div className="h-12 w-12 bg-slate-900 rounded-2xl flex items-center justify-center">
                  <Grid3x3 className="h-6 w-6 text-white" />
                </div>
                Active Batch Registries
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow className="h-16 hover:bg-transparent border-none">
                    <TableHead className="w-12"></TableHead>
                    <TableHead className="font-black text-slate-400 text-[11px] uppercase tracking-widest px-6">Batch Identity</TableHead>
                    <TableHead className="font-black text-slate-400 text-[11px] uppercase tracking-widest px-6 text-center">Schedule</TableHead>
                    <TableHead className="font-black text-slate-400 text-[11px] uppercase tracking-widest px-6 text-center">Status</TableHead>
                    <TableHead className="text-right px-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch: any) => (
                    <TableRow 
                      key={batch.id} 
                      className={`h-28 border-b border-slate-50 transition-all cursor-pointer hover:bg-slate-50/50 group ${viewingBatchId === batch.id ? 'bg-primary/5 border-l-4 border-l-primary' : ''}`}
                      onClick={() => setViewingBatchId(batch.id)}
                    >
                      <TableCell className="text-center pl-6">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-black text-lg ${viewingBatchId === batch.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                          {batch.name.charAt(0)}
                        </div>
                      </TableCell>
                      <TableCell className="px-6">
                        <div className="font-black text-slate-900 uppercase text-lg tracking-tight group-hover:text-primary transition-colors">{batch.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest rounded-lg border-slate-200">{batch.segment}</Badge>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Users className="h-3 w-3" /> {batch.candidateCount || 0} Assets
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="font-black text-slate-900 text-base uppercase tracking-tighter">
                            {fmtDate(batch.date)}
                          </div>
                          <div className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-50 rounded-full border border-orange-100 shadow-sm">
                            <Clock className="h-3.5 w-3.5 text-orange-500" />
                            <span className="text-xs font-extrabold text-orange-700 uppercase tracking-tight">
                              {batch.timing}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 text-center">
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[10px] px-4 h-8 rounded-full shadow-sm">OPERATIONAL</Badge>
                      </TableCell>
                      <TableCell className="text-right px-10">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-destructive hover:bg-destructive/10 rounded-xl"
                          onClick={(e) => { e.stopPropagation(); deleteBatchMutation.mutate(batch.id); }}
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Candidates Selection */}
        <div className="lg:col-span-4 space-y-8">
          {viewingBatchId ? (
            <Card className="border-none shadow-premium bg-white rounded-[40px] overflow-hidden">
               <CardHeader className="bg-slate-900 p-8">
                 <CardTitle className="text-white text-xl font-black uppercase tracking-tight flex items-center justify-between">
                   Asset Allocation
                   <Badge className="bg-primary text-white border-none font-black text-[10px] px-3">{selectedCandidates.length} Selected</Badge>
                 </CardTitle>
                 <CardDescription className="text-slate-400 mt-2 font-medium italic">Assign eligible candidates to the active registry.</CardDescription>
               </CardHeader>
               <CardContent className="p-0">
                 <div className="max-h-[500px] overflow-y-auto">
                   {approvedCandidates.length === 0 ? (
                     <div className="p-20 text-center text-slate-300 flex flex-col items-center gap-4">
                       <Users className="h-12 w-12 opacity-20" />
                       <p className="text-sm font-black uppercase tracking-widest">No Available Assets</p>
                     </div>
                   ) : (
                    <div className="divide-y divide-slate-50">
                      {approvedCandidates.map((cand: any) => {
                        const isAssigned = batchCandidates.some(bc => bc.candidateId === cand.id);
                        return (
                          <div key={cand.id} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-all group">
                            <div className="flex items-center gap-4">
                              <Checkbox 
                                checked={selectedCandidates.includes(cand.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) setSelectedCandidates(prev => [...prev, cand.id]);
                                  else setSelectedCandidates(prev => prev.filter(id => id !== cand.id));
                                }}
                                disabled={isAssigned}
                                className="h-5 w-5 rounded-lg border-2 border-slate-200 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                              />
                              <div>
                                <p className="font-black text-slate-900 uppercase text-sm group-hover:text-primary transition-colors">{cand.fullName}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{cand.candidateCode}</p>
                              </div>
                            </div>
                            {isAssigned && <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 font-black text-[9px] rounded-lg px-2">ASSIGNED</Badge>}
                          </div>
                        );
                      })}
                    </div>
                   )}
                 </div>
                 <div className="p-8 bg-slate-50">
                   <Button 
                    className="w-full h-14 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 disabled:opacity-30 transition-all hover:scale-[1.02]"
                    disabled={selectedCandidates.length === 0}
                    onClick={() => assignCandidatesMutation.mutate({ batchId: viewingBatchId, candidateIds: selectedCandidates })}
                   >
                     Deploy Selection
                   </Button>
                 </div>
               </CardContent>
            </Card>
          ) : (
            <Card className="border-none shadow-premium bg-gradient-to-br from-indigo-50 to-blue-50 p-12 rounded-[40px] text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="h-24 w-24 bg-white rounded-[32px] shadow-2xl shadow-indigo-200 flex items-center justify-center mb-8">
                <Grid3x3 className="h-10 w-10 text-indigo-500 animate-pulse" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-4">Command Inactive</h3>
              <p className="text-slate-500 font-medium max-w-[240px] mx-auto text-sm">Select a batch registry from the list to initiate candidate allocation protocols.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
