import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  Grid3x3,
  Search,
  Loader2,
  X,
  Building2,
  Sparkles,
  CheckCircle2,
  Users,
} from "lucide-react";

interface SeatCell {
  total: number;
  allocated: number;
}

interface MatrixRow {
  speciality: string;
  seats: Record<string, SeatCell>;
  total: number;
  totalAllocated: number;
}

interface Matrix {
  units: string[];
  rows: MatrixRow[];
  source: "db" | "excel";
}

interface SeatMatrixModalProps {
  open: boolean;
  onClose: () => void;
  programId?: number | null;
}

export function SeatMatrixModal({ open, onClose, programId }: SeatMatrixModalProps) {
  const [search, setSearch] = useState("");

  const { data: matrix, isLoading } = useQuery<Matrix>({
    queryKey: ["seat-matrix-modal", programId],
    queryFn: () => api.get<Matrix>(`/seat-matrix${programId ? `?programId=${programId}` : ""}`),
    enabled: open,
    staleTime: 10000,
  });

  const units = matrix?.units || [];
  const rows = matrix?.rows || [];

  const totalSeats = rows.reduce((acc, r) => acc + (r.total || 0), 0);
  const totalAllocated = rows.reduce((acc, r) => acc + (r.totalAllocated || 0), 0);
  const totalVacancies = Math.max(0, totalSeats - totalAllocated);

  const filteredRows = rows.filter((r) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    if (r.speciality.toLowerCase().includes(term)) return true;
    return units.some((u) => u.toLowerCase().includes(term));
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[90vh] p-0 rounded-[28px] overflow-hidden border border-slate-200 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <DialogHeader className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-6 py-4.5 shrink-0 border-b border-white/10 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Grid3x3 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg font-black text-white tracking-tight">
                  Fellowship Seat Matrix & Live Vacancies
                </DialogTitle>
                <Badge className="bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[10px] font-bold px-2">
                  Doctor / Panel View
                </Badge>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                Check available fellowship quotas, center distribution, and current vacancies.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10 rounded-full h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto fancy-scrollbar flex-1">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">Total Sanctioned Seats</p>
                <p className="text-2xl font-black text-indigo-950 mt-0.5">{totalSeats}</p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                <Users className="h-5 w-5" />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">Allocated / Filled</p>
                <p className="text-2xl font-black text-emerald-950 mt-0.5">{totalAllocated}</p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-amber-700 tracking-wider">Remaining Vacancies</p>
                <p className="text-2xl font-black text-amber-950 mt-0.5">{totalVacancies}</p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <Sparkles className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Filter by subspecialty or unit..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs rounded-xl border-slate-200 bg-slate-50 font-medium"
              />
            </div>
            <p className="text-xs text-slate-500 font-semibold">
              Showing {filteredRows.length} subspecialties across {units.length} hospital units
            </p>
          </div>

          {/* Matrix Table */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin text-orange-500" />
              <p className="text-xs font-bold">Loading live seat matrix data...</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-slate-400 space-y-2">
              <Grid3x3 className="h-10 w-10 mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-600">No seat matrix records found</p>
              <p className="text-xs text-slate-400">Please verify with the exam coordinator.</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left font-black text-slate-700 uppercase tracking-wider py-3 px-4 min-w-[200px] sticky left-0 bg-slate-50 z-10">
                        Subspecialty Stream
                      </th>
                      {units.map((unit) => (
                        <th key={unit} className="text-center font-black text-slate-700 uppercase tracking-wider py-3 px-3 min-w-[110px]">
                          <span className="block truncate" title={unit}>{unit}</span>
                        </th>
                      ))}
                      <th className="text-center font-black text-slate-900 uppercase tracking-wider py-3 px-3 bg-slate-100 min-w-[90px]">
                        Total
                      </th>
                      <th className="text-center font-black text-emerald-800 uppercase tracking-wider py-3 px-3 bg-emerald-50/70 min-w-[90px]">
                        Allocated
                      </th>
                      <th className="text-center font-black text-amber-800 uppercase tracking-wider py-3 px-3 bg-amber-50/70 min-w-[90px]">
                        Vacant
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row) => {
                      const vacant = Math.max(0, row.total - row.totalAllocated);
                      return (
                        <tr key={row.speciality} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-2.5 px-4 font-bold text-slate-800 sticky left-0 bg-white group-hover:bg-slate-50/60 z-10 border-r border-slate-100">
                            {row.speciality}
                          </td>
                          {units.map((unit) => {
                            const cell = row.seats[unit] || { total: 0, allocated: 0 };
                            const cellVacant = Math.max(0, cell.total - cell.allocated);
                            return (
                              <td key={unit} className="py-2.5 px-3 text-center">
                                {cell.total > 0 ? (
                                  <div className="inline-flex flex-col items-center">
                                    <span className="font-bold text-slate-800">{cell.total}</span>
                                    <span className={`text-[10px] font-bold ${cellVacant > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                                      {cellVacant > 0 ? `${cellVacant} Vacant` : "Filled"}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-semibold">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-center font-black text-slate-900 bg-slate-50/50">
                            {row.total}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-emerald-700 bg-emerald-50/30">
                            {row.totalAllocated}
                          </td>
                          <td className="py-2.5 px-3 text-center bg-amber-50/30">
                            <Badge
                              className={`text-[10px] font-black px-1.5 py-0.5 border ${
                                vacant > 0
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              {vacant > 0 ? `${vacant} Open` : "0 Open"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between px-6">
          <p className="text-[11px] text-slate-500 font-medium">
            💡 Quotas are managed centrally by the Fellowship Exam Coordinator & Administration.
          </p>
          <Button
            size="sm"
            onClick={onClose}
            className="h-8 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs"
          >
            Close Seat Matrix
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
