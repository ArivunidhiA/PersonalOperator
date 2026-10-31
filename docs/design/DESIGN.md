# Design

Restrained and warm: a near-black ground, one ivory highlight, one deep accent.

- Ground `#0b0a09`, ivory `#efe7d8` (text, primary pill), garnet `#8c2f39` (the single accent: booking CTA, orb body). Amber stays only for the last-minute countdown.
- Orb: base colours are ivory highlight, garnet mid-tone and deep oxblood; `hue` stays 0. No gradient halo.
- Type (self-hosted by `next/font/google`, both SIL OFL): **Instrument Sans** for UI, **Newsreader** italic for the "Ariv's AI" wordmark. Geist and Geist Mono were removed. Licence: no purchase needed.
- Landing: orb, one pill ("Ask me" / "End" / "Cancel"), a footer link. Transcript, status line and mute appear only when relevant.
- Contrast: informational text is `white/60` or brighter. Decorative text may be dimmer only if `aria-hidden`.
- Print: `@media print` shows only the transcript (`data-print="transcript"`), used by "Print or save as PDF".
