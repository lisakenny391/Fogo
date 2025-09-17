# Design Guidelines for Cryptocurrency Faucet Application

## Design Approach
**Reference-Based Approach**: Taking inspiration from modern crypto platforms like Ethereum Foundation, Uniswap, and Web3 applications that balance technical functionality with approachable design.

## Core Design Principles
- **Trust & Transparency**: Clean, professional interface that builds user confidence
- **Technical Clarity**: Clear communication of blockchain operations and token distribution
- **Real-time Feedback**: Immediate status updates and transaction confirmations
- **Accessibility**: Support for both crypto newcomers and experienced users

## Color Palette

### Primary Colors
**Dark Mode** (Default):
- Background: 220 13% 9% (Deep navy-blue background)
- Surface: 220 13% 12% (Elevated surfaces)
- Primary: 142 76% 36% (Green for success/tokens - crypto-friendly)
- Text Primary: 210 20% 98% (Near white)
- Text Secondary: 215 20% 65% (Muted gray)

**Light Mode**:
- Background: 0 0% 100% (Pure white)
- Surface: 220 14% 96% (Light gray surfaces)
- Primary: 142 76% 36% (Same green for consistency)
- Text Primary: 222 84% 5% (Near black)
- Text Secondary: 215 13% 35% (Dark gray)

### Accent Colors
- **Success**: 142 76% 36% (Token green)
- **Warning**: 38 92% 50% (Amber for rate limits/warnings)
- **Error**: 0 84% 60% (Red for failures)
- **Info**: 217 91% 60% (Blue for informational states)

### Gradients
Subtle gradients for hero sections and key CTAs:
- **Primary Gradient**: 142 76% 36% to 160 84% 39% (Green spectrum)
- **Background Accent**: Very subtle 220 13% 9% to 220 13% 12% overlay

## Typography
**Primary Font**: Inter (Google Fonts) - Clean, technical readability
**Secondary Font**: JetBrains Mono (Google Fonts) - For addresses, hashes, and technical data

### Font Scale
- **Headings**: 2xl-4xl weights 600-700
- **Body**: Base-lg weight 400
- **Technical Data**: SM-base weight 400 (monospace)
- **Labels**: SM weight 500

## Layout System
**Tailwind Spacing Units**: 2, 4, 6, 8, 12, 16
- **Micro spacing**: 2, 4 (buttons, form elements)
- **Component spacing**: 6, 8 (cards, sections)
- **Layout spacing**: 12, 16 (major sections, page margins)

## Component Library

### Core Components
- **Wallet Connection**: Prominent button with connection status
- **Claim Interface**: Central card with eligibility check and claim button
- **Statistics Dashboard**: Grid layout with key metrics (balance, claims, users)
- **Recent Activity Feed**: Scrollable list with transaction details
- **Leaderboard Table**: Ranked user display with addresses and claim counts

### Navigation
- **Top Navigation**: Logo, wallet connection, theme toggle
- **Sidebar** (Desktop): Quick access to stats, leaderboard, recent activity
- **Mobile Navigation**: Collapsible hamburger menu

### Forms & Inputs
- **Address Input**: Large input field with validation feedback
- **Claim Button**: Primary green button with loading states
- **Form Validation**: Inline error messages with red accent color

### Data Displays
- **Metric Cards**: Clean cards showing key statistics with icons
- **Charts**: Line/bar charts using muted colors with green accents
- **Transaction Hashes**: Monospace font with copy functionality
- **Wallet Addresses**: Truncated display with expand/copy options

### Overlays
- **Modal Dialogs**: Transaction confirmations, error messages
- **Toast Notifications**: Success/error feedback for user actions
- **Loading States**: Skeleton loaders and spinners

## Images
No large hero image required. Focus on:
- **Crypto Icons**: Small token icons and wallet provider logos
- **Status Indicators**: Simple SVG icons for success/error states
- **Chart Graphics**: Generated data visualizations (no static images)

## Animations
Minimal, purposeful animations:
- **Button States**: Subtle hover/active feedback
- **Loading Indicators**: Smooth spinners for blockchain operations
- **State Transitions**: Gentle fades between success/error states
- **Chart Updates**: Smooth data transitions (built into Recharts)

## Accessibility
- **Dark Mode Priority**: Default to dark mode for crypto user preference
- **High Contrast**: Ensure text meets WCAG AA standards
- **Keyboard Navigation**: Full keyboard accessibility for all functions
- **Screen Reader Support**: Proper ARIA labels for complex blockchain data
- **Focus Indicators**: Clear focus rings for interactive elements

## Technical Considerations
- **Responsive Breakpoints**: Mobile-first design with tablet/desktop enhancements
- **Performance**: Minimal animation budget for fast loading
- **Web3 UX**: Clear transaction states and blockchain feedback
- **Error Handling**: Comprehensive error states for blockchain failures