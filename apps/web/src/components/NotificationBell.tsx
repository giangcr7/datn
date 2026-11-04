"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  Drawer,
  Empty,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import { BellOutlined, ReloadOutlined } from "@ant-design/icons";
import { workdeskFetch } from "@/lib/change-requests";

interface WorkNotification {
  key: string;
  title: string;
  count: number;
  fingerprint: string;
  href: string;
  read: boolean;
  severity: "info" | "warning" | "error";
}
interface WorkInbox {
  items: WorkNotification[];
  unread: number;
  totalTasks: number;
  generatedAt: string;
}

export default function NotificationBell({
  inverse = false,
}: {
  inverse?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<WorkInbox>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const sequence = useRef(0);
  const marking = useRef(false);
  const load = useCallback(async () => {
    if (marking.current) return;
    const current = ++sequence.current;
    setLoading(true);
    try {
      const data = await workdeskFetch<WorkInbox>("/api/inbox");
      if (current === sequence.current) {
        setInbox(data);
        setError("");
      }
    } catch (failure) {
      if (current === sequence.current) setError((failure as Error).message);
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, []);
  const invalidate = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      invalidate();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load, invalidate]);

  async function read(item: WorkNotification, navigate = false) {
    if (marking.current) return;
    if (item.read && navigate) {
      setOpen(false);
      router.push(item.href);
      return;
    }
    marking.current = true;
    invalidate();
    setBusyKey(item.key);
    try {
      const next = await workdeskFetch<WorkInbox>("/api/inbox/read", {
        key: item.key,
        fingerprint: item.fingerprint,
      });
      setInbox(next);
      setError("");
      if (navigate) {
        setOpen(false);
        router.push(item.href);
      }
    } catch (failure) {
      message.error((failure as Error).message);
    } finally {
      marking.current = false;
      setBusyKey("");
      setLoading(false);
      void load();
    }
  }
  return (
    <>
      <Badge
        count={inbox?.unread || 0}
        size="small"
        offset={[-4, 4]}
        dot={!!error}
      >
        <Button
          type="text"
          aria-label="Thông báo công việc"
          title={error ? "Không tải được thông báo" : "Thông báo công việc"}
          icon={<BellOutlined aria-hidden="true" style={{ fontSize: 21 }} />}
          style={{
            color: inverse ? "#ffffff" : "var(--school-primary)",
            minWidth: 40,
          }}
          onClick={() => {
            setOpen(true);
            void load();
          }}
        />
      </Badge>
      <Drawer
        title="Thông báo công việc"
        open={open}
        onClose={() => setOpen(false)}
        size="min(480px, 100vw)"
      >
        <Space
          style={{
            width: "100%",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <Typography.Text>
            {inbox ? inbox.unread + " nhóm chưa đọc" : "Thông báo của bạn"}
          </Typography.Text>
          <Button
            icon={<ReloadOutlined aria-hidden="true" />}
            loading={loading}
            disabled={!!busyKey}
            onClick={() => void load()}
          >
            Cập nhật
          </Button>
        </Space>
        {error && (
          <Alert
            type="warning"
            showIcon
            title="Chưa cập nhật được thông báo"
            description={error}
            style={{ marginBottom: 16 }}
          />
        )}
        {!inbox && loading && (
          <Spin tip="Đang tải thông báo">
            <div style={{ minHeight: 100 }} />
          </Spin>
        )}
        {inbox && inbox.items.length === 0 && !error && (
          <Empty description="Chưa có công việc cần thông báo" />
        )}
        {inbox?.items.map((item) => (
          <Card
            key={item.key}
            size="small"
            style={{
              marginBottom: 12,
              borderInlineStart:
                "3px solid " +
                (item.read
                  ? "#cbd5e1"
                  : item.severity === "error"
                    ? "#b42318"
                    : "var(--school-gold)"),
            }}
          >
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Space wrap>
                <Tag
                  color={
                    item.read
                      ? "default"
                      : item.severity === "error"
                        ? "red"
                        : "blue"
                  }
                >
                  {item.read ? "Đã đọc" : "Chưa đọc"}
                </Tag>
                <Typography.Text strong>{item.title}</Typography.Text>
              </Space>
              <Typography.Text type="secondary">
                {item.count}{" "}
                {item.key.startsWith("blockchain-")
                  ? "giao dịch"
                  : item.key.startsWith("student-") || item.key === "requests"
                    ? "yêu cầu"
                    : "hồ sơ"}
              </Typography.Text>
              <Space wrap>
                <Button
                  size="small"
                  type="primary"
                  loading={busyKey === item.key}
                  disabled={!!busyKey && busyKey !== item.key}
                  onClick={() => void read(item, true)}
                >
                  Xem công việc
                </Button>
                {!item.read && (
                  <Button
                    size="small"
                    disabled={!!busyKey}
                    onClick={() => void read(item)}
                  >
                    Đánh dấu đã đọc
                  </Button>
                )}
              </Space>
            </Space>
          </Card>
        ))}
        {inbox && inbox.items.length > 0 && (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            Đánh dấu đã đọc không làm thay đổi trạng thái hồ sơ. Danh sách tự
            cập nhật theo tình trạng xử lý.
          </Typography.Paragraph>
        )}
      </Drawer>
    </>
  );
}
