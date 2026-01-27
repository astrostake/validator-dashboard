import { Link, useLocation } from "react-router-dom";
import { 
  ShieldCheck, 
  Gavel, 
  Sun, 
  Moon, 
  SquaresFour, // Icon untuk Overview
  Wallet,      // Icon untuk Wallets
  Globe,       // Icon untuk Explorer
  Graph,       // Icon untuk Nodes
  Gear         // Icon untuk Settings (BARU)
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function Navbar() {
  const location = useLocation();
  const { setTheme, theme } = useTheme();

  // Helper function untuk menentukan style link (Aktif vs Tidak Aktif)
  const getLinkClass = (path: string) => {
    const isActive = location.pathname === path;
    return cn(
      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
      isActive 
        ? "bg-primary/10 text-primary border border-primary/20" 
        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
    );
  };

  return (
    <nav className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        
        {/* === KIRI: LOGO & MENU UTAMA === */}
        <div className="flex items-center gap-6">
          {/* Logo Brand */}
          <Link to="/" className="flex items-center gap-2 font-bold text-lg hover:opacity-80 transition">
            <ShieldCheck weight="fill" className="text-primary text-2xl" />
            <span className="hidden sm:inline">Validator Dashboard</span>
          </Link>

          {/* Menu Links (Desktop) */}
          <div className="hidden md:flex items-center gap-1">
            <Link to="/" className={getLinkClass("/")}>
              <SquaresFour weight={location.pathname === "/" ? "fill" : "bold"} />
              Overview
            </Link>
            
            <Link to="/wallets" className={getLinkClass("/wallets")}>
              <Wallet weight={location.pathname === "/wallets" ? "fill" : "bold"} />
              Wallets
            </Link>
            
            <Link to="/explorer" className={getLinkClass("/explorer")}>
              <Globe weight={location.pathname === "/explorer" ? "fill" : "bold"} />
              Explorer
            </Link>
            
            <Link to="/nodes" className={getLinkClass("/nodes")}>
              <Graph weight={location.pathname === "/nodes" ? "fill" : "bold"} />
              Nodes
            </Link>

            <Link to="/governance" className={getLinkClass("/governance")}>
              <Gavel weight={location.pathname === "/governance" ? "fill" : "bold"} />
              Governance
            </Link>
            
          </div>
        </div>

        {/* === KANAN: ACTIONS & THEME TOGGLE === */}
        <div className="flex items-center gap-3">

           {/* Tombol Settings */}
           <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:text-foreground hover:bg-secondary">
              <Link to="/settings" title="Settings">
                 <Gear className={cn("h-5 w-5", location.pathname === "/settings" ? "text-primary fill-current" : "")} weight={location.pathname === "/settings" ? "fill" : "bold"} />
                 <span className="sr-only">Settings</span>
              </Link>
           </Button>

           {/* Tombol Dark Mode Toggle */}
           <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary"
            title="Toggle Theme"
          >
            {/* Animasi Icon Matahari/Bulan */}
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-orange-500" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-blue-400" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>

      </div>
    </nav>
  );
}