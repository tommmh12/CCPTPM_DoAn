# Design System Specification: The Ethereal Canvas

## 1. Overview & Creative North Star
**Creative North Star: "The Zen Workspace"**

This design system is not a mere utility; it is a digital sanctuary. We are moving beyond the "productivity tool" trope to create an environment of cognitive ease. By prioritizing "The Zen Workspace," we reject the cluttered, boxy layouts of traditional note-taking apps. Instead, we embrace a high-end editorial feel characterized by **intentional asymmetry, breathability, and tonal depth.** 

The system breaks the "template" look by treating the screen as a physical desk. Elements do not just "sit" on the grid; they float, layer, and breathe. We use high-contrast typography scales (Manrope for expression, Inter for utility) to guide the eye through content as if reading a premium art monograph.

---

## 2. Colors & Surface Architecture
The palette is a sophisticated blend of botanical greens and aquatic blues. It is designed to lower the user's heart rate while maintaining professional focus.

### The "No-Line" Rule
**Borders are a failure of hierarchy.** In this system, 1px solid borders for sectioning are strictly prohibited. Boundaries must be defined solely through background color shifts. For example, a `surface_container_low` sidebar sitting against a `surface` background provides all the definition needed without the visual "noise" of a line.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, semi-transparent layers. 
- **The Base:** Use `background` (#f6fafb) for the overall canvas.
- **The Work Area:** Use `surface_container_lowest` (#ffffff) for the primary note-taking or task area to draw the eye to the most important "sheet of paper."
- **The Navigation:** Use `surface_container` (#e8eff2) for sidebars to provide a grounded, structural feel.

### The "Glass & Gradient" Rule
To elevate the experience, floating elements (like Modals or Floating Action Buttons) should utilize **Glassmorphism**. Apply `surface_bright` at 80% opacity with a `20px` backdrop-blur. 
- **Signature Polish:** For primary actions, use a subtle linear gradient from `primary` (#3d6758) to `primary_dim` (#315b4d). This adds a "soul" to the UI that flat hex codes cannot achieve.

---

## 3. Typography
We use a dual-font strategy to balance editorial flair with high-performance readability.

*   **Display & Headlines (Manrope):** Chosen for its geometric precision and modern "tech-boutique" feel. Use `display-lg` for empty states or welcome screens to create a bold, confident statement.
*   **Body & Labels (Inter):** A workhorse for legibility. Its tall x-height ensures that even at `body-sm` (0.75rem), task lists remain crystal clear.

**Editorial Hierarchy:** Always lead with a large `headline-md` for note titles, followed by significant `6` (2rem) spacing before the `body-lg` text begins. This creates a luxurious "opening" for every note.

---

## 4. Elevation & Depth
We define importance through **Tonal Layering** rather than shadows.

*   **The Layering Principle:** Place a `surface_container_lowest` card on a `surface_container_low` section. The slight shift in brightness creates a soft, natural lift.
*   **Ambient Shadows:** For elevated elements like menus, use a "Global Glow" instead of a drop shadow. 
    *   *Spec:* `0px 12px 32px rgba(43, 52, 55, 0.06)`. This uses the `on_surface` color at a very low opacity to mimic natural, diffused light.
*   **The "Ghost Border" Fallback:** If accessibility requires a container edge, use `outline_variant` (#aab4b7) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
- **Primary:** High-pill shape (`full` roundedness). Background: `primary` (#3d6758). Label: `on_primary` (#e4fff3). No shadow, unless hovered.
- **Secondary:** Surface-only. Background: `secondary_container` (#bdeaf8). Label: `on_secondary_container` (#2c5863). 

### Cards & Lists (The Editorial List)
**Forbid the use of divider lines.** To separate tasks or notes:
1.  Use `2` (0.7rem) of vertical white space.
2.  Use a subtle background shift on hover to `surface_container_high`.
3.  Leading elements (checkboxes) should use `primary_fixed_dim` (#b1decc) to feel integrated, not jarring.

### Input Fields
Text inputs should not be "boxes." Use a `surface_container_low` background with `xl` (0.75rem) rounded corners. On focus, do not change the border; instead, shift the background to `surface_container_highest` and introduce a subtle `primary` glow.

### Signature Component: The "Focus Drawer"
A slide-over panel for meta-data (tags, dates) using `surface_bright` with a heavy backdrop blur. It should feel like a pane of frosted glass sliding over your notes, maintaining the context of the work underneath.

---

## 6. Do's and Don'ts

### Do
*   **Do** use asymmetrical margins. A wider left-hand margin on notes creates an editorial, "notebook" feel.
*   **Do** use `8` (2.75rem) spacing to separate major functional groups.
*   **Do** use `tertiary` (#486083) for "Work" related tags and `secondary` (#3a6571) for "Personal" to create intuitive color-coding.

### Don't
*   **Don't** use pure black (#000000) for text. Use `on_surface` (#2b3437) to maintain the soft, calming aesthetic.
*   **Don't** use standard `md` corners for everything. Mix `xl` (0.75rem) for large containers and `full` for interactive pills to create a hierarchy of "softness."
*   **Don't** use 100% opacity shadows. They break the "Zen" and look like legacy software.