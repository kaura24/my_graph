import { useEffect } from "react";
import { useStore } from "../store/useStore";

export function TagSettingsPanel() {
    const { settings, updateSettings, aiStatus, loadAIStatus } = useStore();

    useEffect(() => {
        void loadAIStatus();
    }, [loadAIStatus]);

    return (
        <div className="side-panel">
            <div className="side-panel__header">
                <span>태그 설정</span>
            </div>

            <div className="side-panel__body settings-panel">
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
                                    : "연결 실패 (키 확인)"
                                  : aiStatus === null
                                    ? "확인 중…"
                                    : "API 키 미설정 (.env)"}
                        </span>
                    </div>
                </div>

                {/* 자동 태그 모드 */}
                <div className="settings-group">
                    <div className="settings-group__title">자동 태그</div>
                    <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", marginBottom: 12 }}>
                        문서 저장 시 자동 태그 추출 방식을 선택합니다.
                    </p>

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
                    <div style={{ paddingLeft: 8, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                        #python #작업 등 해시태그를 쓰면 저장 시 태그로 추가
                    </div>

                    <div style={{ marginTop: 16 }}>
                        <div className="settings-group__title" style={{ marginBottom: 8 }}>
                            추출 방식
                        </div>
                        <div className="tag-mode-selector">
                            <div
                                className={`tag-mode-option ${settings.autoTagMode === "local" ? "active" : ""}`}
                                onClick={() => updateSettings({ autoTagMode: "local" })}
                            >
                                <span className="tag-mode__label">로컬 (NLP)</span>
                                <span className="tag-mode__desc">kiwipiepy 형태소 분석</span>
                            </div>
                            <div
                                className={`tag-mode-option ${settings.autoTagMode === "ai" ? "active" : ""}`}
                                onClick={() => updateSettings({ autoTagMode: "ai" })}
                            >
                                <span className="tag-mode__label">AI (OpenAI)</span>
                                <span className="tag-mode__desc">
                                    {aiStatus?.available ? aiStatus.activeModel : "연결 필요"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
