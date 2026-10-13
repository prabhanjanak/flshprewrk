import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import logoUrl from "../assets/seh_sav_logo_1777703794142.jpg";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
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
} from "lucide-react";
import { Button } from "../components/ui/button";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: "Dashboard",         href: "/",                  icon: LayoutDashboard, roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "unit_coordinator", "doctor", "student"] },
  { label: "Programs",          href: "/programs",           icon: GraduationCap,   roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator"] },
  { label: "Units",             href: "/units",              icon: Building2,       roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "unit_coordinator"] },
  { label: "Users",             href: "/users",              icon: Users,           roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator"] },
  { label: "Application Forms", href: "/application-forms", icon: FormInput,       roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator"] },
  { label: "Candidates",        href: "/candidates",         icon: ClipboardList,   roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "unit_coordinator"] },
  { label: "Exams",             href: "/exams",              icon: BookOpen,        roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "student"] },
  { label: "Interviews",        href: "/interviews",         icon: Stethoscope,     roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "unit_coordinator", "doctor"] },
  { label: "Seat Matrix",       href: "/seat-matrix",        icon: Grid3x3,         roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator", "unit_coordinator"] },
  { label: "Rankings",          href: "/rankings",           icon: Trophy,          roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator"] },
  { label: "Allocations",       href: "/allocations",        icon: Award,           roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator"] },
  { label: "Payments",          href: "/payments",           icon: CreditCard,      roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator"] },
  { label: "Batches",           href: "/batches",            icon: Grid3x3,         roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator"] },
  { label: "Reports",           href: "/reports",            icon: BarChart3,       roles: ["super_admin", "program_admin", "central_exam_coordinator", "exam_coordinator"] },
  { label: "My Results",        href: "/results",            icon: FileText,        roles: ["student"] },
  { label: "Waiting Hall (TV)",   href: "/tv",              icon: Monitor,         roles: ["super_admin", "program_admin", "central_exam_coordinator", "display_operator"] },
  { label: "Active Sessions",     href: "/active-sessions",    icon: Activity,        roles: ["super_admin", "program_admin", "central_exam_coordinator"] },
];

const roleLabel: Record<string, string> = {
  super_admin:              "Super Admin",
  program_admin:            "Program Admin",
  central_exam_coordinator: "Central Exam Coordinator",
  exam_coordinator:         "Exam Coordinator",
  unit_coordinator:         "Unit Coordinator",
  doctor:                   "Doctor / Interviewer",
  student:                  "Candidate",
  display_operator:         "Display Operator",
};

function SidebarContent({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();

  if (!user) return null;

  const filtered = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn("p-4 border-b border-sidebar-border", collapsed && "px-2")}>
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="SAV" className="h-10 w-10 rounded-lg object-contain bg-white p-1 flex-shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-bold text-sidebar-foreground leading-tight truncate">Sankara Academy</p>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">of Vision</p>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto custom-scrollbar">
        {filtered.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}>
              <div 
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer group",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed && "px-2 justify-center"
                )}
              >
                <item.icon className={cn("h-4 w-4 flex-shrink-0", isActive ? "text-inherit" : "text-sidebar-foreground/50 group-hover:text-inherit")} />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!collapsed && isActive && <ChevronRight className="h-3 w-3 opacity-70" />}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className={cn("p-3 border-t border-sidebar-border space-y-1", collapsed && "px-2")}>
        {!collapsed && (
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-sidebar-foreground truncate">{user.fullName}</p>
            <p className="text-[10px] text-sidebar-primary truncate">{roleLabel[user.role] ?? user.role}</p>
          </div>
        )}

        <Link href="/profile" onClick={onNavigate}>
          <div 
            title={collapsed ? "My Profile" : undefined}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
              location === "/profile"
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "px-2 justify-center"
            )}
          >
            <UserCircle className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span className="flex-1">My Profile</span>}
          </div>
        </Link>


        <Button
          variant="ghost"
          size="sm"
          title={collapsed ? "Sign Out" : undefined}
          className={cn(
            "w-full justify-start text-sidebar-foreground/70 hover:text-red-400 hover:bg-red-400/10 gap-2",
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
          "hidden md:flex flex-col min-h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 relative group/sidebar",
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
