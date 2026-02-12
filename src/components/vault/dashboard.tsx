"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useVault } from "@/hooks/use-vault";
import { useUISettings } from "@/hooks/use-ui-settings";
import { AccountEntry, PasswordHistory } from "@/lib/types";
import { 
  Plus, Search, ShieldCheck, Settings, Key, 
  LogOut, Globe, User, Copy, ExternalLink,
  History, Info, AlertTriangle, Download, Upload,
  Cpu, Edit2, Check, X, Wand2, ShieldAlert, Zap,
  Moon, Sun, Languages, Eye, EyeOff
} from "lucide-react";
import { 
  Sidebar, SidebarContent, SidebarHeader, SidebarMenu, 
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarFooter 
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger 
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { passwordSecurityAudit, PasswordSecurityAuditOutput } from "@/ai/flows/password-security-audit";
import { PasswordGenerator } from "./password-generator";
import { ConflictResolver } from "./conflict-resolver";
import { Textarea } from "@/components/ui/textarea";

type ViewMode = 'accounts' | 'conflicts' | 'generator' | 'audit' | 'settings';

export function Dashboard() {
  const { vault, updateVault, lock, exportVault, importVault } = useVault();
  const { theme, setTheme, language, setLanguage, t } = useUISettings();
  const [view, setView] = useState<ViewMode>('accounts');
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<AccountEntry | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResults, setAuditResults] = useState<Record<string, PasswordSecurityAuditOutput>>({});
  const [showPassword, setShowPassword] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<AccountEntry>>({});
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPassword, setImportPassword] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Reset selection when view changes
    setSelectedAccount(null);
    setIsEditing(false);
    setShowPassword(false);
  }, [view]);

  const filteredAccounts = vault?.accounts.filter(a => 
    a.sitio.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.usuario.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const stats = useMemo(() => {
    if (!vault) return { total: 0, compromised: 0, weak: 0 };
    const compromised = Object.values(auditResults).filter(r => r.isCompromised).length;
    const weak = Object.values(auditResults).filter(r => r.isCommon).length;
    return { total: vault.accounts.length, compromised, weak };
  }, [vault, auditResults]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t('form.copied'), description: `${label}` });
  };

  const handleSaveAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const sitio = formData.get('sitio') as string;
    const usuario = formData.get('usuario') as string;
    const password = formData.get('password') as string;
    const notas = formData.get('notas') as string;

    const newAccount: AccountEntry = {
      id: crypto.randomUUID(),
      sitio,
      usuario,
      password,
      notas: notas || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceId: vault?.deviceId || "local",
      history: []
    };

    await updateVault(v => ({
      ...v,
      accounts: [...v.accounts, newAccount]
    }));
    
    setIsAdding(false);
    toast({ title: t('form.save') });
  };

  const startEdit = () => {
    if (!selectedAccount) return;
    setEditForm({ ...selectedAccount });
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditForm({});
  };

  const saveEdit = async () => {
    if (!selectedAccount || !vault) return;
    
    const hasPasswordChanged = editForm.password !== selectedAccount.password;
    const historyEntry: PasswordHistory | null = hasPasswordChanged 
      ? { password: selectedAccount.password, updatedAt: selectedAccount.updatedAt }
      : null;

    const updatedAccount: AccountEntry = {
      ...selectedAccount,
      sitio: editForm.sitio || selectedAccount.sitio,
      usuario: editForm.usuario || selectedAccount.usuario,
      password: editForm.password || selectedAccount.password,
      notas: editForm.notas || "",
      updatedAt: new Date().toISOString(),
      history: historyEntry ? [historyEntry, ...selectedAccount.history] : selectedAccount.history
    };

    await updateVault(v => ({
      ...v,
      accounts: v.accounts.map(a => a.id === selectedAccount.id ? updatedAccount : a)
    }));

    setSelectedAccount(updatedAccount);
    setIsEditing(false);
    toast({ title: t('dashboard.last_update') });
  };

  const runAudit = async () => {
    if (!vault) return;
    setIsAuditing(true);
    const results: Record<string, PasswordSecurityAuditOutput> = { ...auditResults };
    
    for (const acc of vault.accounts) {
      const audit = await passwordSecurityAudit({ password: acc.password });
      results[acc.id] = audit;
      await new Promise(r => setTimeout(r, 50));
    }
    
    setAuditResults(results);
    setIsAuditing(false);
    toast({ title: t('audit.complete') });
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar className="border-r border-sidebar-border">
          <SidebarHeader className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-sidebar-primary-foreground" />
              </div>
              <h1 className="text-xl font-headline font-bold text-sidebar-foreground">LocalPass</h1>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu className="px-3 gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton isActive={view === 'accounts'} onClick={() => setView('accounts')}>
                  <Key className="w-4 h-4" /> <span>{t('sidebar.accounts')}</span>
                  <Badge className="ml-auto bg-sidebar-accent text-sidebar-foreground border-none text-[10px]">
                    {vault?.accounts.length || 0}
                  </Badge>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={view === 'generator'} onClick={() => setView('generator')}>
                  <Wand2 className="w-4 h-4" /> <span>{t('sidebar.generator')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={view === 'audit'} onClick={() => setView('audit')}>
                  <ShieldCheck className="w-4 h-4" /> <span>{t('sidebar.audit')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={view === 'conflicts'} onClick={() => setView('conflicts')}>
                  <AlertTriangle className="w-4 h-4" /> <span>{t('sidebar.conflicts')}</span>
                  {vault?.conflicts.length ? (
                    <Badge variant="destructive" className="ml-auto text-[10px]">{vault.conflicts.length}</Badge>
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={view === 'settings'} onClick={() => setView('settings')}>
                  <Settings className="w-4 h-4" /> <span>{t('sidebar.settings')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-4 border-t border-sidebar-border space-y-2">
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="flex-1 text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="flex-1 text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}>
                <Languages className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="ghost" className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent" onClick={lock}>
              <LogOut className="w-4 h-4" /> {t('sidebar.logout')}
            </Button>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-16 border-b flex items-center justify-between px-8 bg-card backdrop-blur-md sticky top-0 z-10">
            <div className="flex-1 max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder={t('dashboard.search')} 
                  className="pl-9 h-10 bg-background/50 border-muted"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Dialog open={isAdding} onOpenChange={setIsAdding}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" /> {t('dashboard.add_account')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('form.new_credential')}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSaveAccount} className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t('form.site')}</label>
                      <Input name="sitio" required placeholder="github.com" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t('form.user')}</label>
                      <Input name="usuario" required placeholder="user@example.com" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t('form.password')}</label>
                      <Input name="password" type="password" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t('form.notes')}</label>
                      <Input name="notas" placeholder={t('form.optional_notes')} />
                    </div>
                    <DialogFooter>
                      <Button type="submit" className="w-full">{t('form.save')}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </header>

          <div className="flex-1 overflow-hidden p-8">
            <ScrollArea className="h-full">
              {view === 'accounts' && (
                <div className="h-full flex flex-col gap-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-primary/5 border-primary/10 shadow-none">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-2">
                          <Zap className="w-4 h-4 text-primary" />
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('dashboard.total_accounts')}</span>
                        </div>
                        <p className="text-3xl font-headline font-bold">{stats.total}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-destructive/5 border-destructive/10 shadow-none">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-2">
                          <ShieldAlert className="w-4 h-4 text-destructive" />
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('dashboard.compromised')}</span>
                        </div>
                        <p className="text-3xl font-headline font-bold text-destructive">{stats.compromised}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-yellow-500/5 border-yellow-500/10 shadow-none">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3 mb-2">
                          <ShieldAlert className="w-4 h-4 text-yellow-600" />
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('dashboard.weak')}</span>
                        </div>
                        <p className="text-3xl font-headline font-bold text-yellow-600">{stats.weak}</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredAccounts.map(acc => (
                      <Card key={acc.id} className="group hover:shadow-md transition-all cursor-pointer border-muted hover:border-accent/50" onClick={() => {
                        setSelectedAccount(acc);
                        setIsEditing(false);
                      }}>
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-accent/5 flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                            <Globe className="w-6 h-6 text-accent" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold truncate text-lg">{acc.sitio}</h3>
                            <p className="text-sm text-muted-foreground truncate">{acc.usuario}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {filteredAccounts.length === 0 && (
                      <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground opacity-50">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                          <Search className="w-8 h-8" />
                        </div>
                        <p className="text-lg">{t('dashboard.no_accounts')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {view === 'generator' && <PasswordGenerator />}
              {view === 'conflicts' && <ConflictResolver />}
              {view === 'audit' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-headline font-bold">{t('audit.title')}</h2>
                      <p className="text-muted-foreground">{t('audit.desc')}</p>
                    </div>
                    <Button onClick={runAudit} disabled={isAuditing} className="gap-2">
                      <ShieldCheck className="w-4 h-4" /> {isAuditing ? t('audit.analyzing') : t('audit.run')}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {vault?.accounts.map(acc => {
                      const result = auditResults[acc.id];
                      return (
                        <Card key={acc.id} className="overflow-hidden">
                          <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <Globe className="w-5 h-5 text-accent" />
                                <span className="font-bold">{acc.sitio}</span>
                                <span className="text-muted-foreground text-sm">({acc.usuario})</span>
                              </div>
                              {result ? (
                                <Badge variant={result.isCompromised || result.isCommon ? "destructive" : "default"} className={result.isCompromised || result.isCommon ? "" : "bg-green-500 hover:bg-green-600"}>
                                  {result.isCompromised ? t('audit.status_compromised') : result.isCommon ? t('audit.status_weak') : t('audit.status_secure')}
                                </Badge>
                              ) : (
                                <Badge variant="outline">{t('audit.no_analysis')}</Badge>
                              )}
                            </div>
                            {result && (
                              <div className="bg-muted/30 p-4 rounded-lg text-sm border">
                                <p className="font-semibold mb-2">{t('audit.suggestions_title')}</p>
                                <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                                  {result.issueCodes.length > 0 ? result.issueCodes.map(code => (
                                    <li key={code}>{t(`audit.${code}`)}</li>
                                  )) : (
                                    <li>{t('audit.secure_msg')}</li>
                                  )}
                                </ul>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {view === 'settings' && (
                <div className="max-w-2xl mx-auto space-y-8 pb-20">
                  <h2 className="text-2xl font-headline font-bold">{t('settings.title')}</h2>
                  <div className="grid gap-6">
                    <Card>
                      <CardContent className="p-6 space-y-4">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <Languages className="w-5 h-5" /> {t('settings.language')}
                        </h3>
                        <div className="flex gap-4">
                          <Button variant={language === 'en' ? 'default' : 'outline'} className="flex-1" onClick={() => setLanguage('en')}>
                            {t('settings.english')}
                          </Button>
                          <Button variant={language === 'es' ? 'default' : 'outline'} className="flex-1" onClick={() => setLanguage('es')}>
                            {t('settings.spanish')}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-6 space-y-4">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />} {t('settings.theme')}
                        </h3>
                        <div className="flex gap-4">
                          <Button variant={theme === 'light' ? 'default' : 'outline'} className="flex-1" onClick={() => setTheme('light')}>
                            {t('settings.light')}
                          </Button>
                          <Button variant={theme === 'dark' ? 'default' : 'outline'} className="flex-1" onClick={() => setTheme('dark')}>
                            {t('settings.dark')}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-6 space-y-4">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <Download className="w-5 h-5" /> {t('settings.export_title')}
                        </h3>
                        <p className="text-sm text-muted-foreground">{t('settings.export_desc')}</p>
                        <Button variant="outline" className="w-full gap-2" onClick={() => {
                          const data = exportVault();
                          const blob = new Blob([data], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `localpass_vault_${new Date().toISOString().split('T')[0]}.json`;
                          a.click();
                        }}>
                          <Download className="w-4 h-4" /> {t('settings.export_button')}
                        </Button>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-6 space-y-4">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <Upload className="w-5 h-5" /> {t('settings.import_title')}
                        </h3>
                        <p className="text-sm text-muted-foreground">{t('settings.import_desc')}</p>
                        <Dialog open={importDialogOpen} onOpenChange={(open) => {
                          setImportDialogOpen(open);
                          if (!open) {
                            setImportPassword("");
                            setImportFile(null);
                            if (importFileInputRef.current) importFileInputRef.current.value = "";
                          }
                        }}>
                          <DialogTrigger asChild>
                            <Button variant="outline" className="w-full gap-2">
                              <Upload className="w-4 h-4" /> {t('settings.import_button')}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>{t('settings.import_title')}</DialogTitle>
                              <DialogDescription>{t('settings.import_desc')}</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">{t('app.master_password')}</label>
                                <Input
                                  type="password"
                                  placeholder={t('app.master_pass_prompt')}
                                  value={importPassword}
                                  onChange={(e) => setImportPassword(e.target.value)}
                                  autoComplete="off"
                                />
                              </div>
                              <div className="space-y-2">
                                <label htmlFor="import-file-input" className="text-sm font-medium">{t('settings.import_file_label')}</label>
                                <input
                                  id="import-file-input"
                                  ref={importFileInputRef}
                                  type="file"
                                  accept=".json,application/json"
                                  className="hidden"
                                  title={t('settings.import_file_label')}
                                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => importFileInputRef.current?.click()}
                                  >
                                    {importFile ? importFile.name : t('settings.import_select_file')}
                                  </Button>
                                  {importFile && (
                                    <Button type="button" variant="ghost" size="icon" onClick={() => { setImportFile(null); importFileInputRef.current && (importFileInputRef.current.value = ""); }}>
                                      <X className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                disabled={!importPassword.trim() || !importFile || importLoading}
                                onClick={async () => {
                                  if (!importFile) return;
                                  setImportLoading(true);
                                  try {
                                    const text = await importFile.text();
                                    await importVault(text, importPassword.trim());
                                    setImportDialogOpen(false);
                                    setView('accounts');
                                    setImportPassword("");
                                    setImportFile(null);
                                    if (importFileInputRef.current) importFileInputRef.current.value = "";
                                  } catch (err: any) {
                                    toast({ variant: "destructive", title: "Error", description: err?.message ?? t('app.import_error') });
                                  } finally {
                                    setImportLoading(false);
                                  }
                                }}
                              >
                                {importLoading ? t('app.encrypting') : t('settings.import_do')}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-6 space-y-4">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                          <Cpu className="w-5 h-5" /> {t('settings.tech_info')}
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between border-b py-2">
                            <span className="text-muted-foreground">{t('settings.device_id')}</span>
                            <span className="font-mono text-[10px]">{vault?.deviceId}</span>
                          </div>
                          <div className="flex justify-between border-b py-2">
                            <span className="text-muted-foreground">{t('settings.algorithm')}</span>
                            <span>AES-256-GCM</span>
                          </div>
                          <div className="flex justify-between py-2">
                            <span className="text-muted-foreground">{t('settings.iterations')}</span>
                            <span>210,000</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </main>

        {selectedAccount && (
          <aside className="w-96 border-l bg-card backdrop-blur-md p-8 overflow-y-auto animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-headline font-bold">{t('dashboard.details')}</h2>
              <div className="flex gap-2">
                {!isEditing ? (
                  <Button variant="ghost" size="icon" onClick={startEdit} className="rounded-full">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="icon" onClick={saveEdit} className="rounded-full text-green-600">
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={cancelEdit} className="rounded-full text-destructive">
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="icon" onClick={() => setSelectedAccount(null)} className="rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="space-y-8">
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center">
                  <Globe className="w-10 h-10 text-accent" />
                </div>
                {isEditing ? (
                  <Input 
                    value={editForm.sitio} 
                    onChange={e => setEditForm({...editForm, sitio: e.target.value})}
                    className="text-center font-bold text-xl"
                  />
                ) : (
                  <h3 className="text-2xl font-bold text-center">{selectedAccount.sitio}</h3>
                )}
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <User className="w-3 h-3" /> {t('form.user')}
                  </label>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <Input 
                        value={editForm.usuario} 
                        onChange={e => setEditForm({...editForm, usuario: e.target.value})}
                        className="font-medium"
                      />
                    ) : (
                      <>
                        <Input readOnly value={selectedAccount.usuario} className="bg-muted/30 border-none font-medium" />
                        <Button variant="ghost" size="icon" onClick={() => handleCopy(selectedAccount.usuario, t('form.user'))}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Key className="w-3 h-3" /> {t('form.password')}
                  </label>
                  <div className="flex items-center gap-2 relative">
                    {isEditing ? (
                      <Input 
                        value={editForm.password} 
                        onChange={e => setEditForm({...editForm, password: e.target.value})}
                        className="font-medium"
                      />
                    ) : (
                      <>
                        <Input readOnly type={showPassword ? "text" : "password"} value={selectedAccount.password} className="bg-muted/30 border-none font-medium pr-10" />
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleCopy(selectedAccount.password, t('form.password'))}>
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Info className="w-3 h-3" /> {t('form.notes')}
                  </label>
                  {isEditing ? (
                    <Textarea 
                      value={editForm.notas} 
                      onChange={e => setEditForm({...editForm, notas: e.target.value})}
                      className="text-sm min-h-[100px]"
                      placeholder={t('form.optional_notes')}
                    />
                  ) : (
                    selectedAccount.notas ? <p className="p-4 bg-muted/30 rounded-lg text-sm italic whitespace-pre-wrap">{selectedAccount.notas}</p> : <p className="text-sm text-muted-foreground italic">{t('form.optional_notes')}</p>
                  )}
                </div>
              </div>

              {selectedAccount.history.length > 0 && !isEditing && (
                <div className="pt-6 border-t space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <History className="w-3 h-3" /> {t('dashboard.history')}
                  </h4>
                  <div className="space-y-3">
                    {selectedAccount.history.map((h, i) => (
                      <div key={i} className="flex items-center justify-between text-xs p-2 bg-muted/20 rounded-md border border-dashed">
                        <span className="font-mono opacity-50">••••••••</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{new Date(h.updatedAt).toLocaleDateString()}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopy(h.password, t('dashboard.history'))}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-6 border-t space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <History className="w-3 h-3" /> {t('dashboard.timeline')}
                </h4>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="relative">
                      <div className="w-2 h-2 rounded-full bg-accent mt-1.5" />
                      <div className="absolute top-4 left-1 w-px h-full bg-border" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{t('dashboard.created')}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(selectedAccount.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-2 h-2 rounded-full bg-accent mt-1.5" />
                    <div>
                      <p className="text-sm font-bold">{t('dashboard.last_update')}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(selectedAccount.updatedAt).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              {!isEditing && (
                <div className="pt-6 flex gap-2">
                  <Button variant="outline" className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-white" onClick={() => {
                    if (confirm(t('dashboard.delete_confirm'))) {
                      updateVault(v => ({
                        ...v,
                        accounts: v.accounts.filter(a => a.id !== selectedAccount.id)
                      }));
                      setSelectedAccount(null);
                    }
                  }}>{t('dashboard.delete')}</Button>
                  <Button className="flex-1" asChild>
                    <a href={`https://${selectedAccount.sitio}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2">
                      <ExternalLink className="w-4 h-4" /> {t('dashboard.go_to_site')}
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </SidebarProvider>
  );
}