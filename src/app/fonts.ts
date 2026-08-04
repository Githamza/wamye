// ============================================================
// Fonts, shared by both root layouts.
//
// next/font must be called at module scope, and there are two root layouts
// ([lang] and (app)), so the calls live here rather than being duplicated.
//
// Inter carries no Arabic glyphs — it is loaded `subsets: ["latin"]` and has
// none to load. Rather than swapping the family per locale, both faces are
// declared and --font-sans lists them in order (see globals.css): the browser
// resolves each glyph to the first family that has it, so Arabic text picks up
// the Arabic face while Latin text on the same page — "Wamye", a phone number —
// stays Inter. No locale-conditional CSS, and mixed-script lines look right,
// which matters for derja because it borrows French words wholesale.
//
// Readex Pro also ships Latin, but the order above means it never gets asked
// for it. That is deliberate: it is here for its Arabic only.
// ============================================================

import { Readex_Pro, Inter } from "next/font/google";

export const inter = Inter({
  variable: "--font-latin",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

/**
 * Readex Pro, replacing Cairo: it is drawn for reading ease — low stroke
 * contrast, large counters, simplified letterforms — and at the same px size it
 * reads visibly bigger than Cairo did. Our readers are drivers glancing at a
 * phone mid-course, often in derja they read slower than they speak, so plain
 * legibility beats a tighter fit.
 *
 * It costs vertical space, and its weight axis stops at 700 where Cairo went to
 * 1000. `font-extrabold` (800) therefore clamps to 700 — the browser does this
 * silently and correctly, so the hero simply renders one notch lighter rather
 * than breaking. Variable, so no weight list.
 */
export const arabic = Readex_Pro({
  variable: "--font-arabic",
  subsets: ["arabic"],
});

/** Both faces, for the <html> className of either root layout. */
export const fontVariables = `${inter.variable} ${arabic.variable}`;
