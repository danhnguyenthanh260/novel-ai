import { useEffect } from "react";
import { DEFAULT_PREFS, WRITE_TOOLS_VISIBLE_KEY, parseJsonSafe, type Preferences } from "@/features/scenes/components/draftRunner/shared";

export function useDraftRunnerPreferenceEffects(params: {
  prefs: Preferences;
  showWriteTools: boolean;
  setPrefs: (value: Preferences) => void;
  setShowWriteTools: (value: boolean) => void;
}) {
  const { prefs, showWriteTools, setPrefs, setShowWriteTools } = params;

  useEffect(() => {
    const storedPrefs = parseJsonSafe<Partial<Preferences>>(localStorage.getItem("write_prefs:v1"), {});
    setPrefs({
      ghostEnabled: typeof storedPrefs.ghostEnabled === "boolean" ? storedPrefs.ghostEnabled : DEFAULT_PREFS.ghostEnabled,
      ghostIdleSec:
        typeof storedPrefs.ghostIdleSec === "number" && Number.isFinite(storedPrefs.ghostIdleSec)
          ? Math.max(15, Math.min(300, Math.floor(storedPrefs.ghostIdleSec)))
          : DEFAULT_PREFS.ghostIdleSec,
      museTemperature:
        typeof storedPrefs.museTemperature === "number" && Number.isFinite(storedPrefs.museTemperature)
          ? Math.max(0.1, Math.min(1.8, storedPrefs.museTemperature))
          : DEFAULT_PREFS.museTemperature,
      editorFontSize:
        typeof storedPrefs.editorFontSize === "number" && Number.isFinite(storedPrefs.editorFontSize)
          ? Math.max(13, Math.min(24, Math.floor(storedPrefs.editorFontSize)))
          : DEFAULT_PREFS.editorFontSize,
    });
  }, [setPrefs]);

  useEffect(() => {
    localStorage.setItem("write_prefs:v1", JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    const raw = localStorage.getItem(WRITE_TOOLS_VISIBLE_KEY);
    if (raw === "0") setShowWriteTools(false);
  }, [setShowWriteTools]);

  useEffect(() => {
    localStorage.setItem(WRITE_TOOLS_VISIBLE_KEY, showWriteTools ? "1" : "0");
  }, [showWriteTools]);
}
