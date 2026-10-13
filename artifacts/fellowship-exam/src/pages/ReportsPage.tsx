import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import {
  Loader2,
  TrendingUp,
  Users,
  Award,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  Percent,
  TrendingDown,
  Info,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { motion, Variants } from "framer-motion";

interface ReportsStats {
  kpis: {
    totalApplicants: number;
    totalApproved: number;
    totalAllocated: number;
    totalPending: number;
    totalRevenue: number;
    conversionRate: number;
  };
  bySpecialization: Array<{
    id: number;
    name: string;
    code: string;
    seats: number;
    applicants: number;
    allocated: number;
    fillRate: number;
  }>;
  statusBreakdown: Array<{ name: string; value: number }>;
  timelineData: Array<{ date: string; count: number }>;
  scoreAverages: Array<{
    specialization: string;
    mcq: number;
    psychometric: number;
    interview: number;
  }>;
  recentAlerts: Array<{ type: string; message: string }>;
}

const DONUT_COLORS: Record<string, string> = {
  "Pending Review": "#fb923c", // Orange
  "Screening Passed": "#3b82f6", // Blue
  "Rejected": "#ef4444", // Red
  "Allocated": "#10b981", // Emerald
  "Waitlisted": "#a855f7", // Purple
};

const CHART_COLORS = ["#f97316", "#3b82f6", "#10b981", "#fb923c", "#a855f7"];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export default function ReportsPage() {
  const { data: stats, isLoading, error } = useQuery<ReportsStats>({
    queryKey: ["reports-stats"],
    queryFn: () => api.get<ReportsStats>("/reports/stats"),
  });

  const downloadCycleReport = async () => {
    try {
      const blob = await api.getBlob("/reports/cycle-report");
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Full_Cycle_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Report download failed:", error);
    }
  };

  const downloadDailyReport = async () => {
    try {
      const blob = await api.getBlob("/reports/daily-report");
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Daily_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Daily Report download failed:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-orange-600" />
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest animate-pulse">
            Analyzing Admissions Data...
          </p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center p-8 bg-red-50 rounded-2xl max-w-md border border-red-100">
          <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-red-900 mb-2">Failed to Load Report Data</h2>
          <p className="text-sm text-red-700">
            There was an error communicating with the API server. Please ensure the backend is running and try again.
          </p>
        </div>
      </div>
    );
  }

  const { kpis, bySpecialization, statusBreakdown, timelineData, scoreAverages, recentAlerts } = stats;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-6 space-y-6"
    >
      {/* Header Section */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-orange-950 to-orange-800 bg-clip-text text-transparent">
            Analytics & Reports
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time insights, academic scores, entrance performance metrics, and seat allocations.
          </p>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={downloadCycleReport}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:pointer-events-none disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] border-none min-h-9 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white font-black uppercase tracking-widest text-[11px] shadow-lg shadow-orange-500/20"
          >
            <FileText className="h-4 w-4" /> Download Cycle Report
          </button>
          <button
            onClick={downloadDailyReport}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 disabled:pointer-events-none disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] border border-slate-200 min-h-9 px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-black uppercase tracking-widest text-[11px] shadow-sm"
          >
            <Calendar className="h-4 w-4 text-orange-600" /> Download Daily Report
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          {
            label: "Total Applicants",
            value: kpis.totalApplicants,
            icon: Users,
            color: "text-orange-600",
            bg: "bg-orange-50/50",
            border: "border-orange-100/50",
            desc: "Unique registered applicants",
          },
          {
            label: "Allotted Selections",
            value: kpis.totalAllocated,
            icon: Award,
            color: "text-emerald-600",
            bg: "bg-emerald-50/50",
            border: "border-emerald-100/50",
            desc: `Conversion Rate: ${kpis.conversionRate}%`,
          },
          {
            label: "Awaiting Review",
            value: kpis.totalPending,
            icon: AlertCircle,
            color: "text-amber-600",
            bg: "bg-amber-50/50",
            border: "border-amber-100/50",
            desc: "Applications in pending review",
          },
          {
            label: "Total Revenue",
            value: `₹${kpis.totalRevenue.toLocaleString("en-IN")}`,
            icon: Percent,
            color: "text-blue-600",
            bg: "bg-blue-50/50",
            border: "border-blue-100/50",
            desc: "Application fees received",
          },
        ].map((stat, i) => (
          <motion.div key={i} variants={itemVariants}>
            <Card className={`overflow-hidden border shadow-sm hover:shadow-md transition-shadow ${stat.border}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</p>
                    <p className={`text-3xl font-extrabold mt-2 ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-slate-400 font-medium mt-1">{stat.desc}</p>
                  </div>
                  <div className={`p-3.5 rounded-2xl ${stat.bg}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Dynamic Smart Database Alerts */}
      <motion.div variants={itemVariants}>
        <Card className="border-orange-100/60 bg-gradient-to-br from-orange-50/10 to-amber-50/20">
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-600" /> Operational Insights & Action Items
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-5">
            {recentAlerts.map((alert, index) => {
              const Icon = alert.type === "critical" ? AlertCircle : alert.type === "warning" ? AlertTriangle : alert.type === "success" ? CheckCircle : Info;
              const badgeVariant = alert.type === "critical" ? "destructive" : alert.type === "warning" ? "secondary" : "outline";
              return (
                <div key={index} className="p-3 bg-white rounded-xl border border-slate-100 flex items-start gap-3 shadow-sm hover:shadow-md transition-all">
                  <div className={`p-1.5 rounded-lg mt-0.5 ${alert.type === "critical" ? "bg-red-50 text-red-600" : alert.type === "warning" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <Badge variant={badgeVariant} className="text-[9px] uppercase tracking-widest font-black mb-1">
                      {alert.type}
                    </Badge>
                    <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                      {alert.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* Row 1 Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Speciality Seat Metrics (Bar Chart) */}
        <motion.div variants={itemVariants} className="md:col-span-2">
          <Card className="shadow-sm border border-slate-100">
            <CardHeader className="flex flex-row justify-between items-center">
              <div>
                <CardTitle className="text-lg font-bold text-slate-800">Specialization Seat Fill Rate</CardTitle>
                <CardDescription>Visual comparison of Applicants vs Allotted Selections vs Available Seats.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="h-[360px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySpecialization} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '16px', border: '1px solid #f1f5f9', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  <Bar dataKey="applicants" name="Applicants" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="allocated" name="Allotted Selections" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="seats" name="Seat Capacity" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Status Distribution (Pie Chart) */}
        <motion.div variants={itemVariants}>
          <Card className="shadow-sm border border-slate-100 h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-slate-800">Application Pipeline</CardTitle>
              <CardDescription>Conversion stages breakdown.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center pb-6">
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {statusBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={DONUT_COLORS[entry.name] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2 max-w-[280px] mx-auto w-full">
                {statusBreakdown.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DONUT_COLORS[item.name] || "#94a3b8" }} />
                      <span className="text-slate-600 font-medium">{item.name}</span>
                    </div>
                    <span className="font-extrabold text-slate-800">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Row 2 Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Timeline of Submissions (Area Chart) */}
        <motion.div variants={itemVariants}>
          <Card className="shadow-sm border border-slate-100">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-slate-800">Application Submission Trend</CardTitle>
              <CardDescription>Historical application volume (last 15 active days).</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] pt-4">
              {timelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9' }} />
                    <Area type="monotone" dataKey="count" name="Applications" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  No submissions recorded yet.
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Average Test Scores by Specialization (Bar Chart) */}
        <motion.div variants={itemVariants}>
          <Card className="shadow-sm border border-slate-100">
            <CardHeader>
              <CardTitle className="text-lg font-bold text-slate-800">Academic Score Benchmarks</CardTitle>
              <CardDescription>Specialty performance comparing MCQ, Psychometric & Interview averages.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreAverages} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="specialization" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #f1f5f9' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  <Bar dataKey="mcq" name="MCQ Average" fill="#f97316" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="psychometric" name="Psychometric Average" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="interview" name="Interview Average" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Row 3 - Seat Matrix Detailed breakdown Table */}
      <motion.div variants={itemVariants}>
        <Card className="shadow-sm border border-slate-100">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-slate-800">Specialization Matrix & Allocation Breakdown</CardTitle>
            <CardDescription>Comprehensive seat distribution and allocation metrics.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-black uppercase tracking-widest text-[10px] bg-slate-50/50">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Specialization</th>
                  <th className="py-3 px-4 text-center">Applicants</th>
                  <th className="py-3 px-4 text-center">Allotted Selections</th>
                  <th className="py-3 px-4 text-center">Total Seats</th>
                  <th className="py-3 px-4">Seat Fill Progress</th>
                  <th className="py-3 px-4 text-right">Fill Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-700 text-sm font-semibold">
                {bySpecialization.map((spec) => {
                  const progressColor = spec.fillRate >= 80 ? "bg-emerald-500" : spec.fillRate >= 40 ? "bg-amber-500" : "bg-slate-300";
                  return (
                    <tr key={spec.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs text-orange-600">{spec.code}</td>
                      <td className="py-3.5 px-4 text-slate-900">{spec.name}</td>
                      <td className="py-3.5 px-4 text-center text-slate-500">{spec.applicants}</td>
                      <td className="py-3.5 px-4 text-center text-emerald-600 font-bold">{spec.allocated}</td>
                      <td className="py-3.5 px-4 text-center text-slate-900">{spec.seats}</td>
                      <td className="py-3.5 px-4 min-w-[150px]">
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${Math.min(spec.fillRate, 100)}%` }} />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-900 font-extrabold">{spec.fillRate}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
