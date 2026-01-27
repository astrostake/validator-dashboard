import { useEffect, useState } from "react";
import { 
  Wallet, Gift, UsersThree, Heartbeat, 
  ChartPie, Coins, Fire, Plus, Clock
} from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import axios from "axios";

import { StatsCard } from "@/components/dashboard/StatsCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

// Registrasi komponen Chart.js
ChartJS.register(ArcElement, Tooltip, Legend);

// Definisi Warna Chart yang Konsisten
const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

// --- Interface Data ---
interface Chain {
  name: string;
  priceUsd: number;
  decimals: number;
  logoUrl?: string;
}

interface WalletData {
  id: string;
  label: string;
  chain: Chain;
  balances: { total: string; staked: string; rewards: string; commission: string; valuation?: { totalUsd: number } };
  validator?: { status: { jailed: boolean; tokens: string } };
}

interface Proposal {
  proposalId: string;
  chain: { name: string };
  title: string;
  voting: { endTime: string; myVote: string };
  type: string;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [nodeHealth, setNodeHealth] = useState({ active: 0, jailed: 0, total: 0 });
  const [validatorAum, setValidatorAum] = useState(0);
  
  // Data untuk Chart
  const [aumChartData, setAumChartData] = useState<any>(null);
  const [stakeChartData, setStakeChartData] = useState<any>(null);
  
  // Data List
  const [topChains, setTopChains] = useState<any[]>([]);
  const [urgentProposals, setUrgentProposals] = useState<any[]>([]);
  
  const [chainLogos, setChainLogos] = useState<Record<string, string>>({});

  // --- Fetch Logic ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        
        // 1. Fetch Dashboard Data
        const dashRes = await axios.get(`${API_URL}/dashboard`);
        const data = dashRes.data.data;
        
        if (data) {
          setSummary(data.summary);
          
          const validators = data.wallets.validators || [];
          const regular = data.wallets.regular || [];
          
          // Hitung Node Health
          setNodeHealth({
            total: validators.length,
            active: validators.filter((v: any) => v.validator?.status?.jailed === false).length,
            jailed: validators.filter((v: any) => v.validator?.status?.jailed === true).length
          });

          // Hitung AUM & Data Chart
          let totalAum = 0;
          const aumByChain: Record<string, number> = {};
          const stakeByChain: Record<string, number> = {};
          const chainMap: Record<string, { name: string; value: number; count: number; logoUrl?: string }> = {};
          let totalPortfolio = 0;

          // Process Validators
          validators.forEach((v: WalletData) => {
             const rawTokens = parseFloat(v.validator?.status?.tokens || "0");
             const price = v.chain?.priceUsd || 0;
             const decimals = v.chain?.decimals || 6;
             const valUsd = (rawTokens / Math.pow(10, decimals)) * price;
             
             if(valUsd > 0) {
                totalAum += valUsd;
                aumByChain[v.chain.name] = (aumByChain[v.chain.name] || 0) + valUsd;
             }
          });
          setValidatorAum(totalAum);

          // Process All Wallets
          [...validators, ...regular].forEach((w: WalletData) => {
             const staked = parseFloat(w.balances.staked || "0");
             const price = w.chain?.priceUsd || 0;
             if(staked > 0) {
                stakeByChain[w.chain.name] = (stakeByChain[w.chain.name] || 0) + (staked * price);
             }

             const val = w.balances.valuation?.totalUsd || 0;
             totalPortfolio += val;
             
             if(!chainMap[w.chain.name]) {
                chainMap[w.chain.name] = { 
                  name: w.chain.name, 
                  value: 0, 
                  count: 0,
                  logoUrl: w.chain.logoUrl
                };
             }
             chainMap[w.chain.name].value += val;
             chainMap[w.chain.name].count += 1;
          });

          const extractedLogos: Record<string, string> = {};
          Object.values(chainMap).forEach((c) => {
             if (c.logoUrl) {
                extractedLogos[c.name] = c.logoUrl;
             }
          });
          setChainLogos(extractedLogos);

          // Set Chart Data
          setAumChartData({
            labels: Object.keys(aumByChain),
            datasets: [{
              data: Object.values(aumByChain),
              backgroundColor: CHART_COLORS,
              borderColor: 'transparent', 
              borderWidth: 0
            }]
          });

          setStakeChartData({
             labels: Object.keys(stakeByChain),
             datasets: [{
               data: Object.values(stakeByChain),
               backgroundColor: CHART_COLORS,
               borderColor: 'transparent',
               borderWidth: 0
             }]
          });

          const sortedChains = Object.values(chainMap)
             .sort((a, b) => b.value - a.value)
             .map(c => ({ ...c, percent: totalPortfolio > 0 ? (c.value / totalPortfolio) * 100 : 0 }));
          setTopChains(sortedChains);
        }

        // 2. Fetch Governance
        const govRes = await axios.get(`${API_URL}/governance/all`);
        if(govRes.data.success) {
           const proposals = govRes.data.data.proposals || [];
           const active = proposals
             .filter((p: Proposal) => p.type === 'active')
             .sort((a: Proposal, b: Proposal) => new Date(a.voting.endTime).getTime() - new Date(b.voting.endTime).getTime())
             .slice(0, 5);
           setUrgentProposals(active);
        }

      } catch (e) {
        console.error("Fetch error:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Format Helpers
  const formatUsd = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  const formatCompact = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: "compact", maximumFractionDigits: 1 }).format(val);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
              <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
              <p className="text-muted-foreground mt-1">
                Welcome back. Here's what's happening with your validators today.
              </p>
          </div>
          <Button asChild className="gap-2 shadow-sm">
             <Link to="/wallets"><Plus weight="bold" /> Add Wallet</Link>
          </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard 
             title="Net Worth"
             icon={<Wallet className="w-4 h-4" />}
             value={formatUsd(summary?.portfolioValue?.total || 0)}
             loading={loading}
             subValue={
               <span className="text-emerald-500 font-medium flex items-center gap-1">
                  +2.5% <span className="text-muted-foreground font-normal">from last month</span>
               </span>
             }
          />
          
          <StatsCard 
             title="Pending Value"
             icon={<Gift className="w-4 h-4" />}
             value={formatUsd((summary?.portfolioValue?.pendingRewards || 0) + (summary?.portfolioValue?.validatorCommission || 0))}
             loading={loading}
             subValue={
                <span className="flex gap-3">
                   <span>Rew: <span className="text-foreground font-medium">{formatCompact(summary?.portfolioValue?.pendingRewards || 0)}</span></span>
                   <span>Com: <span className="text-foreground font-medium">{formatCompact(summary?.portfolioValue?.validatorCommission || 0)}</span></span>
                </span>
             }
          />

          <StatsCard 
             title="Total AUM"
             icon={<UsersThree className="w-4 h-4" />}
             value={formatUsd(validatorAum)}
             loading={loading}
             subValue={`Delegated to ${nodeHealth.active} active nodes`}
          />

          <StatsCard 
             title="Node Health"
             icon={<Heartbeat className="w-4 h-4" />}
             value={`${nodeHealth.active} / ${nodeHealth.total}`}
             loading={loading}
             subValue={
                nodeHealth.jailed > 0 ? (
                   <span className="text-red-500 font-bold flex items-center gap-1">
                       {nodeHealth.jailed} Nodes Jailed
                   </span>
                ) : (
                   <span className="text-emerald-500 flex items-center gap-1">
                       All systems operational
                   </span>
                )
             }
          />
      </div>

      {/* Charts & Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
         
         {/* LEFT COLUMN: Charts (4 cols) */}
         <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-6">
             
             {/* AUM Chart with Legend */}
             <Card className="col-span-1 md:col-span-2 lg:col-span-1">
                <CardHeader className="pb-2">
                   <CardTitle className="text-base flex items-center gap-2">
                      <ChartPie weight="bold" className="w-4 h-4 text-primary" /> Validator AUM
                   </CardTitle>
                </CardHeader>
                <CardContent>
                   {loading ? <Skeleton className="h-[200px] w-full rounded-lg" /> : 
                     (aumChartData && aumChartData.datasets[0].data.length > 0 ? 
                       <div className="flex flex-col sm:flex-row items-center gap-6 h-[220px]">
                        {/* Chart */}
                           <div className="h-[140px] w-[140px] shrink-0 relative">
                               <Doughnut 
                                 data={aumChartData} 
                                 options={{ 
                                     maintainAspectRatio: false, 
                                     plugins: { legend: { display: false } },
                                     cutout: '75%'
                                 }} 
                               />
                               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                   <div className="text-center">
                                       <div className="text-[10px] text-muted-foreground uppercase">Total</div>
                                       <div className="text-xs font-bold">{formatCompact(validatorAum)}</div>
                                   </div>
                               </div>
                           </div>

                           {/* Legend List */}
                           <div className="flex-1 w-full h-full min-w-0 py-2">
                               <ScrollArea className="h-full pr-4">
                                   <div className="space-y-3">
                                       {aumChartData.labels.map((label: string, i: number) => {
                                           const val = aumChartData.datasets[0].data[i];
                                           const total = (aumChartData.datasets[0].data as number[]).reduce((a, b) => a + b, 0);
                                           const percent = total > 0 ? (val / total) * 100 : 0;
                                           return (
                                               <div key={label} className="flex items-center justify-between text-xs group">
                                                   <div className="flex items-center gap-2 overflow-hidden">
                                                       <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></span>
                                                       <span className="font-medium truncate text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
                                                   </div>
                                                   <div className="text-right pl-2">
                                                       <div className="font-mono font-medium">{formatCompact(val)}</div>
                                                       <div className="text-[10px] text-muted-foreground">{percent.toFixed(1)}%</div>
                                                   </div>
                                               </div>
                                           );
                                       })}
                                   </div>
                               </ScrollArea>
                           </div>
                       </div>
                       :
                       <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data available</div>
                     )
                   }
                </CardContent>
             </Card>

             {/* Stake Chart with Legend */}
             <Card className="col-span-1 md:col-span-2 lg:col-span-1">
                <CardHeader className="pb-2">
                   <CardTitle className="text-base flex items-center gap-2">
                      <Coins weight="bold" className="w-4 h-4 text-primary" /> Personal Stake
                   </CardTitle>
                </CardHeader>
                <CardContent>
                   {loading ? <Skeleton className="h-[200px] w-full rounded-lg" /> : 
                     (stakeChartData && stakeChartData.datasets[0].data.length > 0 ? 
                       <div className="flex flex-col sm:flex-row items-center gap-6 h-[220px]">
                        {/* Chart */}
                           <div className="h-[140px] w-[140px] shrink-0 relative">
                               <Doughnut 
                                 data={stakeChartData} 
                                 options={{ 
                                     maintainAspectRatio: false, 
                                     plugins: { legend: { display: false } },
                                     cutout: '75%'
                                 }} 
                               />
                               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                   <div className="text-center">
                                       <div className="text-[10px] text-muted-foreground uppercase">Staked</div>
                                       <div className="text-xs font-bold">{formatCompact(summary?.portfolioValue?.staked || 0)}</div>
                                   </div>
                               </div>
                           </div>

                           {/* Legend List */}
                           <div className="flex-1 w-full h-full min-w-0 py-2">
                               <ScrollArea className="h-full pr-4">
                                   <div className="space-y-3">
                                       {stakeChartData.labels.map((label: string, i: number) => {
                                           const val = stakeChartData.datasets[0].data[i];
                                           const total = (stakeChartData.datasets[0].data as number[]).reduce((a, b) => a + b, 0);
                                           const percent = total > 0 ? (val / total) * 100 : 0;
                                           return (
                                               <div key={label} className="flex items-center justify-between text-xs group">
                                                   <div className="flex items-center gap-2 overflow-hidden">
                                                       <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></span>
                                                       <span className="font-medium truncate text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
                                                   </div>
                                                   <div className="text-right pl-2">
                                                       <div className="font-mono font-medium">{formatCompact(val)}</div>
                                                       <div className="text-[10px] text-muted-foreground">{percent.toFixed(1)}%</div>
                                                   </div>
                                               </div>
                                           );
                                       })}
                                   </div>
                               </ScrollArea>
                           </div>
                       </div>
                       :
                       <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">No data available</div>
                     )
                   }
                </CardContent>
             </Card>

             {/* Portfolio List */}
             <Card className="md:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                   <CardTitle className="text-base">Portfolio Distribution</CardTitle>
                   <Button variant="ghost" size="sm" asChild className="text-xs h-8">
                      <Link to="/wallets">Manage Wallets</Link>
                   </Button>
                </CardHeader>
                <CardContent>
                   <ScrollArea className="h-[200px] pr-4">
                      <div className="space-y-4">
                        {topChains.map((c) => (
                           <div key={c.name} className="flex items-center justify-between p-2 hover:bg-secondary/20 rounded-lg transition-colors">
                              <div className="flex items-center gap-3">
                                 <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center font-bold text-xs border border-border overflow-hidden shrink-0">
                                    {c.logoUrl ? (
                                       <img 
                                          src={c.logoUrl} 
                                          alt={c.name} 
                                          className="w-full h-full object-cover"
                                          onError={(e) => {
                                             (e.target as HTMLImageElement).style.display = 'none';
                                             (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                          }}
                                       />
                                    ) : (
                                       <span>{c.name.substring(0,2).toUpperCase()}</span>
                                    )}
                                    {c.logoUrl && <span className="hidden">{c.name.substring(0,2).toUpperCase()}</span>}
                                 </div>
                                 
                                 <div>
                                    <div className="text-sm font-medium">{c.name}</div>
                                    <div className="text-xs text-muted-foreground">{c.count} Wallet(s)</div>
                                 </div>
                              </div>
                              <div className="text-right">
                                 <div className="text-sm font-mono font-medium">{formatUsd(c.value)}</div>
                                 <div className="text-xs text-muted-foreground">{Math.round(c.percent)}% of portfolio</div>
                              </div>
                           </div>
                        ))}
                      </div>
                   </ScrollArea>
                </CardContent>
             </Card>
         </div>

         {/* RIGHT COLUMN: Governance (3 cols) */}
         <Card className="lg:col-span-3 flex flex-col h-full">
             <CardHeader className="flex flex-row items-center justify-between">
                 <div>
                    <CardTitle className="text-base flex items-center gap-2">
                       <Fire weight="bold" className="text-orange-500 w-4 h-4"/> Urgent Proposals
                    </CardTitle>
                    <CardDescription>Ending within 48 hours</CardDescription>
                 </div>
                 <Button variant="ghost" size="sm" asChild className="text-xs h-8">
                    <Link to="/governance">View All</Link>
                 </Button>
             </CardHeader>
             <CardContent className="flex-1">
                <ScrollArea className="h-[500px] pr-4">
                    {urgentProposals.length === 0 && !loading && (
                       <div className="flex flex-col items-center justify-center h-40 text-center">
                          <div className="bg-secondary/50 p-3 rounded-full mb-3">
                             <Clock className="w-6 h-6 text-muted-foreground" />
                          </div>
                          <p className="text-sm text-muted-foreground">No urgent proposals found.</p>
                       </div>
                    )}
                    
                    <div className="space-y-3">
                        {urgentProposals.map((p) => (
                           <div key={p.proposalId + p.chain.name} className="p-4 rounded-lg border bg-card hover:bg-secondary/50 transition flex flex-col gap-2 group cursor-pointer">
                               <div className="flex justify-between items-start">
                                   
                                   {/* BADGE CHAIN: Menggunakan Logo dari State 'chainLogos' */}
                                   <Badge variant="outline" className="text-[10px] uppercase bg-background group-hover:bg-secondary border-border flex items-center gap-1.5 pl-1 pr-2">
                                      {chainLogos[p.chain.name] && (
                                         <img src={chainLogos[p.chain.name]} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                                      )}
                                      {p.chain.name}
                                   </Badge>
                                   <div className="flex items-center gap-1.5 text-xs text-orange-500 font-medium bg-orange-500/10 px-2 py-0.5 rounded-full">
                                      <Clock weight="fill" />
                                      {new Date(p.voting.endTime).toLocaleDateString()}
                                   </div>
                               </div>
                               <div className="text-sm font-medium leading-tight line-clamp-2" title={p.title}>
                                  {p.title}
                               </div>
                               <div className="flex justify-between items-center pt-2 mt-auto border-t border-border/50">
                                   <span className="text-xs text-muted-foreground">My Vote</span>
                                   <Badge variant={p.voting.myVote === 'NOT_VOTED' ? 'secondary' : 'default'} className="text-[10px]">
                                      {p.voting.myVote === 'NOT_VOTED' ? 'Waiting' : p.voting.myVote}
                                   </Badge>
                               </div>
                           </div>
                        ))}
                    </div>
                </ScrollArea>
             </CardContent>
         </Card>

      </div>
    </div>
  );
}