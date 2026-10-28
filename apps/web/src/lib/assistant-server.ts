import "server-only";
import { createHash } from "node:crypto";
import {
  assistantGuides,
  normalizeAssistantText,
  selectAssistantGuides,
  type AssistantGuide,
} from "./assistant-knowledge";
import type { AssistantAnswer, AssistantQuestion } from "./diploma-assistant";

export class AssistantRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export interface AssistantConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  dailyLimit: number;
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum
    ? number
    : fallback;
}

export function assistantConfig(
  env: NodeJS.ProcessEnv = process.env,
): AssistantConfig {
  const enabled = env.AI_ASSISTANT_ENABLED === "true";
  const baseUrl = (env.AI_BASE_URL || "").replace(/\/+$/, "");
  if (enabled) {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new Error("Invalid assistant configuration");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !env.AI_API_KEY ||
      !env.AI_MODEL
    )
      throw new Error("Invalid assistant configuration");
  }
  return {
    enabled,
    baseUrl,
    model: env.AI_MODEL || "",
    apiKey: env.AI_API_KEY || "",
    timeoutMs: integer(env.AI_TIMEOUT_MS, 25000, 1000, 45000),
    dailyLimit: integer(env.AI_DAILY_REQUEST_LIMIT, 100, 1, 1000),
  };
}

export async function readBoundedJson(
  request: Pick<Request, "body" | "headers">,
  maximum = 4096,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maximum)
    throw new AssistantRequestError(
      413,
      "Nội dung quá dài. Vui lòng rút gọn câu hỏi.",
    );
  if (!request.body)
    throw new AssistantRequestError(400, "Vui lòng nhập câu hỏi.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum)
        throw new AssistantRequestError(
          413,
          "Nội dung quá dài. Vui lòng rút gọn câu hỏi.",
        );
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new AssistantRequestError(400, "Nội dung câu hỏi không hợp lệ.");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function validateAssistantQuestion(value: unknown): AssistantQuestion {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AssistantRequestError(400, "Câu hỏi không hợp lệ.");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !["question", "context"].includes(key)) ||
    typeof input.question !== "string" ||
    !input.question.trim() ||
    input.question.trim().length > 800 ||
    Array.from(input.question).some(
      (character) =>
        character.charCodeAt(0) < 32 && !"\t\n\r".includes(character),
    )
  )
    throw new AssistantRequestError(
      400,
      "Vui lòng nhập câu hỏi từ 1 đến 800 ký tự.",
    );
  if (input.context === undefined) return { question: input.question.trim() };
  if (
    !input.context ||
    typeof input.context !== "object" ||
    Array.isArray(input.context)
  )
    throw new AssistantRequestError(
      400,
      "Ngữ cảnh giải thích lỗi không hợp lệ.",
    );
  const context = input.context as Record<string, unknown>;
  if (
    Object.keys(context).some((key) => !["type", "codes"].includes(key)) ||
    context.type !== "registry-issues" ||
    !Array.isArray(context.codes) ||
    !context.codes.length ||
    context.codes.length > 8 ||
    context.codes.some(
      (code) =>
        typeof code !== "string" || !/^[A-Z][A-Z0-9_]{0,63}$/.test(code),
    )
  )
    throw new AssistantRequestError(
      400,
      "Chỉ gửi mã lỗi kiểm tra dữ liệu, không gửi thông tin hồ sơ.",
    );
  return {
    question: input.question.trim(),
    context: {
      type: "registry-issues",
      codes: [...new Set(context.codes as string[])],
    },
  };
}

export function checkAssistantOrigin(request: Request, siteUrl?: string) {
  let expected: string;
  try {
    expected = new URL(siteUrl || request.url).origin;
  } catch {
    throw new AssistantRequestError(403, "Yêu cầu không hợp lệ.");
  }
  if (
    request.headers.get("origin") !== expected ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AssistantRequestError(
      403,
      "Vui lòng mở trợ lý từ trang của nhà trường.",
    );
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new AssistantRequestError(415, "Định dạng câu hỏi không hợp lệ.");
}

type Limits = {
  day: number;
  used: number;
  active: number;
  buckets: Map<string, { resetAt: number; count: number }>;
};
const shared = globalThis as typeof globalThis & {
  diplomaAssistantLimits?: Limits;
};
const limits = (shared.diplomaAssistantLimits ||= {
  day: 0,
  used: 0,
  active: 0,
  buckets: new Map(),
});

export function createAssistantLimiter(state: Limits = limits) {
  return (
    identity: string | undefined,
    dailyLimit: number,
    now = Date.now(),
  ) => {
    const day = Math.floor(now / 86400000);
    if (state.day !== day) {
      state.day = day;
      state.used = 0;
    }
    for (const [key, bucket] of state.buckets)
      if (bucket.resetAt <= now) state.buckets.delete(key);
    const key = identity
      ? createHash("sha256").update(identity).digest("hex")
      : "public";
    const previous = state.buckets.get(key);
    if (state.used >= dailyLimit)
      throw new AssistantRequestError(
        429,
        "Trợ lý đã đạt giới hạn lượt hỏi trong ngày. Vui lòng dùng các chức năng chính hoặc thử lại ngày sau.",
        Math.ceil(((day + 1) * 86400000 - now) / 1000),
      );
    if (state.active >= 2)
      throw new AssistantRequestError(
        429,
        "Trợ lý đang bận. Vui lòng thử lại sau.",
        10,
      );
    if (previous && previous.count >= (identity ? 10 : 5))
      throw new AssistantRequestError(
        429,
        "Bạn đã gửi nhiều câu hỏi. Vui lòng chờ ít phút rồi thử lại.",
        Math.ceil((previous.resetAt - now) / 1000),
      );
    if (!previous && state.buckets.size >= 2000)
      throw new AssistantRequestError(
        429,
        "Trợ lý đang bận. Vui lòng thử lại sau.",
        60,
      );
    state.buckets.set(key, {
      count: (previous?.count || 0) + 1,
      resetAt: previous?.resetAt || now + 600000,
    });
    state.used++;
    state.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        state.active--;
      }
    };
  };
}

export const reserveAssistantRequest = createAssistantLimiter();

function guideAnswer(guides: AssistantGuide[]): AssistantAnswer {
  return {
    answer: guides.map((guide) => guide.body).join("\n\n"),
    steps: [...new Set(guides.flatMap((guide) => guide.steps))].slice(0, 7),
    sources: guides.map(({ id, title, href }) => ({ id, title, href })),
    mode: "guide",
  };
}

export async function answerDiplomaQuestion(
  input: AssistantQuestion,
  staff: boolean,
  config: AssistantConfig,
  signal?: AbortSignal,
  providerFetch: typeof fetch = fetch,
): Promise<AssistantAnswer> {
  const guides = selectAssistantGuides(
    input.question,
    input.context?.codes || [],
    staff,
  );
  if (!guides.length) {
    return {
      answer: staff
        ? "Em hỗ trợ hướng dẫn sử dụng, quy trình văn bằng và giải thích lỗi kiểm tra dữ liệu. Anh/chị vui lòng hỏi cụ thể về một chức năng. Trợ lý không truy cập hồ sơ cá nhân và không thực hiện thay thao tác nghiệp vụ."
        : "Trợ lý hỗ trợ hướng dẫn tra cứu, xác thực PDF/QR và đăng nhập tài khoản. Vui lòng hỏi về một trong các nội dung này. Các chức năng xử lý hồ sơ chỉ dành cho cán bộ được phân quyền; trợ lý không tra cứu thông tin cá nhân.",
      steps: [],
      sources: assistantGuides
        .filter((guide) => !guide.staffOnly)
        .map(({ id, title, href }) => ({ id, title, href })),
      mode: "guide",
    };
  }
  const fallback = guideAnswer(guides);
  if (!config.enabled) return fallback;
  try {
    const response = await providerFetch(config.baseUrl + "/chat/completions", {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + config.apiKey,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.any([
        AbortSignal.timeout(config.timeoutMs),
        ...(signal ? [signal] : []),
      ]),
      body: JSON.stringify({
        model: config.model,
        stream: false,
        store: false,
        max_completion_tokens: 1600,
        messages: [
          {
            role: "system",
            content:
              "Bạn là Trợ lý văn bằng của Trường Đại học Thủy Lợi. Chỉ giải thích hướng dẫn nội bộ được cung cấp, trả lời tiếng Việt ngắn gọn 2-4 câu. Không tạo dữ kiện, không khẳng định đã kiểm tra hay đã thực hiện việc gì. Không kết luận văn bằng cụ thể hợp lệ, thật/giả, đã phát hành; không cam kết giá trị pháp lý. Không yêu cầu thông tin cá nhân, mật khẩu hay OTP. Không tạo URL, không markdown, không công cụ, không trả lời kiến thức ngoài hướng dẫn. Các bước và liên kết sẽ do hệ thống hiển thị riêng. Nếu hướng dẫn không đủ, nói rõ cần cán bộ kiểm tra.",
          },
          {
            role: "user",
            content: JSON.stringify({
              questions: guides.map((guide) => guide.question),
              guidance: guides.map((guide) => ({
                title: guide.title,
                content: guide.body,
              })),
            }),
          },
        ],
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return fallback;
    }
    const payload = (await readBoundedJson(response, 32768)) as {
      choices?: { message?: { content?: unknown }; finish_reason?: string }[];
    };
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    if (
      typeof content !== "string" ||
      !content.trim() ||
      content.length > 5000 ||
      choice?.finish_reason === "length" ||
      /https?:\/\/|sk-[a-zA-Z0-9_-]{12,}|<\/?[a-z][^>]*>/i.test(content)
    )
      return fallback;
    const normalized = normalizeAssistantText(content);
    if (
      content.includes(config.apiKey) ||
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(content) ||
      /(?:van bang|bang (?:nay|cua ban|cua anh|cua chi)).{0,45}(?:hoan toan hop le|la hop le|la that|la gia|da duoc phat hanh|da phat hanh|da ky|da thu hoi)/.test(
        normalized,
      ) ||
      /\b(?:toi|em|tro ly)\b.{0,25}\bda\b.{0,20}\b(?:duyet|xoa|ky|phat hanh|thu hoi|cap nhat)\b/.test(
        normalized,
      )
    )
      return fallback;
    return { ...fallback, answer: content.trim(), mode: "ai" };
  } catch {
    return fallback;
  }
}
