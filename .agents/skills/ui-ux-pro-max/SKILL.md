---
name: ui-ux-pro-max
description: "UI/UX design intelligence for web and mobile. Includes 50+ styles, 161 color palettes, 57 font pairings, 161 product types, 99 UX guidelines, and 25 chart types across 10 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui, and HTML/CSS). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, and check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, and mobile app. Elements: button, modal, navbar, sidebar, card, table, form, and chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, and flat design. Topics: color systems, accessibility, animation, layout, typography, font pairing, spacing, interaction states, shadow, and gradient. Integrations: shadcn/ui MCP for component search and examples."
---

# UI/UX Pro Max - Design Intelligence

Comprehensive design guide for web and mobile applications. Contains 50+ styles, 161 color palettes, 57 font pairings, 161 product types with reasoning rules, 99 UX guidelines, and 25 chart types across 10 technology stacks. Searchable database with priority-based recommendations.

## When to Apply

This Skill should be used when the task involves **UI structure, visual design decisions, interaction patterns, or user experience quality control**.

### Must Use

This Skill must be invoked in the following situations:

- Designing new pages (Landing Page, Dashboard, Admin, SaaS, Mobile App)
- Creating or refactoring UI components (buttons, modals, forms, tables, charts, etc.)
- Choosing color schemes, typography systems, spacing standards, or layout systems
- Reviewing UI code for user experience, accessibility, or visual consistency
- Implementing navigation structures, animations, or responsive behavior
- Making product-level design decisions (style, information hierarchy, brand expression)
- Improving perceived quality, clarity, or usability of interfaces

### Recommended

This Skill is recommended in the following situations:

- UI looks "not professional enough" but the reason is unclear
- Receiving feedback on usability or experience
- Pre-launch UI quality optimization
- Aligning cross-platform design (Web / iOS / Android)
- Building design systems or reusable component libraries

### Skip

This Skill is not needed in the following situations:

- Pure backend logic development
- Only involving API or database design
- Performance optimization unrelated to the interface
- Infrastructure or DevOps work
- Non-visual scripts or automation tasks

**Decision criteria**: If the task will change how a feature **looks, feels, moves, or is interacted with**, this Skill should be used.

## Rule Categories by Priority

*For human/AI reference: follow priority 1→10 to decide which rule category to focus on first; use `--domain <Domain>` to query details when needed. Scripts do not read this table.*

| Priority | Category | Impact | Domain | Key Checks (Must Have) | Anti-Patterns (Avoid) |
|----------|----------|--------|--------|------------------------|------------------------|
| 1 | Accessibility | CRITICAL | `ux` | Contrast 4.5:1, Alt text, Keyboard nav, Aria-labels | Removing focus rings, Icon-only buttons without labels |
| 2 | Touch & Interaction | CRITICAL | `ux` | Min size 44×44px, 8px+ spacing, Loading feedback | Reliance on hover only, Instant state changes (0ms) |
| 3 | Performance | HIGH | `ux` | WebP/AVIF, Lazy loading, Reserve space (CLS < 0.1) | Layout thrashing, Cumulative Layout Shift |
| 4 | Style Selection | HIGH | `style`, `product` | Match product type, Consistency, SVG icons (no emoji) | Mixing flat & skeuomorphic randomly, Emoji as icons |
| 5 | Layout & Responsive | HIGH | `ux` | Mobile-first breakpoints, Viewport meta, No horizontal scroll | Horizontal scroll, Fixed px container widths, Disable zoom |
| 6 | Typography & Color | MEDIUM | `typography`, `color` | Base 16px, Line-height 1.5, Semantic color tokens | Text < 12px body, Gray-on-gray, Raw hex in components |
| 7 | Animation | MEDIUM | `ux` | Duration 150–300ms, Motion conveys meaning, Spatial continuity | Decorative-only animation, Animating width/height, No reduced-motion |
| 8 | Forms & Feedback | MEDIUM | `ux` | Visible labels, Error near field, Helper text, Progressive disclosure | Placeholder-only label, Errors only at top, Overwhelm upfront |
| 9 | Navigation Patterns | HIGH | `ux` | Predictable back, Bottom nav ≤5, Deep linking | Overloaded nav, Broken back behavior, No deep links |
| 10 | Charts & Data | LOW | `chart` | Legends, Tooltips, Accessible colors | Relying on color alone to convey meaning |

## How to Use

Search specific domains using the CLI tool below. The full Quick Reference rule set, workflow, and pre-delivery checklists are documented in the project README and the data CSVs.

### Step 1: Analyze Requirements
Extract product type, target audience, style keywords, and stack from the request.

### Step 2: Generate Design System (REQUIRED)
Always start with `--design-system` for comprehensive, reasoned recommendations:

```bash
python3 .Codex/skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

This searches domains in parallel (product, style, color, landing, typography), applies reasoning
rules from `ui-reasoning.csv`, and returns a complete design system: pattern, style, colors,
typography, effects, and anti-patterns to avoid.

### Step 2b: Persist Design System (Master + Overrides Pattern)
```bash
python3 .Codex/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name" [--page "dashboard"]
```
Creates `design-system/MASTER.md` (global source of truth) and `design-system/pages/<page>.md`
(page-specific overrides). When building a page, check the page file first; if it exists, its rules
override MASTER.md, otherwise use MASTER.md exclusively.

### Step 3: Supplement with Domain Searches
```bash
python3 .Codex/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

| Domain | Use For |
|--------|---------|
| `product` | Product type recommendations |
| `style` | UI styles, colors, effects |
| `color` | Color palettes by product type |
| `typography` | Font pairings, Google Fonts |
| `landing` | Page structure, CTA strategies |
| `chart` | Chart types, library recommendations |
| `ux` | Best practices, anti-patterns |
| `icons` | Icon library recommendations |
| `google-fonts` | Individual Google Fonts lookup (optional dataset) |
| `react` | React/Next.js performance |
| `web` | App interface guidelines (iOS/Android/RN) |

### Step 4: Stack Guidelines
```bash
python3 .Codex/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack <stack>
```
Stacks: react, nextjs, vue, svelte, astro, swiftui, react-native, flutter, nuxtjs, nuxt-ui,
html-tailwind, shadcn, jetpack-compose, threejs, angular, laravel.

## Output Formats
```bash
# ASCII box (default)
python3 .Codex/skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system
# Markdown
python3 .Codex/skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system -f markdown
```

## Pre-Delivery Checklist (App + Web)

### Visual Quality
- [ ] No emojis used as icons (use SVG: Heroicons/Lucide)
- [ ] All icons come from a consistent icon family and style
- [ ] Semantic theme tokens used consistently (no ad-hoc per-screen hardcoded colors)
- [ ] Pressed-state visuals do not shift layout bounds or cause jitter

### Interaction
- [ ] cursor-pointer on all clickable elements (web)
- [ ] All tappable elements provide clear pressed feedback
- [ ] Touch targets ≥44×44pt (iOS) / 48×48dp (Android)
- [ ] Micro-interaction timing 150–300ms with native-feeling easing
- [ ] Disabled states visually clear and non-interactive

### Light/Dark Mode
- [ ] Primary text contrast ≥4.5:1 in both modes; secondary ≥3:1
- [ ] Dividers/borders and interaction states distinguishable in both modes
- [ ] Modal/drawer scrim opacity 40–60% black
- [ ] Both themes tested before delivery

### Layout & Accessibility
- [ ] Responsive verified at 375 / 768 / 1024 / 1440
- [ ] Safe areas respected; scroll content not hidden behind fixed bars
- [ ] 4/8dp spacing rhythm maintained
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Color is not the only indicator; all meaningful icons/images have labels

> Full 99-rule Quick Reference (Accessibility, Touch & Interaction, Performance, Style Selection,
> Layout & Responsive, Typography & Color, Animation, Forms & Feedback, Navigation Patterns,
> Charts & Data) is available via `--domain ux` searches and the project README.
