import { useState } from "react";
import axios from "axios";
import { 
  Wallet, ShieldCheck, PencilSimple, 
  PaperPlaneRight, ArrowsClockwise, DownloadSimple,
  Warning, Bell, CheckCircle, 
  Gear, Globe, Broadcast, Money, Prohibit
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Types
interface WalletSetting {
  id: string;
  label: string;
  chainName: string;
  address: string;
  valAddress?: string;
  webhookConfigured: boolean;
}

interface NotificationForm {
  webhookUrl: string;
  notifyWalletTx: boolean;
  notifyBalanceChange: boolean;
  balanceThreshold: number;
  notifyOwnDelegations: boolean;
  notifyValidatorTx: boolean;
  notifyMissedBlocks: boolean;
  missedBlocksThreshold: number;
  missedBlocksCooldown: number;
  notifyRecovery: boolean;
  notifyGovernance: boolean;
  consensusAddress: string;
}

export function NotificationManager({ wallets, onRefresh }: { wallets: WalletSetting[], onRefresh: () => void }) {
  const { toast } = useToast();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  // State
  const [selectedWallet, setSelectedWallet] = useState<WalletSetting | null>(null);
  
  // Settings Modal State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [form, setForm] = useState<NotificationForm>({
      webhookUrl: "", notifyWalletTx: false, notifyBalanceChange: false, balanceThreshold: 100, 
      notifyOwnDelegations: false, notifyValidatorTx: false, notifyMissedBlocks: false, 
      missedBlocksThreshold: 10, missedBlocksCooldown: 5, notifyRecovery: true, 
      notifyGovernance: false, consensusAddress: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isFetchingConsensus, setIsFetchingConsensus] = useState(false);

  // Edit Modal State
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: "", label: "", valAddress: "" });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // --- Actions ---
  const openSettings = async (w: WalletSetting) => {
      setSelectedWallet(w);
      setSettingsOpen(true);
      
      // Default reset
      setForm({
        webhookUrl: "", notifyWalletTx: false, notifyBalanceChange: false, balanceThreshold: 100, 
        notifyOwnDelegations: false, notifyValidatorTx: false, notifyMissedBlocks: false, 
        missedBlocksThreshold: 10, missedBlocksCooldown: 5, notifyRecovery: true, 
        notifyGovernance: false, consensusAddress: ""
      });

      try {
          const res = await axios.get(`${API_URL}/wallet/${w.id}/webhook`);
          if (res.data.success) {
              const s = res.data.data.settings;
              setForm({
                  webhookUrl: s.webhookUrl || "",
                  notifyWalletTx: s.general?.walletTransactions || false,
                  notifyBalanceChange: s.general?.balanceChanges?.enabled || false,
                  balanceThreshold: s.general?.balanceChanges?.thresholdUsd || 100,
                  notifyOwnDelegations: s.validator?.ownDelegations || false,
                  notifyValidatorTx: s.validator?.incomingDelegations || false,
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
      if(!selectedWallet) return;
      setIsSaving(true);
      try {
          await axios.post(`${API_URL}/wallet/${selectedWallet.id}/webhook`, form);
          toast({ title: "Configuration Saved", description: "Notification preferences updated." });
          setSettingsOpen(false);
          onRefresh();
      } catch(e) { toast({ variant: "destructive", title: "Save Failed", description: "Please check your inputs." }); }
      finally { setIsSaving(false); }
  };

  const testWebhook = async () => {
      if(!selectedWallet) return;
      setIsTesting(true);
      try {
          // Save first to ensure backend has the URL
          await axios.post(`${API_URL}/wallet/${selectedWallet.id}/webhook`, form);
          await axios.post(`${API_URL}/wallet/${selectedWallet.id}/webhook/test`, { testUrl: form.webhookUrl });
          toast({ title: "Test Sent", description: "Check your Discord channel." });
      } catch(e) { toast({ variant: "destructive", title: "Test Failed", description: "Could not send webhook." }); }
      finally { setIsTesting(false); }
  };

  const autoFetchConsensus = async () => {
      if (!selectedWallet) return;
      setIsFetchingConsensus(true);
      try {
          const res = await axios.get(`${API_URL}/wallet/${selectedWallet.id}/fetch-consensus`);
          if (res.data.success) {
              setForm(prev => ({ ...prev, consensusAddress: res.data.data.validator.consensusAddress }));
              toast({ title: "Address Fetched", description: "Consensus address updated." });
          }
      } catch (e) { toast({ title: "Fetch Failed", description: "Node unreachable.", variant: "destructive" }); }
      finally { setIsFetchingConsensus(false); }
  };

  const openEdit = (w: WalletSetting) => {
      setEditForm({ id: w.id, label: w.label, valAddress: w.valAddress || "" });
      setEditOpen(true);
  };

  const saveEdit = async () => {
      setIsSavingEdit(true);
      try {
          await axios.patch(`${API_URL}/wallet/${editForm.id}`, editForm);
          toast({ title: "Updated", description: "Wallet details updated." });
          setEditOpen(false);
          onRefresh();
      } catch (e) { toast({ variant: "destructive", title: "Update Failed", description: "Could not update wallet." }); }
      finally { setIsSavingEdit(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
          <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Notification Channels</h2>
              <p className="text-sm text-muted-foreground">Manage alerts for {wallets.length} configured wallets.</p>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2">
              <ArrowsClockwise /> Refresh
          </Button>
      </div>

      {/* Grid Layout for Wallets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {wallets.map(w => (
            <Card key={w.id} className="border-border/60 shadow-sm hover:shadow-md transition-all duration-300 group">
                <CardHeader className="flex flex-row items-start justify-between pb-2 bg-secondary/10 border-b border-border/50">
                    <div className="flex gap-3 items-center">
                        <div className={cn("p-2.5 rounded-lg border border-border/50 shadow-sm", w.valAddress ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400")}>
                            {w.valAddress ? <ShieldCheck weight="fill" className="text-xl"/> : <Wallet weight="fill" className="text-xl"/>}
                        </div>
                        <div>
                            <h4 className="font-bold text-sm truncate max-w-[140px]">{w.label}</h4>
                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono text-muted-foreground bg-background/80">
                                {w.chainName}
                            </Badge>
                        </div>
                    </div>
                    {w.webhookConfigured ? (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
                            <Broadcast weight="fill" /> Active
                        </div>
                    ) : (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium bg-secondary px-2 py-1 rounded-full">
                            <Prohibit weight="bold" /> Off
                        </div>
                    )}
                </CardHeader>
                
                <CardContent className="p-4 pt-4">
                    <div className="text-xs text-muted-foreground font-mono bg-secondary/30 p-2 rounded border border-border/50 truncate mb-4">
                        {w.address}
                    </div>
                    
                    <div className="space-y-2">
                         <div className="flex justify-between text-xs">
                             <span className="text-muted-foreground">Type</span>
                             <span className={cn("font-medium", w.valAddress ? "text-purple-400" : "text-blue-400")}>
                                 {w.valAddress ? "Validator Node" : "Standard Wallet"}
                             </span>
                         </div>
                    </div>
                </CardContent>

                <CardFooter className="p-3 bg-secondary/5 border-t border-border/50 gap-2">
                     <Button variant="ghost" size="sm" className="flex-1 text-xs h-8" onClick={() => openEdit(w)}>
                         <PencilSimple className="mr-2"/> Edit
                     </Button>
                     <Button variant="secondary" size="sm" className="flex-1 text-xs h-8 shadow-sm border border-border/50" onClick={() => openSettings(w)}>
                         <Gear className="mr-2"/> Configure
                     </Button>
                </CardFooter>
            </Card>
          ))}
      </div>

      {/* --- SETTINGS DIALOG (Enterprise Layout with Tabs) --- */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto gap-0 p-0">
              <DialogHeader className="p-6 pb-2">
                  <DialogTitle className="flex items-center gap-2 text-xl">
                      <Bell weight="fill" className="text-primary"/> Alert Configuration
                  </DialogTitle>
                  <DialogDescription>
                      Settings for <span className="font-semibold text-foreground">{selectedWallet?.label}</span>
                  </DialogDescription>
              </DialogHeader>
              
              <div className="p-6 pt-2">
                  <Tabs defaultValue="integrations" className="w-full">
                      <TabsList className="grid w-full grid-cols-3 mb-6 bg-secondary/50">
                          <TabsTrigger value="integrations">Integrations</TabsTrigger>
                          <TabsTrigger value="wallet">Wallet Rules</TabsTrigger>
                          {selectedWallet?.valAddress ? (
                              <TabsTrigger value="validator">Validator Rules</TabsTrigger>
                          ) : (
                              <TabsTrigger value="validator" disabled className="opacity-50">Validator Rules</TabsTrigger>
                          )}
                      </TabsList>

                      {/* TAB 1: INTEGRATIONS */}
                      <TabsContent value="integrations" className="space-y-6 focus-visible:ring-0">
                          <div className="space-y-4 rounded-lg border p-4 bg-secondary/10">
                              <div className="space-y-2">
                                  <Label className="text-sm font-semibold">Discord Webhook URL</Label>
                                  <div className="flex gap-2">
                                      <Input 
                                        value={form.webhookUrl} 
                                        onChange={(e) => setForm({...form, webhookUrl: e.target.value})} 
                                        placeholder="https://discord.com/api/webhooks/..." 
                                        className="font-mono text-xs bg-background"
                                      />
                                  </div>
                                  <p className="text-[11px] text-muted-foreground">
                                      We will send all enabled alerts to this channel.
                                  </p>
                              </div>
                              
                              <div className="flex items-center justify-between pt-2">
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Broadcast className="text-blue-500"/> Required for notifications
                                  </span>
                                  <Button size="sm" variant="secondary" onClick={testWebhook} disabled={isTesting || !form.webhookUrl} className="h-8">
                                      {isTesting ? <ArrowsClockwise className="animate-spin mr-2"/> : <PaperPlaneRight className="mr-2"/>}
                                      Test Notification
                                  </Button>
                              </div>
                          </div>
                      </TabsContent>

                      {/* TAB 2: WALLET RULES */}
                      <TabsContent value="wallet" className="space-y-5 focus-visible:ring-0">
                           {/* Item 1 */}
                           <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-secondary/20 transition-colors">
                              <div className="space-y-0.5">
                                  <div className="text-sm font-semibold flex items-center gap-2">
                                      <Money className="text-blue-500"/> Transactions
                                  </div>
                                  <div className="text-xs text-muted-foreground">Notify on incoming/outgoing transfers</div>
                              </div>
                              <Switch checked={form.notifyWalletTx} onCheckedChange={(c) => setForm({...form, notifyWalletTx: c})} />
                          </div>

                          {/* Item 2 */}
                          <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-secondary/20 transition-colors">
                              <div className="space-y-0.5">
                                  <div className="text-sm font-semibold flex items-center gap-2">
                                      <ShieldCheck className="text-blue-500"/> My Delegations
                                  </div>
                                  <div className="text-xs text-muted-foreground">Notify when I delegate/undelegate</div>
                              </div>
                              <Switch checked={form.notifyOwnDelegations} onCheckedChange={(c) => setForm({...form, notifyOwnDelegations: c})} />
                          </div>

                          {/* Item 3 (Complex) */}
                          <div className="border rounded-lg bg-card overflow-hidden">
                              <div className="flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors">
                                  <div className="space-y-0.5">
                                      <div className="text-sm font-semibold flex items-center gap-2">
                                          <Warning className="text-orange-500"/> Balance Change
                                      </div>
                                      <div className="text-xs text-muted-foreground">Alert on significant value shifts</div>
                                  </div>
                                  <Switch checked={form.notifyBalanceChange} onCheckedChange={(c) => setForm({...form, notifyBalanceChange: c})} />
                              </div>
                              {form.notifyBalanceChange && (
                                  <div className="bg-secondary/10 p-4 border-t border-border/50 flex items-center gap-4 animate-in slide-in-from-top-2">
                                      <Label className="text-xs font-medium whitespace-nowrap">Threshold (USD):</Label>
                                      <Input type="number" className="h-8 w-32 bg-background font-mono text-xs" value={form.balanceThreshold} onChange={(e) => setForm({...form, balanceThreshold: parseFloat(e.target.value)})}/>
                                      <p className="text-[10px] text-muted-foreground">Only alert if change &gt; ${form.balanceThreshold}</p>
                                  </div>
                              )}
                          </div>
                      </TabsContent>

                      {/* TAB 3: VALIDATOR RULES */}
                      <TabsContent value="validator" className="space-y-5 focus-visible:ring-0">
                          {selectedWallet?.valAddress && (
                              <>
                                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                                      <div className="space-y-0.5">
                                          <div className="text-sm font-semibold flex items-center gap-2">
                                              <Globe className="text-purple-500"/> Governance
                                          </div>
                                          <div className="text-xs text-muted-foreground">New proposals available for voting</div>
                                      </div>
                                      <Switch checked={form.notifyGovernance} onCheckedChange={(c) => setForm({...form, notifyGovernance: c})} />
                                  </div>

                                  <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                                      <div className="space-y-0.5">
                                          <div className="text-sm font-semibold flex items-center gap-2">
                                              <DownloadSimple className="text-purple-500"/> Delegator Changes
                                          </div>
                                          <div className="text-xs text-muted-foreground">When others delegate/undelegate to you</div>
                                      </div>
                                      <Switch checked={form.notifyValidatorTx} onCheckedChange={(c) => setForm({...form, notifyValidatorTx: c})} />
                                  </div>

                                  {/* Uptime Section */}
                                  <div className="border rounded-lg bg-card border-red-500/20 overflow-hidden">
                                      <div className="flex items-center justify-between p-4 bg-red-500/5">
                                          <div className="space-y-0.5">
                                              <div className="text-sm font-semibold flex items-center gap-2 text-red-500">
                                                  <Warning weight="fill"/> Missed Blocks & Downtime
                                              </div>
                                              <div className="text-xs text-muted-foreground">Critical health monitoring</div>
                                          </div>
                                          <Switch checked={form.notifyMissedBlocks} onCheckedChange={(c) => setForm({...form, notifyMissedBlocks: c})} />
                                      </div>

                                      {form.notifyMissedBlocks && (
                                          <div className="p-4 space-y-5 bg-secondary/5 border-t border-red-500/10 animate-in slide-in-from-top-2">
                                              {/* Config Row */}
                                              <div className="flex gap-4 items-end">
                                                  <div className="space-y-1.5 flex-1">
                                                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Consensus Address</Label>
                                                      <Input className="h-9 text-xs font-mono bg-background" 
                                                          value={form.consensusAddress} 
                                                          onChange={(e) => setForm({...form, consensusAddress: e.target.value})} 
                                                          placeholder="cosmosvalcons..."
                                                      />
                                                  </div>
                                                  <Button variant="outline" onClick={autoFetchConsensus} disabled={isFetchingConsensus} className="mb-[1px]">
                                                      {isFetchingConsensus ? <ArrowsClockwise className="animate-spin"/> : "Auto-Fetch"}
                                                  </Button>
                                              </div>
                                              
                                              <Separator className="bg-border/60" />

                                              <div className="grid grid-cols-2 gap-6">
                                                  <div className="space-y-3">
                                                      <div className="flex justify-between"><Label className="text-xs">Threshold</Label><span className="text-xs font-mono text-primary">{form.missedBlocksThreshold} blocks</span></div>
                                                      <Slider value={[form.missedBlocksThreshold]} min={1} max={100} onValueChange={(v) => setForm({...form, missedBlocksThreshold: v[0]})} />
                                                  </div>
                                                  <div className="space-y-3">
                                                      <div className="flex justify-between"><Label className="text-xs">Cooldown</Label><span className="text-xs font-mono text-primary">{form.missedBlocksCooldown} min</span></div>
                                                      <Slider value={[form.missedBlocksCooldown]} min={1} max={60} onValueChange={(v) => setForm({...form, missedBlocksCooldown: v[0]})} />
                                                  </div>
                                              </div>

                                              <div className="flex items-center justify-between pt-2">
                                                  <Label className="flex items-center gap-2 text-xs cursor-pointer">
                                                      <CheckCircle className="text-emerald-500" weight="fill"/> Notify on Recovery
                                                  </Label>
                                                  <Switch className="h-4 w-8" checked={form.notifyRecovery} onCheckedChange={(c) => setForm({...form, notifyRecovery: c})} />
                                              </div>
                                          </div>
                                      )}
                                  </div>
                              </>
                          )}
                      </TabsContent>
                  </Tabs>
              </div>

              <DialogFooter className="p-6 pt-2 border-t bg-secondary/10">
                  <Button variant="ghost" onClick={() => setSettingsOpen(false)}>Cancel</Button>
                  <Button onClick={saveSettings} disabled={isSaving}>
                      {isSaving ? <ArrowsClockwise className="animate-spin mr-2"/> : null} 
                      Save Changes
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* --- EDIT WALLET DIALOG --- */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                  <DialogTitle>Edit Wallet Details</DialogTitle>
                  <DialogDescription>Update label or link a validator node.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 py-4">
                  <div className="grid gap-2">
                      <Label htmlFor="label">Wallet Label</Label>
                      <Input id="label" value={editForm.label} onChange={(e) => setEditForm({...editForm, label: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                      <Label htmlFor="valAddress">Validator Operator Address (Optional)</Label>
                      <Input id="valAddress" className="font-mono text-xs" value={editForm.valAddress} onChange={(e) => setEditForm({...editForm, valAddress: e.target.value})} placeholder="cosmosvaloper..." />
                      <p className="text-[10px] text-muted-foreground bg-secondary/50 p-2 rounded">
                          <span className="font-bold">Note:</span> Adding a validator address enables advanced node monitoring (uptime, governance, delegators).
                      </p>
                  </div>
              </div>
              <DialogFooter>
                  <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button onClick={saveEdit} disabled={isSavingEdit}>
                      {isSavingEdit ? <ArrowsClockwise className="animate-spin mr-2"/> : null}
                      Save Changes
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}