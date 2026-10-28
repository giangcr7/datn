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
  const verificationUrl = selectedCert
    ? window.location.origin +
      "/verify?proof=" +
      encodeURIComponent(JSON.stringify({ uuid: selectedCert.uuid }))
    : "";

  async function handleCopyVerificationLink() {
    if (!verificationUrl) return;
    try {
      await navigator.clipboard.writeText(verificationUrl);
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
                      onClick={() => setSelectedCert(cert)}
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
            type="primary"
            onClick={handleCopyVerificationLink}
          >
            Sao chép liên kết xác thực
          </Button>,
        ]}
      >
        {selectedCert && (
          <div className="flex flex-col items-center gap-4 py-4">
            <QRCode
              value={verificationUrl}
              size={240}
              style={{ height: "auto", maxWidth: "100%", width: 240 }}
            />
            <Paragraph type="secondary" className="text-center mb-0">
              Quét mã QR hoặc mở liên kết chia sẻ để xác thực văn bằng.
            </Paragraph>
          </div>
        )}
      </Modal>
    </div>
  );
}
