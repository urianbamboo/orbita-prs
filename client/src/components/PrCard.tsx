import { useEffect, useState } from "react";
import type { Pr } from "@orbita-prs/shared";
import { TaskAltIcon } from "./icons.js";

interface PrCardProps {
  pr:         Pr;
  repoColor:  string;
  selected:   boolean;
  onClick:    () => void;
}

const STATUS_DOT: Record<string, string> = {
  busy: "#34D399",
  wait: "#FBBF24",
  you:  "#FBBF24",
  idle: "#4C5A90",
  done: "#60A5FA",
};

function formatInStageAge(iso: string, nowMs: number): string {
  const ms = Math.max(0, nowMs - new Date(iso).getTime());
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)  return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(ms / 86_400_000);
  return `${days} d`;
}

export default function PrCard({ pr, repoColor, selected, onClick }: PrCardProps) {
  const [hovered, setHovered] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isDone  = pr.stage === "entregues";
  const dotColor = STATUS_DOT[pr.status] ?? "#4C5A90";
  const stageSince = pr.stageSince ?? pr.updatedAt;

  useEffect(() => {
    if (isDone) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [isDone]);

  const outlineStyle = selected
    ? { outline: "1.5px solid #34D399", outlineOffset: "-0.75px" }
    : { outline: "1px solid #23305F",  outlineOffset: "-0.5px"  };

  return (
    <div
      className="w-full flex flex-col gap-[5px] p-[10px] rounded-[11px] cursor-pointer relative transition-all"
      style={{ background: "#131D47", ...outlineStyle }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* ── Repo row ── */}
      <div className="w-full min-w-0 flex flex-row justify-between items-center gap-1">
        <div className="flex flex-row gap-[5px] items-center min-w-0">
          <div className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: repoColor }} />
          <span className="text-[9.5px] font-mono tracking-[0.5px] truncate" style={{ color: repoColor }} title={pr.repoKey}>
            {pr.repoKey}
          </span>
        </div>
        {isDone ? (
          <div className="flex flex-row gap-1 items-center shrink-0">
            <span className="text-[12px] text-[#93A1CF] font-mono font-semibold whitespace-nowrap">
              #{pr.number}
            </span>
            <TaskAltIcon className="w-[15px] h-[15px] shrink-0" fill="#60A5FA" />
          </div>
        ) : (
          <span className="text-[12px] text-[#EAF0FF] font-mono font-semibold whitespace-nowrap shrink-0">
            #{pr.number}
          </span>
        )}
      </div>

      {/* ── Title ── */}
      <div
        className={`text-[12.5px] leading-4 font-funnel font-semibold line-clamp-3 break-words ${isDone ? "text-[#93A1CF]" : "text-[#EDF2FF]"}`}
      >
        {pr.title}
      </div>

      {/* ── Status row ── */}
      <div className="w-full min-w-0 flex flex-row justify-between items-center gap-1">
        <div className="flex-1 min-w-0 flex flex-row gap-[5px] items-center">
          {!isDone && (
            <div
              className={`w-[6px] h-[6px] rounded-full shrink-0 ${pr.status === "busy" || pr.shepherd?.activity === "adjusting" ? "pulse" : ""}`}
              style={{ backgroundColor: dotColor }}
            />
          )}
          <span className="text-[9px] text-[#9AA9D6] font-mono flex-1 min-w-0 truncate">{pr.statusLabel}</span>
          {pr.shepherd && pr.shepherd.activity === "adjusting" && (
            <span className="text-[8px] font-mono shrink-0" style={{ color: "#A78BFA" }}>✦</span>
          )}
        </div>
        {pr.pct !== undefined && !isDone && (
          <span className="text-[9px] font-mono whitespace-nowrap shrink-0" style={{ color: dotColor }}>
            {pr.pct}%
          </span>
        )}
      </div>

      {/* ── Time in current stage (skip entregues) ── */}
      {!isDone && (
        <div className="w-full min-w-0 flex flex-row justify-between items-center gap-1 pt-[2px]">
          <span className="text-[8.5px] text-[#5B6A9A] font-mono truncate">neste status</span>
          <span
            className="text-[8.5px] font-mono whitespace-nowrap shrink-0"
            style={{ color: "#7481B2" }}
            title={new Date(stageSince).toLocaleString("pt-BR")}
          >
            há {formatInStageAge(stageSince, nowMs)}
          </span>
        </div>
      )}

      {/* ── Hover overlay: who's on it ── */}
      {hovered && !isDone && (pr.assignees.length > 0 || pr.reviewers.length > 0) && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[#0B1230] rounded-[10px] p-2.5 flex flex-col gap-1.5 w-full outline outline-1 outline-[#36437F] -outline-offset-[0.5px]">
          {pr.assignees.map((p) => (
            <div key={p.login} className="flex flex-row gap-2 items-center">
              <Avatar name={p.name} color="#A78BFA" />
              <span className="text-[10px] text-[#EDF2FF] font-sans">{p.name} <span className="text-[#7481B2]">· editando</span></span>
            </div>
          ))}
          {pr.reviewers.map(({ person, state }) => (
            <div key={person.login} className="flex flex-row gap-2 items-center">
              <Avatar name={person.name} color={state === "approved" ? "#34D399" : state === "changes" ? "#FBBF24" : "#A7B3DE"} />
              <span className="text-[10px] text-[#EDF2FF] font-sans">
                {person.name} <span className="text-[#7481B2]">· {state === "approved" ? "aprovado" : state === "changes" ? "pediu mudanças" : "revisando"}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-funnel font-bold"
      style={{ outline: `1.5px solid ${color}`, outlineOffset: "-0.75px", background: "#18214A", color }}
    >
      {initial}
    </div>
  );
}
