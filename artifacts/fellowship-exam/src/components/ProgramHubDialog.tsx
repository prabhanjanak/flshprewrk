import React from "react";
import { useProgram, Program } from "../contexts/ProgramContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  GraduationCap,
  Eye,
  Stethoscope,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Shield,
  Layers,
  FileCheck2,
  Users,
} from "lucide-react";

export function ProgramHubDialog() {
  const { programs, activeProgramId, setActiveProgramId, isHubOpen, setHubOpen } = useProgram();

  const handleSelect = (id: number) => {
    setActiveProgramId(id);
    setHubOpen(false);
  };

  const getProgramIcon = (category: string) => {
    switch (category) {
      case "fellowship":
        return <GraduationCap className="h-6 w-6 text-orange-600" />;
      case "vct":
        return <Eye className="h-6 w-6 text-blue-600" />;
      case "optometry":
        return <Stethoscope className="h-6 w-6 text-emerald-600" />;
      default:
        return <Layers className="h-6 w-6 text-purple-600" />;
    }
  };

  const getProgramColors = (category: string, isActive: boolean) => {
    if (isActive) {
      return "ring-2 ring-orange-500 bg-orange-50/20 border-orange-300 shadow-md";
    }
    switch (category) {
      case "fellowship":
        return "hover:border-orange-200 hover:bg-orange-50/10 hover:shadow-sm";
      case "vct":
        return "hover:border-blue-200 hover:bg-blue-50/10 hover:shadow-sm";
      default:
        return "hover:border-slate-300 hover:bg-slate-50/40 hover:shadow-sm";
    }
  };

  return (
    <Dialog open={isHubOpen} onOpenChange={setHubOpen}>
      <DialogContent className="max-w-3xl rounded-3xl p-6 md:p-8 bg-white border border-slate-200 shadow-2xl">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-[11px] font-bold tracking-wide uppercase">
              <Sparkles className="h-3.5 w-3.5 text-orange-600" />
              Sankara Academy of Vision
            </span>
          </div>
          <DialogTitle className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Academic Examination Suite Switcher
          </DialogTitle>
          <DialogDescription className="text-xs md:text-sm text-slate-500 font-medium">
            Each academic program runs in complete end-to-end segregation with dedicated applicant pools, exam pipelines, and merit allocations.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          {programs.map((prog) => {
            const isActive = prog.id === activeProgramId;
            const isFellowship = prog.category === "fellowship" || prog.name.toLowerCase().includes("fellowship");
            const isVCT = prog.category === "vct" || prog.name.toLowerCase().includes("vct") || prog.name.toLowerCase().includes("vision care");

            return (
              <div
                key={prog.id}
                onClick={() => handleSelect(prog.id)}
                className={`relative p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-4 bg-white ${getProgramColors(
                  prog.category,
                  isActive
                )}`}
              >
                {isActive && (
                  <div className="absolute top-4 right-4 flex items-center gap-1 text-orange-600 text-xs font-bold bg-orange-100/90 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Active Suite
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 shadow-2xs">
                      {getProgramIcon(prog.category)}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-slate-900 leading-snug">
                        {prog.name}
                      </h3>
                      <p className="text-xs font-mono font-bold text-slate-400">
                        Code: {prog.code} • {prog.academicYear}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {prog.description || (isFellowship
                      ? "Comprehensive subspecialty ophthalmology fellowship, MCQ test, psychometrics & clinical viva."
                      : isVCT
                      ? "Vision Care Technician vocational intake, theory assessments, and clinical station queue."
                      : "Academic intake and examination evaluation.")}
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {isFellowship && (
                      <>
                        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50">MCQ Exam</Badge>
                        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50">Mind Map</Badge>
                        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50">Panel Viva</Badge>
                        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50">Subspecialties</Badge>
                      </>
                    )}
                    {isVCT && (
                      <>
                        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50">VCT Exam</Badge>
                        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50">Station Viva</Badge>
                        <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50">Unit Allocation</Badge>
                      </>
                    )}
                  </div>
                </div>

                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(prog.id);
                  }}
                  className={`w-full h-10 rounded-xl font-bold text-xs gap-1.5 ${
                    isActive
                      ? "bg-slate-900 hover:bg-slate-800 text-white"
                      : "bg-orange-600 hover:bg-orange-700 text-white"
                  }`}
                >
                  {isActive ? "Currently Active" : "Launch Exam Portal"}
                  {!isActive && <ArrowRight className="h-3.5 w-3.5" />}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-slate-400" />
            Isolated Database & Pipeline Integrity
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHubOpen(false)}
            className="text-xs font-bold text-slate-500 hover:text-slate-900"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
