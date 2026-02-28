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
import { Info, ChevronDown, ChevronUp } from "lucide-react";
import "reactflow/dist/style.css";
import { useStore } from "../store/useStore";

export function GraphView() {
    const [showHelp, setShowHelp] = useState(true);
    const { docs, docTags, current, loadDoc, settings } = useStore();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    const isDark = settings.theme === "dark";
    const isSolarized = settings.theme === "solarized";

    useEffect(() => {
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        const radius = Math.max(200, docs.length * 30);
        const angleStep = (Math.PI * 2) / Math.max(1, docs.length);

        const nodeBg = isDark ? "#2a2d33" : isSolarized ? "#EEE8D5" : "#ffffff";
        const nodeBorder = isDark ? "#569cd6" : isSolarized ? "#268BD2" : "#2563eb";
        const nodeText = isDark ? "#cccccc" : isSolarized ? "#073642" : "#1d4ed8";
        const edgeColor = isDark ? "#569cd6" : isSolarized ? "#268BD2" : "#93c5fd";

        docs.forEach((doc, i) => {
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

            const tagsA = docTags[doc.id] || [];
            docs.forEach((otherDoc) => {
                if (doc.id !== otherDoc.id) {
                    const tagsB = docTags[otherDoc.id] || [];
                    const commonTags = tagsA.filter((t) => tagsB.includes(t));
                    if (commonTags.length > 0) {
                        const edgeId = `e-${doc.id}-${otherDoc.id}`;
                        const reverseEdgeId = `e-${otherDoc.id}-${doc.id}`;
                        if (!newEdges.find((e) => e.id === edgeId || e.id === reverseEdgeId)) {
                            newEdges.push({
                                id: edgeId,
                                source: doc.id,
                                target: otherDoc.id,
                                animated: true,
                                style: { stroke: edgeColor },
                            });
                        }
                    }
                }
            });
        });

        setNodes(newNodes);
        setEdges(newEdges);
    }, [docs, docTags, current, setNodes, setEdges, isDark, isSolarized]);

    const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
        loadDoc(node.id);
    }, [loadDoc]);

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
                            <p>같은 태그를 가진 문서끼리 선으로 연결됩니다. 문서에 태그를 추가하면 관련 문서와 연결됩니다.</p>
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
