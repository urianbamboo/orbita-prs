import { useState, useEffect, useCallback } from "react";
import type { Pr, Stage, PrScope } from "@orbita-prs/shared";
import { useOrbitState, useForcSync } from "./hooks/useOrbitState.js";
import Header from "./components/Header.js";
import Scoreboard from "./components/Scoreboard.js";
import StageColumn from "./components/StageColumn.js";
import DetailBar from "./components/DetailBar.js";
import PeopleStrip from "./components/PeopleStrip.js";
import { AdsClickIcon } from "./components/icons.js";

const STAGES: Stage[] = ["nova", "obra", "review", "aguardando_voce", "merge", "entregues"];

const EMPTY_COUNTS = {
  nova: 0, obra: 0, review: 0, aguardando_voce: 0, merge: 0, entregues: 0,
} as Record<Stage, number>;

function prKey(pr: Pr): string {
  return `${pr.owner}/${pr.repoKey}/${pr.number}`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex flex-row gap-2.5 w-full">
      {STAGES.map((s) => (
        <div
          key={s}
          className="flex-1 min-w-0 h-[348px] rounded-[14px] bg-[#0A112B] outline outline-1 outline-[#23305F] -outline-offset-[0.5px] animate-pulse"
        />
      ))}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [scope,      setScope]      = useState<PrScope>("mine");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useOrbitState(scope);
  const forceSync = useForcSync();

  // Esc closes detail bar
  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setSelectedId(null);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [handleEsc]);

  // Clear selection when scope changes
  useEffect(() => {
    setSelectedId(null);
  }, [scope]);

  const prs       = data?.prs       ?? [];
  const repos     = data?.repos      ?? [];
  const people    = data?.people     ?? [];
  const counts    = data?.counts     ?? EMPTY_COUNTS;
  const entreguesCounts = data?.entreguesCounts ?? { last7d: 0, week: 0 };
  const currentUser = data?.currentUser ?? "";
  const selectedPr: Pr | null = selectedId
    ? (prs.find((pr) => prKey(pr) === selectedId) ?? null)
    : null;

  const prsByStage = (stage: Stage) => prs.filter((pr) => pr.stage === stage);

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: "linear-gradient(0deg, #070B1C 0%, #0B1128 55%, #0D1430 100%)" }}
    >
      {/* Glow effects */}
      <div
        className="fixed w-[820px] h-[720px] left-[-260px] top-[-260px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(ellipse 50% 50% at 50% 50%, #7C3AED55 0%, #7C3AED00 100%)", zIndex: 0 }}
      />
      <div
        className="fixed w-[760px] h-[560px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(ellipse 50% 50% at 50% 50%, #0891B244 0%, #0891B200 100%)", right: "-200px", bottom: "-200px", zIndex: 0 }}
      />

      <div className="relative z-10 flex flex-col gap-[14px] p-[22px] max-w-[1520px] mx-auto">
        {/* ── Top bar ── */}
        <Header
          syncStatus={data?.syncStatus}
          lastSyncAt={data?.lastSyncAt}
          currentUser={currentUser}
          scope={scope}
          onScopeChange={setScope}
          onSync={() => forceSync.mutate()}
        />

        {/* ── Page header ── */}
        <div className="w-full flex flex-row justify-between items-end">
          <div className="flex flex-col gap-[5px] flex-1">
            <h1 className="text-[34px] text-[#EDF2FF] font-funnel font-extrabold tracking-[-0.4px]">
              {scope === "mine" ? "Pra onde vai cada PR sua?" : "Todas as PRs abertas na empresa"}
            </h1>
            <p className="text-[13.5px] leading-5 text-[#A7B3DE] font-sans">
              {scope === "mine"
                ? "As pull requests que você abriu nos repos monitorados — onde cada uma está no processo, quem está trabalhando nela e o que está travado agora."
                : "Todas as pull requests abertas nos repositórios da organização, por estágio de evolução."}
            </p>
          </div>
          <div className="flex flex-row gap-2.5 items-center shrink-0 ml-4">
            <span className="text-[11px] text-[#7481B2] font-mono whitespace-nowrap">
              {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
            </span>
          </div>
        </div>

        {/* ── Scoreboard ── */}
        <Scoreboard counts={counts} entreguesCounts={entreguesCounts} />

        {/* ── Pipeline panel ── */}
        <div className="w-full min-w-0 flex flex-col gap-[14px] p-[16px_16px_12px_16px] bg-[#0E1636] rounded-[20px] outline outline-1 outline-[#23305F] -outline-offset-[0.5px] overflow-hidden">
          {/* Panel header */}
          <div className="w-full min-w-0 flex flex-row justify-between items-center gap-3">
            <div className="flex flex-col gap-[2px] min-w-0 shrink">
              <span className="text-[17px] text-[#EDF2FF] font-funnel font-bold whitespace-nowrap">
                Pista de evolução das PRs
              </span>
              <span className="text-[10.5px] text-[#7481B2] font-mono tracking-[0.2px] whitespace-nowrap">
                cada cartão é uma PR — acompanhe até o merge
              </span>
            </div>
            {/* Repo legend */}
            <div className="flex flex-row gap-2 items-center min-w-0 flex-wrap justify-end">
              {repos.slice(0, 4).map((repo) => (
                <div
                  key={repo.key}
                  className="flex flex-row gap-1.5 p-[6px_9px] items-center bg-[#101A40] rounded-full outline outline-1 outline-[#23305F] -outline-offset-[0.5px] max-w-[180px]"
                >
                  <div className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: repo.color }} />
                  <span className="text-[10px] text-[#A7B3DE] font-mono truncate" title={repo.name}>{repo.name}</span>
                  <span className="text-[10px] font-mono whitespace-nowrap shrink-0" style={{ color: repo.color }}>
                    {prs.filter((p) => p.repoKey === repo.key && p.stage !== "entregues").length}
                  </span>
                </div>
              ))}
              <div className="flex flex-row gap-1.5 p-[7px_11px] items-center bg-[#101A40] rounded-full outline outline-1 outline-[#36437F] -outline-offset-[0.5px] shrink-0">
                <AdsClickIcon className="w-3.5 h-3.5" fill="#22D3EE" />
                <span className="text-[10.5px] text-[#BEE6F5] font-mono whitespace-nowrap">
                  passe o mouse → quem está nela · clique → ficha
                </span>
              </div>
            </div>
          </div>

          {/* Station columns */}
          {isLoading && !data ? (
            <Skeleton />
          ) : isError && !data ? (
            <ErrorBanner message={(error as Error).message} onRetry={() => void refetch()} />
          ) : prs.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="w-full flex flex-col gap-2">
              {isError && (
                <div className="flex flex-row gap-2 items-center justify-between px-1">
                  <span className="text-[10px] text-[#FBBF24] font-mono">
                    Falha ao atualizar ({(error as Error).message}) — mostrando última carga
                    {isFetching ? " · tentando de novo…" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="text-[10px] text-[#A7B3DE] font-mono underline hover:text-[#EDF2FF]"
                  >
                    tentar de novo
                  </button>
                </div>
              )}
              <div className="w-full min-w-0 flex flex-row gap-2">
                {STAGES.map((stage) => (
                  <StageColumn
                    key={stage}
                    stage={stage}
                    prs={prsByStage(stage)}
                    repos={repos}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Detail bar */}
          <DetailBar pr={selectedPr} repos={repos} />
        </div>

        {/* ── People strip ── */}
        <PeopleStrip
          people={people}
          prs={prs}
          lastSyncAt={data?.lastSyncAt}
          currentUser={currentUser}
        />

        <footer className="w-full flex flex-row justify-end pt-1 relative z-10">
          <a
            href="https://github.com/urianbamboo/orbita-prs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#5B6A9A] font-mono hover:text-[#7481B2] transition-colors"
          >
            by Urian
          </a>
        </footer>
      </div>
    </div>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="w-full flex flex-col gap-3 items-center justify-center py-12">
      <span className="text-[#FB7185] font-mono text-sm">Erro ao carregar dados do servidor</span>
      <span className="text-[#7481B2] font-mono text-xs">{message}</span>
      <button
        onClick={onRetry}
        className="mt-2 px-4 py-2 rounded-[9px] bg-[#131D47] text-[#A7B3DE] text-xs font-sans font-semibold hover:bg-[#1A2855] transition-colors outline outline-1 outline-[#36437F]"
      >
        Tentar novamente
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="w-full flex flex-col gap-2 items-center justify-center py-16">
      <span className="text-3xl">🎉</span>
      <span className="text-[#EDF2FF] font-funnel font-bold text-lg">Nenhuma PR sua no ar</span>
      <span className="text-[#7481B2] font-mono text-sm">Todas as PRs foram mergeadas ou não há repos configurados</span>
    </div>
  );
}
