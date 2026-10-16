import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import logoUrl from "../assets/seh_sav_logo_1777703794142.jpg";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useProgram } from "../contexts/ProgramContext";
import { cn } from "../lib/utils";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardList,
  FileText,
  BarChart3,
  Stethoscope,
  LogOut,
  BookOpen,
  Building2,
  Award,
  ChevronRight,
  FormInput,
  Moon,
  Sun,
  UserCircle,
  Menu,
  X,
  Grid3x3,
  Trophy,
  CreditCard,
  Monitor,
  Mail,
  Activity,
  Sparkles,
} from "lucide-react";
import { Button } from "../components/ui/button";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: "Dashboard",                 href: "/",                  icon: LayoutDashboard, roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "unit_coordinator", "doctor", "student"] },
  { label: "Applications & Admissions", href: "/application-forms", icon: FormInput,       roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "unit_coordinator"] },
  { label: "Letters",                   href: "/letters",           icon: Award,           roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "unit_coordinator"] },
  { label: "Interview Evaluation",      href: "/interviews",        icon: Stethoscope,     roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "unit_coordinator", "doctor"] },
  { label: "User Management",           href: "/users",             icon: Users,           roles: ["super_admin"] },
  { label: "My Results",                href: "/results",           icon: FileText,        roles: ["student"] },
];

const roleLabel: Record<string, string> = {
  super_admin:              "Super Admin",
  exam_coordinator:         "Exam Coordinator",
  doctor:                   "Doctor",
  // Legacy aliases mapped directly to 3 canonical roles
  program_admin:            "Exam Coordinator",
  central_exam_coordinator: "Exam Coordinator",
  unit_coordinator:         "Exam Coordinator",
  student:                  "Candidate",
  display_operator:         "Display Operator",
};

function SidebarContent({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { user, logout } = useAuth();
  const { theme: rawTheme, toggleTheme } = useTheme();
  const { activeProgram, openProgramHub } = useProgram();
  const theme = rawTheme as any;
  const [location] = useLocation();

  if (!user) return null;

  const filtered = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <div className="flex flex-col h-full bg-[#0a1b33]">
      {/* Logo Section */}
      <div className={cn("p-5 border-b border-white/10", collapsed && "px-2 py-4")}>
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="SAV" className="h-10 w-10 rounded-xl object-contain bg-white p-1.5 flex-shrink-0 shadow-md ring-2 ring-white/10" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-bold text-white tracking-wider leading-tight truncate uppercase">Sankara Academy</p>
              <p className="text-[10px] text-white/50 tracking-widest truncate uppercase font-semibold">of Vision</p>
            </div>
          )}
        </div>
      </div>

      {/* Active Program Suite Switcher */}
      {!collapsed && (user.role === "super_admin" || user.role === "exam_coordinator" || user.role === "program_admin" || user.role === "central_exam_coordinator") && (
        <div className="px-4 py-3 border-b border-white/10 bg-white/5">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Active Suite
            </span>
            <button
              onClick={() => openProgramHub()}
              className="text-[10px] font-bold text-white/70 hover:text-white underline tracking-tight transition-colors cursor-pointer"
            >
              Switch
            </button>
          </div>
          <div
            onClick={() => openProgramHub()}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 cursor-pointer transition-all flex items-center justify-between group"
          >
            <div className="min-w-0 pr-1">
              <p className="text-xs font-black text-white truncate leading-tight group-hover:text-orange-300 transition-colors">
                {activeProgram ? activeProgram.name : "Select Program"}
              </p>
              <p className="text-[10px] font-mono text-white/50 truncate font-semibold">
                {activeProgram?.code || "No Program"}
              </p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-transform shrink-0" />
          </div>
        </div>
      )}

      {/* Nav Section */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto fancy-scrollbar">
        {filtered.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}>
              <div 
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-[14.5px] font-bold transition-all duration-300 cursor-pointer group relative overflow-hidden",
                  isActive
                    ? "bg-gradient-to-r from-[#ff7a00] to-[#e06600] text-white shadow-lg shadow-[#ff7a00]/25 scale-[1.02]"
                    : "text-white/75 hover:text-white hover:bg-gradient-to-r hover:from-[#ff7a00] hover:to-[#ff9f43] hover:shadow-md hover:shadow-[#ff7a00]/15 hover:scale-[1.02] active:scale-[0.98]",
                  collapsed && "px-2 justify-center rounded-2xl"
                )}
              >
                <item.icon className={cn("h-5 w-5 flex-shrink-0 transition-all duration-300", 
                  isActive ? "text-white scale-110 rotate-[6deg]" : "text-white/60 group-hover:text-white group-hover:scale-115 group-hover:rotate-[6deg]"
                )} />
                {!collapsed && (
                  <span className="flex-1 truncate transition-transform duration-300 group-hover:translate-x-1 tracking-tight">
                    {item.label}
                  </span>
                )}
                {!collapsed && isActive && <ChevronRight className="h-4 w-4 text-white/90 animate-pulse" />}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Profile Section */}
      <div className={cn("p-3.5 border-t border-white/10 space-y-1.5 bg-[#081528]/85", collapsed && "px-2")}>
        {!collapsed && (
          <div className="px-3.5 py-3 rounded-xl bg-white/5 border border-white/5 mb-2 shadow-inner">
            <p className="text-xs font-bold text-white tracking-wide truncate">{user.fullName}</p>
            <p className="text-[10px] text-[#ff7a00] font-black truncate tracking-wider uppercase mt-1">{roleLabel[user.role] ?? user.role}</p>
          </div>
        )}

        <Link href="/profile" onClick={onNavigate}>
          <div 
            title={collapsed ? "My Profile" : undefined}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 cursor-pointer",
              location === "/profile"
                ? "bg-gradient-to-r from-[#ff7a00] to-[#e06600] text-white shadow-lg"
                : "text-white/75 hover:text-white hover:bg-gradient-to-r hover:from-[#ff7a00] hover:to-[#ff9f43] hover:shadow-md",
              collapsed && "px-2 justify-center rounded-xl"
            )}
          >
            <UserCircle className="h-4.5 w-4.5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110" />
            {!collapsed && <span className="flex-1 tracking-wide">My Profile</span>}
          </div>
        </Link>


        <Button
          variant="ghost"
          size="sm"
          title={collapsed ? "Sign Out" : undefined}
          className={cn(
            "w-full justify-start text-white/60 hover:text-red-400 hover:bg-red-500/10 gap-2.5 h-9 text-xs font-medium",
            collapsed && "px-2 justify-center"
          )}
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && "Sign Out"}
        </Button>
      </div>
    </div>
  );
}

export default function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();

  useEffect(() => { setMobileOpen(false); }, [location]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <aside
        className={cn(
          "hidden md:flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 relative group/sidebar",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <SidebarContent collapsed={collapsed} />

        {/* Moving Bar Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "absolute -right-4 top-1/2 -translate-y-1/2 z-50 h-24 w-8 flex items-center justify-center transition-all duration-300 group/bar",
            "bg-sidebar-primary/10 hover:bg-sidebar-primary/20 rounded-l-none rounded-r-2xl border-y border-r border-sidebar-border"
          )}
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <div className={cn(
            "transition-transform duration-500",
            collapsed ? "rotate-0" : "rotate-180"
          )}>
            <ChevronRight className="h-5 w-5 text-sidebar-primary" />
          </div>
          {/* Pulsing indicator */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-1 bg-sidebar-primary/30 rounded-full group-hover/bar:bg-sidebar-primary/60 transition-colors" />
        </button>
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 h-14 bg-sidebar border-b border-sidebar-border shadow-sm">
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-sidebar-foreground hover:bg-sidebar-accent flex-shrink-0" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <img src={logoUrl} alt="SAV" className="h-7 w-7 rounded object-contain bg-white p-0.5 flex-shrink-0" />
          <span className="text-sm font-bold text-sidebar-foreground truncate">Sankara Academy of Vision</span>
        </div>
      </div>

      <div
        className={cn("md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300", mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")}
        onClick={() => setMobileOpen(false)}
      />

      <aside className={cn("md:hidden fixed top-0 left-0 z-50 h-full w-72 bg-sidebar border-r border-sidebar-border shadow-2xl", "transition-transform duration-300 ease-in-out", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="absolute top-3 right-3 z-10">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-sidebar-foreground/70 hover:bg-sidebar-accent" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}

