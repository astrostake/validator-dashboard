import { useEffect, useState } from "react";
import axios from "axios";
import { 
  GithubLogo, DiscordLogo, TwitterLogo, 
  Circle, CheckCircle, WarningCircle, Lightning
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function Footer() {
  const [dbStatus, setDbStatus] = useState<'connected' | 'error' | 'loading'>('loading');
  const [version] = useState(`v${__APP_VERSION__}`); 

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        await axios.get(`${API_URL}/health`, { timeout: 5000 });
        setDbStatus('connected');
      } catch (e) {
        setDbStatus('error');
      }
    };
    
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <footer className="border-t border-border bg-card/50 backdrop-blur mt-auto">
      
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        
        <div className="flex flex-col md:flex-row items-center justify-center md:justify-start gap-2 text-sm text-muted-foreground order-2 md:order-1">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Lightning weight="fill" className="text-primary" /> Validator Monitor
          </span>
          <span className="hidden md:inline text-muted-foreground/50">•</span>
          <span className="text-xs md:text-sm">&copy; {new Date().getFullYear()} AstroStake.</span>
        </div>

        <div className="flex justify-center order-1 md:order-2">
            <div className="flex items-center gap-4 text-xs font-mono bg-secondary/50 px-3 py-1.5 rounded-full border border-border shadow-sm">
                <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Sys:</span>
                    {dbStatus === 'loading' && <Circle className="text-yellow-500 animate-pulse" weight="fill" />}
                    {dbStatus === 'connected' && <CheckCircle className="text-green-500" weight="fill" />}
                    {dbStatus === 'error' && <WarningCircle className="text-red-500" weight="fill" />}
                    
                    <span className={cn(
                        "font-medium",
                        dbStatus === 'connected' ? "text-green-400" : 
                        dbStatus === 'error' ? "text-red-400" : "text-muted-foreground"
                    )}>
                        {dbStatus === 'connected' ? 'OK' : dbStatus === 'error' ? 'Offline' : '...'}
                    </span>
                </div>
                <div className="w-px h-3 bg-border"></div>
                <div className="text-muted-foreground">
                    <span className="text-foreground">{version}</span>
                </div>
            </div>
        </div>

        <div className="flex items-center justify-center md:justify-end gap-4 order-3">
          <a href="https://github.com/astrostake/validator-dashboard" target="_blank" rel="noreferrer" 
             className="text-muted-foreground hover:text-white transition-colors p-2 hover:bg-secondary rounded-full" title="Source Code">
            <GithubLogo size={20} weight="fill" />
          </a>
          <a href="https://discord.gg/your-server" target="_blank" rel="noreferrer" 
             className="text-muted-foreground hover:text-indigo-400 transition-colors p-2 hover:bg-secondary rounded-full" title="Join Discord">
            <DiscordLogo size={20} weight="fill" />
          </a>
          <a href="https://twitter.com/astrostake" target="_blank" rel="noreferrer" 
             className="text-muted-foreground hover:text-blue-400 transition-colors p-2 hover:bg-secondary rounded-full" title="Follow Twitter">
            <TwitterLogo size={20} weight="fill" />
          </a>
        </div>

      </div>
    </footer>
  );
}