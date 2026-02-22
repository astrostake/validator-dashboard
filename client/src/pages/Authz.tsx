// src/pages/Authz.tsx
// Halaman utama — orchestrate GrantsTab dan VoteWithdrawTab

import { useEffect, useState } from "react";
import axios from "axios";
import { Key, HandCoins, Scales, Wallet, Globe, Warning, Spinner } from "@phosphor-icons/react";

import { Button }        from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast }      from "@/hooks/use-toast";

import type { Network, Grant } from "@/components/authz/authz.types";
import { MSG_LABEL, shorten } from "@/components/authz/authz.types";
import { GrantsTab } from "@/components/authz/GrantsTab";
import { VoteWithdrawTab } from "@/components/authz/VoteWithdrawTab";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
type ActiveTab = "grant" | "vote" | "withdraw";

export default function AuthzPage() {
  const { toast } = useToast();

  const [networks, setNetworks]                 = useState<Network[]>([]);
  const [selectedNetwork, setSelectedNetwork]   = useState<Network | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting]         = useState(false);
  const [activeTab, setActiveTab]               = useState<ActiveTab>("grant");
  const [grants, setGrants]                     = useState<Grant[]>([]);
  const [isLoadingGrants, setIsLoadingGrants]   = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/networks`).then((res) => {
      if (res.data.success) setNetworks(res.data.data);
    });
  }, []);

  const loadGrants = async () => {
    if (!connectedAddress || !selectedNetwork) return;
    setIsLoadingGrants(true);
    try {
      const res = await axios.get(
        `${selectedNetwork.rest}/cosmos/authz/v1beta1/grants/granter/${connectedAddress}`,
        { timeout: 10000 }
      );
      const raw: any[] = res.data.grants || [];
      setGrants(raw.map((g) => ({
        msgType: g.authorization?.msg || g.authorization?.["@type"] || "unknown",
        label:   MSG_LABEL[g.authorization?.msg || ""] || g.authorization?.msg || "Unknown",
        grantee: g.grantee || "",
        expiry:  g.expiration || null,
      })));
    } catch (e: any) {
      toast({ title: "Failed to load grants", description: e.message, variant: "destructive" });
    } finally {
      setIsLoadingGrants(false);
    }
  };

  useEffect(() => {
    if (connectedAddress && selectedNetwork) loadGrants();
  }, [connectedAddress, selectedNetwork]);

  const connectKeplr = async () => {
    if (!selectedNetwork)
      return toast({ title: "Select a network first", variant: "destructive" });
    if (!selectedNetwork.chainId)
      return toast({ title: "Chain ID not configured", description: `Add chainId to config for ${selectedNetwork.name}`, variant: "destructive" });

    setIsConnecting(true);
    try {
      const keplr = (window as any).keplr;
      if (!keplr) throw new Error("Keplr not found. Please install the Keplr extension.");

      const prefix    = selectedNetwork.bech32Prefix || selectedNetwork.name.toLowerCase();
      const coinDenom = selectedNetwork.denom.replace(/^[ua]/, "").toUpperCase();

      await keplr.experimentalSuggestChain({
        chainId: selectedNetwork.chainId, chainName: selectedNetwork.name,
        rpc: selectedNetwork.rpc, rest: selectedNetwork.rest,
        bip44: { coinType: 118 },
        bech32Config: {
          bech32PrefixAccAddr:  prefix,       bech32PrefixAccPub:   `${prefix}pub`,
          bech32PrefixValAddr:  `${prefix}valoper`, bech32PrefixValPub: `${prefix}valoperpub`,
          bech32PrefixConsAddr: `${prefix}valcons`, bech32PrefixConsPub: `${prefix}valconspub`,
        },
        currencies:    [{ coinDenom, coinMinimalDenom: selectedNetwork.denom, coinDecimals: selectedNetwork.decimals }],
        feeCurrencies: [{ coinDenom, coinMinimalDenom: selectedNetwork.denom, coinDecimals: selectedNetwork.decimals, gasPriceStep: { low: 0.01, average: 0.025, high: 0.04 } }],
        stakeCurrency:  { coinDenom, coinMinimalDenom: selectedNetwork.denom, coinDecimals: selectedNetwork.decimals },
      });

      await keplr.enable(selectedNetwork.chainId);
      const accounts = await keplr.getOfflineSigner(selectedNetwork.chainId).getAccounts();
      setConnectedAddress(accounts[0].address);
      toast({ title: "Connected", description: `${shorten(accounts[0].address)} on ${selectedNetwork.name}` });
    } catch (e: any) {
      toast({ title: "Connection failed", description: e.message, variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => { setConnectedAddress(null); setGrants([]); };

  const getSigner = async () => {
    if (!selectedNetwork?.chainId) throw new Error("No chain selected");
    const keplr = (window as any).keplr;
    await keplr.enable(selectedNetwork.chainId);
    return keplr.getOfflineSigner(selectedNetwork.chainId);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Key weight="duotone" className="text-primary" /> Authz Manager
          </h1>
          <p className="text-muted-foreground mt-1">Grant permissions, vote, and withdraw rewards via hot wallet.</p>
        </div>

        <div className="flex items-center gap-3 bg-card p-1 rounded-lg border border-border">
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Select value={selectedNetwork?.slug || ""} onValueChange={(v) => { setSelectedNetwork(networks.find((n) => n.slug === v) || null); disconnect(); }}>
              <SelectTrigger className="w-[180px] h-9 border-none bg-transparent pl-9 text-xs font-medium focus:ring-0">
                <SelectValue placeholder="Select Network" />
              </SelectTrigger>
              <SelectContent>
                {networks.map((n) => (
                  <SelectItem key={n.slug} value={n.slug}>
                    <div className="flex items-center gap-2">
                      {n.logo && <img src={n.logo} className="w-4 h-4 rounded-full" alt={n.name} />}
                      {n.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-px h-5 bg-border" />
          <Button variant={connectedAddress ? "ghost" : "default"} size="sm" className="h-8 text-xs gap-2" onClick={connectedAddress ? disconnect : connectKeplr} disabled={isConnecting}>
            {isConnecting ? <Spinner className="animate-spin" size={14} />
              : connectedAddress ? <><Wallet size={14} weight="fill" className="text-emerald-400" /> {shorten(connectedAddress)}</>
              : <><Wallet size={14} /> Connect Keplr</>}
          </Button>
        </div>
      </div>

      {/* Warning */}
      {!connectedAddress && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 py-4 px-5">
            <Warning size={20} weight="fill" className="text-amber-400 shrink-0" />
            <p className="text-sm text-amber-300">
              Select a network and connect your <strong>hot wallet</strong> via Keplr to get started. The validator (cold) wallet only needs to grant permissions once.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
        <TabsList className="h-9 bg-secondary/50 p-0.5 gap-0.5">
          <TabsTrigger value="grant"    className="text-xs h-8 gap-1.5"><Key size={13} weight="bold" /> Grants</TabsTrigger>
          <TabsTrigger value="vote"     className="text-xs h-8 gap-1.5"><Scales size={13} weight="bold" /> Vote</TabsTrigger>
          <TabsTrigger value="withdraw" className="text-xs h-8 gap-1.5"><HandCoins size={13} weight="bold" /> Withdraw</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Content */}
      {!connectedAddress ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground/30 gap-3">
          <Wallet size={40} weight="duotone" />
          <p className="text-sm">Connect wallet to continue</p>
        </div>
      ) : activeTab === "grant" ? (
        <GrantsTab
          network={selectedNetwork!}
          connectedAddress={connectedAddress}
          grants={grants}
          isLoadingGrants={isLoadingGrants}
          onLoadGrants={loadGrants}
          getSigner={getSigner}
        />
      ) : (
        <VoteWithdrawTab
          activeTab={activeTab}
          network={selectedNetwork!}
          connectedAddress={connectedAddress}
          getSigner={getSigner}
        />
      )}
    </div>
  );
}