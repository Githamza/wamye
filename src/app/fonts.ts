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
// Cairo while Latin text on the same page — "Wamye", a phone number — stays
// Inter. No locale-conditional CSS, and mixed-script lines look right, which
// matters for derja because it borrows French words wholesale.
// ============================================================

import { Cairo, Inter } from "next/font/google";

export const inter = Inter({
  variable: "--font-latin",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

/**
 * Cairo, not IBM Plex Sans Arabic or Tajawal: the UI uses weights 400–800
 * (font-extrabold on the landing hero), and Plex Arabic stops at 700 while
 * Tajawal skips 600. Cairo has a variable axis, so no weight list is needed.
 */
export const cairo = Cairo({
  variable: "--font-arabic",
  subsets: ["arabic"],
});

/** Both faces, for the <html> className of either root layout. */
export const fontVariables = `${inter.variable} ${cairo.variable}`;
