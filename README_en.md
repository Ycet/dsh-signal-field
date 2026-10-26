# dsh-signal-field v0.3.0

[![中文](https://img.shields.io/badge/简体中文-red?style=for-the-badge)](README.md)
[![EN](https://img.shields.io/badge/English-blue?style=for-the-badge)](README_en.md)

![version](https://img.shields.io/badge/version-v0.3.0-blue?style=for-the-badge)
![license](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
![platform](https://img.shields.io/badge/platform-DSH%20Web%20%2F%20Desktop-informational?style=for-the-badge)

An animated-UI plugin for DeepSeek Harness (DSH) on Web and desktop: it brings a dithered signal-field backdrop, a blueprint headline type effect and frosted-glass composer surfaces to the new-session page and chat sessions, and extends the same backdrop and glass to the HUD panel — each toggleable under Settings → UI Motion.

> [!NOTE]
> The scope is exactly two kinds of page: the **new session** page and the **chat session** page. The plugin manager, the scheduled-task page and any other panel page keep the stock DSH look: since v0.1.1 the plugin creates no layer, writes no scope attribute and injects nothing there, and it destroys an existing layer and canvas when you navigate away.
>
> Since v0.2.0 it also covers the chat page **composer strip** and the `dsh-awesome-hud` **HUD panel glass** (the right sidebar backdrop was removed in v0.2.4).

---

## Demo

**New session page (idle)** — dithered signal field, "DEEPSEEK HARNESS" blueprint headline and frosted-glass composer:

![New session page: dithered signal field, DEEPSEEK HARNESS blueprint headline and frosted-glass composer](docs/screenshot-hero.png)

**Chat session page (active)** — the field runs through the transcript and the composer strip, and the composer card reads as frosted glass:

![Chat session page: signal field continues through the transcript into the composer strip, composer card reads as frosted glass](docs/screenshot-chat.png)

(Light theme, 2378×1708 screenshots. The animation is rendered live; these stills show the final look.)

---

## What you get

| Area | Signal field | Blueprint headline | Frosted glass |
| --- | --- | --- | --- |
| New session (`data-content-phase="hero"`) | ✓ | ✓ "DEEPSEEK HARNESS" | ✓ composer |
| Chat session | ✓ (composer strip included) | — | ✓ composer |
| HUD panel (`dsh-awesome-hud`, both pages) | ✓ shows through, blurred | — | ✓ panel |

- The field spans the content area but deliberately does **not** repaint the left navigation column: DSH keeps its own fill, so colour stacking with plugins such as `dsh-better-sidebar` stays predictable.
- Light and dark palettes follow the DSH theme automatically: light `#e7e9f0 / #b6bfd8 / cursor erase`, dark `#070a12 / #3a4a7a / cursor reveal`.
- Backdrop interaction: drifting noise wave + pointer-trail erase/reveal + click ripple.
- Headline interaction: entry reveal, glyphs turn into dashed vector outlines near the pointer, with an optional selection frame, draggable letter blocks and drifting specks.
- The headline shares the hero row with the whale mark, "探索未至之境" and the preview badge, and the whole row is centred; letter blocks can be dragged anywhere on the page without being clipped, and spring back on release.
- Both the composer and the HUD panel hang their blur on the host's `::before`, never on the host element itself: `backdrop-filter` turns that element into the containing block for its `position:fixed` descendants, so putting it on the host makes the popups inside that subtree resolve against the host and get clipped by its `overflow:hidden`. In v0.2.0 this trapped `dsh-awesome-hud`'s own git graph and other dialogs inside the 300px panel; v0.2.1 fixes it and pins the rule with automated assertions.
- Messages scrolling under the composer no longer land on the status row: since v0.2.5 the **composer seat grows its own `::before` backing** — a `backdrop-filter` blur plus a bottom-edge tint at `z-index:-1`, so it always paints *below* the card and the status-row text and can never blur any UI. The v0.2.2 colour band and the v0.2.3 `::after` blur both painted above the seat's children; v0.2.4 switched to a `mask` but put it on the scroll container, and the seat is a child of it — the whole seat faded out (the status-row text vanished), and the backdrop root created by the mask stopped the composer card from sampling the signal field, degrading the glass to a transparent card with visible noise. Both are fixed in v0.2.5.
v0.2.7 shrinks that backing to **only the info line below the composer** (height measured at runtime as "card bottom → seat bottom" and exposed as `--mui-seat-band-h`): with the v0.2.5 full-seat layer, `backdrop-filter` averaged the fine dither into a smooth pale grey, so the whole composer strip looked like it had no animated backdrop at all and the card blurred an already-smoothed field. The rest of the seat is transparent again, so the backdrop shows all the way into the composer area.
- The HUD panel floats over the right-hand side of the content area, where there was no signal field, so its glass could only blur flat white and looked opaque. Since v0.2.3 a matching field layer is placed behind the panel, and v0.2.5 fixes two things about it: the layer is now inserted into the panel's own layer (DSH's `shell.overlay`) immediately before the panel (it used to hang on `body` with `z-index:-1`, where the shell's opaque background covered it completely), and its box now runs to the bottom-right corner of the viewport instead of "panel rect + 24px" — the panel's height follows its content, so a short panel used to leave a plain white block underneath.
v0.2.6 fixes two remaining artefacts: the layer used to be laid out as "panel rect + 24px", so it started above the conversation area and the right column showed a **hard-edged rectangular patch**; that 24px overhang also landed on top of the conversation area, stacking two signal fields into a **dirty vertical band** (light cell 233 → 243, dark cell 233 → 218). The box is now aligned to the *content band* itself (left = content-area right edge, top = content-area top edge, right/bottom = viewport edges) and carries its own opaque same-source base (`--mui-surface-base`), so any overlap is covered instead of composited twice.
- Since v0.2.4 the **right sidebar is out of scope**: its animated backdrop is removed entirely (layer, observers, CSS and the setting), so the sidebar keeps the stock DSH look; the switch count drops from 11 to 10. The vertical strip the HUD panel itself occupies is still covered by its backdrop layer (otherwise the panel has nothing to blur and a white block appears beneath it); that layer disappears with the panel.

---

## Settings page

Settings → UI Motion (a `settings.section` entry with id `signal-field`, order 58). Since v0.2.9 the page has two modules separated by a divider:

| Module | Rows |
| --- | --- |
| Master (above both modules) | Enable all effects |
| **Pages** | New session page / Chat session page (each with a one-line hint) |
| **Effects** | Headline default motion / Headline pointer interaction / Headline animation speed (slider, **1×** by default) / Backdrop default motion / Backdrop pointer interaction / Composer frosted glass / Backdrop intensity (slider, **30%** by default) / Backdrop animation speed (slider, **1×** by default) / Redraw frame-rate cap (slider, **30 fps** by default) |

- **1 master switch + 7 switches + 4 sliders**: module 1 chooses which pages show the effects, module 2 tunes the effects themselves.
- Turning a page off disables everything on that page (signal field, blueprint headline, composer glass) and returns it to the stock DSH look; with "New session page" off the headline is not mounted at all.
- **The HUD panel has no switch of its own**: it follows the "Chat session page" switch, so turning the chat page off also reverts the panel; it is *not* controlled by "Composer frosted glass" (that switch only governs the composer card).
- The blur radius is fixed at 14px (the old "Glass blur" slider was removed in v0.2.9) and shared by the composer and the HUD panel.
- **Redraw frame-rate cap** (new in v0.2.11; 15–60 fps, step 5, **30** by default) limits how many times per second the signal field redraws in order to save power. It is **independent of image quality**: grain size, glass strength, colours and canvas size are unchanged — only the draw rate moves. While the window is unfocused (another app in front) it drops to 8 fps and returns to the configured value the moment the window regains focus; while the pointer moves or clicks on the field it is temporarily uncapped for about 1.2 s so trails never show steps. Default 30 fps halves redraws on a 60 Hz display and quarters them on a 120 Hz one.
- **Headline animation speed** (new in v0.3.0; 0.25×–2×, step 0.25, **1×** by default) sets how fast the sweep runner, the reveal lens and the hover-to-outline transition run; **1× is the original feel**. It applies live while dragging: the headline never flickers, never replays, and its glyph textures are never re-baked. Pointer following and drag spring-back deliberately ignore it, otherwise the feel would degrade as you slow it down.
- **Backdrop animation speed** (new in v0.3.0; 0.25×–2×, step 0.25, **1×** by default) is a single multiplier for the whole backdrop: wave drift, ripple wobble and ripple spread all scale together, and **ripples live correspondingly shorter** (1.6s ÷ factor) — that follows from using one unified multiplier. The HUD panel's backing field follows the same factor. It is fully independent of the redraw cap: high speed with a low cap looks steppy, and that trade-off is yours to make.
- The headline only exists on the new session page, so the two headline rows are effectively hero-only.
- A static note at the bottom of module 1 repeats that effects only run on the new session and chat pages; the plugin manager and automation pages keep the stock DSH look.
- Stored in browser `localStorage` under `dsh-signal-field:v1` and restored after a restart; "Restore defaults" clears it. The old per-page × per-effect structure is mapped semantically onto the new model (an old default intensity of 55% follows the new 30% default; hand-tuned values are kept).
- Turning the master switch off destroys the canvas, stops animation and removes every injected scope attribute, restoring the stock DSH look.

---

## Accessibility and degradation

- With `prefers-reduced-motion: reduce`, the first install seeds "idle motion" and "pointer interaction" as off; the settings page explains this and lets you turn them back on.
- Without WebGL2, or after context loss, the backdrop degrades to a soft radial gradient (`[data-mui-field][data-fallback]`): no dithering, no interaction, nothing else breaks.
- If no headline mount point exists, the settings page says so and every other effect keeps working.

---

## Install / upgrade / remove

```text
# install (target is the absolute path of the plugin package directory)
plugin_manager install_bundle  target=<absolute-path-to-plugin>/dsh-signal-field

# upgrade after editing sources
node scripts/build.mjs        # regenerate client.js
# the profile links this directory: a page refresh loads the new bundle;
# re-run install_bundle only when package.json / exports change.
# If a refresh is not enough: toggle the plugin off/on, or restart DeepSeek Harness.

# remove
plugin_manager remove_bundle  target=dsh-signal-field
```

---

## Known limits and version coupling

The plugin only reads the host and never mutates DSH state, but it does depend on a few DOM contracts. If the effects disappear after a DSH upgrade, check this table:

| Purpose | Anchor | Behaviour when missing |
| --- | --- | --- |
| Page detection | presence of `[data-conversation-content]` | the whole page is out of scope: no layer, no attributes, no headline |
| New session vs chat | `[data-conversation-content][data-content-phase]` | without a `hero` phase it is treated as chat and no headline is mounted |
| Backdrop layer host | the conversation surface `[data-conversation-content]` itself | no backdrop; everything else works |
| Headline mount point | the largest-font leaf text block inside `[data-content-phase="hero"]` | no headline; the settings page reports it |
| Headline insertion point | climb to the hero row whose parent is a column flex container, then insert before the text group | no headline when the row cannot be located |
| Composer card | `[data-composer-card]` | no frosted glass |
| Composer strip | `[data-composer-seat]` and its use of `--dsw-alias-bg-base` | the opaque strip returns and the backdrop breaks there |
| Composer strip | `blur + bottom tint` on `[data-composer-seat]::before` (`z-index:-1`, chat phase only) | messages no longer scroll over the status row, the card still blurs the real field, and the status-row text stays untouched |
| HUD panel | `.hud-panel` from `dsh-awesome-hud` (the blur lives on `.hud-panel::before` only) | no frosted glass (harmless when that plugin is absent) |
| Dark theme | `body[data-ds-dark-theme]` | light palette only |
| Palette tokens | `--dsw-alias-label-primary` / `--dsw-alias-brand-primary` | built-in neutral fallback colours |

`[data-conversation-content]` is the plugin's only page-detection source and therefore its single point of failure (since v0.1.1 it no longer reads `ctx.layout`).


---

## Upgrade regression checklist

1. New session: the whale mark, "DEEPSEEK HARNESS", "探索未至之境" and the preview badge sit on one centred row.
2. New session: the area **below** the composer is covered by the backdrop.
3. Chat session: the composer strip is no longer white, the backdrop runs to the bottom of the page, and the composer card reads as the same frosted glass as on the new-session page (v0.2.5 fixed the "transparent card" caused by the mask breaking backdrop-filter).
4. Chat session, scrolling the transcript: message text **no longer overlaps the status row**, and the status-row text below the composer (the workspace and model lines) is **fully visible, opaque and crisp** (the key v0.2.5 regression).
5. Expanding a question card / plan list: nothing covers or blurs the area beneath the overlay (the key v0.2.4 regression).
6. Right sidebar: back to the stock DSH look, with **no** signal field.
7. HUD panel: it reads as frosted glass and the signal field shows through blurred; the strip of the right-hand column **below** the panel is backdrop rather than a plain white block (the key v0.2.5 regression); there is **no** hard-edged patch and **no** denser band around the panel (the key v0.2.6 regression); turning "HUD panel frosted glass" off restores the original look and removes that backdrop layer.
8. The HUD's own popups (git graph, branch/commit/confirm dialogs, file and branch menus, commit hover tip) are still centred in or anchored to the viewport — **not trapped inside the panel and not clipped**.
9. Drag the headline to the page corners and over the composer: it stays visible and springs back on release.
10. Regression: backdrops/headline/composer glass on both pages, light/dark switching, 8 switches and 2 sliders applying immediately and surviving a refresh; the plugin manager and scheduled-task page still keep the stock DSH look.
11. With the master switch off: no `data-mui*` attribute remains on `document.documentElement`, and `<style data-plugin="dsh-signal-field:styles">` is gone.
12. Settings structure (v0.2.9): only the "Pages" and "Effects" modules plus one divider; turning "Chat session page" off returns the chat page to the stock look and the HUD panel loses its glass too; backdrop intensity shows 30% by default.
13. Power regression (v0.2.11): at the default "30 fps" cap the picture should be visually indistinguishable from 60 fps; focus another app and come back — the backdrop resumes seamlessly with no jump and no freeze; flick the pointer quickly across the field and the trail still tracks the cursor (the cap is lifted during interaction). The `--- performance ---` block at the end of the self-check text reports measured `fps` / `avgRenderMs` / `renders` / `skips` for direct comparison.
14. Speed regression (v0.3.0): at the default 1× on both sliders the look must match v0.2.11 exactly. Dragging "Headline animation speed" should speed the sweep up and down smoothly **without the runner jumping position**, and the headline must **not flicker or replay**; dragging "Backdrop animation speed" should move wave, ripple wobble and ripple spread together, with the HUD backing field following. Crank the backdrop speed to 2× while capping redraws at 15 fps — choppiness is acceptable, tearing or a frozen picture is not. The `speeds: title=…x background=…x` line in the self-check text must match the slider values.
