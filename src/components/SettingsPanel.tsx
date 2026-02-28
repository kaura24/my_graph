import { useEffect } from "react";
import { useStore } from "../store/useStore";
import type { AppSettings } from "../store/useStore";

export function SettingsPanel() {
    const { settings, updateSettings, aiStatus, loadAIStatus } = useStore();

    useEffect(() => {
        void loadAIStatus();
    }, [loadAIStatus]);

    const themes: { value: AppSettings["theme"]; label: string }[] = [
        { value: "dark", label: "Dark" },
        { value: "light", label: "Light" },
        { value: "solarized", label: "Solarized" },
    ];

    return (
        <div className="side-panel">
            <div className="side-panel__header">
                <span>설정</span>
            </div>

            <div className="side-panel__body settings-panel">
                {/* Theme */}
                <div className="settings-group">
                    <div className="settings-group__title">테마</div>
                    {themes.map((t) => (
                        <div
                            key={t.value}
                            className="settings-row"
                            style={{ cursor: "pointer" }}
                            onClick={() => updateSettings({ theme: t.value })}
                        >
                            <span className="settings-row__label">{t.label}</span>
                            <span style={{ fontSize: "var(--font-size-l)" }}>
                                {settings.theme === t.value ? "●" : "○"}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Font Size */}
                <div className="settings-group">
                    <div className="settings-group__title">글꼴 크기</div>
                    <div className="settings-row">
                        <span className="settings-row__label">{settings.fontSize}px</span>
                        <input
                            type="range"
                            min={10}
                            max={20}
                            step={1}
                            value={settings.fontSize}
                            onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
                        />
                    </div>
                </div>

                {/* AI 연결 상태 */}
                <div className="settings-group">
                    <div className="settings-group__title">AI 연결 상태</div>
                    <div className="settings-row" style={{ alignItems: "center", gap: 8 }}>
                        <span
                            className={`ai-status-dot ${aiStatus?.available ? "connected" : "disconnected"}`}
                            title={aiStatus?.available ? `연결됨 (${aiStatus.activeModel})` : "연결 안 됨"}
                        />
                        <span className="settings-row__label">
                            {aiStatus?.available
                                ? `OpenAI 연결됨 (${aiStatus.activeModel})`
                                : aiStatus?.hasKey
                                  ? aiStatus.activeModel
                                    ? `연결 실패 (모델: ${aiStatus.activeModel})`
                                    : "연결 실패"
                                  : aiStatus === null
                                    ? "확인 중…"
                                    : "API 키 미설정"}
                        </span>
                    </div>
                </div>

                {/* Accent color */}
                <div className="settings-group">
                    <div className="settings-group__title">강조 색상</div>
                    <div className="settings-row">
                        <span className="settings-row__label">{settings.accentColor}</span>
                        <input
                            type="color"
                            value={settings.accentColor}
                            onChange={(e) => updateSettings({ accentColor: e.target.value })}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
