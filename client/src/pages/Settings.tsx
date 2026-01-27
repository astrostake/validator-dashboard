import { useEffect, useState } from "react";
import axios from "axios";
import { Gear, Bell, Bug } from "@phosphor-icons/react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NotificationManager } from "@/components/settings/NotificationManager";
import { SystemTools } from "@/components/settings/SystemTools";

// Shared Types
interface WalletSetting {
  id: string;
  label: string;
  chainName: string;
  address: string;
  valAddress?: string;
  webhookConfigured: boolean;
}

export default function Settings() {
  const [wallets, setWallets] = useState<WalletSetting[]>([]);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  useEffect(() => { loadWallets(); }, []);

  const loadWallets = async () => {
    try {
      const res = await axios.get(`${API_URL}/dashboard`);
      if (res.data.success) {
        const all = [
            ...(res.data.data.wallets.validators || []),
            ...(res.data.data.wallets.regular || [])
        ].map((w: any) => ({
            id: w.id,
            label: w.label,
            chainName: w.chain.name,
            address: w.address,
            valAddress: w.validator?.addresses?.operator,
            webhookConfigured: w.notifications?.webhookConfigured || false
        }));
        setWallets(all);
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-8 animate-in fade-in duration-500">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/20 shadow-sm">
                    <Gear className="text-2xl" weight="fill" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
                    <p className="text-muted-foreground">Manage notifications, integrations, and debug tools.</p>
                </div>
            </div>
        </div>

        <Tabs defaultValue="notifications" className="space-y-6">
            <TabsList className="bg-secondary/50 p-1">
                <TabsTrigger value="notifications" className="gap-2 px-6"><Bell weight="bold"/> Notifications</TabsTrigger>
                <TabsTrigger value="system" className="gap-2 px-6"><Bug weight="bold"/> System Tools</TabsTrigger>
            </TabsList>

            {/* TAB 1: NOTIFICATION MANAGER */}
            <TabsContent value="notifications" className="focus-visible:ring-0">
                <NotificationManager wallets={wallets} onRefresh={loadWallets} />
            </TabsContent>

            {/* TAB 2: SYSTEM TOOLS */}
            <TabsContent value="system" className="focus-visible:ring-0">
                <SystemTools wallets={wallets.map(w => ({ id: w.id, label: w.label }))} />
            </TabsContent>
        </Tabs>
    </div>
  );
}