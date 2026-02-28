"""
graph_service.py — NetworkX 기반 그래프 연산
graphAdapter.ts (graphology) 를 Python으로 이식
"""
import json
import networkx as nx
from . import db_service

_graph: nx.Graph | None = None


def init_graph() -> nx.Graph:
    global _graph
    json_str = db_service.load_latest_graph_json()
    if json_str:
        data = json.loads(json_str)
        _graph = nx.node_link_graph(data)
    else:
        _graph = nx.Graph()
    return _graph


def get_graph() -> nx.Graph:
    global _graph
    if _graph is None:
        return init_graph()
    return _graph


def add_edge(a: str, b: str, **attrs):
    g = get_graph()
    if not g.has_node(a):
        g.add_node(a)
    if not g.has_node(b):
        g.add_node(b)
    if not g.has_edge(a, b):
        g.add_edge(a, b, **attrs)


def persist_graph():
    g = get_graph()
    data = nx.node_link_data(g)
    db_service.save_graph_json(json.dumps(data, ensure_ascii=False))
