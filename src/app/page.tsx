"use client";

import { VaultProvider, useVault } from "@/hooks/use-vault";
import { SetupVault } from "@/components/vault/setup-vault";
import { UnlockVault } from "@/components/vault/unlock-vault";
import { Dashboard } from "@/components/vault/dashboard";
import { useEffect, useState } from "react";

function VaultOrchestrator() {
  const { isLocked, isInitialized } = useVault();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  if (!isInitialized) {
    return <SetupVault />;
  }

  if (isLocked) {
    return <UnlockVault />;
  }

  return <Dashboard />;
}

export default function Home() {
  return (
    <VaultProvider>
      <main className="min-h-screen">
        <VaultOrchestrator />
      </main>
    </VaultProvider>
  );
}