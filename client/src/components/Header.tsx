import type { SyncStatus, PrScope } from "@orbita-prs/shared";
import { RocketIcon } from "./icons.js";

interface HeaderProps {
  syncStatus?: SyncStatus;
  lastSyncAt?: string;
  currentUser: string;
  scope:       PrScope;
  onScopeChange: (s: PrScope) => void;
  onSync: () => void;
}

const STATUS_COLOR: Record<SyncStatus, string> = {
  ok:       "#34D399",
  syncing:  "#FBBF24",
  degraded: "#FB7185",
  error:    "#EF4444",
};

const STATUS_LABEL: Record<SyncStatus, string> = {
  ok:       "GitHub conectado",
  syncing:  "sincronizando…",
  degraded: "degradado",
  error:    "erro de conexão",
};

function formatSync(iso?: string): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function Header({
  syncStatus = "ok",
  lastSyncAt,
  currentUser,
  scope,
  onScopeChange,
  onSync,
}: HeaderProps) {
  const dotColor = STATUS_COLOR[syncStatus];
  const label    = STATUS_LABEL[syncStatus];
  const displayUser = currentUser || "demo";
  const initial = displayUser.charAt(0).toUpperCase();

  return (
    <div className="w-full flex flex-row gap-0 justify-between items-center relative z-10">
      {/* ── Brand ── */}
      <div className="flex flex-row gap-3 items-center">
        <div
          className="w-[42px] h-[42px] flex items-center justify-center rounded-[13px] shrink-0"
          style={{ background: "linear-gradient(-135deg, #8B5CF6 14.645%, #EC4899 57.071%, #22D3EE 85.355%)" }}
        >
          <RocketIcon className="w-6 h-6" fill="#FFFFFF" />
        </div>
        <div className="flex flex-col gap-[1px]">
          <div className="text-[18px] text-[#EDF2FF] font-funnel font-bold tracking-[0.2px] whitespace-nowrap">
            Órbita de PRs
          </div>
          <div className="text-[10.5px] text-[#7481B2] font-mono tracking-[0.6px] whitespace-nowrap">
            sua central de evolução de pull requests
          </div>
        </div>
      </div>

      {/* ── Scope toggle (Minhas PRs / Toda a empresa) ── */}
      <div className="flex flex-row gap-1 p-1 bg-[#0E1739] rounded-[999px] outline outline-1 outline-[#23305F] -outline-offset-[0.5px]">
        {(["mine", "org"] as PrScope[]).map((s) => (
          <button
            key={s}
            onClick={() => onScopeChange(s)}
            className={`px-3 py-1.5 rounded-[999px] text-[11px] font-mono transition-colors whitespace-nowrap ${
              scope === s
                ? "bg-[#1E2D5C] text-[#EDF2FF] font-semibold"
                : "text-[#7481B2] hover:text-[#A7B3DE]"
            }`}
          >
            {s === "mine" ? "Minhas PRs" : "Toda a empresa"}
          </button>
        ))}
      </div>

      {/* ── Sync pill ── */}
      <button
        onClick={onSync}
        className="flex flex-row gap-2 p-[7px_14px] items-center bg-[#0E1739] rounded-[999px] outline outline-1 outline-[#23305F] -outline-offset-[0.5px] hover:bg-[#14224A] transition-colors"
      >
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${syncStatus === "ok" ? "pulse" : ""}`}
          style={{ backgroundColor: dotColor }}
        />
        <span className="text-[11px] text-[#A7B3DE] font-mono whitespace-nowrap">
          {label} · sync {formatSync(lastSyncAt)}
        </span>
      </button>

      {/* ── User ── */}
      <div className="flex flex-row gap-2.5 items-center">
        <span className="text-[13px] text-[#EDF2FF] font-sans font-semibold whitespace-nowrap">
          {displayUser}
        </span>
        <div className="w-9 h-9 flex items-center justify-center bg-[#18214A] rounded-full outline outline-2 outline-[#22D3EE] -outline-offset-1 shrink-0">
          <span className="text-[14px] text-[#A5F3FC] font-funnel font-bold">{initial}</span>
        </div>
      </div>
    </div>
  );
}
