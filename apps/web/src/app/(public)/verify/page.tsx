"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Spin, Typography } from "antd";
import styles from "@/styles/public-pages.module.css";
import DiplomaVerificationResult from "@/components/DiplomaVerificationResult";
import type { DiplomaVerification } from "@/lib/public-verification";

const { Text } = Typography;

function VerifyContent() {
  const searchParams = useSearchParams();
  const shareToken = searchParams.get("share");
  const [loading, setLoading] = useState(Boolean(shareToken));
  const [verification, setVerification] = useState<DiplomaVerification | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!shareToken) {
      setLoading(false);
      return;
    }
    let disposed = false;
    void (async () => {
      try {
        const response = await fetch("/api/shares/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: shareToken }),
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok || !data.success)
          throw new Error(
            data.error || data.message || "Liên kết không còn hiệu lực.",
          );
        if (!disposed) setVerification(data);
      } catch (error) {
        if (!disposed)
          setErrorMsg(
            error instanceof Error
              ? error.message
              : "Không thể xác thực văn bằng từ liên kết này.",
          );
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [shareToken]);

  return (
    <div className={styles.content}>
      <section className={styles.introduction} aria-labelledby="verify-title">
        <h1 id="verify-title">Xác thực văn bằng được chia sẻ</h1>
        <p>
          Chỉ liên kết do sinh viên chia sẻ mới có quyền xem kết quả xác thực.
        </p>
      </section>
      <div className={styles.panel}>
        {!shareToken && (
          <Alert
            showIcon
            type="info"
            title="Xác thực public đã được tắt"
            description="Vui lòng yêu cầu sinh viên gửi liên kết chia sẻ riêng hoặc đăng nhập tài khoản sinh viên để tạo liên kết."
          />
        )}
        {shareToken && (
          <Spin spinning={loading} description="Đang xác thực văn bằng...">
            {verification && (
              <DiplomaVerificationResult verification={verification} />
            )}
            {errorMsg && (
              <Alert
                showIcon
                type="error"
                title="Liên kết xác thực không hợp lệ"
                description={errorMsg}
              />
            )}
            {!loading && !verification && !errorMsg && (
              <Text type="secondary">Không có dữ liệu xác thực.</Text>
            )}
          </Spin>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center" role="status">
          Đang tải...
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
