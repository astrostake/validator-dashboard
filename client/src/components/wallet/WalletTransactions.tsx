import { useEffect, useState } from "react";
import axios from "axios";
import { 
  ArrowsLeftRight, Cube, ArrowUpRight, ArrowDownLeft, 
  TrendUp, TrendDown, MagnifyingGlass, ArrowUUpRight,
  Wallet, ShieldCheck
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
  token: { denom: string; decimals: number };
}

interface WalletData {
  id: string;
  label: string;
  chain: Chain;
}

interface WalletTransactionsProps {
  wallet: WalletData | null;
}

export function WalletTransactions({ wallet }: WalletTransactionsProps) {
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  
  // State untuk menyimpan data chain yang akurat (Denom -> Decimals)
  const [chainMap, setChainMap] = useState<Record<string, number>>({});

  // State Filter Utama
  // PERUBAHAN 1: Default mainTab jadi "wallet"
  const [mainTab, setMainTab] = useState("wallet"); 
  const [subFilter, setSubFilter] = useState("all"); 

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  // 1. Fetch Chain Config saat komponen dimuat pertama kali
  useEffect(() => {
    const fetchChains = async () => {
        try {
            const res = await axios.get(`${API_URL}/chains`);
            if (res.data.success) {
                const map: Record<string, number> = {};
                res.data.data.forEach((c: any) => {
                    // Simpan mapping: "ahp" -> 18, "ulava" -> 6
                    if(c.token?.denom) {
                        map[c.token.denom] = c.token.decimals || 6;
                    }
                });
                setChainMap(map);
            }
        } catch (e) {
            console.error("Failed to load chain map", e);
        }
    };
    fetchChains();
  }, []);

  // 2. Fetch Transactions saat wallet berubah
  useEffect(() => {
    if (wallet) {
      setPage(1);
      // PERUBAHAN 2: Set ke "wallet" saat ganti wallet
      setMainTab("wallet");
      setSubFilter("all");
      fetchTransactions(1, "wallet", "all");
    } else {
      setTransactions([]);
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

  // --- FETCH LOGIC ---
  const fetchTransactions = async (pageNum: number, tab: string, sub: string) => {
    if (!wallet) return;
    setLoading(true);
    
    try {
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

      const offset = (pageNum - 1) * 20; 
      const res = await axios.get(`${API_URL}/wallet/${wallet.id}/transactions`, {
        params: { limit: 20, offset, category: categoryParam, type: typeParam }
      });

      if (res.data.success) {
        const newTxs = res.data.data.transactions || [];
        setTransactions(newTxs);
        setHasMore(newTxs.length === 20); 
      }
    } catch (e) {
      console.error("Tx Fetch Error", e);
    } finally {
      setLoading(false);
    }
  };

  // --- Helper Functions ---
  const shorten = (str: string) => str ? `${str.slice(0, 6)}...${str.slice(-4)}` : '';
  const formatDate = (ts: string) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getBadgeStyle = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('send')) return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    if (t.includes('receive')) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (t.includes('delegate')) return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    if (t.includes('undelegate')) return "bg-pink-500/10 text-pink-400 border-pink-500/20";
    if (t.includes('redelegate')) return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    return "bg-secondary text-muted-foreground";
  };

  const getIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('send')) return <ArrowUpRight className="text-orange-400" />;
    if (t.includes('receive')) return <ArrowDownLeft className="text-emerald-400" />;
    if (t.includes('redelegate')) return <ArrowUUpRight className="text-blue-400" />;
    if (t.includes('undelegate')) return <TrendDown className="text-pink-400" />;
    if (t.includes('delegate')) return <TrendUp className="text-purple-400" />;
    return <ArrowsLeftRight className="text-muted-foreground" />;
  };

  // --- LOGIC PERBAIKAN: FORMAT AMOUNT ---
  const formatAmount = (tx: any) => {
      const raw = tx.transaction?.amount || "0";
      if (raw === 'Failed') return <span className="text-red-500 font-bold">Failed</span>;
      
      const m = raw.match(/^([\d\.]+)([a-zA-Z]+)(.*)$/);
      if(m) {
          const rawVal = parseFloat(m[1]); 
          const rawDenom = m[2];
          
          // 1. Priority 1: Cek di ChainMap yang kita fetch dari /api/chains
          let decimals = chainMap[rawDenom];

          // 2. Priority 2: Fallback ke wallet config
          if (!decimals) decimals = wallet?.chain?.token?.decimals || 6;

          // 3. Priority 3: Heuristik (Tebak-tebakan cerdas jika data API kosong)
          if (decimals === 6 && rawDenom.startsWith('a') && !rawDenom.includes('ibc')) {
              decimals = 18;
          }

          const val = rawVal / Math.pow(10, decimals);
          
          // 4. Bersihkan Nama Denom
          let displayDenom = rawDenom.toUpperCase();
          
          if (decimals === 18 && displayDenom.startsWith('A')) {
             displayDenom = displayDenom.substring(1);
          } else if (decimals === 6 && displayDenom.startsWith('U')) {
             displayDenom = displayDenom.substring(1);
          }

          if (displayDenom === 'HP') displayDenom = 'HP';

          const isOut = tx.transaction?.direction === 'OUT';
          return (
            <span className={cn("font-mono font-medium", isOut ? "text-red-400" : "text-emerald-400")}>
                {isOut ? "-" : "+"}{val.toLocaleString(undefined, {maximumFractionDigits: 6})} {displayDenom}
            </span>
          );
      }
      return <span className="text-muted-foreground font-mono text-xs">{raw}</span>;
  };

  // --- RENDER ---
  if (!wallet) return (
      <Card className="h-full min-h-[600px] flex flex-col items-center justify-center text-center p-8 bg-secondary/5 border-dashed">
        <div className="p-6 bg-secondary/30 rounded-full mb-4 animate-pulse"><MagnifyingGlass className="w-12 h-12 text-muted-foreground opacity-50" /></div>
        <h3 className="text-xl font-bold">No Wallet Selected</h3>
        <p className="text-muted-foreground max-w-xs mx-auto mt-2">Select a wallet from the list on the left.</p>
      </Card>
  );

  return (
    <Card className="h-full min-h-[600px] flex flex-col border-border shadow-md">
      <CardHeader className="border-b border-border bg-card/50 px-6 py-4 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
           <div>
               <CardTitle className="text-base flex items-center gap-2">Transaction History</CardTitle>
               <CardDescription>Activity for <span className="font-mono text-primary">{wallet.chain.name}</span></CardDescription>
           </div>
           
           <Tabs value={mainTab} onValueChange={handleTabChange} className="w-full sm:w-auto">
              {/* PERUBAHAN 3: Ubah grid-cols-3 jadi grid-cols-2 */}
              <TabsList className="grid w-full grid-cols-2 h-9 bg-secondary/50 p-1">
                 {/* PERUBAHAN 4: Hapus TabsTrigger 'all' */}
                 <TabsTrigger value="wallet" className="text-xs h-7 flex items-center gap-2"><Wallet weight="bold"/> Wallet</TabsTrigger>
                 <TabsTrigger value="validator" className="text-xs h-7 flex items-center gap-2"><ShieldCheck weight="bold"/> Validator</TabsTrigger>
              </TabsList>
           </Tabs>
        </div>

        {mainTab === 'wallet' && (
            <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mr-1">Filter:</span>
                {['all', 'general', 'staking'].map((type) => (
                    <button key={type} onClick={() => handleSubFilterChange(type)}
                        className={cn("px-3 py-1 rounded-full text-xs font-medium transition-all border capitalize",
                            subFilter === type ? "bg-primary/20 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary/80"
                        )}>
                        {type}
                    </button>
                ))}
            </div>
        )}

        {mainTab === 'validator' && (
            <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mr-1">Filter:</span>
                {['all', 'delegate', 'undelegate', 'redelegate'].map((type) => (
                    <button key={type} onClick={() => handleSubFilterChange(type)}
                        className={cn("px-3 py-1 rounded-full text-xs font-medium transition-all border capitalize",
                            subFilter === type ? "bg-primary/20 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-transparent hover:text-foreground"
                        )}>
                        {type}
                    </button>
                ))}
            </div>
        )}

      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
          <div className="bg-secondary/20 border-b border-border text-xs font-medium text-muted-foreground grid grid-cols-12 px-6 py-2 gap-2">
              <div className="col-span-2">Tx Hash</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-4">Context</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-2 text-right">Time</div>
          </div>

          <ScrollArea className="flex-1">
             <div className="px-2">
                {loading && transactions.length === 0 ? (
                    <div className="p-8 space-y-3">
                       <Skeleton className="h-12 w-full" />
                       <Skeleton className="h-12 w-full" />
                       <Skeleton className="h-12 w-full" />
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <Cube className="w-10 h-10 mb-2 opacity-20" weight="duotone" />
                        <p>No transactions found</p>
                    </div>
                ) : (
                    <Table>
                        <TableBody>
                            {transactions.map((tx) => (
                                <TableRow key={tx.id} className="hover:bg-secondary/30 border-b-border/50 text-sm group">
                                    <TableCell className="font-mono text-xs text-primary w-[16%]">
                                        <a href={`/explorer/${tx.hash}`} target="_blank" className="hover:underline flex items-center gap-1">
                                            {shorten(tx.hash)}
                                            <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </a>
                                    </TableCell>
                                    <TableCell className="w-[16%]">
                                        <Badge variant="outline" className={cn("text-[10px] font-bold px-1.5 py-0.5 border h-5 truncate max-w-[100px]", getBadgeStyle(tx.type))}>
                                            {tx.type.replace('Msg', '')}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="w-[33%]">
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                                            {getIcon(tx.type)}
                                            <span className="truncate max-w-[150px]">
                                                {tx.transaction?.recipient ? `To: ${shorten(tx.transaction.recipient)}` : 
                                                 tx.transaction?.sender ? `From: ${shorten(tx.transaction.sender)}` : 
                                                 tx.transaction?.validator ? `Val: ${shorten(tx.transaction.validator)}` : '-'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right w-[16%]">
                                        {formatAmount(tx)}
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-muted-foreground w-[16%]">
                                        {formatDate(tx.timestamp)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
             </div>
          </ScrollArea>

          <div className="border-t border-border p-3 flex justify-between items-center bg-card">
              <Button variant="ghost" size="sm" onClick={() => { if(page > 1) { setPage(p=>p-1); fetchTransactions(page-1, mainTab, subFilter); } }} disabled={page === 1 || loading}>
                  Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page}</span>
              <Button variant="ghost" size="sm" onClick={() => { setPage(p=>p+1); fetchTransactions(page+1, mainTab, subFilter); }} disabled={!hasMore || loading}>
                  Next
              </Button>
          </div>
      </CardContent>
    </Card>
  );
}