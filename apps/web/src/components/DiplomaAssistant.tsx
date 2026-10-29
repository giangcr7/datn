"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Drawer, Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import {
  CommentOutlined,
  BulbOutlined,
  DeleteOutlined,
  DownOutlined,
  SendOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  canAccessWorkspacePath,
  type WorkspaceUser,
} from "@/lib/workspace-access";
import {
  assistantEvent,
  type AssistantAnswer,
  type AssistantContext,
} from "@/lib/diploma-assistant";
import styles from "./DiplomaAssistant.module.css";

type ChatEntry =
  | { id: number; role: "user"; question: string }
  | { id: number; role: "assistant"; result: AssistantAnswer };

export default function DiplomaAssistant() {
  const { data: session, status } = useSession();
  const user = (session as { error?: string } | null)?.error
    ? undefined
    : (session?.user as WorkspaceUser | undefined);
  const staff =
    status === "authenticated" &&
    !user?.mustChangePassword &&
    canAccessWorkspacePath(user, "/import");
  const identity = status + ":" + (user?.id || "public") + ":" + staff;
  const [open, setOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState<AssistantContext>();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const input = useRef<TextAreaRef>(null);
  const bottom = useRef<HTMLDivElement>(null);

  function cancel() {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    setLoading(false);
  }

  function reset() {
    cancel();
    setEntries([]);
    setSuggestionsOpen(false);
    setContext(undefined);
    setQuestion("");
    setError("");
  }

  useEffect(() => {
    sequence.current++;
    controller.current?.abort();
    setEntries([]);
    setSuggestionsOpen(false);
    setContext(undefined);
    setQuestion("");
    setError("");
    setLoading(false);
  }, [identity]);

  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const onExplain = (event: Event) => {
      if (!staff || !(event instanceof CustomEvent)) return;
      const detail = event.detail as AssistantContext | undefined;
      if (detail?.type !== "registry-issues" || !Array.isArray(detail.codes))
        return;
      const codes = [
        ...new Set(
          detail.codes.filter(
            (code) =>
              typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code),
          ),
        ),
      ].slice(0, 8);
      if (!codes.length) return;
      sequence.current++;
      controller.current?.abort();
      setLoading(false);
      setError("");
      setSuggestionsOpen(false);
      setContext({ type: "registry-issues", codes });
      setQuestion(
        "Giải thích các lỗi kiểm tra dữ liệu đã chọn và hướng dẫn xử lý.",
      );
      setOpen(true);
    };
    window.addEventListener(assistantEvent, onExplain);
    return () => window.removeEventListener(assistantEvent, onExplain);
  }, [staff]);

  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [entries, loading, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentQuestion = question.trim();
    if (
      !currentQuestion ||
      currentQuestion.length > 800 ||
      loading ||
      (controller.current && !controller.current.signal.aborted)
    )
      return;
    cancel();
    const requestId = sequence.current;
    const activeController = new AbortController();
    controller.current = activeController;
    setLoading(true);
    setSuggestionsOpen(false);
    setError("");
    setEntries((current) => [
      ...current.slice(-6),
      { id: requestId, role: "user", question: currentQuestion },
    ]);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion,
          ...(context ? { context } : {}),
        }),
        signal: activeController.signal,
        cache: "no-store",
      });
      const result = await response.json();
      if (sequence.current !== requestId || activeController.signal.aborted)
        return;
      if (!response.ok || !result.success)
        throw new Error(
          result.error || "Trợ lý chưa thể trả lời. Vui lòng thử lại.",
        );
      setEntries((current) => [
        ...current,
        { id: requestId + 0.5, role: "assistant", result },
      ]);
      setQuestion("");
      setContext(undefined);
    } catch (failure) {
      if (sequence.current !== requestId || activeController.signal.aborted)
        return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Không thể kết nối trợ lý. Vui lòng thử lại.",
      );
    } finally {
      if (sequence.current === requestId) {
        controller.current = null;
        setLoading(false);
      }
    }
  }

  const suggestions = [
    "Tra cứu cần nhập những gì?",
    "Xác thực PDF và mã QR như thế nào?",
    "Đăng nhập và tải PDF ở đâu?",
    ...(staff
      ? ["Ngành chưa được ánh xạ là gì?", "Hướng dẫn kiểm tra dữ liệu hồ sơ"]
      : []),
  ];

  return (
    <>
      <Button
        type="primary"
        icon={<CommentOutlined />}
        className={styles.launcher}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Mở Trợ lý văn bằng"
        onClick={() => setOpen(true)}
      >
        Trợ lý văn bằng
      </Button>
      <Drawer
        title="Trợ lý văn bằng"
        open={open}
        size="min(460px, 100vw)"
        onClose={() => {
          cancel();
          setOpen(false);
        }}
        afterOpenChange={(visible) => {
          if (visible) input.current?.focus();
        }}
        styles={{ body: { padding: 0 } }}
        extra={
          <Button
            type="text"
            icon={<DeleteOutlined />}
            aria-label="Xóa nội dung chat"
            title="Xóa nội dung chat"
            onClick={reset}
          />
        }
      >
        <div className={styles.panel}>
          <div className={styles.notice}>
            <strong>Hướng dẫn sử dụng và giải thích lỗi hồ sơ</strong>
            <details>
              <summary>Quyền riêng tư</summary>
              <p>
                Nội dung chat chỉ giữ tạm trên trang, không lưu vào hồ sơ. AI
                bên ngoài chỉ nhận hướng dẫn nội bộ được chọn, không nhận nguyên
                văn câu hỏi, tài khoản hay dữ liệu văn bằng.
              </p>
            </details>
          </div>
          <div
            className={styles.messages}
            role="log"
            aria-label="Nội dung trao đổi"
            aria-live="polite"
            aria-relevant="additions"
          >
            {!entries.length && (
              <section
                className={styles.suggestions}
                aria-label="Gợi ý câu hỏi"
              >
                <p>Anh/chị cần hỗ trợ nội dung nào?</p>
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    block
                    disabled={loading}
                    onClick={() => {
                      setQuestion(suggestion);
                      setContext(undefined);
                      input.current?.focus();
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </section>
            )}
            {entries.map((entry) => (
              <article
                key={entry.id}
                className={
                  entry.role === "user" ? styles.question : styles.answer
                }
              >
                <strong>
                  {entry.role === "user" ? "Bạn" : "Trợ lý văn bằng"}
                </strong>
                {entry.role === "user" ? (
                  <p>{entry.question}</p>
                ) : (
                  <>
                    <span className={styles.mode}>
                      {entry.result.mode === "ai"
                        ? "AI diễn giải từ hướng dẫn nội bộ"
                        : "Hướng dẫn hệ thống · Không dùng phản hồi AI"}
                    </span>
                    <p>{entry.result.answer}</p>
                    {!!entry.result.steps.length && (
                      <ol>
                        {entry.result.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    )}
                    {!!entry.result.sources.length && (
                      <nav
                        aria-label="Chức năng và hướng dẫn liên quan"
                        className={styles.sources}
                      >
                        {entry.result.sources.map((source) => (
                          <Link
                            key={source.id}
                            href={source.href}
                            onClick={() => {
                              cancel();
                              setOpen(false);
                            }}
                          >
                            {source.title} →
                          </Link>
                        ))}
                      </nav>
                    )}
                  </>
                )}
              </article>
            ))}
            {loading && (
              <p role="status" className={styles.waiting}>
                Đang chuẩn bị hướng dẫn…
              </p>
            )}
            <div ref={bottom} />
          </div>
          <form className={styles.composer} onSubmit={submit}>
            {!!entries.length && (
              <div className={styles.followUp}>
                <Button
                  type="text"
                  htmlType="button"
                  icon={<BulbOutlined aria-hidden="true" />}
                  className={styles.suggestionToggle}
                  aria-expanded={suggestionsOpen}
                  aria-controls="diploma-assistant-suggestions"
                  onClick={() => setSuggestionsOpen((current) => !current)}
                >
                  Gợi ý câu hỏi
                  {suggestionsOpen ? (
                    <UpOutlined aria-hidden="true" />
                  ) : (
                    <DownOutlined aria-hidden="true" />
                  )}
                </Button>
                <section
                  id="diploma-assistant-suggestions"
                  className={styles.followUpQuestions}
                  aria-label="Gợi ý câu hỏi tiếp theo"
                  hidden={!suggestionsOpen}
                >
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      htmlType="button"
                      disabled={loading}
                      onClick={() => {
                        setQuestion(suggestion);
                        setContext(undefined);
                        setSuggestionsOpen(false);
                        input.current?.focus({ cursor: "end" });
                      }}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </section>
              </div>
            )}
            {context && (
              <div className={styles.context}>
                Đã chọn {context.codes.length} mã lỗi, không kèm dữ liệu hồ sơ.
                <Button
                  type="link"
                  size="small"
                  onClick={() => setContext(undefined)}
                >
                  Bỏ chọn
                </Button>
              </div>
            )}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <label htmlFor="diploma-assistant-question">
              Câu hỏi của anh/chị
            </label>
            <Input.TextArea
              id="diploma-assistant-question"
              ref={input}
              value={question}
              maxLength={800}
              showCount
              autoSize={{ minRows: 2, maxRows: 5 }}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key !== "Enter" ||
                  event.shiftKey ||
                  event.ctrlKey ||
                  event.altKey ||
                  event.metaKey ||
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229
                )
                  return;
                event.preventDefault();
                if (!event.repeat && !loading)
                  event.currentTarget.form?.requestSubmit();
              }}
              placeholder="Ví dụ: Tra cứu văn bằng cần nhập những gì?"
              disabled={loading}
            />
            <div className={styles.actions}>
              <span>Enter để gửi · Shift+Enter để xuống dòng</span>
              {loading ? (
                <Button onClick={cancel}>Dừng trả lời</Button>
              ) : (
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SendOutlined />}
                  disabled={!question.trim()}
                >
                  Gửi câu hỏi
                </Button>
              )}
            </div>
          </form>
        </div>
      </Drawer>
    </>
  );
}
