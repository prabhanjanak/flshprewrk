import { useState, useEffect } from "react";
import logoUrl from "../assets/seh_sav_logo_1777703794142.jpg";
import goldenJubileeLogoUrl from "../assets/golden_jubilee_logo.png";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { 
  Loader2, Eye, EyeOff, PhoneCall, ShieldCheck, Mail, Lock, Sparkles, 
  ArrowRight, Award, Stethoscope, GraduationCap, Building,
  KeyRound, ShieldAlert, HeartHandshake, UserCheck
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [systemIp, setSystemIp] = useState("");

  useEffect(() => {
    fetch("/api/system-ip")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.ip) {
          setSystemIp(data.ip);
        }
      })
      .catch((err) => console.warn("Failed to fetch system IP:", err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden bg-[#f8fafc] text-slate-900 flex flex-col justify-between selection:bg-[#0b4a8f] selection:text-white">
      {/* Subtle Light Mode Ambient Grid & Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-blue-100/60 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-[550px] h-[550px] bg-orange-100/60 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 left-1/4 w-[700px] h-[500px] bg-slate-200/50 rounded-full blur-[160px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f080_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f080_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Top Floating Branding Header */}
      <header className="relative z-10 w-full px-6 lg:px-12 py-3.5 sm:py-4 flex items-center justify-between border-b border-slate-200/90 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="bg-white p-2 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-center">
            <img 
              src={logoUrl} 
              alt="Sankara Academy of Vision & Sankara Eye Foundation" 
              className="h-12 sm:h-16 md:h-18 w-auto max-w-[320px] sm:max-w-[420px] object-contain transition-all"
            />
          </div>
          <div className="hidden xl:block h-10 w-[1px] bg-slate-200" />
          <div className="hidden xl:block">
            <span className="text-xs font-black tracking-widest uppercase text-[#0b4a8f] block leading-none">
              Central Admissions & Examination Portal
            </span>
            <span className="text-[10px] font-bold tracking-wider text-slate-500 block mt-1">
              Sri Kanchi Kamakoti Medical Trust
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10.5px] font-black uppercase tracking-widest shadow-2xs">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span>Admissions 2026 Live</span>
          </div>
          {systemIp && (
            <div className="hidden md:flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10.5px] font-mono font-bold">
              <span>IP: {systemIp}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Split Grid */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-8 py-10">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          
          {/* Left Column: Academic Dossier & Milestones */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7 }}
            className="lg:col-span-6 space-y-7 text-left"
          >
            {/* Golden Jubilee Milestone Card */}
            <div className="inline-flex items-center gap-4 p-2.5 pr-6 rounded-2xl bg-gradient-to-r from-amber-50 via-yellow-50/70 to-white border border-amber-200 shadow-sm">
              <div className="w-14 h-14 rounded-xl bg-white p-1 flex items-center justify-center border border-amber-300 shrink-0 shadow-xs">
                <img src={goldenJubileeLogoUrl} alt="Golden Jubilee" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-700">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                  Golden Jubilee Milestone
                </div>
                <p className="text-xs font-black text-slate-900 mt-0.5">
                  50 Years of Social Impact & <span className="text-amber-800">3 Million Free Eye Surgeries</span>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 leading-[1.15]">
                Centralized <br />
                <span className="text-[#0b4a8f]">Fellowship Admissions</span> <br />
                & Examination Portal
              </h1>
              <p className="text-sm font-medium text-slate-600 leading-relaxed max-w-lg">
                Official institutional system for subspecialty fellowship admissions, candidate verification, psychometry assessment, evaluator scoring, and national merit rank sheets.
              </p>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-2 gap-3.5 pt-1">
              {[
                { icon: Stethoscope, title: "Subspecialty Streams", desc: "Cornea, Retina, Glaucoma, Paediatrics & more" },
                { icon: GraduationCap, title: "Centralized Examination", desc: "Online MCQ, Psychometry & Clinical Viva" },
                { icon: Award, title: "Speciality Merit Ranking", desc: "Automated ranking with score breakdown" },
                { icon: Building, title: "Multi-Center Allocation", desc: "Bangalore, Coimbatore, Kanpur & across India" },
              ].map((item, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md hover:border-slate-300 transition-all">
                  <item.icon className="w-5 h-5 text-[#0b4a8f] mb-2" />
                  <h4 className="text-xs font-black text-slate-900">{item.title}</h4>
                  <p className="text-[10.5px] text-slate-500 font-medium mt-0.5 leading-snug">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* Trust Footer */}
            <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest pt-1">
              <span className="flex items-center gap-1.5 text-emerald-700 font-black">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                256-Bit Encrypted
              </span>
              <span>•</span>
              <span>Sri Kanchi Kamakoti Medical Trust</span>
            </div>
          </motion.div>

          {/* Right Column: Clean White Authentication Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="lg:col-span-6 w-full max-w-md mx-auto"
          >
            <Card className="relative rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.08)] overflow-hidden border-t-4 border-t-[#0b4a8f]">
              <CardContent className="p-8 sm:p-9 space-y-6">
                <div className="space-y-1.5 text-center">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#0b4a8f] text-[10px] font-black uppercase tracking-widest mb-1">
                    <KeyRound className="w-3 h-3 text-[#0b4a8f]" />
                    Authorized Access
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Portal Sign-in</h2>
                  <p className="text-xs text-slate-500 font-medium">Enter your institutional credentials to continue</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                      >
                        <Alert className="bg-red-50 border-red-200 text-red-800 rounded-2xl border p-3.5">
                          <AlertDescription className="text-xs font-bold text-center flex items-center justify-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                            {error}
                          </AlertDescription>
                        </Alert>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="space-y-4">
                    {/* Email Input */}
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-slate-600 pl-1">
                        Credential ID / Email Address
                      </Label>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                          <Mail className="w-4 h-4" />
                        </div>
                        <Input
                          id="email"
                          type="email"
                          placeholder="name@sankaraeye.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="h-12 pl-13 rounded-xl bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[#0b4a8f] focus:ring-2 focus:ring-[#0b4a8f]/20 text-xs font-bold transition-all"
                        />
                      </div>
                    </div>

                    {/* Password Input */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between pl-1">
                        <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                          Password Key
                        </Label>
                        <button
                          type="button"
                          onClick={() => setForgotOpen(true)}
                          className="text-[10px] font-black uppercase tracking-widest text-[#0b4a8f] hover:underline transition-all"
                        >
                          Help & Recovery
                        </button>
                      </div>
                      <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
                          <Lock className="w-4 h-4" />
                        </div>
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="h-12 pl-13 pr-11 rounded-xl bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[#0b4a8f] focus:ring-2 focus:ring-[#0b4a8f]/20 text-xs font-bold transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-xl bg-[#0b4a8f] hover:bg-[#08386b] text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-900/15 border-none transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying Credentials...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>Sign In to Examination Portal</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    )}
                  </Button>
                </form>
              </CardContent>

              <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>SAV Central Examination System Active</span>
              </div>
            </Card>
          </motion.div>
        </div>
      </main>

      {/* Global Light Footer */}
      <footer className="relative z-10 w-full py-5 px-6 border-t border-slate-200 text-center space-y-1 bg-white/70 backdrop-blur-md">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
          Sri Kanchi Kamakoti Medical Trust · Sankara Eye Hospitals, India
        </p>
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
          Developed & Maintained by Department of Information Systems
        </p>
      </footer>

      {/* Institutional Recovery Support Modal */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-md rounded-[24px] bg-white border border-slate-200 p-8 shadow-2xl text-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl font-black text-slate-900">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#0b4a8f] border border-blue-200">
                <PhoneCall className="w-5 h-5" />
              </div>
              System Credentials Support
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-3">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#0b4a8f] bg-blue-100/60 px-3 py-1 rounded-full border border-blue-200">
                <HeartHandshake className="w-3.5 h-3.5" />
                Security Protocol Notice
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                For administrative integrity, fellowship portal credentials and password resets are managed directly by the Chief System Administrator.
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 space-y-2 border border-slate-200">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">Lead System Administrator</span>
                <span className="text-base font-black text-slate-900 block mt-0.5">Mr. Prabhanjan</span>
              </div>
              <a 
                href="mailto:prabhanjan@sankaraeye.com" 
                className="inline-flex items-center gap-2 text-xs font-bold text-[#0b4a8f] hover:underline transition-colors"
              >
                <Mail className="w-4 h-4" />
                prabhanjan@sankaraeye.com
              </a>
            </div>

            <Button 
              className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-widest text-xs" 
              onClick={() => setForgotOpen(false)}
            >
              Close Window
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
