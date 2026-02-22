// src/components/authz/GrantsTab.tsx

import { useState } from "react";
import {
  Key, ShieldCheck, Trash, PlusCircle, ArrowsClockwise,
  Spinner, Warning
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import type { Network, Grant } from "./authz.types";
import { GRANT_MSG_TYPES, MSG_LABEL, shorten, formatExpiry } from "./authz.types";

interface GrantsTabProps {
  network: Network;
  connectedAddress: string;
  grants: Grant[];
  isLoadingGrants: boolean;
  onLoadGrants: () => void;
  getSigner: () => Promise<any>;
}

export function GrantsTab({
  network,
  connectedAddress,
  grants,
  isLoadingGrants,
  onLoadGrants,
  getSigner,
}: GrantsTabProps) {
  const { toast } = useToast();

  // State grant form
  const [granteeAddress, setGranteeAddress]     = useState("");
  const [selectedMsgTypes, setSelectedMsgTypes] = useState<string[]>([]);
  const [expiryDays, setExpiryDays]             = useState<number | "">("");
  const [isGranting, setIsGranting]             = useState(false);

  // State revoke — pisah dari grant supaya tidak saling blocking
  const [revokeGrantee, setRevokeGrantee]   = useState("");
  const [revokingType, setRevokingType]     = useState<string | null>(null);

  // ─── Grant ───────────────────────────────────────────────────────────────────

  const handleGrant = async () => {
    if (!granteeAddress.trim())
      return toast({ title: "Grantee address required", variant: "destructive" });
    if (selectedMsgTypes.length === 0)
      return toast({ title: "Select at least one permission", variant: "destructive" });

    setIsGranting(true);
    try {
      const { SigningStargateClient, defaultRegistryTypes } = await import("@cosmjs/stargate");
      const { Registry }             = await import("@cosmjs/proto-signing");
      const { MsgGrant }             = await import("cosmjs-types/cosmos/authz/v1beta1/tx");
      const { GenericAuthorization } = await import("cosmjs-types/cosmos/authz/v1beta1/authz");
      const { Timestamp }            = await import("cosmjs-types/google/protobuf/timestamp");

      const registry = new Registry(defaultRegistryTypes);
      registry.register("/cosmos.authz.v1beta1.MsgGrant",  MsgGrant);
      registry.register("/cosmos.authz.v1beta1.GenericAuthorization", GenericAuthorization);

      const signer = await getSigner();
      const client = await SigningStargateClient.connectWithSigner(network.rpc, signer, { registry });

      const expiry = expiryDays
        ? new Date(Date.now() + Number(expiryDays) * 86400000)
        : null;

      const msgs = selectedMsgTypes.map((msgType) => ({
        typeUrl: "/cosmos.authz.v1beta1.MsgGrant",
        value: MsgGrant.fromPartial({
          granter: connectedAddress,
          grantee: granteeAddress.trim(),
          grant: {
            authorization: {
              typeUrl: "/cosmos.authz.v1beta1.GenericAuthorization",
              value: GenericAuthorization.encode(
                GenericAuthorization.fromPartial({ msg: msgType })
              ).finish(),
            },
            expiration: expiry
              ? Timestamp.fromPartial({ seconds: BigInt(Math.floor(expiry.getTime() / 1000)) })
              : undefined,
          },
        }),
      }));

      const fee = {
        amount: [{ denom: network.denom, amount: "5000" }],
        gas: String(100000 * msgs.length),
      };
      const result = await client.signAndBroadcast(connectedAddress, msgs, fee);
      if (result.code !== 0) throw new Error(result.rawLog || "Transaction failed");

      toast({ title: "Grant successful!", description: `${msgs.length} permission(s) granted to ${shorten(granteeAddress)}` });
      setSelectedMsgTypes([]);
      setGranteeAddress("");
      onLoadGrants();
    } catch (e: any) {
      toast({ title: "Grant failed", description: e.message, variant: "destructive" });
    } finally {
      setIsGranting(false);
    }
  };

  // ─── Revoke ──────────────────────────────────────────────────────────────────

  const handleRevoke = async (msgType: string) => {
    if (!revokeGrantee.trim())
      return toast({ title: "Grantee address required to revoke", description: "Isi alamat grantee di field revoke", variant: "destructive" });

    setRevokingType(msgType);
    try {
      const { SigningStargateClient, defaultRegistryTypes } = await import("@cosmjs/stargate");
      const { Registry }   = await import("@cosmjs/proto-signing");
      const { MsgRevoke }  = await import("cosmjs-types/cosmos/authz/v1beta1/tx");

      const registry = new Registry(defaultRegistryTypes);
      registry.register("/cosmos.authz.v1beta1.MsgRevoke", MsgRevoke);

      const signer = await getSigner();
      const client = await SigningStargateClient.connectWithSigner(network.rpc, signer, { registry });

      const msg = {
        typeUrl: "/cosmos.authz.v1beta1.MsgRevoke",
        value: {
          granter:    connectedAddress,
          grantee:    revokeGrantee.trim(),
          msgTypeUrl: msgType,
        },
      };

      const fee = { amount: [{ denom: network.denom, amount: "3000" }], gas: "80000" };
      const result = await client.signAndBroadcast(connectedAddress, [msg], fee);
      if (result.code !== 0) throw new Error(result.rawLog || "Transaction failed");

      toast({ title: "Revoked", description: MSG_LABEL[msgType] || msgType });
      onLoadGrants();
    } catch (e: any) {
      toast({ title: "Revoke failed", description: e.message, variant: "destructive" });
    } finally {
      setRevokingType(null);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

      {/* ── LEFT: Grant Form ── */}
      <div className="xl:col-span-5 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PlusCircle weight="bold" className="text-primary" /> Grant Permission
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Grantee — Hot Wallet Address</Label>
              <Input
                placeholder="cosmos1..."
                className="h-9 text-xs font-mono bg-secondary border-border"
                value={granteeAddress}
                onChange={(e) => setGranteeAddress(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Permissions</Label>
              <div className="space-y-2">
                {GRANT_MSG_TYPES.map((g) => (
                  <label
                    key={g.value}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      selectedMsgTypes.includes(g.value)
                        ? "bg-primary/10 border-primary/40"
                        : "bg-secondary/20 border-border hover:border-border/80"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={selectedMsgTypes.includes(g.value)}
                      onChange={(e) =>
                        setSelectedMsgTypes((prev) =>
                          e.target.checked
                            ? [...prev, g.value]
                            : prev.filter((v) => v !== g.value)
                        )
                      }
                    />
                    <div>
                      <p className="text-xs font-medium">{g.label}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{g.value}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Expiry (days, leave empty = never)</Label>
              <Input
                type="number"
                placeholder="e.g. 365"
                className="h-9 text-xs bg-secondary border-border"
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value ? Number(e.target.value) : "")}
              />
            </div>

            <Button
              className="w-full h-9 text-xs gap-2"
              onClick={handleGrant}
              disabled={isGranting}
            >
              {isGranting
                ? <Spinner className="animate-spin" size={14} />
                : <Key size={14} weight="bold" />}
              {isGranting ? "Broadcasting..." : "Grant Selected Permissions"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── RIGHT: Active Grants ── */}
      <div className="xl:col-span-7">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3 border-b border-border bg-secondary/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck weight="bold" className="text-emerald-400" /> Active Grants
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{grants.length}</Badge>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  onClick={onLoadGrants} disabled={isLoadingGrants}
                >
                  <ArrowsClockwise size={14} className={cn(isLoadingGrants && "animate-spin")} />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0 flex-1 flex flex-col">
            {isLoadingGrants ? (
              <div className="flex items-center justify-center py-16">
                <Spinner size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : grants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40 gap-2">
                <Key size={32} weight="duotone" />
                <p className="text-sm">No active grants found</p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">

                  {/* Revoke grantee input — separate from grant form */}
                  <div className="p-3 bg-rose-500/5 rounded-lg border border-rose-500/20 space-y-1.5">
                    <Label className="text-[10px] text-rose-400/80 uppercase tracking-wider flex items-center gap-1.5">
                      <Warning size={11} weight="fill" /> Grantee address for revoke
                    </Label>
                    <Input
                      placeholder="cosmos1... (hot wallet to revoke)"
                      className="h-8 text-xs font-mono bg-secondary border-border"
                      value={revokeGrantee}
                      onChange={(e) => setRevokeGrantee(e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Fill this in before clicking revoke below.
                    </p>
                  </div>

                  {/* Grant list */}
                  {grants.map((g) => {
                    const isExpired = g.expiry ? new Date(g.expiry) < new Date() : false;
                    return (
                      <div
                        key={g.msgType}
                        className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/10 hover:bg-secondary/20 transition-all group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-xs font-medium">{g.label}</p>
                            {isExpired && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1 border-rose-500/30 text-rose-400 bg-rose-500/10">
                                Expired
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">{g.msgType}</p>
                          {g.grantee && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Grantee: <span className="font-mono">{shorten(g.grantee)}</span>
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            Expires:{" "}
                            <span className={cn(isExpired ? "text-rose-400" : "text-emerald-400/70")}>
                              {formatExpiry(g.expiry)}
                            </span>
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-rose-500/40 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0 ml-2"
                          onClick={() => handleRevoke(g.msgType)}
                          disabled={revokingType === g.msgType}
                          title={revokeGrantee ? `Revoke from ${shorten(revokeGrantee)}` : "Fill grantee address first"}
                        >
                          {revokingType === g.msgType
                            ? <Spinner size={13} className="animate-spin" />
                            : <Trash size={13} weight="bold" />}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}