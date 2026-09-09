import type { Pr, Repo } from "@orbita-prs/shared";
import { AdsClickIcon, ForumIcon } from "./icons.js";

interface DetailBarProps {
  pr:    Pr | null;
  repos: Repo[];
}

function Avatar({ initial, color }: { initial: string; color: string }) {
  return (
    <div
      className="w-9 h-9 flex items-center justify-center rounded-full shrink-0"
      style={{
        background: `${color}22`,
        outline: `2px solid ${color}`,
        outlineOffset: "-1px",
      }}
    >
      <span className="text-[13px] font-funnel font-bold" style={{ color: `${color}DD` }}>
        {initial}
      </span>
    </div>
  );
}

export default function DetailBar({ pr, repos }: DetailBarProps) {
  const repoMap = Object.fromEntries(repos.map((r) => [r.key, r]));

  if (!pr) {
    return (
      <div className="w-full flex flex-row gap-3 p-[10px_14px] items-center bg-[#0B1230] rounded-[13px] outline outline-1 outline-[#36437F] -outline-offset-[0.5px]">
        <div className="flex flex-row gap-1.5 p-[6px_9px] items-center bg-[#7481B21A] rounded-[8px]">
          <AdsClickIcon className="w-3.5 h-3.5" fill="#7481B2" />
          <span className="text-[10.5px] text-[#7481B2] font-mono font-semibold whitespace-nowrap">clique</span>
        </div>
        <span className="text-[11px] text-[#4C5A90] font-mono">
          clique num cartão para ver a ficha da PR — ou passe o mouse para ver quem está nela
        </span>
      </div>
    );
  }

  const repo  = repoMap[pr.repoKey];
  const color = repo?.color ?? "#A7B3DE";

  const activeParticipant = pr.assignees[0] ?? pr.reviewers[0]?.person;
  const avatarColor = pr.stage === "review" ? "#34D399" : color;

  return (
    <div className="w-full flex flex-row gap-3 p-[10px_14px] items-center bg-[#0B1230] rounded-[13px] outline outline-1 outline-[#36437F] -outline-offset-[0.5px] min-w-0">
      {/* Selected badge */}
      <div
        className="flex flex-row gap-1.5 p-[6px_9px] items-center rounded-[8px] shrink-0"
        style={{ background: "#34D39918", outline: "1px solid #34D399", outlineOffset: "-0.5px" }}
      >
        <AdsClickIcon className="w-3.5 h-3.5" fill="#34D399" />
        <span className="text-[10.5px] text-[#34D399] font-mono font-semibold whitespace-nowrap">#{pr.number}</span>
      </div>

      {/* Active participant avatar */}
      {activeParticipant && (
        <Avatar
          initial={activeParticipant.name.charAt(0).toUpperCase()}
          color={avatarColor}
        />
      )}

      {/* Main info */}
      <div className="flex-1 flex flex-col gap-[3px] min-w-0">
        <div className="text-[13px] text-[#EDF2FF] font-funnel font-bold whitespace-nowrap truncate">
          {pr.repoKey} · {pr.title}
        </div>
        <div className="text-[9.5px] text-[#7481B2] font-mono whitespace-nowrap">
          {pr.statusLabel} · branch {pr.branch} · base {pr.base} · {pr.commits} commits
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-row gap-2.5 items-center shrink-0">
        {/* Shepherd badge (when an agent is actively working this PR) */}
        {pr.shepherd && (
          <div
            className="flex flex-row gap-1.5 p-[6px_10px] items-center rounded-[8px] shrink-0"
            style={{ background: "#A78BFA18", outline: "1px solid #A78BFA", outlineOffset: "-0.5px" }}
            title={pr.shepherd.detailUrl ? `Ver: ${pr.shepherd.detailUrl}` : pr.shepherd.label}
          >
            <span className="text-[9px] font-mono" style={{ color: "#A78BFA" }}>
              ✦ {pr.shepherd.agent.displayName}
            </span>
          </div>
        )}

        {/* View conversation */}
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="flex flex-row gap-1.5 p-[9px_13px] items-center bg-[#131D47] rounded-[9px] outline outline-1 outline-[#36437F] -outline-offset-[0.5px] hover:bg-[#1A2855] transition-colors"
        >
          <ForumIcon className="w-[15px] h-[15px]" fill="#A7B3DE" />
          <span className="text-[12px] text-[#A7B3DE] font-sans font-semibold whitespace-nowrap">
            conversa · {pr.comments}
          </span>
        </a>
      </div>
    </div>
  );
}
