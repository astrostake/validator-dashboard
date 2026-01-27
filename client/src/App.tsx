import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Toaster } from "@/components/ui/toaster";

// Import Halaman
import Dashboard from "@/pages/Dashboard";
import WalletList from "@/pages/WalletList";
import TxExplorer from "@/pages/TxExplorer";
import Governance from "@/pages/Governance";
import Nodes from "./pages/Nodes";
import Settings from "./pages/Settings";


function App() {
  return (
    <BrowserRouter>
      {/* Navbar ditaruh di luar Routes agar selalu muncul */}
      <div className="min-h-screen bg-background font-sans antialiased">
        <Navbar />
        
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/wallets" element={<WalletList />} />
            <Route path="/explorer/:hash?" element={<TxExplorer />} />
            <Route path="/governance" element={<Governance />} />
            <Route path="/nodes" element={<Nodes />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <Footer />
        <Toaster />
      </div>
    </BrowserRouter>
  );
}

export default App;