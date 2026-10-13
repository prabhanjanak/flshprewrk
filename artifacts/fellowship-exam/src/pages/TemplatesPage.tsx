import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { 
  FileText, 
  Plus, 
  Trash2, 
  Loader2, 
  ExternalLink, 
  Key, 
  Settings2, 
  ChevronRight,
  Database,
  Search,
  Layout,
  Link2,
} from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { cn } from "../lib/utils";

interface Program {
  id: number;
  name: string;
  code: string;
  academicYear: string;
}

interface DocTemplate {
  id: number;
  programId: number;
  name: string;
  googleDocId: string;
}

export default function TemplatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [search, setSearch] = useState("");
  const [tplForm, setTplForm] = useState({ name: "", googleDocId: "" });
  const [serviceAccountJson, setServiceAccountJson] = useState("");

  const { data: programs = [], isLoading: isLoadingPrograms } = useQuery<Program[]>({
    queryKey: ["programs"],
    queryFn: () => api.get<Program[]>("/programs"),
  });

  const { data: settings } = useQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const res = await api.get<any>("/settings/email");
      setServiceAccountJson(res.googleServiceAccountJson || "");
      return res;
    },
  });

  const { data: templates = [], isLoading: isLoadingTpls } = useQuery<DocTemplate[]>({
    queryKey: ["document-templates", selectedProgram?.id],
    queryFn: () => selectedProgram ? api.get<DocTemplate[]>(`/programs/${selectedProgram.id}/templates`) : Promise.resolve([]),
    enabled: !!selectedProgram,
  });

  const addTplMutation = useMutation({
    mutationFn: (data: any) => api.post("/document-templates", data),
    onSuccess: () => {
      toast({ title: "Template Linked", description: "Successfully added to the program." });
      queryClient.invalidateQueries({ queryKey: ["document-templates", selectedProgram?.id] });
      setTplForm({ name: "", googleDocId: "" });
    },
  });

  const deleteTplMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/document-templates/${id}`),
    onSuccess: () => {
      toast({ title: "Template Removed" });
      queryClient.invalidateQueries({ queryKey: ["document-templates", selectedProgram?.id] });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (data: any) => api.patch("/settings/email", data),
    onSuccess: () => {
      toast({ title: "Credentials Saved", description: "Google API access updated." });
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
    },
  });

  const filteredPrograms = programs.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/50">
      {/* Sidebar - Program Selection */}
      <div className="w-80 border-r bg-white flex flex-col shadow-sm">
        <div className="p-4 border-b space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-500">Academic Programs</h2>
            <Layout className="h-4 w-4 text-slate-300" />
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input 
              placeholder="Search programs..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs font-bold bg-slate-50 border-none"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {isLoadingPrograms ? (
            <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : filteredPrograms.length === 0 ? (
            <div className="p-8 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">No programs found</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filteredPrograms.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProgram(p)}
                  className={cn(
                    "w-full p-4 text-left hover:bg-slate-50 transition-all flex items-center justify-between group border-l-4 border-transparent",
                    selectedProgram?.id === p.id && "bg-orange-50 border-orange-500"
                  )}
                >
                  <div className="space-y-1">
                    <p className={cn("text-xs font-black uppercase tracking-tight", selectedProgram?.id === p.id ? "text-orange-600" : "text-slate-700")}>{p.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{p.code}</span>
                      <Badge className="h-3 text-[8px] px-1 font-black bg-slate-200 text-slate-500 border-none">{p.academicYear}</Badge>
                    </div>
                  </div>
                  <ChevronRight className={cn("h-4 w-4 transition-transform", selectedProgram?.id === p.id ? "text-orange-500 translate-x-1" : "text-slate-300 opacity-0 group-hover:opacity-100")} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Global Settings Trigger */}
        <div className="p-4 border-t bg-slate-50/50">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 h-10 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-orange-600 hover:bg-white"
            onClick={() => setSelectedProgram(null)}
          >
            <Settings2 className="h-4 w-4" /> Global API Settings
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-700">
        {!selectedProgram ? (
          <div className="space-y-8">
            {/* Global Header */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-black p-8 text-white shadow-2xl">
              <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/5 to-transparent blur-3xl" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-400 text-sm font-medium">
                    <Key className="h-4 w-4" />
                    <span>Backend Infrastructure</span>
                  </div>
                  <h1 className="text-4xl font-extrabold tracking-tight">Global API Configuration</h1>
                  <p className="text-slate-400 max-w-md">Configure core institutional credentials and Google Cloud service accounts for automated document synthesis.</p>
                </div>
                <div className="h-16 w-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 backdrop-blur-md">
                  <Settings2 className="h-8 w-8 text-white/40" />
                </div>
              </div>
            </div>

            <Card className="border-slate-200 shadow-md max-w-4xl">
              <CardHeader className="bg-slate-50/50 border-b">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center border border-amber-200">
                    <Key className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-700">Google Service Account JSON</CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase text-slate-400 italic">This credential allows the system to access your Google Docs templates.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">JSON Content</Label>
                  <textarea 
                    className="w-full min-h-[250px] p-4 font-mono text-xs bg-slate-900 text-emerald-400 rounded-xl focus:ring-2 ring-primary border-none shadow-inner"
                    placeholder='{ "type": "service_account", ... }'
                    value={serviceAccountJson}
                    onChange={e => setServiceAccountJson(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground font-bold italic">Paste the entire content of your Google Cloud Service Account JSON key file here.</p>
                </div>
                <Button 
                  className="w-full h-12 font-black uppercase tracking-widest text-xs gap-2"
                  onClick={() => saveSettingsMutation.mutate({ googleServiceAccountJson: serviceAccountJson })}
                  disabled={saveSettingsMutation.isPending}
                >
                  {saveSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                  Synchronize API Credentials
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Program Header */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-orange-500 p-8 text-white shadow-2xl">
              <div className="absolute right-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent blur-3xl" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-orange-100 text-sm font-medium">
                    <FileText className="h-4 w-4" />
                    <span>Template Repository</span>
                  </div>
                  <h1 className="text-4xl font-extrabold tracking-tight uppercase">{selectedProgram.name}</h1>
                  <p className="text-orange-100/80 max-w-md">Manage institutional letter templates, offer protocols, and specialized documentation for this fellowship track.</p>
                </div>
                <div className="text-right bg-black/10 p-4 rounded-2xl backdrop-blur-md">
                  <span className="text-[10px] font-black text-orange-200 uppercase tracking-[0.2em]">Templates Linked</span>
                  <p className="text-4xl font-black text-white leading-none mt-1">{templates.length}</p>
                </div>
              </div>
            </div>

            {/* Template Addition Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-1 border-orange-200 bg-orange-50 shadow-none h-fit">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[10px] font-black uppercase tracking-widest text-orange-600 flex items-center gap-2">
                    <Plus className="h-3.5 w-3.5" /> Link New Letter
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Letter Name</Label>
                    <Input 
                      placeholder="e.g. Offer Letter" 
                      value={tplForm.name} 
                      onChange={e => setTplForm({...tplForm, name: e.target.value})}
                      className="h-9 font-bold text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-slate-500">Google Doc ID</Label>
                    <Input 
                      placeholder="1aBc2DeFg..." 
                      value={tplForm.googleDocId} 
                      onChange={e => setTplForm({...tplForm, googleDocId: e.target.value})}
                      className="h-9 font-bold text-xs bg-white"
                    />
                  </div>
                  <Button 
                    className="w-full h-10 font-black uppercase tracking-widest text-[10px] gap-2"
                    disabled={!tplForm.name || !tplForm.googleDocId || addTplMutation.isPending}
                    onClick={() => addTplMutation.mutate({ ...tplForm, programId: selectedProgram.id })}
                  >
                    {addTplMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Add to Program
                  </Button>
                </CardContent>
              </Card>

              {/* Template List */}
              <div className="md:col-span-2 space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Available Letter Templates</h3>
                {isLoadingTpls ? (
                  <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-500" /></div>
                ) : templates.length === 0 ? (
                  <div className="py-20 text-center border-2 border-dashed rounded-3xl border-slate-200 bg-white shadow-inner">
                    <FileText className="h-12 w-12 text-slate-100 mx-auto mb-3" />
                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No templates configured for this program</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {templates.map(tpl => (
                      <div key={tpl.id} className="group relative flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl hover:shadow-xl hover:border-orange-500/50 transition-all duration-300 overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-slate-100 group-hover:bg-orange-500 transition-colors" />
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center font-black text-sm group-hover:bg-orange-50 group-hover:text-orange-600 transition-colors">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none mb-1">{tpl.name}</p>
                            <p className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-tighter">DOC ID: {tpl.googleDocId.substring(0, 12)}...</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <Button variant="ghost" size="sm" className="h-9 w-9 rounded-xl text-slate-400 hover:text-orange-600 hover:bg-orange-50" asChild>
                              <a href={`https://docs.google.com/document/d/${tpl.googleDocId}`} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                           </Button>
                           <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-9 w-9 rounded-xl text-slate-300 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              if (confirm("Remove this template? This will not delete your Google Doc.")) {
                                deleteTplMutation.mutate(tpl.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
