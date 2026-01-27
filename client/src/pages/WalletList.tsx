import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { 
  Plus, Wallet, PencilSimple, Trash, Bell, 
  ArrowsClockwise, DiscordLogo, PaperPlaneRight,
  Money, ArrowRight, ShieldCheck, CheckCircle,
  Coins, LockKey, Gift, Briefcase, Globe
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch"; 
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Import komponen transaksi
import { WalletTransactions } from "@/components/wallet/WalletTransactions";

// --- Types ---
interface Chain { 
    id: string; 
    name: string; 
    token: { denom: string; decimals: number }; 
    priceUsd?: number; 
}

interface WalletData {
  id: string;
  label: string;
  address: string;
  chainId: string;
  chain: Chain;
  balances: { total: string; staked: string; available: string; rewards: string };
  validator?: { 
      addresses?: { operator?: string };
      earnings?: { commission?: string }; 
  };
  isSyncing?: boolean;
  webhookUrl?: boolean; 
  valAddress?: string; 
}

interface WebhookForm {
    webhookUrl: string;
    notifyWalletTx: boolean;
    notifyOwnDelegations: boolean;
    notifyValidatorTx: boolean;
    notifyBalanceChange: boolean;
    balanceThreshold: number;
}

export default function WalletList() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  
  // Filter State (Global)
  const [selectedChainFilter, setSelectedChainFilter] = useState<string>("all");

  // States untuk Add Wallet
  const [newWallet, setNewWallet] = useState({ chainId: "", label: "", address: "", valAddress: "" });
  const [isAdding, setIsAdding] = useState(false);

  // States untuk Edit Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<{id: string, label: string, valAddress: string} | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // States untuk Webhook Modal
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [currentWebhookWallet, setCurrentWebhookWallet] = useState<WalletData | null>(null);
  const [webhookForm, setWebhookForm] = useState<WebhookForm>({
      webhookUrl: "",
      notifyWalletTx: false, notifyOwnDelegations: false, notifyValidatorTx: false, notifyBalanceChange: false, balanceThreshold: 100
  });
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    loadData();
    loadChains();
  }, []);

  const loadData = async () => {
    try {
      const res = await axios.get(`${API_URL}/dashboard`);
      const data = res.data.data;
      if (data) {
        const allWallets = [
          ...(data.wallets.validators || []),
          ...(data.wallets.regular || [])
        ].map((w: any) => ({
            ...w,
            valAddress: w.validator?.addresses?.operator || null
        }));
        setWallets(allWallets);
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const loadChains = async () => {
    try {
      const res = await axios.get(`${API_URL}/chains`);
      if (res.data.success) {
        setChains(res.data.data);
        if (res.data.data.length > 0) setNewWallet(prev => ({ ...prev, chainId: res.data.data[0].id }));
      }
    } catch (e) { console.error(e); }
  };

  // --- Computed Data (Stats & List) ---
  const filteredWallets = useMemo(() => {
      if (selectedChainFilter === "all") return wallets;
      return wallets.filter(w => String(w.chain?.id) === String(selectedChainFilter));
  }, [wallets, selectedChainFilter]);

  // UPDATE: Kalkulasi Dual Mode (USD & Token)
  const stats = useMemo(() => {
      // Init USD
      let totalAssetsUsd = 0;
      let totalStakedUsd = 0;
      let totalRewardsUsd = 0;
      let totalCommissionUsd = 0;

      // Init Token (Hanya dipakai jika 1 chain dipilih)
      let totalAssetsToken = 0;
      let totalStakedToken = 0;
      let totalRewardsToken = 0;
      let totalCommissionToken = 0;
      let tokenSymbol = "";

      filteredWallets.forEach(w => {
          const price = w.chain?.priceUsd || 0;
          
          const available = parseFloat(w.balances.available || "0");
          const staked = parseFloat(w.balances.staked || "0");
          const rewards = parseFloat(w.balances.rewards || "0");
          const commission = parseFloat(w.validator?.earnings?.commission || "0");

          // Hitung USD (selalu dihitung)
          totalAssetsUsd += (available + staked) * price;
          totalStakedUsd += staked * price;
          totalRewardsUsd += rewards * price;
          totalCommissionUsd += commission * price;

          // Hitung Token (Untuk display spesifik chain)
          totalAssetsToken += (available + staked);
          totalStakedToken += staked;
          totalRewardsToken += rewards;
          totalCommissionToken += commission;
          
          // Ambil simbol token dari wallet pertama yang ditemukan
          if (!tokenSymbol && w.chain?.token?.denom) {
              tokenSymbol = w.chain.token.denom;
          }
      });

      return { 
          usd: {
             totalAssets: totalAssetsUsd,
             totalStaked: totalStakedUsd,
             totalRewards: totalRewardsUsd,
             totalCommission: totalCommissionUsd
          },
          token: {
             totalAssets: totalAssetsToken,
             totalStaked: totalStakedToken,
             totalRewards: totalRewardsToken,
             totalCommission: totalCommissionToken,
             symbol: tokenSymbol.toUpperCase()
          }
      };
  }, [filteredWallets]);

  // --- Actions ---
  const handleAddWallet = async () => {
    if (!newWallet.label || !newWallet.address) return toast({ title: "Error", description: "Label and address required", variant: "destructive" });
    setIsAdding(true);
    try {
      await axios.post(`${API_URL}/wallets`, newWallet);
      toast({ title: "Success", description: "Wallet added successfully" });
      setNewWallet({ ...newWallet, label: "", address: "", valAddress: "" });
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.response?.data?.error || "Failed to add wallet", variant: "destructive" });
    } finally { setIsAdding(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this wallet?")) return;
    try {
      await axios.delete(`${API_URL}/wallet/${id}`);
      toast({ title: "Deleted", description: "Wallet removed" });
      loadData();
      if (selectedWalletId === id) setSelectedWalletId(null);
    } catch (e) { console.error(e); }
  };

  // Edit Logic
  const openEdit = (w: WalletData) => {
    setEditingWallet({ id: w.id, label: w.label, valAddress: w.valAddress || "" });
    setEditModalOpen(true);
  };

  const saveEdit = async () => {
    if (!editingWallet) return;
    setIsSavingEdit(true);
    try {
      await axios.patch(`${API_URL}/wallet/${editingWallet.id}`, { label: editingWallet.label, valAddress: editingWallet.valAddress });
      toast({ title: "Updated", description: "Wallet details updated" });
      setEditModalOpen(false);
      loadData();
    } catch (e) { toast({ variant: "destructive", title: "Failed", description: "Update failed" }); } 
    finally { setIsSavingEdit(false); }
  };

  // Webhook Logic
  const openWebhook = async (w: WalletData) => {
    setCurrentWebhookWallet(w);
    setWebhookModalOpen(true);
    setWebhookForm({
        webhookUrl: "", notifyWalletTx: false, notifyOwnDelegations: false, notifyValidatorTx: false, notifyBalanceChange: false, balanceThreshold: 100
    });
    try {
        const res = await axios.get(`${API_URL}/wallet/${w.id}/webhook`);
        if (res.data.success) {
            const s = res.data.data.settings;
            setWebhookForm({
                webhookUrl: s.webhookUrl || "",
                notifyWalletTx: s.general?.walletTransactions || false,
                notifyOwnDelegations: s.validator?.ownDelegations || false,
                notifyValidatorTx: s.validator?.incomingDelegations || false,
                notifyBalanceChange: s.general?.balanceChanges?.enabled || false,
                balanceThreshold: s.general?.balanceChanges?.thresholdUsd || 100
            });
        }
    } catch (e) { console.error(e); }
  };

  const saveWebhook = async () => {
    if (!currentWebhookWallet) return;
    setIsSavingWebhook(true);
    try {
        await axios.post(`${API_URL}/wallet/${currentWebhookWallet.id}/webhook`, webhookForm);
        toast({ title: "Saved", description: "Notification settings updated" });
        setWebhookModalOpen(false);
    } catch (e) { toast({ variant: "destructive", title: "Error", description: "Failed to save settings" }); }
    finally { setIsSavingWebhook(false); }
  };

  const testWebhook = async () => {
    if (!currentWebhookWallet) return;
    setIsTestingWebhook(true);
    try {
        await axios.post(`${API_URL}/wallet/${currentWebhookWallet.id}/webhook/test`, { testUrl: webhookForm.webhookUrl });
        toast({ title: "Sent", description: "Test notification sent to Discord!" });
    } catch (e) { toast({ variant: "destructive", title: "Error", description: "Test failed. Check URL." }); }
    finally { setIsTestingWebhook(false); }
  };

  // Helpers
  const shorten = (str: string) => str ? `${str.slice(0, 8)}...${str.slice(-4)}` : '';
  const formatMoney = (val: string | number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(typeof val === 'string' ? parseFloat(val) : val);
  const formatUsd = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  // UPDATE: Render Component Helper untuk Stats
  const renderStatValue = (tokenVal: number, usdVal: number) => {
      if (selectedChainFilter === "all") {
          return <div className="text-2xl font-bold font-mono tracking-tight relative z-10">{formatUsd(usdVal)}</div>;
      }
      return (
          <div className="relative z-10">
              <div className="text-2xl font-bold font-mono tracking-tight">
                  {formatMoney(tokenVal)} <span className="text-sm font-sans text-muted-foreground">{stats.token.symbol}</span>
              </div>
              <div className="text-xs font-medium text-muted-foreground mt-0.5">
                  ≈ {formatUsd(usdVal)}
              </div>
          </div>
      );
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-500">
      
      {/* 1. Header & Filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
          <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                  <Wallet weight="duotone" className="text-primary" /> Wallet Manager
              </h1>
              <p className="text-muted-foreground mt-1">Manage wallets, view balances, and track history.</p>
          </div>
          
          <div className="flex items-center gap-3 bg-card p-1 rounded-lg border border-border">
              <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Select value={selectedChainFilter} onValueChange={setSelectedChainFilter}>
                      <SelectTrigger className="w-[180px] h-9 border-none bg-transparent pl-9 text-xs font-medium focus:ring-0">
                          <SelectValue placeholder="All Chains" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="all">All Chains (USD)</SelectItem>
                          {chains.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                  </Select>
              </div>
              <div className="w-px h-5 bg-border"></div>
              <Button variant="ghost" size="icon" onClick={() => loadData()} disabled={loading} className="h-8 w-8 text-muted-foreground hover:text-white">
                  <ArrowsClockwise className={cn(loading && "animate-spin")} />
              </Button>
          </div>
      </div>

      {/* 2. Stats Cards (UPDATED) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 border-border bg-card relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all"></div>
              <div className="flex justify-between items-start mb-2 relative z-10">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Assets</span>
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg"><Coins weight="fill" /></div>
              </div>
              {renderStatValue(stats.token.totalAssets, stats.usd.totalAssets)}
          </Card>

          <Card className="p-5 border-border bg-card relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all"></div>
              <div className="flex justify-between items-start mb-2 relative z-10">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Staked</span>
                  <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg"><LockKey weight="fill" /></div>
              </div>
              {renderStatValue(stats.token.totalStaked, stats.usd.totalStaked)}
          </Card>

          <Card className="p-5 border-border bg-card relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all"></div>
              <div className="flex justify-between items-start mb-2 relative z-10">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rewards</span>
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><Gift weight="fill" /></div>
              </div>
              {renderStatValue(stats.token.totalRewards, stats.usd.totalRewards)}
          </Card>

          <Card className="p-5 border-border bg-card relative overflow-hidden group">
              <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all"></div>
              <div className="flex justify-between items-start mb-2 relative z-10">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Commission</span>
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg"><Briefcase weight="fill" /></div>
              </div>
              {renderStatValue(stats.token.totalCommission, stats.usd.totalCommission)}
          </Card>
      </div>

      {/* 3. Content Area */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* LEFT: Add & List (4 Cols) */}
          <div className="xl:col-span-4 flex flex-col gap-6">
              {/* Add Card */}
              <Card>
                  <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Plus weight="bold" className="text-primary" /> Add New Wallet
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                              <Select value={newWallet.chainId} onValueChange={(v) => setNewWallet({...newWallet, chainId: v})}>
                                  <SelectTrigger className="text-xs h-9 bg-secondary border-border"><SelectValue placeholder="Chain" /></SelectTrigger>
                                  <SelectContent>
                                      {chains.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                                  </SelectContent>
                              </Select>
                          </div>
                          <Input placeholder="Label" className="h-9 text-xs bg-secondary border-border" 
                                 value={newWallet.label} onChange={e => setNewWallet({...newWallet, label: e.target.value})} />
                      </div>
                      <Input placeholder="Wallet Address (cosmos1...)" className="h-9 text-xs font-mono bg-secondary border-border" 
                             value={newWallet.address} onChange={e => setNewWallet({...newWallet, address: e.target.value})} />
                      <Input placeholder="Validator Address (Optional)" className="h-9 text-xs font-mono bg-secondary border-border" 
                             value={newWallet.valAddress} onChange={e => setNewWallet({...newWallet, valAddress: e.target.value})} />
                      <Button className="w-full h-9 text-xs" onClick={handleAddWallet} disabled={isAdding}>
                          {isAdding ? "Adding..." : "Add Wallet"}
                      </Button>
                  </CardContent>
              </Card>

              {/* Wallet List */}
              <Card className="flex-1 overflow-hidden flex flex-col min-h-[500px]">
                  <CardHeader className="pb-3 bg-secondary/30 border-b border-border">
                      <div className="flex justify-between items-center">
                          <CardTitle className="text-sm">Wallets List</CardTitle>
                          <Badge variant="secondary" className="text-xs">{filteredWallets.length}</Badge>
                      </div>
                  </CardHeader>
                  <CardContent className="p-0 flex-1">
                      <ScrollArea className="h-[500px]">
                          <div className="p-2 space-y-1">
                              {filteredWallets.length === 0 && <div className="p-8 text-center text-xs text-muted-foreground">No wallets found matching filter.</div>}
                              {filteredWallets.map(w => (
                                  <div key={w.id} 
                                       onClick={() => setSelectedWalletId(w.id)}
                                       className={cn(
                                           "group relative p-3 rounded-lg border transition-all cursor-pointer",
                                           selectedWalletId === w.id 
                                            ? "bg-primary/10 border-primary/40 ring-1 ring-primary/20" 
                                            : "bg-transparent border-transparent hover:bg-secondary/50 hover:border-border"
                                       )}
                                  >
                                      <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-3 overflow-hidden">
                                              <div className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                                                  {w.chain?.name.substring(0,2).toUpperCase()}
                                              </div>
                                              <div className="min-w-0">
                                                  <div className="flex items-center gap-2">
                                                      <span className="font-medium text-sm truncate">{w.label}</span>
                                                      {w.valAddress && (
                                                          <Badge variant="outline" className="text-[9px] h-4 px-1 border-indigo-500/30 text-indigo-400 bg-indigo-500/10">VAL</Badge>
                                                      )}
                                                  </div>
                                                  <div className="text-xs text-muted-foreground font-mono truncate">{shorten(w.address)}</div>
                                              </div>
                                          </div>
                                          <div className="text-right shrink-0 pl-2">
                                              <div className="text-sm font-mono font-medium text-emerald-400">
                                                  {formatMoney(w.balances.total)}
                                              </div>
                                              <div className="text-[10px] text-muted-foreground">{w.chain?.token?.denom}</div>
                                          </div>
                                      </div>
                                      
                                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity bg-background/80 backdrop-blur rounded p-0.5">
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10" onClick={(e) => { e.stopPropagation(); openEdit(w); }}>
                                              <PencilSimple size={14} weight="bold" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-500 hover:text-blue-400 hover:bg-blue-500/10" onClick={(e) => { e.stopPropagation(); openWebhook(w); }}>
                                              <Bell size={14} weight="bold" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-400 hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); handleDelete(w.id); }}>
                                              <Trash size={14} weight="bold" />
                                          </Button>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </ScrollArea>
                  </CardContent>
              </Card>
          </div>

          {/* RIGHT: Transactions */}
          <div className="xl:col-span-8">
              <WalletTransactions 
                  wallet={wallets.find(w => w.id === selectedWalletId) || null} 
              />
          </div>
      </div>

      {/* --- MODALS --- */}
      {/* Edit Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>Edit Wallet</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Label</Label>
              <Input value={editingWallet?.label || ""} onChange={(e) => setEditingWallet(prev => prev ? {...prev, label: e.target.value} : null)} />
            </div>
            <div className="grid gap-2">
              <Label>Validator Address</Label>
              <Input className="font-mono text-xs" value={editingWallet?.valAddress || ""} onChange={(e) => setEditingWallet(prev => prev ? {...prev, valAddress: e.target.value} : null)} />
            </div>
          </div>
          <DialogFooter><Button onClick={saveEdit} disabled={isSavingEdit}>{isSavingEdit ? "Saving..." : "Save Changes"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Webhook Modal */}
      <Dialog open={webhookModalOpen} onOpenChange={setWebhookModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                <DiscordLogo className="text-indigo-400" weight="fill" /> Notification Settings
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label>Discord Webhook URL</Label>
              <Input className="font-mono text-xs" placeholder="https://discord.com/api/webhooks/..." 
                     value={webhookForm.webhookUrl} onChange={(e) => setWebhookForm({...webhookForm, webhookUrl: e.target.value})} />
            </div>

            <div className="space-y-4 border-t pt-4">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Events</Label>
                
                <div className="flex items-center justify-between p-3 border rounded-lg bg-secondary/20">
                    <div className="space-y-0.5"><div className="text-sm font-medium flex items-center gap-2"><ArrowRight className="text-blue-400"/> Wallet Transactions</div><div className="text-xs text-muted-foreground">Notify on Send, Receive, and IBC Transfers</div></div>
                    <Switch checked={webhookForm.notifyWalletTx} onCheckedChange={(c) => setWebhookForm({...webhookForm, notifyWalletTx: c})} />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg bg-secondary/20">
                    <div className="space-y-0.5"><div className="text-sm font-medium flex items-center gap-2"><CheckCircle className="text-emerald-400"/> Own Delegations</div><div className="text-xs text-muted-foreground">Notify when YOU delegate/undelegate</div></div>
                    <Switch checked={webhookForm.notifyOwnDelegations} onCheckedChange={(c) => setWebhookForm({...webhookForm, notifyOwnDelegations: c})} />
                </div>

                {currentWebhookWallet?.valAddress && (
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-secondary/20">
                        <div className="space-y-0.5"><div className="text-sm font-medium flex items-center gap-2"><ShieldCheck className="text-purple-400"/> Delegator Activity</div><div className="text-xs text-muted-foreground">Notify when OTHERS delegate to you</div></div>
                        <Switch checked={webhookForm.notifyValidatorTx} onCheckedChange={(c) => setWebhookForm({...webhookForm, notifyValidatorTx: c})} />
                    </div>
                )}

                <div className="space-y-3 p-3 border rounded-lg bg-secondary/20">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5"><div className="text-sm font-medium flex items-center gap-2"><Money className="text-amber-400"/> Balance Changes</div><div className="text-xs text-muted-foreground">Notify on significant balance shifts</div></div>
                        <Switch checked={webhookForm.notifyBalanceChange} onCheckedChange={(c) => setWebhookForm({...webhookForm, notifyBalanceChange: c})} />
                    </div>
                    {webhookForm.notifyBalanceChange && (
                        <div className="flex items-center gap-3 pt-2 animate-in slide-in-from-top-2">
                            <Label className="text-xs whitespace-nowrap">Threshold (USD):</Label>
                            <Input type="number" className="h-8 text-xs font-mono" value={webhookForm.balanceThreshold} onChange={(e) => setWebhookForm({...webhookForm, balanceThreshold: parseFloat(e.target.value)})}/>
                        </div>
                    )}
                </div>
            </div>
          </div>

          <DialogFooter className="flex justify-between sm:justify-between w-full gap-2">
            <Button variant="secondary" onClick={testWebhook} type="button" disabled={isTestingWebhook || !webhookForm.webhookUrl} className="gap-2">
                <PaperPlaneRight weight="fill" /> {isTestingWebhook ? "Testing..." : "Test"}
            </Button>
            <Button onClick={saveWebhook} disabled={isSavingWebhook}>{isSavingWebhook ? "Saving..." : "Save Configuration"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}