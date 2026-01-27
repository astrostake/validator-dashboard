import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom"; // GANTI: useSearchParams jadi useParams & useNavigate
import axios from "axios";
import JsonView from '@microlink/react-json-view';
import { 
  ArrowLeft, Spinner, WarningCircle, CheckCircle, Cube,
  Info, Copy, Code, ChartLineUp, ArrowElbowDownRight, MagnifyingGlass,
  GasPump, Wallet, PaperPlaneRight, Clock, Hash
} from "@phosphor-icons/react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// --- Interface Data ---
interface PriceAnalysis {
  tokenSymbol: string;
  pnlUsd: number;
  pnlPercent: string;
  isProfit: boolean;
  priceAtTimestamp: number;
  valueAtTimestamp: number;
  priceCurrent: number;
  valueCurrent: number;
}

interface TxData {
  hash: string;
  height: string;
  timestamp: string;
  type: string;
  status: string;
  amount: string;
  sender: string;
  recipient: string;
  delegator: string;
  validator: string;
  txCategory: string; 
  rawTxParsed: any;
  priceAnalysis: PriceAnalysis | null;
}

// --- Helper Components ---
const CopyButton = ({ text }: { text: string }) => {
    const { toast } = useToast();
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        toast({ description: "Copied to clipboard" });
    };
    return (
        <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Copy">
            <Copy size={14} />
        </button>
    );
};

const InfoRow = ({ icon: Icon, label, value, className = "" }: any) => (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between py-3 border-b border-border/50 ${className}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1 sm:mb-0">
        {Icon && <Icon size={16} />}
        <span>{label}</span>
      </div>
      <div className="font-medium text-sm sm:text-right break-all">{value}</div>
    </div>
);

export default function TxExplorer() {
  // GANTI: Menggunakan useParams untuk membaca /explorer/:hash
  const { hash: hashParam } = useParams(); 
  const navigate = useNavigate();
  
  // State
  const [searchInput, setSearchInput] = useState(hashParam || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<TxData | null>(null);
  const [chainMap, setChainMap] = useState<Record<string, number>>({}); 

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  // --- 1. Init: Fetch Chains & Tx Details ---
  useEffect(() => {
    if (hashParam) {
        setSearchInput(hashParam);
        fetchTxData(hashParam);
    } else {
        // Reset jika URL bersih (/explorer)
        setTx(null);
        setError(null);
        setLoading(false);
        setSearchInput("");
    }
  }, [hashParam]);

  const fetchTxData = async (hash: string) => {
      setLoading(true);
      setError(null);
      try {
        // A. Fetch Chains
        const chainsRes = await axios.get(`${API_URL}/chains`);
        const chains = chainsRes.data.success ? chainsRes.data.data : [];
        const decimalMap: Record<string, number> = {};
        chains.forEach((c: any) => {
            if (c.token?.denom) decimalMap[c.token.denom] = c.token.decimals || 6;
        });
        setChainMap(decimalMap);

        // B. Fetch Transaction Detail
        const txRes = await axios.get(`${API_URL}/transaction/${hash}`);
        if (!txRes.data.success || !txRes.data.data) {
           throw new Error("Transaction not found");
        }

        const d = txRes.data.data;
        const tInfo = d.transaction || {};
        const val = d.valuation || null;

        setTx({
          hash: d.hash,
          height: d.height,
          timestamp: d.timestamp,
          type: d.type,
          status: "Success",
          amount: tInfo.amount,
          sender: tInfo.sender,
          recipient: tInfo.recipient,
          delegator: tInfo.delegator,
          validator: tInfo.validator,
          txCategory: resolveCategory(d.category, tInfo.subcategory),
          rawTxParsed: d.raw?.data || {},
          priceAnalysis: val ? {
            tokenSymbol: val.token.symbol,
            pnlUsd: val.profitLoss.amountUsd,
            pnlPercent: val.profitLoss.percentageFormatted,
            isProfit: val.profitLoss.isProfit,
            priceAtTimestamp: val.token.priceAtTransaction,
            valueAtTimestamp: val.usdValue.atTransaction,
            priceCurrent: val.token.priceCurrent,
            valueCurrent: val.usdValue.current
          } : null
        });

      } catch (e: any) {
        console.error(e);
        setError(e.message || "Failed to load transaction");
        setTx(null);
      } finally {
        setLoading(false);
      }
  };

  // --- Helper Logic ---
  const handleSearch = (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchInput.trim()) return;
      // GANTI: Pindah halaman menggunakan URL Path
      navigate(`/explorer/${searchInput.trim()}`);
  };

  const resolveCategory = (mainCat: string, subCat: string) => {
      if (mainCat === 'wallet') return 'WALLET';
      if (mainCat === 'validator') return subCat === 'own' ? 'STAKING' : 'VALIDATOR';
      return mainCat.toUpperCase();
  };

  const formatAmount = (raw: string) => {
      if (!raw || raw === 'Failed') return { main: 'Failed', sub: null };
      const m = raw.match(/^([\d\.]+)([a-zA-Z]+)(.*)$/);
      if (m) {
          const rawVal = parseFloat(m[1]);
          const denom = m[2];
          const extraInfo = m[3];
          let decimals = 6;
          
          if (chainMap[denom]) {
              decimals = chainMap[denom];
          } else if (denom.startsWith('a') && !denom.includes('ibc')) {
              decimals = 18;
          }
          
          const val = rawVal / Math.pow(10, decimals);
          let cleanDenom = denom.toUpperCase();
          if (denom.length > 3 && (denom.startsWith('u') || denom.startsWith('a'))) {
              cleanDenom = denom.substring(1).toUpperCase();
          }

          const mainString = `${val.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${cleanDenom}`;
          let subString = null;

          if (extraInfo && extraInfo.trim().length > 0) {
              const rMatch = extraInfo.match(/R:(\d+)/);
              const cMatch = extraInfo.match(/C:(\d+)/);
              let details = [];
              if (rMatch) details.push(`Reward: ${(parseFloat(rMatch[1]) / Math.pow(10, decimals)).toLocaleString(undefined, {maximumFractionDigits: 2})}`);
              if (cMatch) details.push(`Comm: ${(parseFloat(cMatch[1]) / Math.pow(10, decimals)).toLocaleString(undefined, {maximumFractionDigits: 2})}`);
              if (details.length > 0) subString = `(${details.join(' + ')})`;
          }
          return { main: mainString, sub: subString };
      }
      return { main: raw, sub: null };
  };

  const formatUsd = (val: number | undefined) => {
      if (val === undefined) return '$0.00';
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: val < 1 ? 4 : 2 }).format(val);
  };

  const getGasInfo = (raw: any) => {
      const wanted = raw?.tx_response?.gas_wanted || raw?.gas_wanted;
      const used = raw?.tx_response?.gas_used || raw?.gas_used;
      if (wanted && used) {
          const percent = Math.min((parseInt(used) / parseInt(wanted)) * 100, 100);
          return { used, wanted, percent };
      }
      return null;
  };

  const gasInfo = tx ? getGasInfo(tx.rawTxParsed) : null;

  // --- RENDER ---
  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER AREA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/60 pb-6">
         <div className="flex items-center gap-4">
             <Button variant="outline" size="icon" asChild className="h-10 w-10">
                <Link to="/"><ArrowLeft className="text-lg" /></Link>
             </Button>
             <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    <Cube weight="duotone" className="text-primary"/> Block Explorer
                </h1>
                <p className="text-sm text-muted-foreground">Detailed transaction inspector & PnL analysis.</p>
             </div>
         </div>

         {/* SEARCH BAR */}
         <form onSubmit={handleSearch} className="flex gap-2 w-full md:w-auto md:min-w-[400px]">
             <div className="relative flex-1">
                 <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                 <Input 
                    placeholder="Search Transaction Hash..." 
                    className="pl-9 font-mono text-sm bg-background"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                 />
             </div>
             <Button type="submit">Search</Button>
         </form>
      </div>

      {/* EMPTY STATE */}
      {!hashParam && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed border-border/50 rounded-xl bg-muted/20">
              <div className="bg-muted p-4 rounded-full mb-4">
                  <MagnifyingGlass className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">Ready to Explore</h3>
              <p className="text-muted-foreground max-w-sm mt-2">
                  Paste a transaction hash to view validator details, messages, and profit/loss analysis.
              </p>
          </div>
      )}

      {/* LOADING STATE */}
      {loading && (
          <div className="flex flex-col items-center justify-center py-32 space-y-4">
              <Spinner className="animate-spin text-4xl text-primary" />
              <p className="text-muted-foreground animate-pulse">Scanning blockchain data...</p>
          </div>
      )}

      {/* ERROR STATE */}
      {!loading && error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive p-6 rounded-xl flex items-center gap-4 max-w-2xl mx-auto">
              <WarningCircle className="text-3xl shrink-0" />
              <div>
                  <h3 className="font-bold">Transaction Not Found</h3>
                  <p className="text-sm opacity-90">{error}</p>
                  <code className="block mt-2 text-xs bg-black/20 p-1 rounded opacity-70">{hashParam}</code>
              </div>
          </div>
      )}

      {/* DATA DISPLAY */}
      {!loading && tx && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500">
              
              {/* KOLOM KIRI (2/3) */}
              <div className="lg:col-span-2 space-y-6">
                  
                  {/* 1. Header Card */}
                  <Card className="p-6 bg-card border-border shadow-sm">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                          <div className="space-y-1 overflow-hidden">
                              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                  <Hash size={12}/> Transaction Hash
                              </div>
                              <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm md:text-base truncate max-w-[200px] md:max-w-md text-foreground/90">
                                      {tx.hash}
                                  </span>
                                  <CopyButton text={tx.hash} />
                              </div>
                          </div>
                          <Badge variant="outline" className="w-fit bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1 gap-1.5">
                              <CheckCircle weight="fill" /> Success
                          </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-border/50">
                          <div>
                              <div className="text-xs text-muted-foreground mb-1">Block Height</div>
                              <div className="font-mono font-medium text-lg flex items-center gap-2">
                                  <Cube className="text-primary/70"/> {tx.height}
                              </div>
                          </div>
                          <div>
                              <div className="text-xs text-muted-foreground mb-1">Timestamp</div>
                              <div className="font-medium flex items-center gap-2">
                                  <Clock className="text-primary/70"/> {new Date(tx.timestamp).toLocaleString()}
                              </div>
                          </div>
                          <div>
                              <div className="text-xs text-muted-foreground mb-1">Category</div>
                              <Badge variant="secondary" className="font-mono text-xs">
                                  {tx.txCategory}
                              </Badge>
                          </div>
                      </div>
                  </Card>

                  {/* 2. Transaction Details */}
                  <Card className="overflow-hidden">
                      <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
                          <Info className="text-primary"/> <span className="font-semibold text-sm">Transfer Details</span>
                      </div>
                      <div className="p-6 space-y-1">
                          <InfoRow 
                              icon={Wallet} label="Type" 
                              value={<span className="font-mono bg-secondary px-2 py-0.5 rounded text-xs">{tx.type}</span>} 
                          />
                          <InfoRow 
                              icon={ChartLineUp} label="Amount" 
                              value={
                                  <div className="flex flex-col items-end">
                                      <span className="font-bold text-base">{formatAmount(tx.amount).main}</span>
                                      {formatAmount(tx.amount).sub && (
                                          <span className="text-xs text-muted-foreground">{formatAmount(tx.amount).sub}</span>
                                      )}
                                  </div>
                              } 
                          />
                          {(tx.sender || tx.delegator) && (
                              <InfoRow icon={PaperPlaneRight} label="Sender" value={
                                  <div className="flex items-center gap-2">
                                      <span className="font-mono text-primary text-xs">{tx.sender || tx.delegator}</span>
                                      <CopyButton text={tx.sender || tx.delegator} />
                                  </div>
                              }/>
                          )}
                          {(tx.recipient || tx.validator) && (
                              <InfoRow icon={ArrowElbowDownRight} label="Recipient" value={
                                  <div className="flex items-center gap-2">
                                      <span className="font-mono text-purple-500 text-xs">{tx.recipient || tx.validator}</span>
                                      <CopyButton text={tx.recipient || tx.validator} />
                                  </div>
                              }/>
                          )}

                          {/* Gas Meter */}
                          {gasInfo && (
                               <InfoRow icon={GasPump} label="Gas Used" value={
                                  <div className="w-48 flex flex-col items-end gap-1">
                                      <div className="text-xs font-mono">
                                          {parseInt(gasInfo.used).toLocaleString()} / {parseInt(gasInfo.wanted).toLocaleString()}
                                      </div>
                                      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                                          <div className={`h-full ${gasInfo.percent > 90 ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${gasInfo.percent}%` }} />
                                      </div>
                                  </div>
                               }/>
                          )}
                      </div>
                  </Card>

                  {/* 3. Raw Data (JSON View) */}
                  <Card className="overflow-hidden border-border">
                      <div className="px-6 py-4 bg-muted/30 border-b border-border flex justify-between items-center">
                          <div className="flex items-center gap-2">
                              <Code className="text-primary"/> <span className="font-semibold text-sm">Raw Data</span>
                          </div>
                      </div>
                      <div className="p-0 text-xs bg-[#1e1e1e]"> 
                         <div className="max-h-[400px] overflow-y-auto p-4 custom-scrollbar">
                            <JsonView 
                                src={tx.rawTxParsed} 
                                theme="chalk" 
                                collapsed={2}
                                displayDataTypes={false}
                                enableClipboard={true}
                                style={{ backgroundColor: 'transparent' }}
                            />
                         </div>
                      </div>
                  </Card>
              </div>

              {/* KOLOM KANAN (1/3) - STICKY */}
              <div className="space-y-6">
                  {/* Price Analysis Card */}
                  {tx.priceAnalysis ? (
                      <Card className="overflow-hidden sticky top-6 shadow-lg border-primary/20">
                          <div className="p-4 bg-gradient-to-br from-secondary/50 to-background border-b border-border flex justify-between items-center">
                              <h2 className="font-semibold text-sm flex items-center gap-2">
                                  <ChartLineUp weight="bold" className="text-emerald-500" /> PnL Analysis
                              </h2>
                              <Badge variant="outline" className="font-mono text-[10px]">{tx.priceAnalysis.tokenSymbol}</Badge>
                          </div>

                          <div className="p-6 space-y-6">
                              {/* Main PnL Box */}
                              <div className={cn(
                                  "text-center p-6 rounded-xl border-2 bg-card/50",
                                  tx.priceAnalysis.isProfit 
                                    ? "border-emerald-500/20 shadow-[0_0_15px_-3px_rgba(16,185,129,0.1)]" 
                                    : "border-red-500/20 shadow-[0_0_15px_-3px_rgba(239,68,68,0.1)]"
                              )}>
                                  <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Unrealized PnL</div>
                                  <div className={cn(
                                      "text-3xl font-bold tracking-tight mb-1",
                                      tx.priceAnalysis.isProfit ? "text-emerald-500" : "text-red-500"
                                  )}>
                                      {tx.priceAnalysis.isProfit ? '+' : ''}{formatUsd(tx.priceAnalysis.pnlUsd)}
                                  </div>
                                  <Badge className={cn(
                                      "font-mono", 
                                      tx.priceAnalysis.isProfit ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"
                                  )}>
                                      {tx.priceAnalysis.isProfit ? '▲' : '▼'} {tx.priceAnalysis.pnlPercent}
                                  </Badge>
                              </div>

                              <Separator />

                              {/* Comparison Table */}
                              <div className="space-y-4">
                                  <div className="flex justify-between items-center text-sm">
                                      <div className="flex flex-col">
                                          <span className="text-muted-foreground text-xs font-semibold">Then (Tx Time)</span>
                                          <span className="text-[10px] text-muted-foreground opacity-90 font-mono">
                                              @ {formatUsd(tx.priceAnalysis.priceAtTimestamp)}
                                          </span>
                                      </div>
                                      <div className="font-mono font-medium opacity-80">
                                          {formatUsd(tx.priceAnalysis.valueAtTimestamp)}
                                      </div>
                                  </div>

                                  <div className="flex justify-between items-center text-sm">
                                      <div className="flex flex-col">
                                          <span className="text-foreground text-xs font-semibold">Now (Current)</span>
                                          <span className="text-[10px] text-muted-foreground opacity-90 font-mono">
                                              @ {formatUsd(tx.priceAnalysis.priceCurrent)}
                                          </span>
                                      </div>
                                      <div className="font-mono font-bold text-base">
                                          {formatUsd(tx.priceAnalysis.valueCurrent)}
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </Card>
                  ) : (
                      <Card className="p-6 text-center border-dashed text-muted-foreground sticky top-6">
                          <ChartLineUp size={32} className="mx-auto mb-2 opacity-20"/>
                          <p className="text-xs">Price analysis unavailable.</p>
                      </Card>
                  )}
              </div>
          </div>
      )}
    </div>
  );
}