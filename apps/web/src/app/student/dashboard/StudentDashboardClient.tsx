// src/app/(student)/dashboard/StudentDashboardClient.tsx
"use client";

import PageTitle from "@/components/PageTitle";

import { useRouter } from "next/navigation";
import React, { useState } from "react";
import {
  Card,
  Row,
  Col,
  Typography,
  Button,
  Modal,
  Space,
  message,
  Empty,
  Tag,
  Input,
  Select,
} from "antd";
import { ShareAltOutlined } from "@ant-design/icons";
import QRCode from "react-qr-code";
import { generateCertPDF } from "@/lib/generateCertPDF";

const { Text, Paragraph } = Typography;

interface CertificateData {
  uuid: string;
  type: string;
  major: string;
  issueDate: string;
  certNo: string;
  txId?: string;
  fullName?: string;
  mssv?: string;
  gpa?: number;
  grade?: string;
  soHieu?: string;
  soVaoSo?: string;
  className?: string;
  namTotNghiep?: number;
  certHash?: string;
  signedPdfAvailable?: boolean;
  pdfSigningMode?: string;
}

interface Props {
  initialCertificates: CertificateData[];
}

export default function StudentDashboardClient({ initialCertificates }: Props) {
  const router = useRouter();
  const [selectedCert, setSelectedCert] = useState<CertificateData | null>(
    null,
  );
  const [recipientEmail, setRecipientEmail] = useState("");
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [shareUrl, setShareUrl] = useState("");
  const [sharing, setSharing] = useState(false);

  function openShare(cert: CertificateData) {
    setSelectedCert(cert);
    setRecipientEmail("");
    setExpiresInHours(72);
    setShareUrl("");
  }

  async function handleCreateShare() {
    if (!selectedCert || !recipientEmail.trim()) {
      message.warning("Vui lòng nhập Gmail của người nhận.");
      return;
    }
    setSharing(true);
    try {
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diplomaId: selectedCert.uuid,
          recipientEmail: recipientEmail.trim(),
          expiresInHours,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.error || "Không tạo được liên kết chia sẻ.");
      setShareUrl(data.shareUrl || "");
      if (data.emailSent)
        message.success("Đã gửi liên kết tới Gmail người nhận.");
      else
        message.warning(
          "Email chưa gửi được; hãy sao chép liên kết để gửi thủ công.",
        );
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : "Không tạo được liên kết chia sẻ.",
      );
    } finally {
      setSharing(false);
    }
  }

  async function handleCopyVerificationLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      message.success("Đã sao chép liên kết xác thực.");
    } catch {
      message.error("Không sao chép được liên kết. Vui lòng quét mã QR.");
    }
  }

  return (
    <div className="workspace-page">
      <div className="min-w-0">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <PageTitle>Văn bằng của tôi</PageTitle>
          <Button onClick={() => router.push("/student/requests")}>
            Yêu cầu chỉnh sửa
          </Button>
          <Button onClick={() => router.push("/student/profile")}>
            Tài khoản
          </Button>
        </div>

        {initialCertificates.length === 0 ? (
          <Empty
            description="Không tìm thấy văn bằng nào đã được cấp phát"
            className="mt-6 bg-white p-6 border border-gray-200"
          />
        ) : (
          initialCertificates.map((cert) => (
            <Card
              key={cert.uuid}
              className="mb-6"
              styles={{ body: { padding: "24px" } }}
            >
              <Row gutter={[24, 24]}>
                <Col span={24}>
                  <Text
                    type="secondary"
                    className="text-xs font-semibold tracking-wider"
                  >
                    MÃ ĐỊNH DANH (UUID)
                  </Text>
                  <div className="font-mono break-all text-base">
                    {cert.uuid}
                  </div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text
                    type="secondary"
                    className="text-xs font-semibold tracking-wider"
                  >
                    LOẠI VĂN BẰNG
                  </Text>
                  <div className="font-semibold text-gray-800">{cert.type}</div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text
                    type="secondary"
                    className="text-xs font-semibold tracking-wider"
                  >
                    CHUYÊN NGÀNH
                  </Text>
                  <div className="font-semibold text-gray-800">
                    {cert.major}
                  </div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text
                    type="secondary"
                    className="text-xs font-semibold tracking-wider"
                  >
                    SỐ HIỆU
                  </Text>
                  <div className="font-semibold text-gray-800">
                    {cert.certNo}
                  </div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text
                    type="secondary"
                    className="text-xs font-semibold tracking-wider"
                  >
                    NƠI CẤP
                  </Text>
                  <div className="font-semibold text-gray-800">
                    Đại học Thủy Lợi
                  </div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text
                    type="secondary"
                    className="text-xs font-semibold tracking-wider"
                  >
                    NGÀY CẤP
                  </Text>
                  <div className="font-semibold text-gray-800">
                    {cert.issueDate}
                  </div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text
                    type="secondary"
                    className="text-xs font-semibold tracking-wider"
                  >
                    TRẠNG THÁI SỔ CÁI
                  </Text>
                  <div className="mt-1">
                    <Tag color="green">ĐÃ XÁC THỰC</Tag>
                  </div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text
                    type="secondary"
                    className="text-xs font-semibold tracking-wider"
                  >
                    GPA
                  </Text>
                  <div className="font-semibold text-gray-800">{cert.gpa}</div>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Text
                    type="secondary"
                    className="text-xs font-semibold tracking-wider"
                  >
                    XẾP LOẠI
                  </Text>
                  <div className="font-semibold text-blue-600">
                    {cert.grade}
                  </div>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Text
                    type="secondary"
                    className="text-xs font-semibold tracking-wider"
                  >
                    NĂM TỐT NGHIỆP
                  </Text>
                  <div className="font-semibold text-gray-800">
                    {cert.namTotNghiep}
                  </div>
                </Col>
                <Col
                  span={24}
                  className="text-right mt-4 border-t border-gray-100 pt-4"
                >
                  <Space>
                    <Button
                      size="large"
                      disabled={!cert.signedPdfAvailable}
                      onClick={async () => {
                        try {
                          await generateCertPDF(cert);
                        } catch (error) {
                          message.error(
                            error instanceof Error
                              ? error.message
                              : "Không tải được PDF",
                          );
                        }
                      }}
                    >
                      Tải PDF ký số
                    </Button>
                    <Button
                      type="primary"
                      size="large"
                      icon={<ShareAltOutlined />}
                      onClick={() => openShare(cert)}
                    >
                      Chia sẻ văn bằng
                    </Button>
                  </Space>
                </Col>
              </Row>
            </Card>
          ))
        )}
      </div>

      <Modal
        title="Chia sẻ văn bằng"
        open={!!selectedCert}
        onCancel={() => setSelectedCert(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedCert(null)}>
            Đóng
          </Button>,
          <Button
            key="copy"
            disabled={!shareUrl}
            onClick={handleCopyVerificationLink}
          >
            Sao chép liên kết xác thực
          </Button>,
          <Button
            key="send"
            type="primary"
            loading={sharing}
            onClick={handleCreateShare}
          >
            Gá»­i vÃ o Gmail
          </Button>,
        ]}
      >
        {selectedCert && (
          <div className="flex flex-col items-center gap-4 py-4">
            <Input
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="Gmail người nhận"
              type="email"
              size="large"
            />
            <Select
              value={expiresInHours}
              onChange={setExpiresInHours}
              size="large"
              style={{ width: "100%" }}
              options={[
                { value: 24, label: "Hết hạn sau 24 giờ" },
                { value: 72, label: "Hết hạn sau 3 ngày" },
                { value: 168, label: "Hết hạn sau 7 ngày" },
              ]}
            />
            {shareUrl && (
              <QRCode
                value={shareUrl}
                size={240}
                style={{ height: "auto", maxWidth: "100%", width: 240 }}
              />
            )}
            <Paragraph type="secondary" className="text-center mb-0">
              Quét mã QR hoặc mở liên kết chia sẻ để xác thực văn bằng.
            </Paragraph>
          </div>
        )}
      </Modal>
    </div>
  );
}
