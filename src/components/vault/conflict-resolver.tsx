"use client";

import { useState } from "react";
import { useVault } from "@/hooks/use-vault";
import { useUISettings } from "@/hooks/use-ui-settings";
import { ConflictEntry, AccountEntry } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, User, Key, ArrowRight, ShieldAlert, Check, Clock, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function ConflictResolver() {
  const { vault, updateVault } = useVault();
  const { t } = useUISettings();

  const resolveConflict = async (conflictId: string, selection: 'local' | 'imported') => {
    if (!vault) return;

    const conflict = vault.conflicts.find(c => c.conflictId === conflictId);
    if (!conflict) return;

    const resolvedAccount = selection === 'local' ? conflict.versionLocal : conflict.versionImportada;

    await updateVault(v => ({
      ...v,
      accounts: [...v.accounts.filter(a => !(a.sitio === conflict.sitio && a.usuario === conflict.usuario)), resolvedAccount],
      conflicts: v.conflicts.filter(c => c.conflictId !== conflictId)
    }));

    toast({ title: t('conflicts.resolved_title'), description: t('conflicts.resolved_desc') });
  };

  if (!vault?.conflicts.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mb-6">
          <Check className="w-12 h-12 text-green-600" />
        </div>
        <h3 className="text-2xl font-headline font-bold text-foreground mb-2">{t('conflicts.synced_title')}</h3>
        <p className="max-w-xs mx-auto">{t('conflicts.synced_desc')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-headline font-bold flex items-center gap-3">
          <ShieldAlert className="text-destructive w-8 h-8" /> {t('conflicts.title')}
        </h2>
        <p className="text-muted-foreground">{t('conflicts.desc')}</p>
      </div>

      <div className="grid gap-8">
        {vault.conflicts.map((conflict) => (
          <Card key={conflict.conflictId} className="overflow-hidden border-2 border-destructive/20 shadow-xl bg-card">
            <CardHeader className="bg-destructive/5 border-b py-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center border shadow-sm">
                  <Globe className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold">{conflict.sitio}</CardTitle>
                  <CardDescription className="font-medium text-destructive">{conflict.usuario}</CardDescription>
                </div>
                <Badge variant="outline" className="ml-auto font-mono text-[10px] bg-background">
                  {new Date(conflict.detectedAt).toLocaleDateString()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                {/* Versión Local */}
                <div className="p-8 flex flex-col gap-6 bg-background">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-tighter text-muted-foreground">{t('conflicts.local_version')}</span>
                    <Badge variant="secondary" className="rounded-sm">LOCAL</Badge>
                  </div>
                  <AccountBrief account={conflict.versionLocal} />
                  <Button variant="outline" className="mt-4 h-12 font-bold" onClick={() => resolveConflict(conflict.conflictId, 'local')}>
                    {t('conflicts.keep_local')}
                  </Button>
                </div>

                {/* Versión Importada */}
                <div className="p-8 flex flex-col gap-6 bg-accent/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-tighter text-muted-foreground">{t('conflicts.imported_version')}</span>
                    <Badge className="bg-accent rounded-sm text-accent-foreground">IMPORT</Badge>
                  </div>
                  <AccountBrief account={conflict.versionImportada} />
                  <Button className="mt-4 h-12 bg-accent hover:bg-accent/90 text-accent-foreground font-bold" onClick={() => resolveConflict(conflict.conflictId, 'imported')}>
                    {t('conflicts.use_imported')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AccountBrief({ account }: { account: AccountEntry }) {
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useUISettings();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm p-3 bg-muted/30 rounded-lg">
        <User className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold">{account.usuario}</span>
      </div>
      <div className="flex items-center gap-3 text-sm p-3 bg-muted/30 rounded-lg relative">
        <Key className="w-4 h-4 text-muted-foreground" />
        <span className="font-mono text-xs flex-1 truncate">
          {showPassword ? account.password : "••••••••••••••••"}
        </span>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 hover:bg-transparent" 
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2">
        <Clock className="w-3 h-3" />
        {t('dashboard.last_update')}: {new Date(account.updatedAt).toLocaleString()}
      </div>
    </div>
  );
}
