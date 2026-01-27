import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { 
  Clock, ArrowLeft, ArrowsClockwise, 
  CheckCircle, ArrowSquareOut
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// --- Types ---
interface Proposal {
  proposalId: string;
  chainName: string;
  title: string;
  description: string;
  type: string; // 'active', 'passed', etc
  walletLabel: string;
  votingEndTime: string;
  myVote: string; // 'YES', 'NO', 'NO_WITH_VETO', 'ABSTAIN', 'NOT_VOTED'
}

export default function Governance() {
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // State untuk Modal Detail
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    fetchProposals();
    
    // Auto refresh countdown setiap menit agar "Time Left" update
    const interval = setInterval(() => {
       setProposals(prev => [...prev]); // Trigger re-render
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const fetchProposals = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/governance/all`);
      if (res.data.success && res.data.data) {
        const rawProposals = res.data.data.proposals || [];
        
        // Mapping Data sesuai struktur React
        const mapped = rawProposals
            .map((p: any) => ({
                proposalId: p.id,
                chainName: p.chain.name,
                title: p.title,
                description: p.description,
                type: p.type,
                walletLabel: p.wallet.label,
                votingEndTime: p.voting.endTime,
                myVote: p.voting.myVote
            }))
            .filter((p: Proposal) => p.type === 'active'); // Hanya ambil yang aktif

        setProposals(mapped);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error("Failed to fetch proposals", e);
    } finally {
      setLoading(false);
    }
  };

  // --- Helper Functions ---
  const getTimeLeft = (dateStr: string) => {
    const end = new Date(dateStr).getTime();
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  };

  const getTimeColor = (dateStr: string) => {
    const end = new Date(dateStr).getTime();
    const now = Date.now();
    const hoursLeft = (end - now) / (1000 * 60 * 60);

    if (hoursLeft < 24) return 'text-red-400 animate-pulse'; // < 24 Jam (Urgent)
    if (hoursLeft < 48) return 'text-orange-400'; // < 2 Hari
    return 'text-emerald-400';
  };

  const getVoteBadgeStyle = (vote: string) => {
    switch(vote) {
        case 'YES': return "bg-green-500/10 text-green-400 border-green-500/20";
        case 'NO': return "bg-red-500/10 text-red-400 border-red-500/20";
        case 'NO_WITH_VETO': return "bg-red-500/10 text-red-400 border-red-500/20";
        case 'ABSTAIN': return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
        case 'NOT_VOTED': return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse";
        default: return "bg-secondary text-muted-foreground";
    }
  };

  const openDetail = (p: Proposal) => {
      setSelectedProposal(p);
      setDetailOpen(true);
  };

  const getExplorerLink = (p: Proposal) => {
      const slug = p.chainName.toLowerCase().replace(/\s+/g, '-');
      return `https://www.mintscan.io/${slug}/proposals/${p.proposalId}`;
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
        <div>
           <div className="flex items-center gap-2 mb-2">
               <Button variant="ghost" size="sm" asChild className="-ml-2 h-8 text-muted-foreground">
                   <Link to="/"><ArrowLeft className="mr-2"/> Dashboard</Link>
               </Button>
           </div>
           <h1 className="text-3xl font-bold tracking-tight">Active Proposals</h1>
           <p className="text-muted-foreground mt-1 max-w-2xl">
               Live tracking of active voting periods across your chains. 
               <span className="text-yellow-500 font-medium ml-1">Priority items are highlighted.</span>
           </p>
        </div>

        <div className="flex items-center gap-3">
            {lastUpdated && (
                <div className="text-right hidden md:block mr-2">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Last Updated</div>
                    <div className="text-xs font-mono">{lastUpdated.toLocaleTimeString()}</div>
                </div>
            )}
            <Button onClick={fetchProposals} disabled={loading} className="gap-2">
                <ArrowsClockwise className={cn(loading && "animate-spin")} />
                {loading ? 'Syncing...' : 'Refresh'}
            </Button>
        </div>
      </div>

      {/* Content Area */}
      {loading && proposals.length === 0 ? (
          /* Loading State */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {[1,2,3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
      ) : proposals.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl bg-card/30">
              <CheckCircle weight="duotone" className="w-16 h-16 text-emerald-500/50 mb-4" />
              <h3 className="text-xl font-bold">All Caught Up!</h3>
              <p className="text-muted-foreground mt-2 text-center max-w-md">
                 No active voting periods found on your monitored chains right now.
              </p>
              <Button variant="outline" onClick={fetchProposals} className="mt-6">Check Again</Button>
          </div>
      ) : (
          /* Proposals Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {proposals.map((p) => (
                <Card 
                    key={p.proposalId + p.chainName}
                    className="group relative overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 cursor-pointer flex flex-col"
                    onClick={() => openDetail(p)}
                >
                    {/* Status Bar Indicator (Left) */}
                    <div className={cn(
                        "absolute top-0 left-0 w-1 h-full transition-colors",
                        p.myVote === 'NOT_VOTED' ? "bg-yellow-500" : "bg-emerald-500"
                    )} />

                    <CardHeader className="pb-3 pl-7">
                        <div className="flex justify-between items-start">
                             <div className="space-y-1">
                                 <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                     {p.chainName}
                                 </div>
                                 <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-5">
                                     #{p.proposalId}
                                 </Badge>
                             </div>
                             
                             {/* Vote Status Badge */}
                             <Badge variant="outline" className={cn("text-[10px] font-bold px-2 py-0.5", getVoteBadgeStyle(p.myVote))}>
                                 {p.myVote === 'NOT_VOTED' ? 'NEED VOTE' : p.myVote}
                             </Badge>
                        </div>
                    </CardHeader>

                    <CardContent className="pl-7 pb-3 flex-1">
                        <h3 className="font-bold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors mb-2">
                            {p.title}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                            {p.description?.replace(/[#*`_]/g, '') || "No description available"}
                        </p>
                    </CardContent>

                    <CardFooter className="pl-7 pt-0 mt-auto border-t border-border/50 bg-secondary/20 py-3 flex justify-between items-center">
                         <div className={cn("flex items-center gap-1.5 text-xs font-mono font-medium", getTimeColor(p.votingEndTime))}>
                             <Clock weight="bold" />
                             {getTimeLeft(p.votingEndTime)}
                         </div>
                         <span className="text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                             Details <ArrowSquareOut weight="bold"/>
                         </span>
                    </CardFooter>
                </Card>
             ))}
          </div>
      )}

      {/* Detail Modal (Dialog) */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
             
             {/* Modal Header */}
             <DialogHeader className="p-6 border-b border-border bg-secondary/20">
                 <div className="flex items-center gap-3 mb-2">
                     <Badge className="bg-primary hover:bg-primary">{selectedProposal?.chainName}</Badge>
                     <span className="font-mono text-sm text-muted-foreground">#{selectedProposal?.proposalId}</span>
                 </div>
                 <DialogTitle className="text-xl leading-snug">
                     {selectedProposal?.title}
                 </DialogTitle>
             </DialogHeader>

             {/* Modal Body (Scrollable) */}
             <ScrollArea className="flex-1 p-6">
                 {/* Metadata Grid */}
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-secondary/30 rounded-lg border border-border/50">
                     <div>
                         <span className="text-[10px] uppercase text-muted-foreground font-bold block mb-1">My Vote</span>
                         <span className={cn("text-sm font-bold", selectedProposal?.myVote === 'NOT_VOTED' ? "text-yellow-500" : "text-emerald-500")}>
                             {selectedProposal?.myVote}
                         </span>
                     </div>
                     <div>
                         <span className="text-[10px] uppercase text-muted-foreground font-bold block mb-1">End Time</span>
                         <span className="text-sm font-mono">
                             {selectedProposal && new Date(selectedProposal.votingEndTime).toLocaleDateString()}
                         </span>
                     </div>
                     <div>
                         <span className="text-[10px] uppercase text-muted-foreground font-bold block mb-1">Wallet</span>
                         <span className="text-sm truncate block" title={selectedProposal?.walletLabel}>
                             {selectedProposal?.walletLabel}
                         </span>
                     </div>
                     <div>
                         <span className="text-[10px] uppercase text-muted-foreground font-bold block mb-1">Status</span>
                         <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Active</Badge>
                     </div>
                 </div>

                 {/* Description */}
                 <div className="prose prose-invert prose-sm max-w-none text-muted-foreground">
                     <p className="whitespace-pre-wrap font-sans leading-relaxed">
                         {selectedProposal?.description}
                     </p>
                 </div>
             </ScrollArea>

             {/* Modal Footer */}
             <DialogFooter className="p-4 border-t border-border bg-secondary/10 gap-2">
                 <Button variant="ghost" onClick={() => setDetailOpen(false)}>Close</Button>
                 {selectedProposal && (
                     <Button asChild className="gap-2">
                         <a href={getExplorerLink(selectedProposal)} target="_blank" rel="noopener noreferrer">
                             View on Mintscan <ArrowSquareOut />
                         </a>
                     </Button>
                 )}
             </DialogFooter>

          </DialogContent>
      </Dialog>
    </div>
  );
}