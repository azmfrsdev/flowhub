import { cn } from "cn";
import type { CompanionState } from "@/lib/companion/state";

/**
 * The sticker dog (PRD FR-DOG-1, ADR-0023 D1): the logo's dog in full body,
 * with a white edge, a hard ink shadow and a yellow bandana. Drawn in parts so
 * CSS can pose it (`.fh-dog` in globals.css); `state` picks the pose and props.
 * Decorative: whatever sits next to it carries the meaning.
 */

const EAR_L = "M41 32 C27 27 15 37 17 52 C18 61 28 64 33 56 C37 49 39 41 41 32 Z";
const EAR_R = "M79 32 C93 27 105 37 103 52 C102 61 92 64 87 56 C83 49 81 41 79 32 Z";
const BODY = "M35 113 C33 92 42 70 60 70 C78 70 87 92 85 113 Z";
const TAIL = "M83 105 q13 0 13 -11 q0 -6 -6 -6";

export function StickerDog({ state, className }: { state: CompanionState; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" data-state={state} className={cn("fh-dog", className)}>
      <g className="fh-dog-whole">
        <g className="fh-dog-sticker">
          <g className="fh-dog-edge" strokeWidth={12} strokeLinejoin="round" strokeLinecap="round">
            <path d={BODY} />
            <path d={EAR_L} />
            <path d={EAR_R} />
            <ellipse cx={60} cy={47} rx={27} ry={23} />
            <path d={TAIL} fill="none" strokeWidth={20} />
          </g>
          <g className="fh-dog-tail">
            <path d={TAIL} fill="none" className="fh-dog-ink-stroke" strokeWidth={13} strokeLinecap="round" />
            <path d={TAIL} fill="none" className="fh-dog-white-stroke" strokeWidth={7} strokeLinecap="round" />
          </g>
          <path d={BODY} className="fh-dog-fill" strokeWidth={3} strokeLinejoin="round" />
          <path d="M50 113 v-10 M70 113 v-10" className="fh-dog-ink-stroke" strokeWidth={2.5} strokeLinecap="round" />
          <path d="M43 67 Q60 73 77 67 L60 82 Z" className="fh-dog-bandana" strokeWidth={2.4} strokeLinejoin="round" />
          <g className="fh-dog-head">
            <path d={EAR_L} className="fh-dog-fill fh-dog-ear-l" strokeWidth={3} strokeLinejoin="round" />
            <path d={EAR_R} className="fh-dog-fill fh-dog-ear-r" strokeWidth={3} strokeLinejoin="round" />
            <ellipse cx={60} cy={47} rx={27} ry={23} className="fh-dog-fill" strokeWidth={3} />
            <g className="fh-dog-blush">
              <ellipse cx={45} cy={55} rx={4} ry={2.4} />
              <ellipse cx={75} cy={55} rx={4} ry={2.4} />
            </g>
            <g className="fh-dog-eyes-open">
              <g className="fh-dog-pupils">
                <circle cx={51} cy={45} r={3.4} className="fh-dog-ink" />
                <circle cx={69} cy={45} r={3.4} className="fh-dog-ink" />
                <circle cx={52.2} cy={43.8} r={1} className="fh-dog-white" />
                <circle cx={70.2} cy={43.8} r={1} className="fh-dog-white" />
              </g>
            </g>
            <g className="fh-dog-eyes-closed fh-dog-ink-stroke" fill="none" strokeWidth={2.4} strokeLinecap="round">
              <path d="M47 46 q4 3 8 0" />
              <path d="M65 46 q4 3 8 0" />
            </g>
            <g className="fh-dog-brows fh-dog-ink-stroke" fill="none" strokeWidth={2.4} strokeLinecap="round">
              <path d="M46 39 L55 36" />
              <path d="M74 39 L65 36" />
            </g>
            <ellipse cx={60} cy={52.5} rx={3.8} ry={2.8} className="fh-dog-ink" />
            <path d="M55 56.5 q5 4.5 10 0" className="fh-dog-mouth-smile fh-dog-ink-stroke" fill="none" strokeWidth={2.4} strokeLinecap="round" />
            <path d="M55.5 59 q4.5 -2 9 0" className="fh-dog-mouth-flat fh-dog-ink-stroke" fill="none" strokeWidth={2.4} strokeLinecap="round" />
            <g className="fh-dog-mouth-open">
              <path d="M53.5 56.5 q6.5 9 13 0 z" className="fh-dog-ink" />
              <path d="M57 60.5 q3 2.6 6 0" className="fh-dog-tongue" />
            </g>
          </g>
        </g>
      </g>
      <g className="fh-dog-prop fh-dog-zzz" fontFamily="var(--font-heading), cursive">
        <text x={86} y={26} fontSize={15}>
          z
        </text>
        <text x={97} y={15} fontSize={19}>
          Z
        </text>
      </g>
      <g className="fh-dog-prop fh-dog-glass">
        <circle cx={98} cy={32} r={10} className="fh-dog-lens" strokeWidth={3.5} />
        <path d="M91 40 L82 50" className="fh-dog-ink-stroke" strokeWidth={5} strokeLinecap="round" />
        <path d="M94 28 q3 -3 7 -1" className="fh-dog-ink-stroke" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      </g>
      <g className="fh-dog-prop fh-dog-calc">
        <rect x={89} y={72} width={22} height={28} rx={4} className="fh-dog-fill" strokeWidth={3} />
        <rect x={93} y={76} width={14} height={6} rx={1.5} className="fh-dog-ink" />
        <g className="fh-dog-ink">
          <circle cx={95} cy={87} r={1.6} />
          <circle cx={100} cy={87} r={1.6} />
          <circle cx={105} cy={87} r={1.6} />
          <circle cx={95} cy={93} r={1.6} />
          <circle cx={100} cy={93} r={1.6} />
          <circle cx={105} cy={93} r={1.6} />
        </g>
      </g>
      <g className="fh-dog-prop fh-dog-bang">
        <circle cx={99} cy={19} r={11} className="fh-dog-bandana" strokeWidth={3} />
        <path d="M99 12 v8" className="fh-dog-ink-stroke" strokeWidth={3.6} strokeLinecap="round" />
        <circle cx={99} cy={25} r={2} className="fh-dog-ink" />
      </g>
      <g className="fh-dog-prop fh-dog-flag">
        <path d="M97 20 V68" className="fh-dog-ink-stroke" strokeWidth={3} strokeLinecap="round" />
        <path d="M98 21 L115 28 L98 36 Z" className="fh-dog-cloth" strokeWidth={2.4} strokeLinejoin="round" />
      </g>
      <g className="fh-dog-prop fh-dog-spark" strokeWidth={2} strokeLinejoin="round">
        <path d="M98 10 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 z" className="fh-dog-bandana" />
        <path d="M18 18 l2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2 z" className="fh-dog-bandana" />
      </g>
      <g className="fh-dog-prop fh-dog-drop">
        <path d="M88 26 q4 6 0 9 q-4 -3 0 -9 z" className="fh-dog-water" strokeWidth={2} />
      </g>
    </svg>
  );
}
