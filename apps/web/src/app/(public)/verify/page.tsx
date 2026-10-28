"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Alert, Button, Spin, Tabs, Typography, Upload, message } from "antd";
import { CameraOutlined, InboxOutlined } from "@ant-design/icons";
import type { IScannerControls } from "@zxing/browser";
import DiplomaVerificationResult from "@/components/DiplomaVerificationResult";
import {
  parseDiplomaQr,
  type DiplomaVerification,
} from "@/lib/public-verification";

const { Title, Text } = Typography;
const { Dragger } = Upload;

function VerifyContent() {
  const searchParams = useSearchParams();
  const proofFromUrl = searchParams.get("proof");
  const [activeTab, setActiveTab] = useState("pdf");
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verification, setVerification] = useState<DiplomaVerification | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const executeVerification = useCallback(
    async (payload: Record<string, unknown>) => {
      setLoading(true);
      setErrorMsg("");
      setVerification(null);
      try {
        const response = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok || !data.success)
          throw new Error(
            data.error || data.message || "Không xác thực được văn bằng.",
          );
        setVerification(data);
      } catch (error) {
        setErrorMsg(
          error instanceof Error
            ? error.message
            : "Không thể kết nối dịch vụ xác thực. Vui lòng thử lại.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!proofFromUrl) return;
    const payload = parseDiplomaQr(proofFromUrl);
    if (!payload) {
      setErrorMsg(
        "Liên kết xác thực không hợp lệ. Vui lòng quét lại mã QR trên văn bằng.",
      );
      return;
    }
    void executeVerification(payload);
  }, [proofFromUrl, executeVerification]);

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    const video = videoRef.current;
    let disposed = false;
    let handled = false;
    let controls: IScannerControls | undefined;

    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (disposed) return;
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromVideoDevice(
          undefined,
          video,
          (result, _error, scannerControls) => {
            if (!result || disposed || handled) return;
            handled = true;
            scannerControls.stop();
            setScanning(false);
            const payload = parseDiplomaQr(result.getText());
            if (!payload) {
              message.warning(
                "Mã QR không hợp lệ. Vui lòng quét mã trên văn bằng.",
              );
              return;
            }
            void executeVerification(payload);
          },
        );
        if (disposed || handled) controls.stop();
      } catch {
        if (!disposed) {
          setScanning(false);
          message.error(
            "Không mở được camera. Vui lòng cấp quyền camera hoặc tải tệp PDF để xác thực.",
          );
        }
      }
    })();

    return () => {
      disposed = true;
      controls?.stop();
      const stream = video.srcObject;
      if (stream instanceof MediaStream)
        stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }, [scanning, executeVerification]);

  async function handlePdfUpload(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      message.error("Vui lòng chọn tệp PDF văn bằng.");
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      message.error("Tệp PDF không được quá 10 MB.");
      return false;
    }
    setLoading(true);
    setErrorMsg("");
    setVerification(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/verify/pdf", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(
          data.error || data.message || "Không xác thực được văn bằng.",
        );
      setVerification(data);
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : "Không xác thực được văn bằng.",
      );
    } finally {
      setLoading(false);
    }
    return false;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="max-w-3xl w-full bg-white p-6 sm:p-8 rounded-xl shadow-sm border border-blue-100">
        <div className="flex items-center gap-4 mb-6 pb-4 border-b-2 border-blue-50">
          <Image
            src="/logo-tlu.png"
            alt="Trường Đại học Thủy lợi"
            width={64}
            height={64}
            style={{ width: 64, height: 64, objectFit: "contain" }}
          />
          <div>
            <Title
              level={3}
              style={{ margin: 0, color: "#002140", fontWeight: "bold" }}
            >
              TRƯỜNG ĐẠI HỌC THỦY LỢI
            </Title>
            <Text style={{ color: "#003b93", fontWeight: 600, fontSize: 14 }}>
              CỔNG XÁC THỰC VĂN BẰNG TỐT NGHIỆP
            </Text>
          </div>
        </div>

        <Spin spinning={loading} tip="Đang xác thực văn bằng...">
          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              setScanning(false);
              setActiveTab(key);
            }}
            items={[
              {
                key: "pdf",
                label: "Xác thực tệp PDF",
                children: (
                  <Dragger
                    accept=".pdf,application/pdf"
                    beforeUpload={handlePdfUpload}
                    showUploadList={false}
                    multiple={false}
                    disabled={loading}
                  >
                    <p className="ant-upload-drag-icon">
                      <InboxOutlined />
                    </p>
                    <p>Kéo thả hoặc chọn tệp PDF văn bằng</p>
                    <p className="text-gray-400 text-sm">
                      Dung lượng tối đa 10 MB
                    </p>
                  </Dragger>
                ),
              },
              {
                key: "qr",
                label: "Quét mã QR",
                children: scanning ? (
                  <div>
                    <video
                      ref={videoRef}
                      className="w-full rounded-lg"
                      autoPlay
                      muted
                      playsInline
                    />
                    <Button
                      block
                      className="mt-4"
                      onClick={() => setScanning(false)}
                    >
                      Dừng quét
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Button
                      type="primary"
                      size="large"
                      icon={<CameraOutlined />}
                      disabled={loading}
                      onClick={() => setScanning(true)}
                    >
                      Mở camera quét QR
                    </Button>
                    <Text type="secondary" className="block mt-3 text-sm">
                      Quét mã QR trên văn bằng để xác thực tự động.
                    </Text>
                  </div>
                ),
              },
            ]}
          />

          {verification && (
            <div className="mt-8 pt-8 border-t">
              <DiplomaVerificationResult verification={verification} />
            </div>
          )}
          {errorMsg && (
            <Alert
              showIcon
              type="error"
              title="Không thể xác thực văn bằng"
              description={errorMsg}
              className="mt-6"
            />
          )}
        </Spin>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Đang tải...</div>}>
      <VerifyContent />
    </Suspense>
  );
}
