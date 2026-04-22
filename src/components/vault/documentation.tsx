"use client";

import { useUISettings } from "@/hooks/use-ui-settings";
import { 
  ShieldCheck, Lock, Globe, Database, Server, 
  Cpu, FileCode, CheckCircle2, AlertCircle 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function Documentation() {
  const { t } = useUISettings();

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-3xl font-headline font-bold text-foreground">{t('documentation.title')}</h2>
        <p className="text-muted-foreground text-lg">{t('documentation.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              {t('documentation.offline_title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('documentation.offline_desc')}
            </p>
          </CardContent>
        </Card>

        <Card className="border-accent/20 bg-accent/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-accent" />
              {t('documentation.local_storage_title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('documentation.local_storage_desc')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b pb-2">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <h3 className="text-xl font-bold">{t('documentation.encryption_title')}</h3>
        </div>
        
        <div className="grid gap-4">
          <Card>
            <CardContent className="pt-6 flex gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold">{t('documentation.pbkdf2_title')}</h4>
                <p className="text-sm text-muted-foreground italic">PBKDF2-HMAC-SHA512 + 210,000 Iterations</p>
                <p className="text-sm text-muted-foreground pt-2">
                  {t('documentation.pbkdf2_desc')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 flex gap-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <Cpu className="w-6 h-6 text-accent" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold">{t('documentation.aes_title')}</h4>
                <p className="text-sm text-muted-foreground italic">AES-256-GCM (Galois/Counter Mode)</p>
                <p className="text-sm text-muted-foreground pt-2">
                  {t('documentation.aes_desc')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3 border-b pb-2">
          <CheckCircle2 className="w-6 h-6 text-green-500" />
          <h3 className="text-xl font-bold">{t('documentation.practices_title')}</h3>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-dashed flex flex-col gap-2">
            <Badge variant="outline" className="w-fit">Privacy</Badge>
            <p className="text-sm font-medium">{t('documentation.practice_1')}</p>
          </div>
          <div className="p-4 rounded-xl border border-dashed flex flex-col gap-2">
            <Badge variant="outline" className="w-fit">Security</Badge>
            <p className="text-sm font-medium">{t('documentation.practice_2')}</p>
          </div>
          <div className="p-4 rounded-xl border border-dashed flex flex-col gap-2">
            <Badge variant="outline" className="w-fit">Reliability</Badge>
            <p className="text-sm font-medium">{t('documentation.practice_3')}</p>
          </div>
        </div>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-widest text-muted-foreground">
            <FileCode className="w-4 h-4" />
            {t('documentation.dev_info_title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {t('documentation.dev_info_desc')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Next.js 15</Badge>
            <Badge variant="secondary">Electron 33</Badge>
            <Badge variant="secondary">Web Crypto API</Badge>
            <Badge variant="secondary">Tailwind CSS</Badge>
            <Badge variant="secondary">TypeScript</Badge>
            <Badge variant="secondary">Radix UI</Badge>
          </div>
        </CardContent>
      </Card>
      
      <div className="bg-yellow-500/5 border border-yellow-500/20 p-4 rounded-xl flex gap-3">
        <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0" />
        <div className="text-xs text-yellow-800 leading-relaxed">
          {t('documentation.export_warning')}
        </div>
      </div>
    </div>
  );
}
