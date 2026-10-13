import {
  ShieldCheck,
  Briefcase,
  ClipboardList,
  Building2,
  Stethoscope,
  GraduationCap,
  User,
} from "lucide-react";

const ROLE_CONFIG: Record<
  string,
  { Icon: React.ElementType; bg: string; iconColor: string; ring: string }
> = {
  super_admin: {
    Icon: ShieldCheck,
    bg: "bg-gradient-to-br from-red-500 to-rose-700",
    iconColor: "text-white",
    ring: "ring-red-200",
  },
  program_admin: {
    Icon: Briefcase,
    bg: "bg-gradient-to-br from-orange-400 to-orange-600",
    iconColor: "text-white",
    ring: "ring-orange-200",
  },
  central_exam_coordinator: {
    Icon: ClipboardList,
    bg: "bg-gradient-to-br from-blue-500 to-blue-700",
    iconColor: "text-white",
    ring: "ring-blue-200",
  },
  unit_coordinator: {
    Icon: Building2,
    bg: "bg-gradient-to-br from-teal-500 to-cyan-700",
    iconColor: "text-white",
    ring: "ring-teal-200",
  },
  doctor: {
    Icon: Stethoscope,
    bg: "bg-gradient-to-br from-violet-500 to-purple-700",
    iconColor: "text-white",
    ring: "ring-violet-200",
  },
  student: {
    Icon: GraduationCap,
    bg: "bg-gradient-to-br from-slate-500 to-slate-700",
    iconColor: "text-white",
    ring: "ring-slate-200",
  },
};

const SIZE_CONFIG = {
  xs: { wrapper: "w-7 h-7", icon: "h-3.5 w-3.5" },
  sm: { wrapper: "w-9 h-9", icon: "h-4 w-4" },
  md: { wrapper: "w-12 h-12", icon: "h-5 w-5" },
  lg: { wrapper: "w-20 h-20", icon: "h-9 w-9" },
  xl: { wrapper: "w-28 h-28", icon: "h-12 w-12" },
};

interface RoleAvatarProps {
  role: string;
  size?: keyof typeof SIZE_CONFIG;
  className?: string;
  showRing?: boolean;
}

export function RoleAvatar({
  role,
  size = "sm",
  className = "",
  showRing = false,
}: RoleAvatarProps) {
  const config = ROLE_CONFIG[role] ?? {
    Icon: User,
    bg: "bg-gradient-to-br from-gray-400 to-gray-600",
    iconColor: "text-white",
    ring: "ring-gray-200",
  };
  const sizeConfig = SIZE_CONFIG[size];
  const { Icon, bg, iconColor, ring } = config;

  return (
    <div
      className={[
        sizeConfig.wrapper,
        bg,
        "rounded-xl flex items-center justify-center shrink-0 shadow-sm",
        showRing ? `ring-2 ${ring}` : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon className={[sizeConfig.icon, iconColor].join(" ")} strokeWidth={1.8} />
    </div>
  );
}
