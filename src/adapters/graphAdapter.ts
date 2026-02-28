/**
 * graphAdapter.ts — Graphology 그래프 어댑터
 * 현재 미사용 (추후 그래프 연산 시 사용)
 */

import Graph from "graphology";

let graph: any = null;

export function initGraph() {
    graph = new Graph();
    return graph;
}

export function addEdge(a: string, b: string, attrs = {}) {
    if (!graph) initGraph();
    if (!graph.hasNode(a)) graph.addNode(a, {});
    if (!graph.hasNode(b)) graph.addNode(b, {});
    if (!graph.hasEdge(a, b)) graph.addEdge(a, b, attrs);
}

export function persistGraph() {
    if (!graph) return;
    const json = graph.export();
    // 향후 서버 측 저장 구현
    console.log("Graph persisted:", json);
}
