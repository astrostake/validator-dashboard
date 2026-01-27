import { useState, useEffect } from "react";
import axios from "axios";
import { 
  Wallet, CloudArrowDown, Coins, Play, 
  ArrowsClockwise, TerminalWindow, BookOpen
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export function SystemTools({ wallets }: { wallets: { id: string, label: string }[] }) {
  const { toast } = useToast();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const [isReparsing, setIsReparsing] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [_bulkStatus, setBulkStatus] = useState({ isRunning: false, txCount: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
      addLog("System Tools ready.", "info");
  }, []);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
      setLogs(prev => [{ timestamp: new Date().toLocaleTimeString(), message, type }, ...prev].slice(0, 100));
  };

  const handleLocalReparse = async () => {
      if (!selectedWalletId) return;
      if (selectedWalletId === 'ALL') return handleBulkReparse();

      setIsReparsing(true);
      addLog(`Starting local reparse...`, "info");
      try {
          const res = await axios.post(`${API_URL}/wallet/${selectedWalletId}/reparse`);
          if (res.data.success) {
              addLog(`✓ Local reparse triggered.`, "success");
              toast({ title: "Reparse Started", description: "Re-processing local raw data..." });
          }
      } catch (e: any) { addLog(`✗ Error: ${e.message}`, "error"); } 
      finally { setIsReparsing(false); }
  };

  const handleBulkReparse = async () => {
      if(!confirm("Reparse ALL wallets locally?")) return;
      setIsReparsing(true);
      setBulkStatus({ isRunning: true, txCount: 0 });
      addLog("Queueing Global Bulk Reparse...", "warning");
      try {
          const res = await axios.post(`${API_URL}/reparse-all`);
          if (res.data.success) {
              addLog(`✓ Bulk process started. Queued ${res.data.data?.totalWallets} wallets.`, "success");
              startPolling();
          }
      } catch (e: any) { addLog(`✗ Error: ${e.message}`, "error"); setIsReparsing(false); }
  };

  const handleHardResync = async () => {
      if (!selectedWalletId || selectedWalletId === 'ALL') return;
      if(!confirm("⚠️ WARNING: This will DELETE existing transactions and download fresh from RPC. Continue?")) return;

      setIsResyncing(true);
      addLog(`Initiating HARD RESYNC...`, "warning");
      try {
          const res = await axios.post(`${API_URL}/wallet/${selectedWalletId}/resync`);
          if (res.data.success) {
              addLog(`✓ History cleared. Downloading fresh data...`, "success");
              toast({ title: "Resync Started", description: "Fetching fresh data from RPC..." });
          }
      } catch (e: any) { addLog(`✗ Error: ${e.message}`, "error"); } 
      finally { setIsResyncing(false); }
  };

  // ✅ UPDATED: Support Single Wallet & Global Backfill
  const handlePriceBackfill = async () => {
      const isGlobal = !selectedWalletId || selectedWalletId === 'ALL';
      const msg = isGlobal 
        ? "Overwrite prices for ALL wallets with CoinGecko data?" 
        : "Overwrite prices for SELECTED wallet with CoinGecko data?";

      if(!confirm(msg)) return;
      
      setIsBackfilling(true);
      addLog(`Starting ${isGlobal ? 'Global' : 'Single'} price backfill...`, "info");
      
      try {
          // Pilih endpoint berdasarkan seleksi
          const url = isGlobal 
            ? `${API_URL}/backfill-prices` 
            : `${API_URL}/wallet/${selectedWalletId}/backfill-prices`;
            
          await axios.post(url);
          
          addLog("✓ Price backfill job queued.", "success");
          toast({ title: "Updating Prices", description: "Fetching historical rates..." });
      } catch (e: any) { addLog(`✗ Error: ${e.message}`, "error"); } 
      finally { setIsBackfilling(false); }
  };

  const startPolling = () => {
      const interval = setInterval(async () => {
          try {
              const res = await axios.get(`${API_URL}/reparse-status`);
              const status = res.data.data?.status;
              if (status === 'in_progress') {
                  const estimated = res.data.data?.estimated?.transactionsToProcess || 0;
                  setBulkStatus({ isRunning: true, txCount: estimated });
              } else {
                  setBulkStatus({ isRunning: false, txCount: 0 });
                  setIsReparsing(false);
                  addLog("Bulk reparse finished.", "info");
                  clearInterval(interval);
              }
          } catch (e) { clearInterval(interval); }
      }, 5000);
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Tool 1: Local Reparse (Controls Selection) */}
          <Card className="flex flex-col">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Wallet className="text-blue-400"/> 1. Select Wallet</CardTitle><CardDescription>Select target for operations below.</CardDescription></CardHeader>
              <CardContent className="space-y-4 flex-1"><div className="mt-auto space-y-2"><Select value={selectedWalletId} onValueChange={setSelectedWalletId}><SelectTrigger><SelectValue placeholder="Select Wallet" /></SelectTrigger><SelectContent><SelectItem value="ALL" className="font-bold">ALL WALLETS (Bulk)</SelectItem>{wallets.map(w => <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>)}</SelectContent></Select><Button className="w-full" disabled={!selectedWalletId || isReparsing} onClick={handleLocalReparse}>{isReparsing ? <ArrowsClockwise className="animate-spin mr-2"/> : <Play className="mr-2"/>} {selectedWalletId === 'ALL' ? 'Run Bulk Parser' : 'Run Local Parser'}</Button></div></CardContent>
          </Card>

          {/* Tool 2: Hard Resync */}
          <Card className="flex flex-col border-orange-500/20 bg-orange-500/5">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2 text-orange-500"><CloudArrowDown weight="fill"/> 2. Hard Resync</CardTitle><CardDescription>Delete history & re-download from RPC.</CardDescription></CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col"><div className="mt-auto"><Button variant="destructive" className="w-full" disabled={!selectedWalletId || selectedWalletId === 'ALL' || isResyncing} onClick={handleHardResync}>{isResyncing ? <ArrowsClockwise className="animate-spin mr-2"/> : <CloudArrowDown className="mr-2"/>} Resync Selected</Button></div></CardContent>
          </Card>

          {/* Tool 3: Price Backfill (UPDATED) */}
          <Card className="flex flex-col">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Coins className="text-emerald-400"/> 3. Price Engine</CardTitle><CardDescription>Update USD values.</CardDescription></CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col"><div className="mt-auto"><Button variant="outline" className="w-full" onClick={handlePriceBackfill} disabled={isBackfilling}>{isBackfilling ? <ArrowsClockwise className="animate-spin mr-2"/> : <Play className="mr-2"/>} {(!selectedWalletId || selectedWalletId === 'ALL') ? "Backfill ALL" : "Backfill Selected"}</Button></div></CardContent>
          </Card>

          {/* Logs Console */}
          <Card className="md:col-span-2 lg:col-span-3">
              <CardHeader className="pb-2 bg-secondary/30"><CardTitle className="text-base flex items-center gap-2 font-mono"><TerminalWindow/> Activity Log</CardTitle></CardHeader>
              <CardContent className="p-0 bg-black/80">
                  <ScrollArea className="h-[200px] p-4">
                      <div className="space-y-1.5 font-mono text-[10px]">
                          {logs.length === 0 && <div className="text-zinc-600 italic">Waiting for activity...</div>}
                          {logs.map((log, i) => (
                              <div key={i} className="flex gap-2"><span className="text-zinc-500">[{log.timestamp}]</span><span className={cn(log.type === 'success' && "text-green-400", log.type === 'error' && "text-red-400", log.type === 'warning' && "text-yellow-400", log.type === 'info' && "text-blue-300")}>{log.message}</span></div>
                          ))}
                      </div>
                  </ScrollArea>
              </CardContent>
          </Card>

          {/* Documentation Info Cards */}
          <div className="md:col-span-2 lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="text-blue-400"/> Local Reparse</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground"><p>Use this if you updated the parser code to fix decimal places or transaction types.</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CloudArrowDown className="text-orange-400"/> Hard Resync</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground"><p>Wipes transaction history and downloads fresh from RPC. Use if data is corrupted.</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Coins className="text-emerald-400"/> Price Backfill</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground"><p>Queries CoinGecko for exact price at time of transaction for accurate PnL.</p></CardContent></Card>
          </div>
      </div>
    </>
  );
}