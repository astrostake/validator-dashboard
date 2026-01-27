import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { 
  ShieldCheck, Pulse, Gear, ArrowsClockwise, 
  Warning, LockKey, LockKeyOpen,
  ChartLineUp, PaperPlaneRight,
  Broadcast, Scroll, CheckCircle, Info
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// --- Types ---
interface ValidatorData {
  id: string;
  label: string;
  chainName: string;
  valAddress: string;
  consensusAddress?: string;
  
  // Stats
  lastMissedBlocks: number;
  missedBlocksThreshold: number;
  lastUptimeCheck: string | null;
  lastGovernanceCheck: string | null;
  lastProposalChecked: number;
  
  // Status
  jailed: boolean;
  active: boolean; // Derived from status usually
  votingPower: number;
  
  // Config Flags
  notifyMissedBlocks: boolean;
  notifyGovernance: boolean;
  webhookConfigured: boolean;
}

interface SettingsForm {
  webhookUrl: string;
  notifyMissedBlocks: boolean;
  missedBlocksThreshold: number;
  missedBlocksCooldown: number;
  notifyRecovery: boolean;
  notifyGovernance: boolean;
  consensusAddress: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function Nodes() {
  const { toast } = useToast();
  
  // Global State
  const [loading, setLoading] = useState(true);
  const [validators, setValidators] = useState<ValidatorData[]>([]);
  const [checkingIds, setCheckingIds] = useState<Record<string, boolean>>({});

  // Settings Modal State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedValidator, setSelectedValidator] = useState<ValidatorData | null>(null);
  const [settingsForm, setSettingsForm] = useState<SettingsForm>({
     webhookUrl: "",
     notifyMissedBlocks: false,
     missedBlocksThreshold: 10,
     missedBlocksCooldown: 5,
     notifyRecovery: true,
     notifyGovernance: false,
     consensusAddress: ""
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [fetchingConsensus, setFetchingConsensus] = useState(false);

  // Details Modal State
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsData, setDetailsData] = useState<any>(null);

  useEffect(() => {
    fetchValidators();
    const interval = setInterval(() => fetchValidators(true), 60000); 
    return () => clearInterval(interval);
  }, []);

  const fetchValidators = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/dashboard`);
      if (res.data.success && res.data.data) {
        const raw = res.data.data.wallets.validators || [];
        
        const mapped: ValidatorData[] = raw.map((w: any) => ({
            id: w.id,
            label: w.label,
            chainName: w.chain.name,
            valAddress: w.validator?.addresses?.operator || "",
            consensusAddress: w.validator?.addresses?.consensus || "",
            
            lastMissedBlocks: w.validator?.monitoring?.missedBlocks?.status?.currentCount || 0,
            missedBlocksThreshold: w.validator?.monitoring?.missedBlocks?.threshold || 10,
            lastUptimeCheck: w.validator?.monitoring?.missedBlocks?.status?.lastCheck || null,
            lastGovernanceCheck: w.validator?.monitoring?.governance?.tracking?.lastCheck || null,
            lastProposalChecked: w.validator?.monitoring?.governance?.tracking?.lastCheckedProposalId || 0,
            
            jailed: w.validator?.status?.jailed || false,
            active: !w.validator?.status?.jailed, // Simplification
            votingPower: w.validator?.status?.votingPower || 0,
            
            notifyMissedBlocks: w.validator?.notifications?.missedBlocksAlerts || false,
            notifyGovernance: w.validator?.notifications?.governanceAlerts || false,
            webhookConfigured: w.notifications?.webhookConfigured || false
        }));
        setValidators(mapped);
      }
    } catch (e) {
      if (!background) console.error("Fetch error", e);
    } finally {
      if (!background) setLoading(false);
    }
  };

  // --- Actions ---

  const handleCheckNow = async (id: string) => {
      setCheckingIds(prev => ({ ...prev, [id]: true }));
      try {
          await axios.post(`${API_URL}/wallet/${id}/check-validator`);
          toast({ title: "Check Initiated", description: "Syncing latest validator data..." });
          setTimeout(() => fetchValidators(true), 2500);
      } catch (e) {
          toast({ title: "Check Failed", description: "Could not reach the node.", variant: "destructive" });
      } finally {
          setTimeout(() => setCheckingIds(prev => ({ ...prev, [id]: false })), 1000);
      }
  };

  const openSettings = async (val: ValidatorData) => {
      setSelectedValidator(val);
      setSettingsOpen(true);
      
      // Default reset
      setSettingsForm({
          webhookUrl: "",
          notifyMissedBlocks: false,
          missedBlocksThreshold: 10,
          missedBlocksCooldown: 5,
          notifyRecovery: true,
          notifyGovernance: false,
          consensusAddress: ""
      });

      try {
          const res = await axios.get(`${API_URL}/wallet/${val.id}/webhook`);
          if (res.data.success) {
              const s = res.data.data.settings;
              setSettingsForm({
                  webhookUrl: s.webhookUrl || "",
                  notifyMissedBlocks: s.validator?.missedBlocks?.enabled || false,
                  missedBlocksThreshold: s.validator?.missedBlocks?.threshold || 10,
                  missedBlocksCooldown: s.validator?.missedBlocks?.cooldownMinutes || 5,
                  notifyRecovery: s.validator?.missedBlocks?.notifyRecovery ?? true,
                  notifyGovernance: s.validator?.governance || false,
                  consensusAddress: s.validator?.consensusAddress || ""
              });
          }
      } catch (e) { console.error(e); }
  };

  const saveSettings = async () => {
      if (!selectedValidator) return;
      setSavingSettings(true);
      try {
          await axios.post(`${API_URL}/wallet/${selectedValidator.id}/webhook`, settingsForm);
          toast({ title: "Configuration Saved", description: "Monitoring settings have been updated." });
          setSettingsOpen(false);
          fetchValidators(true);
      } catch (e) {
          toast({ title: "Save Failed", description: "Please check your input.", variant: "destructive" });
      } finally {
          setSavingSettings(false);
      }
  };

  const testWebhook = async () => {
    if (!selectedValidator || !settingsForm.webhookUrl) {
        toast({ title: "Missing URL", description: "Please enter a Webhook URL first.", variant: "destructive" });
        return;
    }
    setTestingWebhook(true);
    try {
        // Save first strictly to ensure backend has the URL
        await axios.post(`${API_URL}/wallet/${selectedValidator.id}/webhook`, settingsForm);
        await axios.post(`${API_URL}/wallet/${selectedValidator.id}/webhook/test`);
        toast({ title: "Test Sent", description: "Check your Discord channel." });
    } catch (e) {
        toast({ title: "Test Failed", description: "Could not send webhook.", variant: "destructive" });
    } finally {
        setTestingWebhook(false);
    }
  };

  const autoFetchConsensus = async () => {
      if (!selectedValidator) return;
      setFetchingConsensus(true);
      try {
          const res = await axios.get(`${API_URL}/wallet/${selectedValidator.id}/fetch-consensus`);
          if (res.data.success) {
              setSettingsForm(prev => ({
                  ...prev,
                  consensusAddress: res.data.data.validator.consensusAddress
              }));
              toast({ title: "Address Fetched", description: "Consensus address updated." });
          }
      } catch (e) {
          toast({ title: "Fetch Failed", description: "Is the node reachable?", variant: "destructive" });
      } finally {
          setFetchingConsensus(false);
      }
  };

  const openDetails = async (id: string) => {
      setDetailsOpen(true);
      setDetailsData(null);
      try {
          const res = await axios.get(`${API_URL}/wallet/${id}/validator-status`);
          if (res.data.success) {
              setDetailsData(res.data.data);
          }
      } catch (e) { console.error(e); }
  };

  // --- Stats Helpers ---
  const stats = useMemo(() => {
      const total = validators.length;
      const jailed = validators.filter(v => v.jailed).length;
      const healthy = validators.filter(v => !v.jailed && v.lastMissedBlocks === 0).length;
      const warning = validators.filter(v => !v.jailed && v.lastMissedBlocks > 0).length;
      return { total, jailed, healthy, warning };
  }, [validators]);

  const getBarColor = (curr: number, max: number) => {
      if (curr >= max) return "bg-destructive shadow-lg shadow-destructive/20";
      if (curr > max * 0.7) return "bg-orange-500";
      if (curr > 0) return "bg-yellow-500";
      return "bg-emerald-500";
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      
      {/* 1. Dashboard Header & Global Stats */}
      <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
               <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                   <ShieldCheck weight="fill" className="text-primary h-8 w-8"/> 
                   Validator Monitor
               </h1>
               <p className="text-muted-foreground mt-1">Real-time uptime tracking, jail detection, and governance alerts.</p>
            </div>
            <Button onClick={() => fetchValidators()} disabled={loading} variant="outline" className="gap-2 h-10">
                <ArrowsClockwise className={cn(loading && "animate-spin")} size={18} /> 
                {loading ? "Syncing..." : "Refresh Data"}
            </Button>
          </div>

          {/* Quick Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-card/50 border-border/60 shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase">Total Nodes</p>
                          <p className="text-2xl font-bold">{stats.total}</p>
                      </div>
                      <Broadcast className="text-primary h-8 w-8 opacity-20"/>
                  </CardContent>
              </Card>
              <Card className="bg-emerald-500/10 border-emerald-500/20 shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                          <p className="text-xs font-medium text-emerald-500 uppercase">Healthy</p>
                          <p className="text-2xl font-bold text-emerald-500">{stats.healthy}</p>
                      </div>
                      <CheckCircle className="text-emerald-500 h-8 w-8 opacity-40"/>
                  </CardContent>
              </Card>
              <Card className="bg-orange-500/10 border-orange-500/20 shadow-sm">
                   <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                          <p className="text-xs font-medium text-orange-500 uppercase">Warning</p>
                          <p className="text-2xl font-bold text-orange-500">{stats.warning}</p>
                      </div>
                      <Warning className="text-orange-500 h-8 w-8 opacity-40"/>
                  </CardContent>
              </Card>
              <Card className="bg-destructive/10 border-destructive/20 shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between">
                      <div className="space-y-1">
                          <p className="text-xs font-medium text-destructive uppercase">Jailed</p>
                          <p className="text-2xl font-bold text-destructive">{stats.jailed}</p>
                      </div>
                      <LockKey className="text-destructive h-8 w-8 opacity-40"/>
                  </CardContent>
              </Card>
          </div>
      </div>

      <Separator className="bg-border/60" />

      {/* 2. Empty State */}
      {!loading && validators.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-border/50 rounded-xl bg-secondary/5 text-center">
             <div className="bg-secondary/50 p-4 rounded-full mb-4">
                 <ShieldCheck weight="duotone" className="text-4xl text-muted-foreground opacity-50" />
             </div>
             <h3 className="text-xl font-semibold">No Validators Configured</h3>
             <p className="text-muted-foreground mt-2 max-w-sm mb-6">
                 Add a wallet with a "Validator Address" in the Dashboard to start monitoring performance.
             </p>
             <Button variant="secondary">Go to Wallet Dashboard</Button>
          </div>
      )}

      {/* 3. Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {validators.map(val => (
             <Card key={val.id} className="overflow-hidden group border-border/60 shadow-md hover:shadow-lg transition-all duration-300">
                 
                 {/* Card Header */}
                 <div className="p-5 border-b border-border/60 bg-secondary/20 flex justify-between items-start">
                     <div className="flex items-start gap-3">
                         <div className={cn("p-2 rounded-lg mt-1", val.jailed ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                            {val.jailed ? <LockKey size={20} weight="fill"/> : <Pulse size={20} weight="fill"/>}
                         </div>
                         <div>
                             <div className="flex items-center gap-2">
                                 <h3 className="font-bold text-lg">{val.label}</h3>
                                 <Badge variant="outline" className="text-[10px] h-5 px-2 bg-background/50 font-mono text-muted-foreground">
                                     {val.chainName}
                                 </Badge>
                             </div>
                             <div className="font-mono text-xs text-muted-foreground mt-1 opacity-70">
                                 {val.valAddress.slice(0, 10)}...{val.valAddress.slice(-6)}
                             </div>
                         </div>
                     </div>
                     <Button variant="ghost" size="icon" onClick={() => openSettings(val)} className="text-muted-foreground hover:text-foreground">
                         <Gear weight="bold" size={20} />
                     </Button>
                 </div>

                 <CardContent className="p-6 space-y-6">
                     {/* Uptime Status Block */}
                     <div className="space-y-3">
                         <div className="flex justify-between items-end">
                             <div className="flex items-center gap-2">
                                 <span className="text-sm font-medium text-muted-foreground">Signed Blocks</span>
                                 {!val.consensusAddress && (
                                     <span className="text-[10px] bg-yellow-500/10 text-yellow-600 px-2 py-0.5 rounded-full border border-yellow-500/20 flex items-center gap-1">
                                         <Warning size={10} weight="fill"/> No Consensus Addr
                                     </span>
                                 )}
                             </div>
                             <div className="text-right">
                                 <div className="text-2xl font-bold font-mono leading-none">
                                     {val.lastMissedBlocks} <span className="text-sm text-muted-foreground font-sans font-normal">missed</span>
                                 </div>
                                 <div className="text-[10px] text-muted-foreground mt-1">
                                     Threshold: {val.missedBlocksThreshold}
                                 </div>
                             </div>
                         </div>

                         {/* Pro Progress Bar */}
                         <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden relative">
                             <div 
                                className={cn("h-full rounded-full transition-all duration-700 ease-out", getBarColor(val.lastMissedBlocks, val.missedBlocksThreshold))}
                                style={{ width: `${Math.min(((val.lastMissedBlocks || 0) / val.missedBlocksThreshold) * 100, 100)}%` }}
                             />
                         </div>
                     </div>

                     {/* Info Grid */}
                     <div className="grid grid-cols-2 gap-3">
                         <div className="bg-secondary/30 p-3 rounded-lg border border-border/50">
                             <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status</div>
                             <div className={cn("font-bold text-sm flex items-center gap-2", val.jailed ? "text-destructive" : "text-emerald-500")}>
                                 {val.jailed ? <LockKey weight="fill"/> : <LockKeyOpen weight="fill"/>}
                                 {val.jailed ? "JAILED" : "ACTIVE"}
                             </div>
                         </div>
                         <div className="bg-secondary/30 p-3 rounded-lg border border-border/50">
                             <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Last Update</div>
                             <div className="font-mono text-xs mt-1 truncate">
                                 {val.lastUptimeCheck ? new Date(val.lastUptimeCheck).toLocaleTimeString() : 'Waiting...'}
                             </div>
                         </div>
                     </div>
                 </CardContent>

                 {/* Action Footer */}
                 <div className="p-4 bg-secondary/10 border-t border-border/60 flex gap-3">
                     <Button variant="outline" size="sm" className="flex-1 bg-background/50" onClick={() => handleCheckNow(val.id)} disabled={checkingIds[val.id]}>
                         <ArrowsClockwise className={cn("mr-2", checkingIds[val.id] && "animate-spin")} />
                         Check Now
                     </Button>
                     <Button size="sm" className="flex-1" onClick={() => openDetails(val.id)}>
                         <ChartLineUp weight="bold" className="mr-2"/> Details
                     </Button>
                 </div>

                 {/* Status Indicators Strip */}
                 <div className="px-5 py-2 bg-secondary/40 border-t border-border/60 flex gap-6 text-[10px] font-mono text-muted-foreground">
                     <div className={cn("flex items-center gap-1.5 transition-colors", val.notifyMissedBlocks ? "text-emerald-500" : "opacity-50")}>
                         <div className="w-1.5 h-1.5 rounded-full bg-current"/> Uptime
                     </div>
                     <div className={cn("flex items-center gap-1.5 transition-colors", val.notifyGovernance ? "text-emerald-500" : "opacity-50")}>
                         <div className="w-1.5 h-1.5 rounded-full bg-current"/> Governance
                     </div>
                     <div className={cn("flex items-center gap-1.5 transition-colors", val.webhookConfigured ? "text-blue-500" : "opacity-50")}>
                         <div className="w-1.5 h-1.5 rounded-full bg-current"/> Webhook
                     </div>
                 </div>
             </Card>
          ))}
      </div>

      {/* --- SETTINGS DIALOG (Enterprise Layout) --- */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto gap-0 p-0">
              <DialogHeader className="p-6 pb-2">
                  <DialogTitle className="flex items-center gap-2 text-xl">
                      <Gear className="text-primary"/> Configure Monitoring
                  </DialogTitle>
                  <DialogDescription>
                      Settings for <span className="font-semibold text-foreground">{selectedValidator?.label}</span>
                  </DialogDescription>
              </DialogHeader>

              <div className="p-6 pt-2">
                <Tabs defaultValue="webhook" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-6 bg-secondary/50">
                        <TabsTrigger value="webhook">Integrations</TabsTrigger>
                        <TabsTrigger value="uptime">Uptime Rules</TabsTrigger>
                        <TabsTrigger value="gov">Governance</TabsTrigger>
                    </TabsList>

                    {/* TAB 1: WEBHOOK */}
                    <TabsContent value="webhook" className="space-y-6 focus-visible:ring-0">
                        <div className="space-y-4 rounded-lg border p-4 bg-secondary/10">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Discord Webhook URL</Label>
                                <div className="flex gap-2">
                                    <Input className="font-mono text-xs bg-background" 
                                        placeholder="https://discord.com/api/webhooks/..."
                                        value={settingsForm.webhookUrl}
                                        onChange={(e) => setSettingsForm({...settingsForm, webhookUrl: e.target.value})} />
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Create a webhook in your Discord Server Settings → Integrations.
                                </p>
                            </div>
                            
                            <div className="flex items-center justify-between pt-2">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Info weight="fill" className="text-blue-500"/> Required for all alerts
                                </span>
                                <Button size="sm" variant="secondary" onClick={testWebhook} disabled={testingWebhook} className="h-8">
                                    {testingWebhook ? <ArrowsClockwise className="animate-spin mr-2"/> : <PaperPlaneRight className="mr-2"/>}
                                    Test Notification
                                </Button>
                            </div>
                        </div>
                    </TabsContent>

                    {/* TAB 2: UPTIME */}
                    <TabsContent value="uptime" className="space-y-5 focus-visible:ring-0">
                        {/* Master Switch */}
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors">
                            <div className="space-y-0.5">
                                <div className="text-sm font-semibold flex items-center gap-2">
                                    <Pulse className="text-emerald-500" weight="fill"/> Enable Uptime Monitoring
                                </div>
                                <div className="text-xs text-muted-foreground">Alert when validator misses consecutive blocks</div>
                            </div>
                            <Switch checked={settingsForm.notifyMissedBlocks} onCheckedChange={(c) => setSettingsForm({...settingsForm, notifyMissedBlocks: c})} />
                        </div>

                        {settingsForm.notifyMissedBlocks && (
                            <div className="space-y-6 border-l-2 border-primary/20 pl-4 ml-1 animate-in slide-in-from-left-2 fade-in duration-300">
                                
                                {/* Consensus Config */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Configuration</Label>
                                    <div className="space-y-2">
                                        <Label className="text-sm">Consensus Address (valcons)</Label>
                                        <div className="flex gap-2">
                                            <Input className="font-mono text-xs bg-background" placeholder="cosmosvalcons1..." 
                                                value={settingsForm.consensusAddress}
                                                onChange={(e) => setSettingsForm({...settingsForm, consensusAddress: e.target.value})}/>
                                            <Button variant="outline" size="icon" onClick={autoFetchConsensus} disabled={fetchingConsensus} title="Auto Fetch">
                                                <ArrowsClockwise className={cn(fetchingConsensus && "animate-spin")}/>
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <Separator />

                                {/* Thresholds */}
                                <div className="space-y-6">
                                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sensitivity</Label>
                                    
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-sm">Alert Threshold</Label>
                                            <Badge variant="secondary" className="font-mono">{settingsForm.missedBlocksThreshold} Blocks</Badge>
                                        </div>
                                        <Slider 
                                            value={[settingsForm.missedBlocksThreshold]} 
                                            min={5} max={100} step={1}
                                            className="py-2"
                                            onValueChange={(v) => setSettingsForm({...settingsForm, missedBlocksThreshold: v[0]})} 
                                        />
                                        <p className="text-[10px] text-muted-foreground">Trigger alert after missing this many blocks.</p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <Label className="text-sm">Cooldown Period</Label>
                                            <Badge variant="secondary" className="font-mono">{settingsForm.missedBlocksCooldown} Minutes</Badge>
                                        </div>
                                        <Slider 
                                            value={[settingsForm.missedBlocksCooldown]} 
                                            min={1} max={60} step={1}
                                            className="py-2"
                                            onValueChange={(v) => setSettingsForm({...settingsForm, missedBlocksCooldown: v[0]})} 
                                        />
                                        <p className="text-[10px] text-muted-foreground">Wait time before sending another alert for the same issue.</p>
                                    </div>
                                </div>
                                
                                <Separator />
                                
                                {/* Recovery */}
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm flex items-center gap-2 cursor-pointer">
                                        <CheckCircle className="text-emerald-500"/> Notify on Recovery
                                    </Label>
                                    <Switch checked={settingsForm.notifyRecovery} onCheckedChange={(c) => setSettingsForm({...settingsForm, notifyRecovery: c})} />
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* TAB 3: GOVERNANCE */}
                    <TabsContent value="gov" className="space-y-6 focus-visible:ring-0">
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-secondary/10">
                            <div className="space-y-0.5">
                                <div className="text-sm font-semibold flex items-center gap-2">
                                    <Scroll className="text-purple-500" weight="fill"/> Enable Governance Alerts
                                </div>
                                <div className="text-xs text-muted-foreground">Get notified about new proposals instantly</div>
                            </div>
                            <Switch checked={settingsForm.notifyGovernance} onCheckedChange={(c) => setSettingsForm({...settingsForm, notifyGovernance: c})} />
                        </div>

                        {settingsForm.notifyGovernance && selectedValidator && (
                            <div className="bg-secondary/20 border border-border rounded-lg p-4 space-y-3">
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Sync Status</h4>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-muted-foreground text-xs block">Last Checked</span>
                                        <span className="font-mono">
                                            {selectedValidator.lastGovernanceCheck ? new Date(selectedValidator.lastGovernanceCheck).toLocaleString() : "Never"}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground text-xs block">Last Proposal ID</span>
                                        <span className="font-mono">#{selectedValidator.lastProposalChecked}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
              </div>

              <DialogFooter className="p-6 pt-2 border-t bg-secondary/10">
                  <Button variant="ghost" onClick={() => setSettingsOpen(false)}>Cancel</Button>
                  <Button onClick={saveSettings} disabled={savingSettings}>
                      {savingSettings ? <ArrowsClockwise className="animate-spin mr-2"/> : null}
                      Save Configuration
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* --- DETAILS DIALOG --- */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-xl">
             <DialogHeader>
                 <DialogTitle className="flex items-center gap-2">
                     <ChartLineUp className="text-primary"/> Technical Details
                 </DialogTitle>
             </DialogHeader>
             {!detailsData ? (
                 <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                     <ArrowsClockwise className="animate-spin text-2xl"/>
                     <span className="text-sm">Fetching on-chain data...</span>
                 </div>
             ) : (
                 <div className="space-y-6">
                     {/* Key Metrics */}
                     <div className="grid grid-cols-2 gap-4">
                         <div className="bg-secondary/20 p-4 rounded-lg border border-border">
                             <div className="text-xs text-muted-foreground uppercase tracking-wide">Moniker</div>
                             <div className="font-bold text-lg mt-1">{detailsData.validator.operator.moniker}</div>
                         </div>
                         <div className="bg-secondary/20 p-4 rounded-lg border border-border">
                             <div className="text-xs text-muted-foreground uppercase tracking-wide">Voting Power</div>
                             <div className="font-bold text-lg mt-1 font-mono">{Math.floor(detailsData.validator.status.votingPower).toLocaleString()}</div>
                         </div>
                     </div>
                     
                     {/* Signing JSON */}
                     <div className="space-y-2">
                         <Label className="text-xs font-semibold uppercase">Signing Info (Raw)</Label>
                         <div className="bg-black/80 p-4 rounded-lg border border-border/50 relative group">
                            <pre className="text-[10px] font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap max-h-[150px] overflow-y-auto custom-scrollbar">
                                {JSON.stringify(detailsData.validator.signing, null, 2)}
                            </pre>
                         </div>
                     </div>
                     
                     {/* Internal Stats */}
                     <div className="space-y-2">
                         <Label className="text-xs font-semibold uppercase">Monitoring Debug</Label>
                         <div className="bg-secondary/20 p-4 rounded-lg border border-border text-sm space-y-2">
                             <div className="flex justify-between border-b border-border/50 pb-2">
                                 <span className="text-muted-foreground">Real-time Missed Blocks</span>
                                 <span className="font-mono font-bold">{detailsData.monitoring.uptime.currentMissedBlocks}</span>
                             </div>
                             <div className="flex justify-between pt-1">
                                 <span className="text-muted-foreground">Last Database Sync</span>
                                 <span className="font-mono text-xs">{new Date(detailsData.monitoring.uptime.lastCheck).toLocaleString()}</span>
                             </div>
                         </div>
                     </div>
                 </div>
             )}
          </DialogContent>
      </Dialog>

    </div>
  );
}