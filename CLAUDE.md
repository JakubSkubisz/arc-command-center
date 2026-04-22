# CLAUDE.md - Frontend Website Rules

## Always Do First
- Use **Tailwind CSS** for styling.
- Adopt a **minimalist, modern aesthetic** (think Apple, Stripe, Linear).
- Use a maximum of 3 colors (Primary, Background, Text) plus shades of gray.

## Design Guidelines
- **Spacing:** Use Tailwind spacing scale (p-4, m-8, gap-6) consistently. Do not use random pixel values.
- **Typography:** Use sans-serif fonts (font-sans) with clean, professional weight distribution.
- **Layout:** Implement flexbox or grid for responsiveness.
- **Colors:**
    - Background: bg-white or bg-slate-50
    - Text: text-slate-900 (headings), text-slate-600 (body)
    - Primary: A single accent color (e.g., blue-600) for buttons and links.
- **Components:** Cards should have subtle borders (`border border-slate-200`) or light shadows (`shadow-sm`) instead of heavy styling.

## Workflow Rules
- Prioritize visual clarity over complexity.
- Focus on mobile-first design.
- Always add `nav`, `hero`, `features`, and `footer` sections.
