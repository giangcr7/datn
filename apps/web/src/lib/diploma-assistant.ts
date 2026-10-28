export interface AssistantContext {
  type: "registry-issues";
  codes: string[];
}

export interface AssistantSource {
  id: string;
  title: string;
  href: string;
}

export interface AssistantAnswer {
  answer: string;
  steps: string[];
  sources: AssistantSource[];
  mode: "ai" | "guide";
}

export interface AssistantQuestion {
  question: string;
  context?: AssistantContext;
}

export const assistantEvent = "diplomachain:assistant";

export function openRegistryAssistant(codes: string[]) {
  window.dispatchEvent(
    new CustomEvent(assistantEvent, {
      detail: {
        type: "registry-issues",
        codes: [...new Set(codes)].slice(0, 8),
      },
    }),
  );
}
