"use client";

import { useState } from "react";
import { useVault } from "@/hooks/use-vault";
import { useUISettings } from "@/hooks/use-ui-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock, AlertCircle, CheckCircle2 } from "lucide-react";
import { PasswordStrength } from "./password-strength";
import { cn } from "@/lib/utils";

export function SetupVault() {
  const { initialize } = useVault();
  const { t } = useUISettings();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isLengthValid = password.length >= 8;
  const doPasswordsMatch = password === confirm && confirm !== "";
  const canSubmit = isLengthValid && doPasswordsMatch && !isLoading;

  const handleInit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    await initialize(password);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full shadow-xl border-t-4 border-t-primary">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-headline">{t('app.setup_title')}</CardTitle>
          <CardDescription>
            {t('app.setup_desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('app.master_password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="password" 
                  placeholder={t('app.min_chars')} 
                  className={cn("pl-9", !isLengthValid && password.length > 0 && "border-destructive")}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <PasswordStrength password={password} />
              {password.length > 0 && !isLengthValid && (
                <p className="text-[10px] text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {t('app.min_chars')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('app.unlock')}</label>
              <div className="relative">
                <Input 
                  type="password" 
                  placeholder={t('app.master_password')} 
                  className={cn(confirm.length > 0 && !doPasswordsMatch && "border-destructive")}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                />
                {doPasswordsMatch && (
                  <CheckCircle2 className="absolute right-3 top-2.5 h-4 w-4 text-green-500" />
                )}
              </div>
              {confirm.length > 0 && !doPasswordsMatch && (
                <p className="text-[10px] text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {t('app.passwords_dont_match')}
                </p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full font-bold h-11" 
              disabled={!canSubmit}
            >
              {isLoading ? t('app.encrypting') : t('app.create_vault')}
            </Button>

            <div className="flex flex-col gap-2 pt-2 border-t">
              <p className="text-[10px] text-center text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> {t('app.offline_indicator')}
              </p>
              <p className="text-[10px] text-center text-muted-foreground uppercase tracking-wider">
                AES-256-GCM • PBKDF2-SHA512
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
