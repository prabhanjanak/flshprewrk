import { useState } from "react";
import logoUrl from "../assets/seh_sav_logo_1777703794142.jpg";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Loader2, Eye, EyeOff, HelpCircle, PhoneCall, ShieldCheck, Mail, Lock, Sparkles, ArrowRight } from "lucide-react";
import ParticleCanvas from "../components/ParticleCanvas";
import { motion, AnimatePresence } from "framer-motion";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden bg-[#f8fafc]">
      {/* Dynamic Animated Background Blobs */}
      <div className="absolute inset-0 z-0">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            x: [0, 50, 0],
            y: [0, -30, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-10%] left-[-5%] w-[60%] h-[60%] bg-orange-200/50 rounded-full blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            x: [0, -40, 0],
            y: [0, 40, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] bg-purple-200/40 rounded-full blur-[120px]" 
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            x: [0, 30, 0],
            y: [0, 60, 0]
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-10%] left-[10%] w-[50%] h-[50%] bg-blue-200/40 rounded-full blur-[120px]" 
        />
      </div>
      
      <ParticleCanvas count={45} color="255, 122, 0" connectionColor="255, 159, 67" maxDistance={150} opacity={0.25} />

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[550px] space-y-10"
      >
        {/* Branding Section */}
        <div className="text-center space-y-8">
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="relative inline-block group cursor-pointer"
          >
            <div className="absolute -inset-2 bg-gradient-to-r from-orange-500 via-purple-500 to-blue-500 rounded-[2.5rem] blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
            <img 
              src={logoUrl} 
              alt="Sankara Eye Foundation" 
              className="relative w-full h-auto max-h-36 mx-auto rounded-[2rem] shadow-2xl object-contain bg-white p-6 transition-all duration-500" 
            />
          </motion.div>
          
          <div className="space-y-3">
            <h1 className="text-5xl font-black tracking-tighter uppercase italic leading-none flex flex-col items-center gap-0">
              <span className="text-orange-600">Sankara</span>
              <span className="text-slate-900 text-lg tracking-widest uppercase not-italic font-black opacity-80 mt-1">Academy of Vision</span>
            </h1>
            <div className="flex items-center justify-center gap-3">
              <div className="h-[2px] w-12 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50" />
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.5em] opacity-80">Fellowship Operations</p>
              <div className="h-[2px] w-12 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-50" />
            </div>
          </div>
        </div>

        {/* Interactive Login Card */}
        <motion.div
          whileHover={{ y: -5 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <Card className="relative border-slate-200 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.1)] bg-white/95 backdrop-blur-3xl rounded-[3rem] overflow-hidden border-t-4 border-t-orange-500">
            <CardContent className="p-12 pt-14 space-y-10">
              <div className="space-y-4 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 text-slate-800 text-[10px] font-black uppercase tracking-widest border border-slate-200 shadow-sm">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                  Authorized Personnel Only
                </div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">System Login</h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-8">
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <Alert className="bg-red-50 border-red-200 text-red-700 rounded-2xl border-l-4 animate-in shake-in duration-500 shadow-sm overflow-hidden">
                        <AlertDescription className="text-xs font-black text-center uppercase tracking-wide py-1">{error}</AlertDescription>
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-6">
                  <div className="space-y-2 group/input">
                    <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-slate-600 ml-2 group-focus-within/input:text-orange-600 transition-colors">Credential ID (Email)</Label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-orange-100/50 flex items-center justify-center transition-all group-focus-within/input:bg-orange-500 group-focus-within/input:scale-110 shadow-sm">
                        <Mail className="h-4 w-4 text-orange-600 group-focus-within/input:text-white transition-colors" />
                      </div>
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="you@sankaraeye.com" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required 
                        className="h-16 pl-16 rounded-[1.5rem] bg-white border-slate-200 text-slate-900 placeholder:text-slate-300 focus:ring-orange-500/10 focus:border-orange-500/50 transition-all text-sm font-bold shadow-sm" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2 group/input">
                    <div className="flex items-center justify-between ml-2">
                      <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-slate-600 group-focus-within/input:text-blue-600 transition-colors">Secure Key</Label>
                      <button type="button" className="text-[10px] font-black uppercase tracking-widest text-purple-600 hover:text-purple-700 hover:underline transition-all" onClick={() => setForgotOpen(true)}>Recovery</button>
                    </div>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-blue-100/50 flex items-center justify-center transition-all group-focus-within/input:bg-blue-600 group-focus-within/input:scale-110 shadow-sm">
                        <Lock className="h-4 w-4 text-blue-600 group-focus-within/input:text-white transition-colors" />
                      </div>
                      <Input 
                        id="password" 
                        type={showPassword ? "text" : "password"} 
                        placeholder="••••••••" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                        className="h-16 pl-16 pr-14 rounded-[1.5rem] bg-white border-slate-200 text-slate-900 placeholder:text-slate-300 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-sm font-bold shadow-sm" 
                      />
                      <button 
                        type="button" 
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 transition-colors" 
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <motion.div whileTap={{ scale: 0.98 }}>
                  <Button 
                    type="submit" 
                    className="w-full h-16 rounded-[1.5rem] bg-gradient-to-r from-orange-600 via-purple-600 to-blue-600 hover:opacity-90 text-white font-black uppercase tracking-widest text-xs shadow-2xl shadow-purple-500/40 transition-all border-none relative overflow-hidden group/btn" 
                    disabled={loading}
                  >
                    <motion.div 
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000"
                    />
                    {loading ? (
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Verifying...</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-3">
                        <span>Initialize Protocol</span>
                        <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                      </div>
                    )}
                  </Button>
                </motion.div>
              </form>
            </CardContent>
            
            <div className="bg-slate-50 p-6 border-t border-slate-100 flex items-center justify-center gap-3">
               <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
               <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">
                  Secure Server Connection Active
               </div>
            </div>
          </Card>
        </motion.div>

        {/* Footer */}
        <div className="text-center space-y-4">
          <div className="h-[2px] w-12 bg-slate-200 mx-auto rounded-full" />
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400">
            Sankara Academy of Vision
          </p>
        </div>
      </motion.div>

      {/* Support Dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-md rounded-[3rem] bg-white border-none p-10 shadow-2xl overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-500 via-purple-500 to-blue-500" />
          <DialogHeader>
            <DialogTitle className="flex items-center gap-4 text-2xl font-black text-slate-900 tracking-tight">
              <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 shadow-sm border border-orange-100">
                <PhoneCall className="h-6 w-6" />
              </div>
              Protocol Recovery
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-8 pt-6">
            <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-100 space-y-4 shadow-inner">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-600 bg-orange-100/50 w-fit px-4 py-1.5 rounded-full shadow-sm">
                <Sparkles className="h-3 w-3" />
                Security Notice
              </div>
              <p className="text-sm text-slate-700 leading-relaxed font-bold italic">
                "For institutional security, password resets are handled exclusively via the IT Department."
              </p>
            </div>
            
            <div className="rounded-[2rem] bg-slate-900 p-8 space-y-6 text-white shadow-2xl relative overflow-hidden">
               <div className="absolute top-[-20%] right-[-10%] w-32 h-32 bg-orange-500/20 rounded-full blur-2xl" />
              <div className="space-y-2 relative z-10">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Chief System Admin</p>
                <p className="text-xl font-black tracking-tighter">PRABHANJAN</p>
              </div>
              <div className="pt-2 relative z-10">
                <a href="mailto:prabhanjan@sankaraeye.com" className="group flex items-center gap-4 text-sm font-bold text-slate-300 hover:text-white transition-all">
                  <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-orange-500 transition-colors shadow-lg">
                    <Mail className="h-5 w-5" />
                  </div>
                  prabhanjan@sankaraeye.com
                </a>
              </div>
            </div>
            
            <Button className="w-full h-16 rounded-[1.5rem] bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest text-xs transition-all shadow-xl active:scale-[0.98]" onClick={() => setForgotOpen(false)}>
              Close Recovery Window
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}



