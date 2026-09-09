import type { Person, Pr } from "@orbita-prs/shared";
import { FeedbackIcon } from "./icons.js";

interface PeopleStripProps {
  people: Person[];
  prs:    Pr[];
  currentUser: string;
  lastSyncAt?: string;
}

const PERSON_COLORS = ["#22D3EE", "#A78BFA", "#F472B6", "#34D399", "#FBBF24", "#60A5FA"];

function personColor(idx: number): string {
  return PERSON_COLORS[idx % PERSON_COLORS.length]!;
}

function getPersonStatus(person: Person, prs: Pr[]): { label: string; color: string } | null {
  // Find a PR where this person is actively assigned or reviewing
  for (const pr of prs) {
    if (pr.stage === "entregues") continue;
    const isAssignee = pr.assignees.some((a) => a.login === person.login);
    if (isAssignee) {
      return { label: `editando #${pr.number}`, color: "#34D399" };
    }
    const review = pr.reviewers.find((r) => r.person.login === person.login);
    if (review && review.state === "pending") {
      return { label: `revisando #${pr.number}`, color: "#34D399" };
    }
  }
  return null;
}

function getPendingForUser(prs: Pr[]): number {
  return prs.filter((pr) => pr.stage === "aguardando_voce").length;
}

export default function PeopleStrip({ people, prs, currentUser, lastSyncAt }: PeopleStripProps) {
  const syncTime = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "--:--";

  const pendingMine = getPendingForUser(prs);

  return (
    <div className="w-full flex flex-col gap-3 p-[14px_16px] bg-[#0E1636] rounded-[18px] outline outline-1 outline-[#23305F] -outline-offset-[0.5px] relative z-10">
      {/* Header */}
      <div className="w-full flex flex-row justify-between items-center">
        <div className="flex flex-row gap-2 items-center">
          <span className="text-[15px] text-[#EDF2FF] font-funnel font-bold whitespace-nowrap">
            Quem está em órbita agora
          </span>
          <div className="w-[7px] h-[7px] bg-[#34D399] rounded-[4px] pulse shrink-0" />
        </div>
        <span className="text-[10px] text-[#7481B2] font-mono whitespace-nowrap">
          atualiza a cada 30 s · última: {syncTime}
        </span>
      </div>

      {/* People grid */}
      <div className="w-full flex flex-row gap-2.5">
        {/* Current user tile */}
        <div className="flex-1 flex flex-row gap-[11px] p-[10px_12px] items-center bg-[#101A40] rounded-[12px] outline outline-1 outline-[#23305F] -outline-offset-[0.5px]">
          <div className="w-10 h-10 flex items-center justify-center bg-[#13224A] rounded-full outline outline-2 outline-[#22D3EE] -outline-offset-1 shrink-0">
            <span className="text-[14px] text-[#A5F3FC] font-funnel font-bold">U</span>
          </div>
          <div className="flex-1 flex flex-col gap-[1px]">
            <span className="text-[13px] text-[#EDF2FF] font-funnel font-bold whitespace-nowrap">Você</span>
            <span className="text-[9.5px] text-[#7481B2] font-mono tracking-[0.4px] whitespace-nowrap">autor da pista</span>
          </div>
          {pendingMine > 0 && (
            <div className="flex flex-row gap-1.5 p-[7px_10px] items-center bg-black rounded-full">
              <FeedbackIcon className="w-[13px] h-[13px]" fill="#FBBF24" />
              <span className="text-[9.8px] text-[#FBBF24] font-mono whitespace-nowrap">
                {pendingMine} {pendingMine === 1 ? "ajuste seu" : "ajustes seus"} na pista
              </span>
            </div>
          )}
        </div>

        {/* Teammates */}
        {people.filter((p) => p.login !== currentUser).map((person, idx) => {
          const status = getPersonStatus(person, prs);
          const color  = personColor(idx);
          const initial = person.name.charAt(0).toUpperCase();

          return (
            <div
              key={person.login}
              className="flex-1 flex flex-row gap-[11px] p-[10px_12px] items-center bg-[#101A40] rounded-[12px] outline outline-1 outline-[#23305F] -outline-offset-[0.5px]"
            >
              <div
                className="w-10 h-10 flex items-center justify-center rounded-full shrink-0"
                style={{
                  background: `${color}18`,
                  outline: `2px solid ${color}`,
                  outlineOffset: "-1px",
                }}
              >
                <span className="text-[14px] font-funnel font-bold" style={{ color: `${color}DD` }}>
                  {initial}
                </span>
              </div>
              <div className="flex-1 flex flex-col gap-[1px] min-w-0">
                <span className="text-[13px] text-[#EDF2FF] font-funnel font-bold whitespace-nowrap">{person.name}</span>
                <span className="text-[9.5px] text-[#7481B2] font-mono tracking-[0.4px] whitespace-nowrap truncate">
                  {person.role}
                </span>
              </div>
              {status && (
                <div className="flex flex-row gap-1.5 p-[7px_10px] items-center bg-black rounded-full shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full pulse" style={{ backgroundColor: status.color }} />
                  <span className="text-[9.8px] font-mono whitespace-nowrap" style={{ color: status.color }}>
                    {status.label}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
