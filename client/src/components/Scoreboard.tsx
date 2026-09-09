import type { Stage, StateDto } from "@orbita-prs/shared";
import { RocketIcon, ConstructionIcon, VisibilityIcon, FeedbackIcon, MergeTypeIcon, TaskAltIcon } from "./icons.js";

interface ScoreboardProps {
  counts:          StateDto["counts"];
  entreguesCounts: StateDto["entreguesCounts"];
}

interface Tile {
  stage:   Stage;
  label:   string;
  color:   string;
  Icon:    React.FC<{ className?: string; fill?: string }>;
}

const TILES: Tile[] = [
  { stage: "nova",          label: "recém-abertas",   color: "#22D3EE", Icon: RocketIcon      },
  { stage: "obra",          label: "em obra",          color: "#A78BFA", Icon: ConstructionIcon },
  { stage: "review",        label: "em review",        color: "#34D399", Icon: VisibilityIcon   },
  { stage: "aguardando_voce", label: "esperando você", color: "#FBBF24", Icon: FeedbackIcon     },
  { stage: "merge",         label: "na fila de merge", color: "#F472B6", Icon: MergeTypeIcon    },
  { stage: "entregues",     label: "entregues",        color: "#60A5FA", Icon: TaskAltIcon   },
];

export default function Scoreboard({ counts, entreguesCounts }: ScoreboardProps) {
  return (
    <div className="w-full min-w-0 flex flex-row gap-2 relative z-10">
      {TILES.map(({ stage, label, color, Icon }) => (
        <div
          key={stage}
          className="flex-1 min-w-0 flex flex-row gap-[11px] p-[10px_13px] items-center bg-[#0E1636] rounded-[13px] outline outline-1 outline-[#23305F] -outline-offset-[0.5px] overflow-hidden"
        >
          <div className="w-[34px] h-[34px] flex items-center justify-center bg-black rounded-[9px] shrink-0">
            <Icon className="w-[19px] h-[19px]" fill={color} />
          </div>
          <div className="flex flex-col gap-0 min-w-0">
            <div className="text-[9px] text-[#7481B2] font-mono tracking-[0.9px] truncate" title={label}>
              {label}
            </div>
            {stage === "entregues" ? (
              <div className="flex flex-col gap-[2px] mt-[1px]">
                <div className="flex flex-row gap-1.5 items-baseline min-w-0">
                  <span
                    className="text-[20px] font-funnel font-extrabold tracking-[-0.4px] leading-none whitespace-nowrap"
                    style={{ color }}
                  >
                    {entreguesCounts.last7d}
                  </span>
                  <span className="text-[8px] text-[#7481B2] font-mono whitespace-nowrap">últ. 7d</span>
                </div>
                <div className="flex flex-row gap-1.5 items-baseline min-w-0">
                  <span
                    className="text-[20px] font-funnel font-extrabold tracking-[-0.4px] leading-none whitespace-nowrap"
                    style={{ color }}
                  >
                    {entreguesCounts.week}
                  </span>
                  <span
                    className="text-[8px] text-[#7481B2] font-mono whitespace-nowrap"
                    title="semana civil a partir de segunda-feira (America/Sao_Paulo)"
                  >
                    semana
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="text-[26px] font-funnel font-extrabold tracking-[-0.4px] whitespace-nowrap leading-none"
                style={{ color }}
              >
                {counts[stage] ?? 0}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
