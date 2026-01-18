# NaviMuse Visual Style Guide

> [!NOTE]
> This guide serves as the single source of truth for the NaviMuse visual language, ensuring consistency across all UI components and pages.

## 1. Design Philosophy
**Theme Name:** Neo-Glass Tech Dark
**Core Characteristics:**
- Deep blue/black backgrounds
- Glassmorphism effects (blur + transparency)
- Vivid blue/indigo accents (`hsl(244, 87%, 67%)`)
- Subtle glows and pulse animations
- Clean, modern typography (Inter)

## 2. Design Tokens
### Colors (HSL)
The application uses CSS variables for theming.
| Token | Variable | Value (Dark) | Usage |
| :--- | :--- | :--- | :--- |
| **Background** | `--background` | `hsl(224, 71%, 4%)` | Main page background |
| **Foreground** | `--foreground` | `hsl(210, 40%, 98%)` | Primary text color |
| **Card** | `--card` | `hsl(224, 71%, 4%)` | Card backgrounds (often with glass effect) |
| **Primary** | `--primary` | `hsl(244, 87%, 67%)` | Main actions, active states |
| **Secondary** | `--secondary` | `hsl(199, 89%, 48%)` | Secondary actions, badges |
| **Muted** | `--muted` | `hsl(215, 27.9%, 16.9%)` | Backgrounds for subdued elements |
| **Destructive** | `--destructive` | `hsl(0, 62.8%, 30.6%)` | Errors, dangerous actions |
| **Border** | `--border` | `hsl(215, 27.9%, 16.9%)` | Borders, dividers |

### Typography
**Font Family:** `Inter`, systematic-ui, sans-serif
| Class | Size | Line Height | Weight |
| :--- | :--- | :--- | :--- |
| `.text-xs` | 0.75rem | 1rem | - |
| `.text-sm` | 0.875rem | 1.25rem | - |
| `.text-base` | 1rem | 1.5rem | - |
| `.text-lg` | 1.125rem | 1.75rem | - |
| `.text-xl` | 1.25rem | 1.75rem | - |
| `.text-2xl` | 1.5rem | 2rem | - |
| `.font-semibold`| - | - | 600 |
| `.font-bold` | - | - | 700 |

### Spacing & Radius
| Size | Token | Value |
| :--- | :--- | :--- |
| **Radius SM** | `--radius-sm` | 0.375rem |
| **Radius MD** | `--radius-md` | 0.5rem |
| **Radius LG** | `--radius-lg` | 0.75rem |
| **Radius XL** | `--radius-xl` | 1rem |
| **Radius 2XL** | `--radius-2xl` | 1.5rem |
| **Radius Full**| `--radius-full`| 9999px |

## 3. UI Components

### Buttons
**Component Path:** `src/components/ui/button.tsx`
**CSS:** `.btn` (base class)

| Variant | Class | Visual |
| :--- | :--- | :--- |
| **Default** | `.btn .btn-default` | Primary color bg, white text |
| **Secondary** | `.btn .btn-secondary`| Secondary color bg |
| **Outline** | `.btn .btn-outline` | Bordered, transparent bg |
| **Ghost** | `.btn .btn-ghost` | Transparent, hover effect only |
| **Destructive**| `.btn .btn-destructive`| Red bg |

**Sizes:**
- `.btn-size-sm`: Compact actions
- `.btn-size-default`: Standard interactions
- `.btn-size-lg`: Featured actions
- `.btn-size-icon`: Icon-only buttons (2.5rem square)

### Glassmorphism Patterns
Use these utility classes to apply the signature "NaviMuse" look.

#### Glass Panel
Class: `.glass-panel`
- **Background:** `rgba(255, 255, 255, 0.05)`
- **Blur:** `24px`
- **Border:** `1px solid rgba(255, 255, 255, 0.1)`
- **Shadow:** `var(--shadow-2xl)`
- **Usage:** Cards, sidebars, modal backgrounds.

#### Glass Button
Class: `.glass-button`
- **Background:** `rgba(255, 255, 255, 0.05)`
- **Blur:** `12px`
- **Border:** `1px solid rgba(255, 255, 255, 0.1)`
- **Hover:** Brighter background (`0.15`), `shadow-glow`
- **Usage:** Floating actions, toolbar buttons.

### Dialogs (Modals)
- **Overlay:** `.dialog-overlay` (Backdrop blur)
- **Content:** `.dialog-content` (Centered, fixed, glass effect potentially)
- **Structure:**
  ```jsx
  <Dialog>
    <DialogTrigger>Open</DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Title</DialogTitle>
      </DialogHeader>
      {/* Body */}
    </DialogContent>
  </Dialog>
  ```

## 4. Effects & Animations

### Shadows
- `--shadow-glow`: `0 0 15px rgba(99, 102, 241, 0.3)` (Primary color glow)
- `.shadow-2xl`: Deep shadow for floating layers.

### Animations
| Name | Class | Effect |
| :--- | :--- | :--- |
| **Fade In** | `.animate-fade-in` | Opacity 0 -> 1 |
| **Slide Up** | `.animate-slide-up` | TranslateY 10px -> 0 |
| **Pulse Glow** | `.animate-pulse-glow` | Infinite breathing glow |
| **Spin** | `.animate-spin` | Loading spinners |

## 5. Layout Best Practices
1.  **Page Structure:** Use `flex flex-col h-screen` for main layouts.
2.  **Containers:** Use `max-w-*` classes (`max-w-7xl`, `mx-auto`) to constrain content width.
3.  **Spacing:** Stick to the 4px grid (`p-4`, `gap-4`). Avoid arbitrary pixel values.
4.  **Z-Index:**
    - `z-10`: Elevated patterns
    - `z-50`: Modals and sticky Navs

## 6. Technology Stack
> [!IMPORTANT]
> Adhere to these libraries to maintain consistency and performance.

### Core UI Framework
- **Tailwind CSS (`^3.4`)**: Utility-first CSS framework. Used for 95% of styling.
- **Radix UI (`@radix-ui/*`)**: Headless UI primitives for complex accessible components (Dialog, Slider, Slot).
- **Lucide React (`lucide-react`)**: Standard icon set. Use for all UI icons.

### Animation
- **Framer Motion (`framer-motion`)**:
  - Used for complex entrance animations, layout transitions (`AnimatePresence`), and interactive gestures.
  - Standard transition: `easeOut` with `duration: 0.3` or spring physics.
- **CSS Animations**:
  - Used for simple, continuous effects like spinners (`.animate-spin`) or subtle glows (`.animate-pulse-glow`).
  - Defined in `tailwind.config.js` and `index.css`.

### Usage Guidelines
1.  **Components**: Prioritize using `src/components/ui` components (Button, Dialog) over raw HTML elements.
2.  **Icons**: Always import from `lucide-react`. Do not use SVGs directly unless custom branding is required.
3.  **Animation**: Use `Framer Motion` for state changes (mounting/unmounting) and `CSS` for decorative/loading states.
