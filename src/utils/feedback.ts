export type FeedbackKind = "success" | "error" | "info";

export type FeedbackPayload = {
  id: string;
  kind: FeedbackKind;
  message: string;
  durationMs?: number;
};

export const FEEDBACK_EVENT = "mygraph:feedback";

function emit(kind: FeedbackKind, message: string, durationMs?: number) {
  if (typeof window === "undefined") return;
  const payload: FeedbackPayload = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    message,
    durationMs,
  };
  window.dispatchEvent(new CustomEvent<FeedbackPayload>(FEEDBACK_EVENT, { detail: payload }));
}

export const feedback = {
  success: (message: string, durationMs = 2200) => emit("success", message, durationMs),
  error: (message: string, durationMs = 3200) => emit("error", message, durationMs),
  info: (message: string, durationMs = 2200) => emit("info", message, durationMs),
};

