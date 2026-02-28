import { useStore } from "../store/useStore";
import type { AppSettings } from "../store/useStore";

export function SettingsPanel() {
    const { settings, updateSettings } = useStore();

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

                {/* 자동 태그 */}
                <div className="settings-group">
                    <div className="settings-group__title">자동 태그</div>
                    <div
                        className="settings-row"
                        style={{ cursor: "pointer" }}
                        onClick={() => updateSettings({ autoTagFromHashtags: !settings.autoTagFromHashtags })}
                    >
                        <span className="settings-row__label">본문 #해시태그 자동 추출</span>
                        <span style={{ fontSize: "var(--font-size-l)" }}>
                            {settings.autoTagFromHashtags ? "●" : "○"}
                        </span>
                    </div>
                    <div style={{ padding: "0 0 8px", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                        문서에 #python #작업 등 해시태그를 쓰면 저장 시 자동으로 태그로 추가됩니다.
                    </div>
                </div>
            </div>
        </div>
    );
}
