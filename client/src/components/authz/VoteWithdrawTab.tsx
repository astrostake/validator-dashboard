// src/components/authz/VoteWithdrawTab.tsx

import { useEffect, useState } from "react";
import {
  Scales, HandCoins, Coins, ArrowUUpRight, ArrowsClockwise,
  Warning, Spinner
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import type { Network, Proposal, VoteOption } from "./authz.types";

interface VoteWithdrawTabProps {
  activeTab: "vote" | "withdraw";
  network: Network;
  connectedAddress: string;
  getSigner: () => Promise<any>;
}

const VOTE_OPTIONS: { value: VoteOption; label: string; color: string }[] = [
  { value: "VOTE_OPTION_YES",          label: "Yes",     color: "emerald" },
  { value: "VOTE_OPTION_NO",           label: "No",      color: "rose"    },
  { value: "VOTE_OPTION_ABSTAIN",      label: "Abstain", color: "slate"   },
  { value: "VOTE_OPTION_NO_WITH_VETO", label: "Veto",    color: "orange"  },
];

export function VoteWithdrawTab({ activeTab, network, connectedAddress, getSigner }: VoteWithdrawTabProps) {
  const { toast } = useToast();

  // ─── Vote state ──────────────────────────────────────────────────────────────
  const [proposals, setProposals]               = useState<Proposal[]>([]);
  const [isLoadingProposals, setIsLoadingProposals] = useState(false);
  const [granterAddress, setGranterAddress]     = useState("");
  const [voteTarget, setVoteTarget]             = useState<Proposal | null>(null);
  const [voteOption, setVoteOption]             = useState<VoteOption>("VOTE_OPTION_YES");
  const [isVoting, setIsVoting]                 = useState(false);

  // ─── Withdraw state ──────────────────────────────────────────────────────────
  const [withdrawGranter, setWithdrawGranter]   = useState("");
  const [validatorAddress, setValidatorAddress] = useState("");
  const [isWithdrawing, setIsWithdrawing]       = useState(false);

  // ─── Load proposals ──────────────────────────────────────────────────────────

  const loadProposals = async () => {
    setIsLoadingProposals(true);
    setProposals([]);
    
    try {
      // 1. Try v1beta1 first
      try {
        const res = await fetch(
          `${network.rest}/cosmos/gov/v1beta1/proposals?proposal_status=2`
        );
        const json = await res.json();
        if (json.proposals?.length) {
          setProposals(json.proposals.map((p: any) => ({
            proposal_id:     p.proposal_id,
            title:           p.content?.title || `Proposal #${p.proposal_id}`,
            status:          p.status,
            voting_end_time: p.voting_end_time,
          })));
          return; // Aman untuk early return karena ada di dalam block try utama
        }
      } catch { /* fallthrough */ }

      // 2. Try v1
      try {
        const res = await fetch(
          `${network.rest}/cosmos/gov/v1/proposals?proposal_status=PROPOSAL_STATUS_VOTING_PERIOD`
        );
        const json = await res.json();
        setProposals((json.proposals || []).map((p: any) => ({
          proposal_id:     p.id,
          title:           p.title || `Proposal #${p.id}`,
          status:          p.status,
          voting_end_time: p.voting_end_time,
        })));
      } catch (e: any) {
        toast({ title: "Failed to load proposals", description: e.message, variant: "destructive" });
      }
      
    } finally {
      // Ini AKAN SELALU dijalankan, baik saat error maupun saat "return" sukses di atas
      setIsLoadingProposals(false);
    }
  };

  useEffect(() => {
    if (activeTab === "vote") loadProposals();
  }, [activeTab, network.slug]);

  // ─── Vote ────────────────────────────────────────────────────────────────────

  const handleVote = async () => {
    if (!granterAddress.trim())
      return toast({ title: "Validator account address required", variant: "destructive" });
    if (!voteTarget)
      return toast({ title: "Select a proposal first", variant: "destructive" });

    setIsVoting(true);
    try {
      const { SigningStargateClient, defaultRegistryTypes } = await import("@cosmjs/stargate");
      const { Registry }               = await import("@cosmjs/proto-signing");
      const { MsgExec }                = await import("cosmjs-types/cosmos/authz/v1beta1/tx");
      const { MsgVote }                = await import("cosmjs-types/cosmos/gov/v1beta1/tx");
      const { VoteOption: VoteEnum }   = await import("cosmjs-types/cosmos/gov/v1beta1/gov");

      const registry = new Registry(defaultRegistryTypes);
      registry.register("/cosmos.authz.v1beta1.MsgExec", MsgExec);
      registry.register("/cosmos.gov.v1beta1.MsgVote", MsgVote);

      const voteMap: Record<VoteOption, number> = {
        VOTE_OPTION_YES:          VoteEnum.VOTE_OPTION_YES,
        VOTE_OPTION_NO:           VoteEnum.VOTE_OPTION_NO,
        VOTE_OPTION_NO_WITH_VETO: VoteEnum.VOTE_OPTION_NO_WITH_VETO,
        VOTE_OPTION_ABSTAIN:      VoteEnum.VOTE_OPTION_ABSTAIN,
      };

      const signer = await getSigner();
      const client = await SigningStargateClient.connectWithSigner(network.rpc, signer, { registry });

      const innerVote = MsgVote.fromPartial({
        proposalId: BigInt(voteTarget.proposal_id),
        voter:      granterAddress.trim(),
        option:     voteMap[voteOption],
      });

      const msg = {
        typeUrl: "/cosmos.authz.v1beta1.MsgExec",
        value: MsgExec.fromPartial({
          grantee: connectedAddress,
          msgs: [{ typeUrl: "/cosmos.gov.v1beta1.MsgVote", value: MsgVote.encode(innerVote).finish() }],
        }),
      };

      const fee = { amount: [{ denom: network.denom, amount: "3000" }], gas: "120000" };
      const result = await client.signAndBroadcast(connectedAddress, [msg], fee);
      if (result.code !== 0) throw new Error(result.rawLog || "Transaction failed");

      toast({
        title: "Vote submitted!",
        description: `${voteOption.replace("VOTE_OPTION_", "")} on Proposal #${voteTarget.proposal_id}`,
      });
      setVoteTarget(null);
    } catch (e: any) {
      toast({ title: "Vote failed", description: e.message, variant: "destructive" });
    } finally {
      setIsVoting(false);
    }
  };

  // ─── Withdraw ────────────────────────────────────────────────────────────────

  const handleWithdraw = async (type: "reward" | "commission" | "both") => {
    if (!withdrawGranter.trim())
      return toast({ title: "Granter address required", variant: "destructive" });

    setIsWithdrawing(true);
    try {
      const { SigningStargateClient, defaultRegistryTypes } = await import("@cosmjs/stargate");
      const { Registry }               = await import("@cosmjs/proto-signing");
      const { MsgExec }                = await import("cosmjs-types/cosmos/authz/v1beta1/tx");
      const { MsgWithdrawDelegatorReward, MsgWithdrawValidatorCommission } =
        await import("cosmjs-types/cosmos/distribution/v1beta1/tx");

      const registry = new Registry(defaultRegistryTypes);
      registry.register("/cosmos.authz.v1beta1.MsgExec", MsgExec);
      registry.register("/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward", MsgWithdrawDelegatorReward);
      registry.register("/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission", MsgWithdrawValidatorCommission);

      const signer = await getSigner();
      const client = await SigningStargateClient.connectWithSigner(network.rpc, signer, { registry });
      const innerMsgs: { typeUrl: string; value: Uint8Array }[] = [];

      if (type === "reward" || type === "both") {
        innerMsgs.push({
          typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
          value: MsgWithdrawDelegatorReward.encode(
            MsgWithdrawDelegatorReward.fromPartial({
              delegatorAddress: withdrawGranter.trim(),
              validatorAddress: validatorAddress.trim() || withdrawGranter.trim(),
            })
          ).finish(),
        });
      }

      if (type === "commission" || type === "both") {
        innerMsgs.push({
          typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission",
          value: MsgWithdrawValidatorCommission.encode(
            MsgWithdrawValidatorCommission.fromPartial({
              validatorAddress: validatorAddress.trim() || withdrawGranter.trim(),
            })
          ).finish(),
        });
      }

      const msg = {
        typeUrl: "/cosmos.authz.v1beta1.MsgExec",
        value: MsgExec.fromPartial({ grantee: connectedAddress, msgs: innerMsgs }),
      };

      const fee = {
        amount: [{ denom: network.denom, amount: "5000" }],
        gas: String(100000 * innerMsgs.length),
      };
      const result = await client.signAndBroadcast(connectedAddress, [msg], fee);
      if (result.code !== 0) throw new Error(result.rawLog || "Transaction failed");

      toast({ title: "Withdraw successful!", description: `${type} withdrawn` });
    } catch (e: any) {
      toast({ title: "Withdraw failed", description: e.message, variant: "destructive" });
    } finally {
      setIsWithdrawing(false);
    }
  };

  // ─── Render: Vote ─────────────────────────────────────────────────────────────

  if (activeTab === "vote") {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* Left: Vote form */}
        <div className="xl:col-span-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Scales weight="bold" className="text-blue-400" /> Cast Vote
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Validator Account Address (Granter)</Label>
                <Input
                  placeholder="cosmos1... (address with voting power)"
                  className="h-9 text-xs font-mono bg-secondary border-border"
                  value={granterAddress}
                  onChange={(e) => setGranterAddress(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">
                  Not valoper — this is the validator account address that granted voting rights to your hot wallet.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Selected Proposal</Label>
                <div className={cn(
                  "p-3 rounded-lg border text-xs min-h-[48px] flex items-center gap-2",
                  voteTarget
                    ? "bg-primary/5 border-primary/20 text-foreground"
                    : "bg-secondary/20 border-border text-muted-foreground"
                )}>
                  {voteTarget ? (
                    <>
                      <span className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                        #{voteTarget.proposal_id}
                      </span>
                      <span className="truncate">{voteTarget.title}</span>
                    </>
                  ) : (
                    "← Select a proposal from the list"
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Vote Option</Label>
                <div className="grid grid-cols-2 gap-2">
                  {VOTE_OPTIONS.map(({ value, label, color }) => (
                    <button
                      key={value}
                      onClick={() => setVoteOption(value)}
                      className={cn(
                        "p-2.5 rounded-lg border text-xs font-bold transition-all",
                        voteOption === value
                          ? `bg-${color}-500/15 border-${color}-500/40 text-${color}-400`
                          : "bg-secondary/20 border-border text-muted-foreground hover:bg-secondary/40"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full h-9 text-xs gap-2"
                onClick={handleVote}
                disabled={isVoting || !voteTarget}
              >
                {isVoting ? <Spinner className="animate-spin" size={14} /> : <Scales size={14} weight="bold" />}
                {isVoting ? "Broadcasting..." : "Submit Vote"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Proposal list */}
        <div className="xl:col-span-8">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-3 border-b border-border bg-secondary/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Active Proposals</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{proposals.length}</Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadProposals} disabled={isLoadingProposals}>
                    <ArrowsClockwise size={14} className={cn(isLoadingProposals && "animate-spin")} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              {isLoadingProposals ? (
                <div className="flex items-center justify-center py-16">
                  <Spinner size={24} className="animate-spin text-muted-foreground" />
                </div>
              ) : proposals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40 gap-2">
                  <Scales size={32} weight="duotone" />
                  <p className="text-sm">No active proposals</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="p-3 space-y-2">
                    {proposals.map((p) => {
                      const isSelected  = voteTarget?.proposal_id === p.proposal_id;
                      const endDate     = new Date(p.voting_end_time);
                      const hoursLeft   = Math.max(0, (endDate.getTime() - Date.now()) / 3600000);
                      const isUrgent    = hoursLeft < 24;

                      return (
                        <div
                          key={p.proposal_id}
                          onClick={() => setVoteTarget(p)}
                          className={cn(
                            "p-3 rounded-lg border cursor-pointer transition-all",
                            isSelected
                              ? "bg-primary/10 border-primary/40 ring-1 ring-primary/20"
                              : "bg-transparent border-border/50 hover:bg-secondary/40 hover:border-border"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                  #{p.proposal_id}
                                </span>
                                {isSelected && (
                                  <Badge className="text-[9px] h-4 px-1 bg-primary/20 text-primary border-primary/30">
                                    Selected
                                  </Badge>
                                )}
                                {isUrgent && (
                                  <Badge className="text-[9px] h-4 px-1 bg-rose-500/20 text-rose-400 border-rose-500/30">
                                    Urgent
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs font-medium leading-snug">{p.title}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] text-muted-foreground">Ends in</p>
                              <p className={cn("text-xs font-mono font-bold", isUrgent ? "text-rose-400" : "text-muted-foreground")}>
                                {hoursLeft < 24
                                  ? `${Math.floor(hoursLeft)}h ${Math.floor((hoursLeft % 1) * 60)}m`
                                  : `${Math.floor(hoursLeft / 24)}d`}
                              </p>
                            </div>
                          </div>
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

  // ─── Render: Withdraw ─────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <HandCoins weight="bold" className="text-amber-400" /> Withdraw via Authz
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Granter Address (Delegator / Validator)</Label>
            <Input
              placeholder="cosmos1..."
              className="h-9 text-xs font-mono bg-secondary border-border"
              value={withdrawGranter}
              onChange={(e) => setWithdrawGranter(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              The address that has granted withdrawal rights to your hot wallet.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Validator Address (valoper)</Label>
            <Input
              placeholder="cosmosvaloper1... (optional if same as granter)"
              className="h-9 text-xs font-mono bg-secondary border-border"
              value={validatorAddress}
              onChange={(e) => setValidatorAddress(e.target.value)}
            />
          </div>

          <div className="grid gap-2 pt-1">
            <Button
              variant="outline"
              className="h-10 text-xs gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50"
              onClick={() => handleWithdraw("reward")}
              disabled={isWithdrawing}
            >
              {isWithdrawing ? <Spinner className="animate-spin" size={14} /> : <Coins size={14} weight="bold" />}
              Withdraw Delegator Reward
            </Button>

            <Button
              variant="outline"
              className="h-10 text-xs gap-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50"
              onClick={() => handleWithdraw("commission")}
              disabled={isWithdrawing}
            >
              {isWithdrawing ? <Spinner className="animate-spin" size={14} /> : <ArrowUUpRight size={14} weight="bold" />}
              Withdraw Validator Commission
            </Button>

            <Button
              className="h-10 text-xs gap-2"
              onClick={() => handleWithdraw("both")}
              disabled={isWithdrawing}
            >
              {isWithdrawing ? <Spinner className="animate-spin" size={14} /> : <HandCoins size={14} weight="bold" />}
              Withdraw Both (Batch)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="border-border/40 bg-secondary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <Warning size={16} weight="duotone" className="text-amber-400" /> How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-xs text-muted-foreground">
          <div className="space-y-2 p-3 bg-secondary/20 rounded-lg border border-border/40">
            <p className="font-semibold text-foreground">Step 1 — Grant (one time, from cold wallet)</p>
            <p>Run from your validator wallet via CLI or use the Grants tab above:</p>
            <pre className="text-[10px] bg-background/60 p-2 rounded border border-border/40 overflow-x-auto font-mono whitespace-pre-wrap break-all">
{`gaiad tx authz grant <hot_wallet> generic \\
  --msg-type /cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission \\
  --from <validator_wallet>`}
            </pre>
          </div>
          <div className="space-y-2 p-3 bg-secondary/20 rounded-lg border border-border/40">
            <p className="font-semibold text-foreground">Step 2 — Withdraw (any time, from hot wallet)</p>
            <p>
              Your hot wallet signs a <code className="bg-background/60 px-1 rounded">MsgExec</code>
              wrap pesan withdraw atas nama validator. Dana tetap masuk ke withdrawal address validator,
              bukan ke hot wallet.
            </p>
          </div>
          <div className="p-3 bg-amber-500/5 rounded-lg border border-amber-500/20">
            <p className="text-amber-300/80">
              Funds always go to the validator's configured withdrawal address, not to the hot wallet.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}