import type { QuickAssistProps } from "@/features/scenes/components/draftRunner/panels/assistTypes";

export function QuickAssistPanel(props: QuickAssistProps) {
  const {
    ghostSuggestionReady,
    museV2Enabled,
    prefs,
    settingsOpen,
    setSettingsOpen,
    setPrefs,
    ghostCooldownSec,
    ghostIdleCountdownSec,
    ghostRunning,
    isSceneLocked,
    pullGhostSuggestion,
    ghostMode,
    ghostBullets,
    ghostText,
    acceptGhost,
    dismissGhost,
  } = props;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {ghostSuggestionReady ? <span className="status-pill status-pill--other">1 suggestion ready</span> : null}
          <span className="muted">{museV2Enabled ? "v2" : "v1"}</span>
          <span className="muted">{prefs.ghostEnabled ? "ON" : "OFF"}</span>
        </div>
        <button type="button" className="shell-link px-2 py-1 text-xs" onClick={() => setSettingsOpen((v) => !v)}>
          Settings
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {ghostCooldownSec > 0 ? <span className="muted">Cooldown {ghostCooldownSec}s</span> : null}
        {ghostCooldownSec <= 0 && ghostIdleCountdownSec ? (
          <span className="muted">Auto suggest in {ghostIdleCountdownSec}s</span>
        ) : null}
        <button
          type="button"
          className="shell-link ml-auto px-2 py-1 disabled:opacity-40"
          disabled={!prefs.ghostEnabled || ghostRunning || isSceneLocked}
          onClick={() => pullGhostSuggestion("bullets").catch(() => undefined)}
        >
          {ghostRunning ? "Generating..." : "Generate"}
        </button>
      </div>
      <div className="shell-control max-h-[260px] min-h-[120px] overflow-auto p-3 text-sm leading-6">
        {ghostMode === "bullets" ? (
          ghostBullets.length > 0 ? (
            <ul className="list-disc space-y-2 pl-5">
              {ghostBullets.map((bullet, idx) => (
                <li key={`muse-bullet-${idx}`} className="break-words whitespace-pre-wrap">
                  {bullet}
                </li>
              ))}
            </ul>
          ) : ghostText.trim() ? (
            <div className="break-words whitespace-pre-wrap">{ghostText}</div>
          ) : (
            <div className="whitespace-pre-wrap">No suggestion yet.</div>
          )
        ) : (
          <div className="break-words whitespace-pre-wrap">{ghostText || "No suggestion yet."}</div>
        )}
      </div>
      <div className="mt-2 flex gap-2 text-xs">
        <button type="button" className="shell-link px-2 py-1 disabled:opacity-40" disabled={!ghostSuggestionReady} onClick={acceptGhost}>
          Accept
        </button>
        <button type="button" className="shell-link px-2 py-1 disabled:opacity-40" disabled={!ghostSuggestionReady} onClick={dismissGhost}>
          Dismiss
        </button>
        <button
          type="button"
          className="shell-link px-2 py-1 disabled:opacity-40"
          disabled={!prefs.ghostEnabled || ghostRunning}
          onClick={() => pullGhostSuggestion("block").catch(() => undefined)}
        >
          Expand
        </button>
      </div>

      {settingsOpen ? (
        <div className="surface-card mt-2 grid gap-2 p-2 text-xs md:grid-cols-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={prefs.ghostEnabled} onChange={(e) => setPrefs((p) => ({ ...p, ghostEnabled: e.target.checked }))} />
            Ghost enabled
          </label>
          <label className="grid gap-1">
            <span>Ghost idle sec</span>
            <input type="number" className="shell-control px-2 py-1" value={prefs.ghostIdleSec} min={15} max={300} onChange={(e) => setPrefs((p) => ({ ...p, ghostIdleSec: Number(e.target.value || 60) }))} />
          </label>
          <label className="grid gap-1">
            <span>Muse temperature</span>
            <input type="number" className="shell-control px-2 py-1" value={prefs.museTemperature} min={0.1} max={1.8} step={0.05} onChange={(e) => setPrefs((p) => ({ ...p, museTemperature: Number(e.target.value || 0.92) }))} />
          </label>
          <label className="grid gap-1">
            <span>Editor font size</span>
            <input type="number" className="shell-control px-2 py-1" value={prefs.editorFontSize} min={13} max={24} onChange={(e) => setPrefs((p) => ({ ...p, editorFontSize: Number(e.target.value || 16) }))} />
          </label>
        </div>
      ) : null}
    </div>
  );
}
