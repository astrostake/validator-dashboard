import { useEffect, useState } from "react";
import axios from "axios";
import { 
  ArrowsLeftRight, Cube, ArrowUpRight, ArrowDownLeft, 
  TrendUp, TrendDown, ArrowUUpRight,
  Wallet, ShieldCheck, Globe, Hash
} from "@phosphor-icons/react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableRow, 
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// --- Types ---
interface Chain {
  id: string;
  name: string;
  denom?: string;     
  decimals?: number;  
}

interface WalletData {
  id: string;
  label: string;
  valAddress?: string;
  chain: Chain;
}

interface WalletTransactionsProps {
  wallet: WalletData | null;
}

export function WalletTransactions({ wallet }: WalletTransactionsProps) {
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [chainMap, setChainMap] = useState<Record<string, number>>({});

  const [mainTab, setMainTab] = useState("wallet"); 
  const [subFilter, setSubFilter] = useState("all"); 

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  // 1. Fetch Chain Config
  useEffect(() => {
    const fetchChains = async () => {
        try {
            const res = await axios.get(`${API_URL}/chains`);
            if (res.data.success) {
                const map: Record<string, number> = {};
                res.data.data.forEach((c: any) => {
                    // FIX: Akses langsung ke c.token.denom (dari API /chains struktur mungkin masih nested)
                    // Cek struktur response /chains di api.ts kamu. 
                    // Jika api.ts formatChainResponse mengembalikan { token: { denom... } }, maka ini BENAR.
                    // TAPI formatWalletResponse mengembalikan flattened chain. Jadi kita handle keduanya.
                    const denom = c.token?.denom || c.denom;
                    const decimals = c.token?.decimals || c.decimals || 6;
                    if(denom) map[denom] = decimals;
                });
                setChainMap(map);
            }
        } catch (e) { console.error("Failed to load chain map", e); }
    };
    fetchChains();
  }, []);

  // 2. Fetch Transactions
  useEffect(() => {
    setPage(1);
    if (wallet) {
        setMainTab("wallet"); 
        setSubFilter("all");
        fetchTransactions(1, "wallet", "all");
    } else {
        fetchTransactions(1, mainTab, subFilter);
    }
  }, [wallet?.id]);

  const handleTabChange = (val: string) => {
      setMainTab(val);
      setSubFilter("all");
      setPage(1);
      fetchTransactions(1, val, "all");
  };

  const handleSubFilterChange = (val: string) => {
      setSubFilter(val);
      setPage(1);
      fetchTransactions(1, mainTab, val);
  };

  const fetchTransactions = async (pageNum: number, tab: string, sub: string) => {
    setLoading(true);
    try {
      const offset = (pageNum - 1) * 20;
      let url = "";
      let params: any = { limit: 20, offset };

      if (wallet) {
          url = `${API_URL}/wallet/${wallet.id}/transactions`;
          let categoryParam: string | undefined = undefined;
          let typeParam: string | undefined = undefined;

          if (tab === 'wallet') {
              categoryParam = 'wallet';
              if (sub === 'general') typeParam = 'general';
              if (sub === 'staking') typeParam = 'staking'; 
          } else if (tab === 'validator') {
              categoryParam = 'staking';
              if (sub === 'delegate') categoryParam = 'delegate';
              if (sub === 'undelegate') categoryParam = 'undelegate';
              if (sub === 'redelegate') categoryParam = 'redelegate';
          }
          params.category = categoryParam;
          params.type = typeParam;
      } else {
          url = `${API_URL}/transactions/latest`; 
      }

      const res = await axios.get(url, { params });
      if (res.data.success) {
        const newTxs = res.data.data.transactions || res.data.data || [];
        setTransactions(newTxs);
        setHasMore(newTxs.length === 20); 
      }
    } catch (e) {
      console.error("Tx Fetch Error", e);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  // --- Helper: Badge Styles ---
  const getBadgeStyle = (type: string) => {
    const t = type.toLowerCase();
    const base = "font-mono font-bold text-[10px] px-2 py-0.5 rounded-md border backdrop-blur-sm";
    
    if (t.includes('send')) return `${base} bg-orange-500/10 text-orange-400 border-orange-500/20`;
    if (t.includes('receive')) return `${base} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`;
    if (t.includes('delegate') && !t.includes('un') && !t.includes('re')) return `${base} bg-purple-500/10 text-purple-400 border-purple-500/20`;
    if (t.includes('undelegate')) return `${base} bg-pink-500/10 text-pink-400 border-pink-500/20`;
    if (t.includes('redelegate')) return `${base} bg-blue-500/10 text-blue-400 border-blue-500/20`;
    if (t.includes('withdraw')) return `${base} bg-amber-500/10 text-amber-400 border-amber-500/20`;
    
    return `${base} bg-secondary/50 text-muted-foreground border-border`;
  };

  // --- Helper: Clean Type String ---
  // FIX: Fungsi ini memendekkan nama type agar muat di tabel
  const cleanType = (type: string) => {
    return type
        .replace('Msg', '')
        .replace('Exec/', '')
        .replace('DelegatorReward', 'Reward')
        .replace('ValidatorCommission', 'Comm')
        .replace('Withdraw', 'Get')
        .replace('BeginRedelegate', 'Redelegate')
        .replace(/\(batch:\d+\)/, ' (Batch)') // Opsional: sederhanakan batch info
        .replace(/\+/g, ' & ');
  };

  const getIcon = (type: string) => {
    const t = type.toLowerCase();
    const size = 16;
    if (t.includes('send')) return <ArrowUpRight size={size} className="text-orange-400" />;
    if (t.includes('receive')) return <ArrowDownLeft size={size} className="text-emerald-400" />;
    if (t.includes('redelegate')) return <ArrowUUpRight size={size} className="text-blue-400" />;
    if (t.includes('undelegate')) return <TrendDown size={size} className="text-pink-400" />;
    if (t.includes('delegate')) return <TrendUp size={size} className="text-purple-400" />;
    return <ArrowsLeftRight size={size} className="text-muted-foreground" />;
  };

  const shorten = (str: string) => str ? `${str.slice(0, 6)}...${str.slice(-4)}` : '';
  
  const formatDate = (ts: string) => {
      const d = new Date(ts);
      return (
        <div className="flex flex-col items-end">
            <span className="text-xs font-medium text-foreground/80">
                {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="text-[10px] text-muted-foreground">
                {d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
        </div>
      );
  };

  const formatAmount = (tx: any) => {
      const raw = tx.transaction?.amount || "0";
      if (raw === 'Failed') return <span className="text-destructive font-bold text-xs">FAILED</span>;
      
      let isOut = tx.transaction?.direction === 'OUT';
      let isRedelegate = tx.type.toLowerCase().includes('redelegate');

      if (isRedelegate && tx.transaction?.destinationValidator) {
          const myValAddress = wallet?.valAddress || tx.wallet?.valAddress;
          if (myValAddress) {
              const isDestMine = tx.transaction.destinationValidator === myValAddress;
              isOut = !isDestMine; 
          }
      }

      const m = raw.match(/^([\d\.]+)([a-zA-Z]+)(.*)$/);
      if(m) {
          const rawVal = parseFloat(m[1]); 
          const rawDenom = m[2];
          
          // FIX: Access decimals safely (gunakan optional chaining dan fallback yang benar)
          // Priority: ChainMap -> Wallet Chain -> Transaction Wallet Chain
          let decimals = chainMap[rawDenom];
          if (!decimals) {
             decimals = wallet?.chain?.decimals || tx.wallet?.chain?.decimals || 6;
          }
          
          // Heuristik untuk aDenom (biasanya 18)
          if (decimals === 6 && rawDenom.startsWith('a') && !rawDenom.includes('ibc')) decimals = 18;

          const val = rawVal / Math.pow(10, decimals);
          
          let displayDenom = rawDenom.toUpperCase();
          if ((decimals === 18 && displayDenom.startsWith('A')) || (decimals === 6 && displayDenom.startsWith('U'))) {
             displayDenom = displayDenom.substring(1);
          }

          const usdPrice = tx.valuation?.usdValue?.current || 0;

          return (
            <div className="flex flex-col items-end justify-center">
                <span className={cn("font-mono font-bold text-sm tabular-nums tracking-tight", isOut ? "text-rose-400" : "text-emerald-400")}>
                    {isOut ? "-" : "+"}{val.toLocaleString(undefined, {maximumFractionDigits: 4})} {displayDenom}
                </span>
                {usdPrice > 0 && (
                    <span className="text-[10px] text-muted-foreground font-medium">
                        ≈ ${usdPrice.toLocaleString(undefined, {maximumFractionDigits: 2})}
                    </span>
                )}
            </div>
          );
      }
      return <span className="text-muted-foreground font-mono text-xs">{raw}</span>;
  };

  return (
    <Card className="h-full min-h-[600px] flex flex-col border-border/60 shadow-lg bg-card/95 backdrop-blur-sm">
      
      {/* HEADER */}
      <CardHeader className="border-b border-border/40 px-6 py-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
           <div>
               <CardTitle className="text-lg flex items-center gap-2">
                   {wallet ? (
                       <>Transaction History <span className="text-muted-foreground text-sm font-normal">for {wallet.label}</span></>
                   ) : (
                       <><Globe className="text-primary" weight="duotone"/> Global Activity Feed</>
                   )}
               </CardTitle>
               <CardDescription className="text-xs mt-1">
                   {/* FIX: Gunakan optional chaining (?.) untuk denom agar tidak crash jika data belum load */}
                   {wallet 
                    ? `Showing transactions for ${wallet.chain.name} (${wallet.chain.denom?.toUpperCase() || 'TOKEN'})` 
                    : "Real-time transactions across all your tracked wallets"}
               </CardDescription>
           </div>
           
           {wallet && (
               <Tabs value={mainTab} onValueChange={handleTabChange} className="w-full sm:w-auto">
                  <TabsList className="grid w-full grid-cols-2 h-8 bg-secondary/50 p-0.5">
                     <TabsTrigger value="wallet" className="text-xs h-7 gap-2"><Wallet weight="bold"/> Wallet</TabsTrigger>
                     <TabsTrigger value="validator" className="text-xs h-7 gap-2"><ShieldCheck weight="bold"/> Validator</TabsTrigger>
                  </TabsList>
               </Tabs>
           )}
        </div>

        {wallet && mainTab === 'wallet' && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                {['all', 'general', 'staking'].map((type) => (
                    <button key={type} onClick={() => handleSubFilterChange(type)}
                        className={cn("px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all border",
                            subFilter === type ? "bg-primary/10 text-primary border-primary/20" : "bg-transparent text-muted-foreground border-transparent hover:bg-secondary"
                        )}>
                        {type}
                    </button>
                ))}
            </div>
        )}
        {wallet && mainTab === 'validator' && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 overflow-x-auto pb-1 scrollbar-none">
                {['all', 'delegate', 'undelegate', 'redelegate'].map((type) => (
                    <button key={type} onClick={() => handleSubFilterChange(type)}
                        className={cn("px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all border",
                            subFilter === type ? "bg-primary/10 text-primary border-primary/20" : "bg-transparent text-muted-foreground border-transparent hover:bg-secondary"
                        )}>
                        {type}
                    </button>
                ))}
            </div>
        )}
      </CardHeader>

      {/* CONTENT: TABLE */}
      <CardContent className="p-0 flex-1 overflow-hidden flex flex-col relative">
          <div className="bg-secondary/30 border-b border-border/40 text-[10px] uppercase tracking-wider font-bold text-muted-foreground grid grid-cols-12 px-6 py-3 gap-2 sticky top-0 z-10 backdrop-blur-md">
              <div className="col-span-2">Tx Details</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-5">{wallet ? "Context" : "Wallet / Context"}</div>
              <div className="col-span-3 text-right">Amount / Time</div>
          </div>

          <ScrollArea className="flex-1 bg-background/50">
             <div className="">
                {loading && transactions.length === 0 ? (
                    <div className="p-6 space-y-4">
                       {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg bg-secondary/40" />)}
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground/50">
                        <div className="p-4 bg-secondary/30 rounded-full mb-3">
                            <Cube className="w-8 h-8" weight="duotone" />
                        </div>
                        <p className="text-sm font-medium">No transactions found</p>
                    </div>
                ) : (
                    <Table>
                        <TableBody>
                            {transactions.map((tx) => (
                                <TableRow key={tx.id || tx.hash} className="hover:bg-secondary/20 border-b border-border/30 group transition-colors">
                                    <TableCell className="py-4 align-top col-span-2 w-[16%]">
                                        <div className="flex flex-col gap-1">
                                            <a href={`/explorer/${tx.hash}`} target="_blank" className="font-mono text-xs text-primary/80 hover:text-primary hover:underline flex items-center gap-1 w-fit">
                                                <Hash size={12}/> {shorten(tx.hash)}
                                            </a>
                                            <div className="text-[10px] text-muted-foreground font-mono">
                                                Block: {tx.height}
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* FIX: Tambahkan max-w dan truncate pada Badge Type */}
                                    <TableCell className="py-4 align-top w-[16%]">
                                        <div className="max-w-[140px]" title={tx.type}>
                                            <Badge variant="outline" className={cn("w-fit shadow-sm truncate block max-w-full", getBadgeStyle(tx.type))}>
                                                {cleanType(tx.type)}
                                            </Badge>
                                        </div>
                                    </TableCell>

                                    <TableCell className="py-4 align-top w-[41%]">
                                        <div className="flex flex-col gap-1">
                                            {!wallet && (
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <Badge variant="secondary" className="text-[10px] px-1 h-4 bg-secondary/50 text-foreground/70 border-0 rounded-[4px]">
                                                        {tx.wallet?.label || "Unknown"}
                                                    </Badge>
                                                    <span className="text-[10px] text-muted-foreground">• {tx.wallet?.chain?.name}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 text-xs text-foreground/80">
                                                <div className="p-1 rounded bg-secondary/40 text-muted-foreground group-hover:bg-background group-hover:text-foreground transition-colors shrink-0">
                                                    {getIcon(tx.type)}
                                                </div>
                                                
                                                <span className="truncate font-mono text-xs text-muted-foreground/80" title={tx.transaction?.recipient || tx.transaction?.sender || tx.transaction?.validator}>
                                                    {tx.transaction?.recipient ? `To: ${shorten(tx.transaction.recipient)}` : 
                                                     tx.transaction?.sender ? `From: ${shorten(tx.transaction.sender)}` : 
                                                     tx.transaction?.validator ? `Val: ${shorten(tx.transaction.validator)}` : 
                                                     tx.transaction?.destinationValidator ? `Dst: ${shorten(tx.transaction.destinationValidator)}` : '-'}
                                                </span>
                                            </div>
                                        </div>
                                    </TableCell>

                                    <TableCell className="py-4 align-top text-right w-[25%]">
                                        <div className="flex items-start justify-end gap-4">
                                            {formatAmount(tx)}
                                            <div className="hidden sm:block border-l pl-4 border-border/50">
                                                {formatDate(tx.timestamp)}
                                            </div>
                                        </div>
                                    </TableCell>

                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
             </div>
          </ScrollArea>

          <div className="border-t border-border/40 p-2 flex justify-between items-center bg-card/50 backdrop-blur-sm">
              <Button variant="ghost" size="sm" className="h-8 text-xs hover:bg-secondary/50" 
                      onClick={() => { if(page > 1) { setPage(p=>p-1); fetchTransactions(page-1, mainTab, subFilter); } }} 
                      disabled={page === 1 || loading}>
                  Previous
              </Button>
              <span className="text-[10px] font-mono text-muted-foreground bg-secondary/30 px-2 py-1 rounded">Page {page}</span>
              <Button variant="ghost" size="sm" className="h-8 text-xs hover:bg-secondary/50" 
                      onClick={() => { setPage(p=>p+1); fetchTransactions(page+1, mainTab, subFilter); }} 
                      disabled={!hasMore || loading}>
                  Next
              </Button>
          </div>
      </CardContent>
    </Card>
  );
}