// The Signal widgets' look (spec §5), one stylesheet for all five. Colours come only from the §3.1 custom properties
// (--paper, --ink, --blue, --gain, --loss, --wait and their steps), which the page defines once in globals.css: no colour
// literal lives here. Every rule is scoped under .sig-w, so the widgets never restyle the page around them.
//
// Each widget renders <SignalStyles /> (signal-styles.tsx); React 19 hoists the <style> into <head> once by its href.
// The rules are unlayered, so they win over Tailwind's layered utilities (range-you on the sliders) without !important.

export const SIGNAL_STYLES_HREF = "signal-widgets";

export const SIGNAL_CSS = `
.sig-w{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;min-width:0;padding:clamp(16px,2vw,24px);background:var(--paper);color:var(--ink-2);border:1px solid var(--rule);border-radius:18px;box-shadow:var(--lift-w,none);font-family:var(--font-body,inherit);font-size:15px;line-height:1.55}
.sig-w *{box-sizing:border-box}
.sig-w b,.sig-w strong{font-weight:600;color:var(--ink)}
.sig-w p{margin:0}
.sig-w :focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.sig-w .sig-ic{width:15px;height:15px;flex:none}
.sig-w .sig-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.sig-w .sig-head{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.sig-w .sig-live{display:inline-flex;align-items:center;gap:8px;color:var(--blue)}
.sig-w .sig-cat{display:inline-flex;align-items:center;gap:8px}
.sig-w .sig-title{margin:0;font-family:var(--font-display,inherit);font-size:20px;line-height:1.3;font-weight:600;letter-spacing:-.01em;color:var(--ink);text-wrap:balance}
.sig-w .sig-sub{margin-top:4px}
.sig-w .sig-call{border:0;margin:0;padding:0;min-width:0;display:grid;gap:10px}
.sig-w .sig-call legend{padding:0;margin-bottom:10px;font-weight:600;font-size:15px;color:var(--ink)}
.sig-w .sig-tag{display:inline-block;margin-right:8px;padding:2px 7px;border-radius:6px;background:var(--blue-tint);color:var(--blue);font-size:11px;line-height:16px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;vertical-align:1px}
.sig-w .sig-l2.is-open .sig-tag{background:var(--paper)}
.sig-w .sig-chips{display:flex;flex-wrap:wrap;gap:8px}
.sig-w .sig-chip{display:inline-flex;align-items:center;min-height:40px;padding:8px 14px;border:1px solid var(--rule);border-radius:10px;background:var(--paper);color:var(--ink);font:600 14px/20px var(--font-body,inherit);text-align:left;cursor:pointer;transition:background-color .15s,border-color .15s}
.sig-w .sig-chip:hover{background:var(--wash);border-color:var(--line)}
.sig-w .sig-chip[aria-pressed="true"]{background:var(--blue-tint);border-color:var(--blue-line);color:var(--blue)}
.sig-w .sig-chip .sig-ic{margin-right:7px}
.sig-w .sig-chip.is-right{background:var(--gain-tint);border-color:var(--gain);color:var(--gain-ink)}
.sig-w .sig-chip.is-wrong{background:var(--loss-tint);border-color:var(--loss);color:var(--loss-ink)}
.sig-w .sig-chip.is-careful{background:var(--wait-tint);border-color:var(--wait);color:var(--wait-ink)}
.sig-w .sig-fb,.sig-w .sig-verdict{min-height:1.55em}
.sig-w .sig-verdict{font-size:15.5px}
.sig-w .sig-pill{display:inline-flex;align-items:center;gap:5px;min-height:24px;margin-right:8px;padding:3px 10px 3px 8px;border-radius:999px;font-size:12.5px;line-height:1;font-weight:600;vertical-align:1px;white-space:nowrap}
.sig-w .sig-pill .sig-ic{width:13px;height:13px}
.sig-w .sig-pill-gain{background:var(--gain-tint);color:var(--gain-ink);box-shadow:inset 0 0 0 1px var(--gain-line)}
.sig-w .sig-pill-loss{background:var(--loss-tint);color:var(--loss-ink);box-shadow:inset 0 0 0 1px var(--loss-line)}
.sig-w .sig-pill-wait{background:var(--wait-tint);color:var(--wait-ink);box-shadow:inset 0 0 0 1px var(--wait-line)}
.sig-w .sig-pill-blue{background:var(--blue-tint);color:var(--blue);box-shadow:inset 0 0 0 1px var(--blue-line)}
.sig-w .sig-pill-plain{background:var(--wash);color:var(--muted);box-shadow:inset 0 0 0 1px var(--rule);letter-spacing:0;text-transform:none}
.sig-w .sig-pill-ghost{visibility:hidden}
.sig-w .sig-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 12px;border-radius:10px;font:600 14px/1 var(--font-body,inherit);white-space:nowrap;cursor:pointer;border:0;transition:background-color .15s}
.sig-w .sig-btn-quiet{background:var(--paper);color:var(--ink);box-shadow:inset 0 0 0 1px var(--rule)}
.sig-w .sig-btn-quiet:hover{background:var(--wash)}
.sig-w .sig-btn-secondary{background:var(--blue-tint);color:var(--blue)}
.sig-w .sig-btn-secondary:hover{background:var(--blue-tint-2)}
.sig-w .sig-btn:disabled{background:var(--wash-2);color:var(--faint);cursor:not-allowed;box-shadow:none}
.sig-w .sig-btn-quiet:disabled{background:var(--paper)}
.sig-w .sig-presets{display:flex;flex-wrap:wrap;gap:8px}
.sig-w .sig-stage{position:relative;border-radius:12px;padding:14px 14px 10px;background-color:var(--wash);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px}
.sig-w .sig-plot{width:100%;min-width:0}
.sig-w .sig-plot svg{display:block;font-family:var(--font-body,inherit);font-variant-numeric:tabular-nums;overflow:visible}
.sig-w .sig-t-axis{font-size:12px;fill:var(--muted)}
.sig-w .sig-t-faint{font-size:12px;fill:var(--faint)}
.sig-w .sig-t-value{font-size:14px;font-weight:600;fill:var(--ink)}
.sig-w .sig-t-mark{font-size:11.5px;font-weight:600;fill:var(--ink-2)}
.sig-w .sig-axis{stroke:var(--line);stroke-width:1}
.sig-w .sig-hit{fill:transparent}
.sig-w .sig-f-gain{fill:var(--gain)}
.sig-w .sig-f-deep{fill:var(--gain-deep)}
.sig-w .sig-f-loss{fill:var(--loss)}
.sig-w .sig-f-ink{fill:var(--ink)}
.sig-w .sig-f-hatch{stroke:var(--line);stroke-width:1}
.sig-w .sig-hatch-bg{fill:var(--paper)}
.sig-w .sig-hatch-line{stroke:var(--line);stroke-width:2}
.sig-w .sig-dim{opacity:.16}
.sig-w .sig-tip{position:fixed;z-index:95;max-width:240px;padding:7px 10px;border-radius:8px;background:var(--ink);color:var(--paper);font-size:12.5px;font-weight:500;line-height:1.4;white-space:pre-line;pointer-events:none}
.sig-w .sig-r-gap{fill:var(--blue-line)}
.sig-w .sig-r-old{fill:var(--paper);stroke:var(--ink);stroke-width:2}
.sig-w .sig-r-new{fill:var(--blue);stroke:var(--paper);stroke-width:2}
.sig-w .sig-r-t-old{font-size:12.5px;fill:var(--ink-2)}
.sig-w .sig-r-t-new{font-size:13.5px;font-weight:600;fill:var(--ink)}
.sig-w .sig-r-rule{stroke:var(--ink);stroke-width:2}
.sig-w .sig-r-tick{stroke:var(--ink)}
.sig-w .sig-r-t-trap{font-size:12px;fill:var(--wait-ink)}
.sig-w .sig-r-t-trapv{font-size:14px;font-weight:600;fill:var(--wait-ink)}
.sig-w .sig-r-trapbar{fill:var(--wait)}
.sig-w .sig-lockable{display:grid;gap:10px;transition:opacity .25s}
.sig-w .sig-lockable[data-locked="true"]{opacity:.5}
.sig-w .sig-locknote{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--muted)}
.sig-w .sig-range-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.sig-w .sig-range-top label{font-size:14px;font-weight:600;color:var(--ink)}
.sig-w .sig-range-top output{font-size:16px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.sig-w .sig-range{-webkit-appearance:none;appearance:none;display:block;width:100%;height:28px;margin:0;background:transparent;cursor:pointer}
.sig-w .sig-range:disabled{cursor:not-allowed}
.sig-w .sig-range:focus-visible{outline:none}
.sig-w .sig-range::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,var(--blue) var(--p,0%),var(--line) var(--p,0%))}
.sig-w .sig-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;margin-top:-10px;border-radius:50%;background:var(--paper);border:2px solid var(--blue);box-shadow:var(--lift,none)}
.sig-w .sig-range:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 5px var(--blue-tint-2)}
.sig-w .sig-range::-moz-range-track{height:4px;border-radius:2px;background:var(--line)}
.sig-w .sig-range::-moz-range-progress{height:4px;border-radius:2px;background:var(--blue)}
.sig-w .sig-range::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:var(--paper);border:2px solid var(--blue)}
.sig-w .sig-range:focus-visible::-moz-range-thumb{box-shadow:0 0 0 5px var(--blue-tint-2)}
.sig-w .sig-reading{display:grid;gap:12px}
.sig-w .sig-big{font-family:var(--font-display,inherit);font-size:clamp(32px,3.6vw,40px);line-height:1.05;font-weight:600;letter-spacing:-.02em;color:var(--ink)}
.sig-w .sig-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:0;border:1px solid var(--rule);border-radius:12px;overflow:hidden}
.sig-w .sig-facts div{padding:12px 14px;box-shadow:1px 0 0 var(--rule),0 1px 0 var(--rule)}
.sig-w .sig-facts dt{font-size:13px;color:var(--muted)}
.sig-w .sig-facts dd{margin:2px 0 0;font-family:var(--font-display,inherit);font-size:20px;line-height:1.3;font-weight:600;color:var(--ink)}
.sig-w .sig-meter{display:grid;gap:12px}
.sig-w .sig-meter-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;font-size:14px;color:var(--ink)}
.sig-w .sig-meter-top output{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
.sig-w .sig-track{display:flex;height:12px;border-radius:6px;background:var(--wash-2);overflow:hidden}
.sig-w .sig-fill{background:var(--gain);transition:width .42s var(--ease,ease)}
.sig-w .sig-ghost{background:repeating-linear-gradient(135deg,var(--line) 0 1.5px,transparent 1.5px 4.5px);transition:width .42s var(--ease,ease)}
.sig-w .sig-seg{display:flex;gap:2px;height:28px}
.sig-w .sig-seg-part{display:flex;align-items:center;padding:0 6px;border-radius:4px;min-width:0;overflow:hidden;font-size:12.5px;font-weight:600;white-space:nowrap}
.sig-w .sig-seg-ink{background:var(--ink);color:var(--paper)}
.sig-w .sig-seg-gain{background:var(--gain);color:var(--ink)}
.sig-w .sig-seg-deep{background:var(--gain-deep);color:var(--paper)}
.sig-w .sig-seg-loss{background:var(--loss);color:var(--paper)}
.sig-w .sig-l2{display:grid;gap:12px;padding:14px 16px;border-radius:12px;background:var(--wash);color:var(--muted)}
.sig-w .sig-l2.is-open{background:var(--blue-tint);color:var(--ink-2)}
.sig-w .sig-l2-locked{display:flex;align-items:center;gap:6px;font-size:13.5px}
.sig-w .sig-foot{display:grid;gap:8px;padding-top:12px;border-top:1px solid var(--rule)}
.sig-w .sig-key{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0;padding:0;list-style:none;font-size:13px;color:var(--muted)}
.sig-w .sig-key li{display:inline-flex;align-items:center;gap:6px}
.sig-w .sw{display:inline-block;width:12px;height:12px;border-radius:3px;flex:none}
.sig-w .sw-gain{background:var(--gain)}
.sig-w .sw-deep{background:var(--gain-deep)}
.sig-w .sw-loss{background:var(--loss)}
.sig-w .sw-wait{background:var(--wait)}
.sig-w .sw-ink{background:var(--ink)}
.sig-w .sw-hatch{background:repeating-linear-gradient(135deg,var(--line) 0 1.5px,transparent 1.5px 4.5px);box-shadow:inset 0 0 0 1px var(--line)}
.sig-w .sw-claim{background:repeating-linear-gradient(135deg,var(--wait) 0 1.5px,var(--wait-tint) 1.5px 4.5px);box-shadow:inset 0 0 0 1px var(--wait)}
.sig-w .sw-blue{border-radius:50%;background:var(--paper);box-shadow:inset 0 0 0 3px var(--blue)}
.sig-w .sw-ref{width:14px;height:2px;border-radius:0;background:var(--ink-2)}
.sig-w .sw-pin{width:2px;height:14px;border-radius:0;background:var(--ink)}
.sig-w .sig-src{font-size:12.5px;color:var(--muted)}
.sig-w .sig-table summary{cursor:pointer;font-size:13px;font-weight:600;color:var(--blue)}
.sig-w .sig-scroll{margin-top:8px;max-height:240px;overflow:auto;border:1px solid var(--rule);border-radius:10px}
.sig-w table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.sig-w th,.sig-w td{padding:6px 10px;text-align:right;border-bottom:1px solid var(--rule)}
.sig-w th:first-child,.sig-w td:first-child{text-align:left}
.sig-w thead th{position:sticky;top:0;background:var(--wash);color:var(--ink)}
.sig-w .sig-lab{display:grid;gap:14px}
.sig-w .sig-lab-top{display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap}
.sig-w .sig-lab-label{font-size:13px;color:var(--muted)}
.sig-w .sig-lab-value{font-family:var(--font-display,inherit);font-size:clamp(40px,5vw,60px);line-height:1.05;font-weight:600;letter-spacing:-.02em;color:var(--blue)}
.sig-w .sig-lab-sub{font-size:14px;color:var(--ink-2);text-align:right}
.sig-w .sig-ruler{position:relative;height:10px;margin:40px 8px 30px;border-radius:5px;background:var(--wash-2)}
.sig-w .sig-ruler-pin{position:absolute;top:-6px;bottom:-6px;width:2px;margin-left:-1px;background:var(--ink)}
.sig-w .sig-ruler-pin-label{position:absolute;bottom:22px;transform:translateX(-50%);text-align:center;white-space:nowrap;font-size:12px;color:var(--muted);line-height:1.2}
.sig-w .sig-ruler-pin-label b{display:block;font-family:var(--font-display,inherit);font-size:17px}
.sig-w .sig-ruler-notch{position:absolute;top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:var(--ink-2);opacity:.55}
.sig-w .sig-ruler-notch-label{position:absolute;top:16px;transform:translateX(-50%);white-space:nowrap;font-size:12px;color:var(--muted)}
.sig-w .sig-ruler-net{position:absolute;top:0;bottom:0;border-radius:5px;transition:left .42s var(--ease,ease),width .42s var(--ease,ease)}
.sig-w .sig-ruler-net.is-gain{background:var(--gain)}
.sig-w .sig-ruler-net.is-loss{background:var(--loss)}
.sig-w .sig-ruler-net.is-band-gain{background:var(--gain-line)}
.sig-w .sig-ruler-net.is-band-loss{background:var(--loss-line)}
.sig-w .sig-ruler-dot{position:absolute;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:var(--blue);border:3px solid var(--paper);box-shadow:var(--lift,none);transition:left .42s var(--ease,ease);display:grid;place-items:center;color:var(--paper);font-size:12px;line-height:1}
.sig-w .sig-ruler-end{position:absolute;top:16px;font-size:12px;color:var(--faint)}
.sig-w.dragging .sig-ruler-net,.sig-w.dragging .sig-ruler-dot,.sig-w.dragging .sig-lever-fill{transition:none}
.sig-w .sig-levers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.sig-w .sig-lever{display:grid;justify-items:center;gap:6px;min-width:0;text-align:center}
.sig-w .sig-lever-value{font-family:var(--font-display,inherit);font-size:19px;line-height:1.2;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.sig-w .sig-lever-unit{font-size:12px;color:var(--muted);line-height:1.3;min-height:2.6em}
.sig-w .sig-lever-track{position:relative;width:44px;height:var(--lv-h,200px);border-radius:8px;background:var(--paper);box-shadow:inset 0 0 0 1px var(--rule);touch-action:pan-y;cursor:pointer}
.sig-w .sig-lever[data-enabled="false"] .sig-lever-track{cursor:default}
.sig-w .sig-lever:focus-within .sig-lever-track{outline:2px solid var(--blue);outline-offset:2px}
.sig-w .sig-lever-fill{position:absolute;left:6px;right:6px;border-radius:4px;transition:bottom .42s var(--ease,ease),height .42s var(--ease,ease)}
.sig-w .sig-lever-base{background:var(--wash-2)}
.sig-w .sig-lever-delta.is-gain{background:var(--gain)}
.sig-w .sig-lever-delta.is-loss{background:var(--loss)}
.sig-w .sig-lever-delta.is-missing{opacity:.34}
.sig-w .sig-lever-notch{position:absolute;left:-4px;right:-4px;height:2px;margin-bottom:-1px;background:var(--ink-2)}
.sig-w .sig-lever-knob{position:absolute;left:50%;width:30px;height:30px;margin:0 0 -15px -15px;border-radius:50%;background:var(--paper);border:2px solid var(--blue);box-shadow:var(--lift,none);touch-action:none;transition:bottom .42s var(--ease,ease)}
.sig-w .sig-lever-knob::after{content:"";position:absolute;inset:6px;border-radius:50%;background:var(--blue)}
.sig-w .sig-lever-knob::before{content:"";position:absolute;inset:-11px;border-radius:50%}
.sig-w .sig-lever-track:hover .sig-lever-knob{box-shadow:0 0 0 6px var(--blue-tint-2)}
.sig-w.dragging .sig-lever-knob{transition:none}
.sig-w .sig-lever-name{font-size:14px;font-weight:600;color:var(--ink);line-height:1.3}
.sig-w .sig-strip{display:block;width:100%;height:auto}
.sig-w .sig-bridge{display:grid;gap:8px}
.sig-w .sig-bridge-row{display:grid;grid-template-columns:11.5em minmax(0,1fr) 4.2em;align-items:center;gap:10px;font-size:13.5px}
.sig-w .sig-bridge-row.is-total{padding-top:8px;border-top:1px solid var(--line);font-weight:600;color:var(--ink)}
.sig-w .sig-bridge-row output{text-align:right;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.sig-w .sig-bridge-bar{position:relative;height:16px}
.sig-w .sig-bridge-seg{position:absolute;top:2px;bottom:2px;border-radius:3px}
.sig-w .sig-bridge-seg.is-gain{background:var(--gain)}
.sig-w .sig-bridge-seg.is-loss{background:var(--loss)}
.sig-w .sig-bridge-seg.is-blue{background:var(--blue)}
.sig-w .sig-bridge-zero{position:absolute;top:-4px;bottom:-4px;width:1px;background:var(--line)}
.sig-w .sig-bridge-price{position:absolute;top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:var(--ink)}
.sig-w .sig-beat{display:grid;gap:4px;padding:14px 16px;border-radius:12px;border:1px solid var(--rule);background:var(--paper);animation:sig-rise .4s var(--ease,ease)}
.sig-w .sig-beat-who{font-size:12px;line-height:16px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.sig-w .sig-beat-text{font-size:16px;color:var(--ink)}
.sig-w .sig-beat-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.sig-w .sig-dots{display:flex;gap:6px;margin:0;padding:0;list-style:none}
.sig-w .sig-dots li{width:8px;height:8px;border-radius:50%;background:var(--wash-2)}
.sig-w .sig-dots li.is-on{background:var(--blue)}
.sig-w .sig-bars{display:grid;gap:14px}
.sig-w .sig-bar-top{display:flex;justify-content:space-between;gap:8px;font-size:14px;color:var(--ink)}
.sig-w .sig-bar-top output{font-weight:600;font-variant-numeric:tabular-nums}
.sig-w .sig-bar-track{height:16px;margin:4px 0;border-radius:4px;background:var(--wash-2);overflow:hidden}
.sig-w .sig-bar-fill{height:100%;border-radius:4px;transition:width .6s var(--ease,ease)}
.sig-w .sig-bar-fill.is-claim{background:repeating-linear-gradient(135deg,var(--wait) 0 1.5px,var(--wait-tint) 1.5px 4.5px);box-shadow:inset 0 0 0 1.5px var(--wait)}
.sig-w .sig-bar-fill.is-recorded{background:var(--ink)}
.sig-w .sig-bar-fill.is-loss{background:var(--loss)}
.sig-w .sig-bar-note{font-size:13px;color:var(--muted)}
.sig-w .sig-bar-row.is-hidden{opacity:.3}
@keyframes sig-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (max-width:560px){.sig-w .sig-bridge-row{grid-template-columns:minmax(0,1fr) 4.2em}.sig-w .sig-bridge-row .sig-bridge-bar{grid-column:1 / -1;grid-row:2}}
@media (prefers-reduced-motion:reduce){.sig-w *,.sig-w{transition-duration:.001ms !important;animation-duration:.001ms !important}}
`;
