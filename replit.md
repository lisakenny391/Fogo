# Overview

This is a cryptocurrency faucet application for distributing FOGO tokens on the Solana/Fogo testnet blockchain. The application provides free testnet tokens to developers with distribution amounts calculated based on wallet transaction history. It features a modern React frontend with shadcn/ui components, an Express.js backend with Drizzle ORM for database management, and comprehensive analytics and rate limiting capabilities.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety
- **Build Tool**: Vite for fast development and optimized production builds
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system targeting crypto/Web3 aesthetics
- **State Management**: TanStack Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Theme System**: Dark mode default with light mode support, designed for crypto applications

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Authentication**: Session-based authentication with express-session
- **API Design**: RESTful endpoints with comprehensive error handling
- **Rate Limiting**: Custom rate limiting implementation with database persistence

## Database Schema Design
- **Users**: Basic authentication table for admin functionality
- **Claims**: Comprehensive tracking of token distribution requests with status management
- **Rate Limits**: Per-wallet cooldown and frequency tracking
- **Faucet Config**: Global faucet settings and balance management
- **Wallet Eligibility**: Transaction count and eligibility caching for performance

## Blockchain Integration
- **Web3 Library**: Solana Web3.js for blockchain interactions
- **Network**: Fogo testnet (Solana-based) with fallback RPC endpoints
- **Wallet Support**: Solana address validation and transaction handling
- **Transaction Management**: Automatic transaction confirmation and status tracking

## Security & Rate Limiting
- **IP-based Tracking**: Request origin monitoring for abuse prevention
- **Wallet Cooldowns**: Time-based restrictions per wallet address
- **Transaction Verification**: Real-time balance and transaction count validation
- **Error Handling**: Comprehensive error responses without exposing internal details

## Analytics & Monitoring
- **Real-time Stats**: Live faucet metrics and distribution analytics
- **Activity Tracking**: Recent claims history with transaction status
- **Leaderboard System**: Gamified ranking of most active wallets
- **Chart Analytics**: Time-series data visualization for usage patterns

# External Dependencies

## Database
- **Neon Database**: Serverless PostgreSQL with connection pooling
- **Environment**: Requires DATABASE_URL for connection string

## Blockchain Services
- **Fogo RPC**: Primary endpoint at https://rpc.fogo.io
- **Solana Web3.js**: For transaction creation and blockchain queries
- **Private Key Management**: Base58-encoded Solana keypair for transaction signing

## UI Component Libraries
- **Radix UI**: Headless component primitives for accessibility
- **Lucide React**: Icon library for consistent visual elements
- **Recharts**: Chart visualization for analytics dashboard

## Development Tools
- **Replit Integration**: Development environment with live reload
- **Vite Plugins**: Runtime error overlay and development tooling
- **TypeScript**: Full type coverage across frontend and backend

## Session Management
- **connect-pg-simple**: PostgreSQL-backed session storage
- **Express Session**: Secure session handling with database persistence

## Additional Services
- **Google Fonts**: Inter and JetBrains Mono for typography
- **Base58 Encoding**: For Solana address and key handling
- **Date-fns**: Date manipulation and formatting utilities