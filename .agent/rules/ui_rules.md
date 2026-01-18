---
description: NaviMuse UI/UX Design System & Coding Standards
glob: ["client/**/*.{ts,tsx,css}", "src/**/*.{ts,tsx}"]
---

# NaviMuse UI Rules

> [!IMPORTANT]
> **Strictly adhere to these rules when generating frontend code.**

## 1. Core Stack
- **Framework**: React + Vite + TypeScript
- **Styling**: Tailwind CSS (`v3.4+`)
- **Icons**: `lucide-react` (Import as named exports, e.g., `import { Menu } from 'lucide-react'`)
- **Components**: Radix UI primitives wrapped in `src/components/ui` (shadcn-like).
- **Animation**: Framer Motion (`framer-motion`) for interactions; CSS for continuous effects.

## 2. Design System Tokens (Dark Mode Default)

### Colors
Use Tailwind utility classes or CSS variables.
- **Background**: `bg-background` (`hsl(224, 71%, 4%)`)
- **Foreground**: `text-foreground` (`hsl(210, 40%, 98%)`)
- **Primary**: `bg-primary` text-primary-foreground (`hsl(244, 87%, 67%)`)
- **Card**: `bg-card` (often with `.glass-panel`)
- **Accent**: `bg-accent` (for hovers/secondary)

### Typography
- **Font**: Inter (`font-sans`)
- **Headings**: `tracking-tight font-bold text-foreground`
- **Body**: `text-base text-muted-foreground` (for descriptions)

### Shapes
- **Radius**: Use `rounded-xl` for cards, `rounded-lg` for smaller elements.
- **Grid**: 4px base (`p-4`, `gap-2`).

## 3. Mandatory Patterns

### Glassmorphism
Never use solid backgrounds for main containers or overlays. Use:
- `.glass-panel`: For cards, sidebars, modals.
  - `backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl`
- `.glass-button`: For toolbar actions.
  - `hover:bg-white/15 transition-all`

### Component Usage
- **Buttons**:
  - `import { Button } from "@/components/ui/button"`
  - `<Button variant="default">` (Primary)
  - `<Button variant="ghost" size="icon">` (Icon buttons)
- **Dialogs**:
  - `import { Dialog, DialogContent, ... } from "@/components/ui/dialog"`
  - content must be inside `<DialogContent className="glass-panel">`

### Animation Guidelines
- **Page Transitions**: Use `<AnimatePresence>` + `<motion.div>`
- **Loading**: Use CSS `.animate-spin` on `Loader2` icon.
- **Micro-interactions**: Use `hover:scale-105 active:scale-95 transition-transform duration-200`.

## 4. Anti-Patterns (DO NOT DO)
- ❌ Do not use arbitrary hex codes (e.g., `#1e1e1e`). Always use `hsl(var(--...))` or tailwind colors.
- ❌ Do not use `framer-motion` for simple hover colors. Use `transition-colors`.
- ❌ Do not create new button styles. Use `variant="..."`.
- ❌ Do not rely on browser alerts/confirms. Use custom Dialogs.
