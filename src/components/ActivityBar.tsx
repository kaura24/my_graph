import { useStore, type PanelView } from "../store/useStore";

const icons: { id: PanelView; icon: string; label: string }[] = [
    { id: "explorer", icon: "📁", label: "탐색기" },
    { id: "search", icon: "🔍", label: "검색" },
    { id: "tags", icon: "🏷️", label: "태그" },
    { id: "graph", icon: "📊", label: "그래프" },
];

const bottomIcons: { id: PanelView; icon: string; label: string }[] = [
    { id: "settings", icon: "⚙️", label: "설정" },
];

export function ActivityBar() {
    const { activePanel, setActivePanel } = useStore();

    return (
        <div className="activity-bar">
            <div className="activity-bar__top">
                {icons.map(({ id, icon, label }) => (
                    <button
                        key={id}
                        className={`activity-bar__icon ${activePanel === id ? "active" : ""}`}
                        onClick={() => setActivePanel(activePanel === id ? activePanel : id)}
                        title={label}
                    >
                        {icon}
                    </button>
                ))}
            </div>
            <div className="activity-bar__bottom">
                {bottomIcons.map(({ id, icon, label }) => (
                    <button
                        key={id}
                        className={`activity-bar__icon ${activePanel === id ? "active" : ""}`}
                        onClick={() => setActivePanel(id)}
                        title={label}
                    >
                        {icon}
                    </button>
                ))}
            </div>
        </div>
    );
}
