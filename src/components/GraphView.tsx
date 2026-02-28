import { useState, useCallback, useEffect } from "react";
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    Node,
    Edge,
} from "reactflow";
import { Info, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import "reactflow/dist/style.css";
import { useStore } from "../store/useStore";
import api from "../adapters/apiAdapter";

function interpolateHex(hexA: string, hexB: string, t: number): string {
    const parse = (h: string) => {
        const n = parseInt(h.slice(1), 16);
        return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    };
    const [r1, g1, b1] = parse(hexA);
    const [r2, g2, b2] = parse(hexB);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r},${g},${b})`;
}

export function GraphView() {
    const [showHelp, setShowHelp] = useState(true);
    const [rebuildTrigger, setRebuildTrigger] = useState(0);
    const [rebuilding, setRebuilding] = useState(false);
    const [edgeCount, setEdgeCount] = useState<number | null>(null);
    const [graphLoadReason, setGraphLoadReason] = useState<string | null>(null);
    const [rebuildSummary, setRebuildSummary] = useState<string>("");
    const [engine, setEngine] = useState<"auto" | "ai" | "korean_centroid">("korean_centroid");
    const { current, loadDoc, settings } = useStore();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    const isDark = settings.theme === "dark";
    const isSolarized = settings.theme === "solarized";

    useEffect(() => {
        let cancelled = false;

        const buildGraph = async () => {
            // 그래프는 전체 문서 기준으로 표시 (폴더 필터 무시)
            const allDocs = (await api.docs.list()) ?? [];

            const newNodes: Node[] = [];

            const radius = Math.max(200, allDocs.length * 30);
            const angleStep = (Math.PI * 2) / Math.max(1, allDocs.length);

            const nodeBg = isDark ? "#2a2d33" : isSolarized ? "#EEE8D5" : "#ffffff";
            const nodeBorder = isDark ? "#569cd6" : isSolarized ? "#268BD2" : "#2563eb";
            const nodeText = isDark ? "#cccccc" : isSolarized ? "#073642" : "#1d4ed8";
            const edgeColorWeak = isDark ? "#4a6a8a" : isSolarized ? "#6b9bb8" : "#93c5fd";
            const edgeColorStrong = isDark ? "#7eb8ea" : isSolarized ? "#268BD2" : "#1d4ed8";

            allDocs.forEach((doc, i) => {
                const angle = i * angleStep;
                newNodes.push({
                    id: doc.id,
                    position: {
                        x: Math.cos(angle) * radius + radius,
                        y: Math.sin(angle) * radius + radius,
                    },
                    data: { label: (current?.id === doc.id ? current.title : null) || doc.title || doc.id },
                    style: {
                        background: nodeBg,
                        border: `1px solid ${nodeBorder}`,
                        borderRadius: "8px",
                        padding: "10px",
                        fontSize: "var(--font-size-s)",
                        color: nodeText,
                        boxShadow: isDark
                            ? "0 4px 6px -1px rgba(0,0,0,0.4)"
                            : "0 4px 6px -1px rgba(0,0,0,0.1)",
                    },
                });
            });

            // ── 3단계 선 스타일: 점선 / 가는 실선 / 굵은 실선 ──
            // 색 농도도 단계별로 확실히 다르게
            type Tier = {
                label: string; min: number; max: number;
                width: number; dash?: string;
                colorLight: string; colorDark: string;
            };
            const tiers: Tier[] = [
                {
                    label: "약함",  min: 0.0, max: 0.5,
                    width: 1.2, dash: "8 5",
                    colorLight: "#bfdbfe", colorDark: "#3b5a7a",
                },
                {
                    label: "보통", min: 0.5, max: 0.8,
                    width: 2.8,
                    colorLight: "#60a5fa", colorDark: "#5b9bd5",
                },
                {
                    label: "강함",  min: 0.8, max: 1.01,
                    width: 5.0,
                    colorLight: "#1d4ed8", colorDark: "#93c5fd",
                },
            ];
            const getTier = (w: number): Tier =>
                tiers.find((t) => w >= t.min && w < t.max) ?? tiers[tiers.length - 1];

            let nextEdges: Edge[] = [];
            let nextEdgeCount = 0;
            let nextReason: string | null = null;
            try {
                const result = await api.graph.getEdges({
                    edgeType: "tag_semantic",
                    minWeight: 0.0,
                    limit: 4000,
                });
                const docIdSet = new Set(allDocs.map((d) => d.id));
                const semanticEdges = (result?.edges ?? [])
                    .filter((e) => docIdSet.has(e.sourceDocId) && docIdSet.has(e.targetDocId))
                    .map((e) => {
                        const w = e.weight;
                        const tier = getTier(w);
                        const color = isDark ? tier.colorDark : tier.colorLight;
                        return {
                            id: `sem-${e.sourceDocId}-${e.targetDocId}`,
                            source: e.sourceDocId,
                            target: e.targetDocId,
                            animated: false,
                            label: w.toFixed(2),
                            labelStyle: { fontSize: 10, fill: isDark ? "#999" : "#555" },
                            labelBgStyle: { fill: "transparent" },
                            labelBgPadding: [2, 4] as [number, number],
                            labelBgBorderRadius: 2,
                            style: {
                                stroke: color,
                                strokeWidth: tier.width,
                                opacity: 1,
                                strokeDasharray: tier.dash ?? "none",
                            },
                            data: { weight: w },
                        };
                    });
                nextEdges = semanticEdges;
                nextEdgeCount = semanticEdges.length;
            } catch (e) {
                nextReason = `엣지 조회 실패: ${String(e)}`;
            }

            if (!cancelled) {
                setNodes(newNodes);
                setEdges(nextEdges);
                setEdgeCount(nextEdgeCount);
                setGraphLoadReason(nextReason);
            }
        };

        void buildGraph();
        return () => {
            cancelled = true;
        };
    }, [current, setNodes, setEdges, isDark, isSolarized, rebuildTrigger]);

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        loadDoc(node.id);
    }, [loadDoc]);

    const handleRebuildSemantic = useCallback(async () => {
        setRebuilding(true);
        setRebuildSummary("");
        try {
            const res = await api.graph.rebuildSemantic({ engine });
            if (res?.status === "ok") {
                const eng = res.engine ?? "unknown";
                const engineLabel = eng === "ai" ? "AI (GPT)" : eng === "korean_centroid" ? "한국어 Centroid" : eng;
                setRebuildSummary(
                    `${engineLabel} — 엣지 ${res.edgeCount ?? 0}개, 태그 ${res.tagCount ?? 0}개`
                );
            } else {
                setRebuildSummary(`실패: ${res?.reason ?? "unknown"}`);
            }
            setRebuildTrigger((t) => t + 1);
        } catch (e) {
            setRebuildSummary(`요청 실패: ${String(e)}`);
        } finally {
            setRebuilding(false);
        }
    }, [engine]);

    const bgColor = isDark ? "#1e1e1e" : isSolarized ? "#FDF6E3" : "#ffffff";

    return (
        <div className="graph-view" style={{ flex: 1, minHeight: 0, background: bgColor }}>
            <div className="graph-view__help">
                <button
                    type="button"
                    className="graph-view__help-toggle"
                    onClick={() => setShowHelp((v) => !v)}
                    title={showHelp ? "도움말 접기" : "도움말 펼치기"}
                >
                    <Info size={14} />
                    <span>그래프 도움말</span>
                    {showHelp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showHelp && (
                    <div className="graph-view__help-content">
                        <div className="graph-view__help-section">
                            <strong>연결 기준</strong>
                            <p>공통 태그 ≥1인 문서쌍만 연결됩니다. 태그는 문서 저장 시 사용자의 선택(로컬/AI)에 따라 생성되며, 그래프는 기존 태그의 연관도만 계산합니다.</p>
                            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5, fontSize: "var(--font-size-xs)" }}>
                                <strong style={{ fontSize: "var(--font-size-xs)" }}>유사도 범례</strong>
                                {[
                                    { label: "0.8–1.0  강함", w: 5.0, color: isDark ? "#93c5fd" : "#1d4ed8" },
                                    { label: "0.5–0.8  보통", w: 2.8, color: isDark ? "#5b9bd5" : "#60a5fa" },
                                    { label: "0.0–0.5  약함", w: 1.2, color: isDark ? "#3b5a7a" : "#bfdbfe", dash: "8 5" },
                                ].map((r) => (
                                    <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <svg width={52} height={14}>
                                            <line
                                                x1={0} y1={7} x2={52} y2={7}
                                                stroke={r.color}
                                                strokeWidth={r.w}
                                                strokeDasharray={r.dash ?? "none"}
                                            />
                                        </svg>
                                        <span style={{ color: "var(--text-secondary)" }}>{r.label}</span>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <select
                                    value={engine}
                                    onChange={(e) => setEngine(e.target.value as "auto" | "ai" | "korean_centroid")}
                                    disabled={rebuilding}
                                    style={{
                                        fontSize: "var(--font-size-s)",
                                        padding: "4px 8px",
                                        borderRadius: 6,
                                        border: `1px solid ${isDark ? "#555" : "#ccc"}`,
                                        background: isDark ? "#2a2d33" : "#fff",
                                        color: isDark ? "#ccc" : "#333",
                                    }}
                                >
                                    <option value="auto">자동 (AI 우선)</option>
                                    <option value="ai">AI (GPT) 유사도</option>
                                    <option value="korean_centroid">한국어 Centroid</option>
                                </select>
                                <button
                                    type="button"
                                    className="btn"
                                    style={{ fontSize: "var(--font-size-s)" }}
                                    onClick={handleRebuildSemantic}
                                    disabled={rebuilding}
                                    title="기존 태그 기반으로 문서 간 연결을 다시 계산합니다 (태그 자체는 변경하지 않음)"
                                >
                                    <RefreshCw size={14} style={{ marginRight: 4, opacity: rebuilding ? 0.5 : 1 }} />
                                    {rebuilding ? "계산 중…" : "연결 재계산"}
                                </button>
                            </div>
                            {edgeCount === 0 && (
                                <p style={{ marginTop: 8, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                                    태그 유사도 엣지가 0개입니다. 태그 저장 후 재계산 결과를 확인하세요.
                                </p>
                            )}
                            {graphLoadReason && (
                                <p style={{ marginTop: 8, fontSize: "var(--font-size-xs)", color: "var(--danger, #ef4444)" }}>
                                    {graphLoadReason}
                                </p>
                            )}
                            {rebuildSummary && (
                                <p style={{ marginTop: 8, fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                                    {rebuildSummary}
                                </p>
                            )}
                        </div>
                        <div className="graph-view__help-section">
                            <strong>메뉴</strong>
                            <ul>
                                <li><strong>좌하단</strong> — 줌 인/아웃, 화면 맞춤, 잠금</li>
                                <li><strong>우하단</strong> — 미니맵 (전체 구조 보기)</li>
                                <li><strong>노드 클릭</strong> — 해당 문서 열기</li>
                                <li><strong>드래그</strong> — 캔버스 이동, 노드 위치 조정</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>
            <div className="graph-view__canvas">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={onNodeClick}
                    fitView
                    attributionPosition="bottom-right"
                >
                    <MiniMap nodeStrokeWidth={3} zoomable pannable />
                    <Controls />
                    <Background gap={16} size={1} />
                </ReactFlow>
            </div>
        </div>
    );
}
