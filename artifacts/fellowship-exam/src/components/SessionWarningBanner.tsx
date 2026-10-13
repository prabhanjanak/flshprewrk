import { useAuth } from "../contexts/AuthContext";
import { ShieldAlert, RefreshCw, LogOut, Clock } from "lucide-react";
import { Button } from "./ui/button";

export function SessionWarningBanner() {
  const { sessionWarning, secondsRemaining, extendSession, logout } = useAuth();

  if (!sessionWarning) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeDisplay = `${minutes}:${String(seconds).padStart(2, "0")}`;

  // Color shifts from amber → red as time runs out
  const isUrgent = secondsRemaining < 60;

  return (
    <div
      className={`fixed bottom-6 right-6 z-[9999] w-[360px] rounded-2xl shadow-2xl border overflow-hidden transition-all duration-500 animate-in slide-in-from-bottom-4 fade-in
        ${isUrgent
          ? "bg-red-50 border-red-300 shadow-red-100"
          : "bg-amber-50 border-amber-300 shadow-amber-100"
        }`}
    >
      {/* Progress bar at top */}
      <div className={`h-1 w-full ${isUrgent ? "bg-red-100" : "bg-amber-100"}`}>
        <div
          className={`h-full transition-all duration-1000 ease-linear ${isUrgent ? "bg-red-500" : "bg-amber-500"}`}
          style={{ width: `${Math.min(100, ((120 - secondsRemaining) / 120) * 100)}%` }}
        />
      </div>

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isUrgent ? "bg-red-100" : "bg-amber-100"}`}>
            <ShieldAlert className={`h-5 w-5 ${isUrgent ? "text-red-600 animate-pulse" : "text-amber-600"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-black text-sm tracking-wide ${isUrgent ? "text-red-800" : "text-amber-900"}`}>
              Session Expiring Soon
            </p>
            <p className={`text-xs font-medium mt-0.5 leading-relaxed ${isUrgent ? "text-red-600" : "text-amber-700"}`}>
              You'll be logged out due to inactivity.
            </p>
          </div>
          {/* Countdown clock */}
          <div className={`flex-shrink-0 flex flex-col items-center justify-center w-16 h-14 rounded-xl border-2 font-black tabular-nums
            ${isUrgent
              ? "bg-red-100 border-red-300 text-red-700"
              : "bg-amber-100 border-amber-300 text-amber-700"
            }`}
          >
            <Clock className="h-3 w-3 mb-0.5 opacity-60" />
            <span className="text-xl leading-none">{timeDisplay}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2.5">
          <Button
            onClick={extendSession}
            className={`flex-1 h-10 gap-2 text-xs font-black uppercase tracking-wider rounded-xl shadow-sm transition-all active:scale-95
              ${isUrgent
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-amber-500 hover:bg-amber-600 text-white"
              }`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Stay Logged In
          </Button>
          <Button
            onClick={logout}
            variant="outline"
            className={`h-10 px-4 text-xs font-bold uppercase tracking-wider rounded-xl transition-all active:scale-95
              ${isUrgent
                ? "border-red-200 text-red-700 hover:bg-red-50"
                : "border-amber-200 text-amber-700 hover:bg-amber-50"
              }`}
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
