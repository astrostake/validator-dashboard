# Cosmos Validator Monitor - Client

A modern, responsive React dashboard for monitoring Cosmos-based blockchain validators, wallets, and governance proposals. Built with TypeScript, Vite, and Tailwind CSS.

## Features

### Dashboard Overview
- **Portfolio Summary**: Real-time net worth, staking positions, rewards, and commission tracking
- **Visual Analytics**: Interactive doughnut charts for AUM distribution and personal stake allocation
- **Chain Distribution**: Portfolio breakdown by blockchain network
- **Urgent Governance**: Quick access to proposals ending within 48 hours

### Wallet Management
- **Multi-Wallet Support**: Track multiple wallets across different Cosmos chains
- **Real-Time Statistics**: Live balance updates with USD valuation
- **Chain Filtering**: Filter view by specific blockchain networks
- **Transaction History**: Comprehensive activity log with smart categorization
- **Notification Configuration**: Discord webhook integration for transaction alerts

### Block Explorer
- **Transaction Search**: Look up any transaction by hash
- **Detailed Analysis**: View complete transaction metadata and raw data
- **Price Analysis**: Historical price comparison with profit/loss calculation
- **Visual Indicators**: Status badges, amount formatting, and direction arrows

### Validator Monitoring
- **Uptime Tracking**: Real-time missed blocks monitoring with visual progress bars
- **Jail Detection**: Instant alerts when validators are jailed or recovered
- **Health Dashboard**: Overview of all validator nodes with status indicators
- **Smart Alerts**: Configurable thresholds with cooldown periods
- **Consensus Management**: Automatic consensus address fetching

### Governance Tracking
- **Active Proposals**: Live tracking of all ongoing voting periods
- **Vote Status**: Monitor your voting participation across chains
- **Time Indicators**: Visual countdown with urgency highlighting
- **Proposal Details**: Full description, metadata, and external links
- **Priority Sorting**: Urgent proposals highlighted and sorted by deadline

### System Tools
- **Local Reparse**: Re-process transaction data without blockchain calls
- **Hard Resync**: Complete re-download from RPC for data recovery
- **Price Backfill**: Update historical USD values for accurate P&L
- **Activity Logs**: Real-time operation monitoring with status updates
- **Bulk Operations**: Process multiple wallets simultaneously

## Technology Stack

### Core Framework
- **React 18**: Modern hooks-based architecture
- **TypeScript**: Full type safety
- **Vite**: Lightning-fast build tool and dev server

### UI Components
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: High-quality accessible components
- **Phosphor Icons**: Comprehensive icon set
- **Chart.js**: Interactive data visualization

### State Management
- **React Hooks**: useState, useEffect, useMemo
- **Axios**: HTTP client with interceptors
- **React Router**: Client-side routing

## Getting Started

### Prerequisites
- Node.js 16 or higher
- npm or yarn package manager
- Backend API running (see server README)

### Installation

1. Navigate to the client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` file:
```env
VITE_API_URL=http://localhost:3001/api
```

4. Start development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The optimized build will be in the `dist/` directory.

Preview production build:
```bash
npm run preview
```

## Project Structure

```
client/
├── src/
│   ├── components/
│   │   ├── dashboard/
│   │   │   └── StatsCard.tsx      # Reusable stat cards
│   │   ├── wallet/
│   │   │   └── WalletTransactions.tsx  # Transaction list component
│   │   ├── ui/                     # shadcn/ui components
│   │   ├── theme-provider.tsx      # Dark/light mode
│   │   ├── Navbar.tsx              # Navigation bar
│   │   └── Footer.tsx              # Footer with status
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx           # Overview page
│   │   ├── WalletList.tsx          # Wallet management
│   │   ├── TxExplorer.tsx          # Block explorer
│   │   ├── Nodes.tsx               # Validator monitoring
│   │   ├── Governance.tsx          # Proposal tracking
│   │   └── Settings.tsx            # System tools
│   │
│   ├── lib/
│   │   └── utils.ts                # Utility functions
│   │
│   ├── hooks/
│   │   └── use-toast.ts            # Toast notifications
│   │
│   ├── App.tsx                     # Main application
│   ├── main.tsx                    # Entry point
│   └── index.css                   # Global styles
│
├── public/                         # Static assets
├── index.html                      # HTML template
├── vite.config.ts                  # Vite configuration
├── tailwind.config.ts              # Tailwind configuration
├── tsconfig.json                   # TypeScript configuration
└── package.json                    # Dependencies
```

## Key Features Explained

### Dashboard Overview
The dashboard provides a comprehensive view of your entire validator operation:
- **Net Worth**: Aggregated value of all wallets in USD
- **Pending Value**: Unclaimed rewards and commission
- **Total AUM**: Assets under management for validator operations
- **Node Health**: Active/jailed validator status summary

### Wallet Transaction Filtering
Intelligent filtering system with multiple levels:
- **Main Categories**: All, Wallet, Validator
- **Wallet Subcategories**: General (transfers), Staking (delegate/undelegate)
- **Validator Subcategories**: All, Delegate, Undelegate, Redelegate

### Amount Formatting Intelligence
Automatic denomination detection and conversion:
- **Decimal Precision**: Fetches correct decimals from API
- **Fallback Logic**: Smart guessing for chains without API data
- **Display Cleanup**: Removes 'u' and 'a' prefixes intelligently
- **Direction Indicators**: Red for outgoing, green for incoming

### Price Analysis
Historical price tracking with profit/loss calculation:
- **Transaction-Time Price**: Exact USD value when transaction occurred
- **Current Price**: Real-time token value
- **P&L Calculation**: Automatic gain/loss percentage
- **Visual Indicators**: Green for profit, red for loss

### Validator Monitoring
Comprehensive uptime tracking:
- **Missed Blocks Counter**: Visual progress bar with color coding
- **Threshold Configuration**: Customizable alert levels
- **Cooldown System**: Prevents alert spam
- **Recovery Notifications**: Optional alerts when issues resolve

### Notification System
Discord webhook integration with granular control:
- **Wallet Transactions**: Get notified on sends/receives
- **Balance Changes**: Threshold-based alerts for significant movements
- **Delegator Activity**: Track incoming delegations
- **Validator Alerts**: Missed blocks, jailing, recovery
- **Governance**: New proposals and voting results

## Configuration

### Theme Customization
The application supports dark and light modes with system preference detection. Theme configuration is in `tailwind.config.ts`:

```typescript
theme: {
  extend: {
    colors: {
      border: "hsl(var(--border))",
      background: "hsl(var(--background))",
      foreground: "hsl(var(--foreground))",
      // ... customize colors
    }
  }
}
```

### API Configuration
Set the backend API URL in `.env`:
```env
VITE_API_URL=http://localhost:3001/api
```

For production deployment, update this to your production API endpoint.

### Build Optimization
Vite automatically optimizes for production with:
- Code splitting
- Tree shaking
- Asset optimization
- Compression

## Development Guide

### Adding New Pages
1. Create component in `src/pages/`
2. Add route in `App.tsx`:
```typescript
<Route path="/new-page" element={<NewPage />} />
```
3. Add navigation link in `Navbar.tsx`

### Creating Components
Follow the existing pattern:
```typescript
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";

export function MyComponent() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    // Fetch data
  }, []);
  
  return <Card>...</Card>;
}
```

### API Integration
Use axios with proper error handling:
```typescript
try {
  const res = await axios.get(`${API_URL}/endpoint`);
  if (res.data.success) {
    setData(res.data.data);
  }
} catch (error) {
  console.error(error);
  toast({ 
    title: "Error", 
    description: "Failed to load data",
    variant: "destructive" 
  });
}
```

### Styling Guidelines
- Use Tailwind utility classes
- Follow shadcn/ui component patterns
- Maintain responsive design (mobile-first)
- Use semantic color variables

## Troubleshooting

### Build Errors

**Problem**: Module not found errors
```bash
npm install
npm run build
```

**Problem**: TypeScript errors
```bash
npx tsc --noEmit
```

### Development Issues

**Problem**: Hot reload not working
- Check Vite dev server is running
- Clear browser cache
- Restart dev server

**Problem**: API connection errors
- Verify backend is running
- Check `VITE_API_URL` in `.env`
- Inspect network tab in browser DevTools

### Production Deployment

**Problem**: White screen after deployment
- Check console for errors
- Verify base URL in `vite.config.ts`
- Ensure API URL is correctly set

**Problem**: 404 on page refresh
- Configure server to redirect all routes to `index.html`
- For nginx:
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## Performance Optimization

### Code Splitting
Routes are automatically code-split by React Router and Vite.

### Image Optimization
- Use WebP format when possible
- Implement lazy loading for images
- Compress assets before deployment

### Caching Strategy
- Browser caches are leveraged automatically
- API responses can be cached with React Query (future enhancement)

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Android)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Follow existing code style
4. Test thoroughly
5. Submit pull request

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
- Open a GitHub issue
- Check existing documentation
- Contact the development team

## Acknowledgments

Built with:
- [React](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [shadcn/ui](https://ui.shadcn.com/) - Component library
- [Chart.js](https://www.chartjs.org/) - Data visualization
- [Phosphor Icons](https://phosphoricons.com/) - Icon set