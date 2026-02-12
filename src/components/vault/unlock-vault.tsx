"use client";

import { useState } from "react";
import { useVault } from "@/hooks/use-vault";
import { useUISettings } from "@/hooks/use-ui-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { KeyRound, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export function UnlockVault() {
  const { unlock, resetVault } = useVault();
  const { t } = useUISettings();
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(false);
    
    const success = await unlock(password);
    
    if (!success) {
      setError(true);
      toast({ variant: "destructive", title: t('app.vault_locked'), description: t('app.incorrect_password') });
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full shadow-2xl border-none">
        <CardHeader className="text-center space-y-1">
          <div className="mx-auto w-14 h-14 bg-accent/10 rounded-xl flex items-center justify-center mb-2">
            <KeyRound className="w-7 h-7 text-accent" />
          </div>
          <CardTitle className="text-2xl font-headline tracking-tight">{t('app.vault_locked')}</CardTitle>
          <CardDescription>{t('app.unlock')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="space-y-2">
              <Input 
                type="password" 
                placeholder={t('app.master_password')} 
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                className={error ? "border-destructive focus-visible:ring-destructive" : ""}
                required
                autoFocus
              />
              {error && (
                <p className="text-xs text-destructive flex items-center gap-1 font-medium">
                  <ShieldAlert className="w-3 h-3" /> {t('app.incorrect_password')}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full font-bold h-11" disabled={isLoading}>
              {isLoading ? t('app.encrypting') : t('app.unlock')}
            </Button>
          </form>

          <div className="mt-8 pt-4 border-t flex flex-col items-center gap-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive gap-2">
                  <Trash2 className="w-3 h-3" /> {t('app.reset_vault')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('app.reset_confirm_title')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('app.reset_confirm_desc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('app.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={resetVault} className="bg-destructive hover:bg-destructive/90">
                    {t('app.reset_button')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
               <span className="flex items-center gap-1.5">
                 <span className="w-2 h-2 rounded-full bg-green-500" /> {t('app.offline_indicator')}
               </span>
               <span className="w-1 h-1 rounded-full bg-muted-foreground" />
               <span>AES-256</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}