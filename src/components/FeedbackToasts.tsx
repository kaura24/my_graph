import { useEffect, useState } from "react";
import { FEEDBACK_EVENT, type FeedbackPayload } from "../utils/feedback";

type ToastItem = Required<FeedbackPayload>;

export function FeedbackToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onFeedback = (ev: Event) => {
      const detail = (ev as CustomEvent<FeedbackPayload>).detail;
      if (!detail?.id) return;
      const item: ToastItem = {
        ...detail,
        durationMs: detail.durationMs ?? 2200,
      };
      setItems((prev) => [...prev, item]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, item.durationMs);
    };
    window.addEventListener(FEEDBACK_EVENT, onFeedback);
    return () => window.removeEventListener(FEEDBACK_EVENT, onFeedback);
  }, []);

  return (
    <div className="feedback-toasts" aria-live="polite" aria-atomic="true">
      {items.map((item) => (
        <div key={item.id} className={`feedback-toast feedback-toast--${item.kind}`}>
          {item.message}
        </div>
      ))}
    </div>
  );
}

