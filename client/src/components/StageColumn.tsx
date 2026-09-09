import { useState } from "react";
import type { Pr, Repo, Stage } from "@orbita-prs/shared";
import {
  RocketIcon,
  ConstructionIcon,
  VisibilityIcon,
  FeedbackIcon,
  MergeTypeIcon,
  TaskAltIcon,
  ContentCopyIcon,
} from "./icons.js";
import PrCard from "./PrCard.js";

interface StageColumnProps {
  stage:      Stage;
  prs:        Pr[];
  repos:      Repo[];
  selectedId: string | null;
  onSelect:   (id: string | null) => void;
}

const STAGE_CONFIG: Record<Stage, { label: string; sub: string; color: string; Icon: React.FC<{ className?: string; fill?: string }> }> = {
  nova:          { label: "Recém-abertas",   sub: "abertas por você · sem dono",  color: "#22D3EE", Icon: RocketIcon       },
  obra:          { label: "Em obra",         sub: "alguém trabalhando agora",     color: "#A78BFA", Icon: ConstructionIcon  },
  review:        { label: "Em review",       sub: "aguardando revisão",           color: "#34D399", Icon: VisibilityIcon    },
  aguardando_voce: { label: "Aguardando você", sub: "sua ação destrava",          color: "#FBBF24", Icon: FeedbackIcon      },
  merge:         { label: "Prontas pra merge", sub: "aprovadas · falta mergear",  color: "#F472B6", Icon: MergeTypeIcon     },
  entregues:     { label: "Entregues",       sub: "mergeadas nos últimos dias",   color: "#60A5FA", Icon: TaskAltIcon       },
};

function prId(pr: Pr) {
  return `${pr.owner}/${pr.repoKey}/${pr.number}`;
}

function formatColumnClipboard(prs: Pr[]): string {
  return prs.map((pr) => `${pr.repoKey} #${pr.number}`).join("\n");
}

export default function StageColumn({ stage, prs, repos, selectedId, onSelect }: StageColumnProps) {
  const cfg = STAGE_CONFIG[stage];
  const repoMap = Object.fromEntries(repos.map((r) => [r.key, r]));
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    if (prs.length === 0) return;
    const text = formatColumnClipboard(prs);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  }

  return (
    <div className="flex-1 min-w-0 h-[348px] flex flex-col gap-[9px] p-[10px] bg-[#0A112B] rounded-[14px] outline outline-1 outline-[#23305F] -outline-offset-[0.5px] overflow-hidden">
      {/* ── Column header ── */}
      <div className="w-full flex flex-row gap-2 items-center shrink-0 min-w-0">
        <div className="w-[26px] h-[26px] flex items-center justify-center bg-black rounded-[8px] shrink-0">
          <cfg.Icon className="w-[15px] h-[15px]" fill={cfg.color} />
        </div>
        <div className="flex flex-col gap-0 flex-1 min-w-0">
          <span className="text-[12px] text-[#EDF2FF] font-funnel font-bold truncate" title={cfg.label}>{cfg.label}</span>
          <span className="text-[8px] text-[#7481B2] font-mono tracking-[0.2px] truncate" title={cfg.sub}>{cfg.sub}</span>
        </div>
        <button
          type="button"
          onClick={(e) => void handleCopy(e)}
          disabled={prs.length === 0}
          title={prs.length === 0 ? "coluna vazia" : `copiar ${prs.length} PR${prs.length === 1 ? "" : "s"}`}
          aria-label={`Copiar PRs de ${cfg.label}`}
          className="w-[26px] h-[26px] flex items-center justify-center rounded-[8px] shrink-0 outline outline-1 -outline-offset-[0.5px] transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:bg-[#131D47]"
          style={{
            outlineColor: copied ? cfg.color : "#23305F",
            background: copied ? "#000000" : "transparent",
          }}
        >
          {copied ? (
            <span className="text-[9px] font-mono font-bold" style={{ color: cfg.color }}>ok</span>
          ) : (
            <ContentCopyIcon className="w-[13px] h-[13px]" fill="#7481B2" />
          )}
        </button>
      </div>

      {/* ── PR cards ── */}
      <div className="flex-1 min-h-0 overflow-y-auto station-scroll flex flex-col gap-[9px] pr-0.5">
        {prs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[10px] text-[#4C5A90] font-mono">vazia</span>
          </div>
        ) : (
          prs.map((pr) => {
            const id = prId(pr);
            return (
              <PrCard
                key={id}
                pr={pr}
                repoColor={repoMap[pr.repoKey]?.color ?? "#A7B3DE"}
                selected={selectedId === id}
                onClick={() => onSelect(selectedId === id ? null : id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
