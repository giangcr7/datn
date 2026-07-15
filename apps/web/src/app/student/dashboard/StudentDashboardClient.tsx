// src/app/(student)/dashboard/StudentDashboardClient.tsx
'use client';

import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { Card, Row, Col, Typography, Button, Modal, Checkbox, Space, message, Input, Empty, Tag } from 'antd';
import { SafetyCertificateOutlined, ShareAltOutlined } from '@ant-design/icons';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;
import { generateCertPDF } from '@/lib/generateCertPDF';

const shareOptions = [
  { label: 'Ngày sinh', value: 'birthday' },
  { label: 'Nơi sinh', value: 'placeOfBirth' },
  { label: 'Giới tính', value: 'gender' },
  { label: 'Xếp loại', value: 'rank' },
];

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
}

interface Props {
  initialCertificates: CertificateData[];
}

export default function StudentDashboardClient({ initialCertificates }: Props) {
  const router = useRouter();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);
  const [selectedCert, setSelectedCert] = useState<CertificateData | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [proofData, setProofData] = useState('');
  const [generatingProof, setGeneratingProof] = useState(false);

  const openShareModal = (cert: CertificateData) => {
    setSelectedCert(cert);
    setSelectedFields([]);
    setIsShareModalOpen(true);
  };

  const handleCreateProof = () => {
    if (selectedFields.length === 0) {
      return message.warning('Vui lòng chọn thông tin cần chia sẻ!');
    }
    
    setGeneratingProof(true);
    
    // Giả lập thời gian tạo minh chứng mật mã học (ZKP/Merkle Tree)
    setTimeout(() => {
      const generatedProof = {
        certUUID: selectedCert?.uuid,
        fullName: selectedCert?.fullName,
        mssv: selectedCert?.mssv,
        major: selectedCert?.major,
        gpa: selectedCert?.gpa,
        grade: selectedCert?.grade,
        issueDate: selectedCert?.issueDate,
        soHieu: selectedCert?.soHieu,
        soVaoSo: selectedCert?.soVaoSo,
        className: selectedCert?.className,
        namTotNghiep: selectedCert?.namTotNghiep,
        certHash: selectedCert?.certHash,
        txId: selectedCert?.txId,
        network: "Hyperledger Fabric - TLU Channel",
      };
      
      setProofData(JSON.stringify(generatedProof, null, 2));
      setGeneratingProof(false);
      setIsShareModalOpen(false);
      setIsProofModalOpen(true);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <Title level={3} style={{ color: '#1890ff', margin: 0 }}>
            <SafetyCertificateOutlined className="mr-2" />
            Quản lý Văn bằng Cá nhân
          </Title>
          <Button onClick={() => router.push('/student/profile')}>
            👤 Tài khoản
          </Button>
        </div>
        
        {initialCertificates.length === 0 ? (
          <Empty 
            description="Không tìm thấy văn bằng nào đã được cấp phát" 
            className="mt-20 bg-white p-12 rounded-lg shadow-sm border border-gray-200"
          />
        ) : (
          initialCertificates.map((cert) => (
            <Card 
              key={cert.uuid} 
              hoverable
              className="mb-6 rounded-xl border border-gray-200 shadow-sm"
              bodyStyle={{ padding: '24px' }}
            >
              <Row gutter={[24, 24]}>
                <Col span={24}>
                  <Text type="secondary" className="text-xs font-semibold tracking-wider">MÃ ĐỊNH DANH (UUID)</Text>
                  <div className="font-mono text-blue-600 text-lg">{cert.uuid}</div>
                </Col>
                
                <Col xs={24} sm={12} md={8}>
                  <Text type="secondary" className="text-xs font-semibold tracking-wider">LOẠI VĂN BẰNG</Text>
                  <div className="font-semibold text-gray-800">{cert.type}</div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text type="secondary" className="text-xs font-semibold tracking-wider">CHUYÊN NGÀNH</Text>
                  <div className="font-semibold text-gray-800">{cert.major}</div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text type="secondary" className="text-xs font-semibold tracking-wider">SỐ HIỆU</Text>
                  <div className="font-semibold text-gray-800">{cert.certNo}</div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text type="secondary" className="text-xs font-semibold tracking-wider">NƠI CẤP</Text>
                  <div className="font-semibold text-gray-800">Đại học Thủy Lợi</div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text type="secondary" className="text-xs font-semibold tracking-wider">NGÀY CẤP</Text>
                  <div className="font-semibold text-gray-800">{cert.issueDate}</div>
                </Col>
                
                <Col xs={24} sm={12} md={8}>
                  <Text type="secondary" className="text-xs font-semibold tracking-wider">TRẠNG THÁI SỔ CÁI</Text>
                  <div className="mt-1">
                    <Tag color="green">ĐÃ XÁC THỰC</Tag>
                  </div>
                </Col>

                <Col xs={24} sm={12} md={8}>
                  <Text type="secondary" className="text-xs font-semibold tracking-wider">GPA</Text>
                  <div className="font-semibold text-gray-800">{cert.gpa}</div>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Text type="secondary" className="text-xs font-semibold tracking-wider">XẾP LOẠI</Text>
                  <div className="font-semibold text-blue-600">{cert.grade}</div>
                </Col>
                <Col xs={24} sm={12} md={8}>
                  <Text type="secondary" className="text-xs font-semibold tracking-wider">NĂM TỐT NGHIỆP</Text>
                  <div className="font-semibold text-gray-800">{cert.namTotNghiep}</div>
                </Col>
                <Col span={24} className="text-right mt-4 border-t border-gray-100 pt-4">
                  <Space>
                    <Button
                      size="large"
                      onClick={async () => {
                        const verifyUrl = `${window.location.origin}/verify?proof=${encodeURIComponent(JSON.stringify({
                          certUUID: cert.uuid, certHash: cert.certHash,
                          fullName: cert.fullName, mssv: cert.mssv,
                          major: cert.major, gpa: cert.gpa, grade: cert.grade,
                          issueDate: cert.issueDate, soHieu: cert.soHieu,
                          soVaoSo: cert.soVaoSo, className: cert.className,
                          namTotNghiep: cert.namTotNghiep,
                        }))}`;
                        await generateCertPDF(cert, verifyUrl);
                      }}
                    >
                      📄 Tải PDF
                    </Button>
                    <Button 
                      type="primary" 
                      size="large"
                      icon={<ShareAltOutlined />}
                      onClick={() => openShareModal(cert)}
                      className="rounded-md bg-blue-600 font-medium"
                    >
                      Chia sẻ minh chứng
                    </Button>
                  </Space>
                </Col>
              </Row>
            </Card>
          ))
        )}
      </div>

      {/* Modal lựa chọn thông tin chia sẻ */}
      <Modal
        title="Cấu hình Quyền Riêng Tư (Selective Disclosure)"
        open={isShareModalOpen}
        onCancel={() => setIsShareModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsShareModalOpen(false)}>Hủy</Button>,
          <Button key="ok" type="primary" loading={generatingProof} onClick={handleCreateProof} className="bg-blue-600">
            Tạo minh chứng ZKP
          </Button>
        ]}
      >
        <Paragraph className="text-gray-600 mb-4">
          Công nghệ Blockchain cho phép bạn chỉ chia sẻ những trường thông tin cần thiết (Zero-Knowledge Proof) mà không lộ toàn bộ văn bằng:
        </Paragraph>
        <Checkbox.Group className="w-full" onChange={(values) => setSelectedFields(values as string[])}>
          <Space direction="vertical" className="w-full">
            {shareOptions.map(opt => (
              <Checkbox key={opt.value} value={opt.value} className="text-base">
                {opt.label}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </Modal>

      {/* Modal kết quả minh chứng */}
      <Modal
        title="Chuỗi JSON Minh Chứng (Proof)"
        open={isProofModalOpen}
        onCancel={() => setIsProofModalOpen(false)}
        footer={[
          <Button 
            key="copy" 
            type="primary" 
            className="bg-blue-600"
            onClick={() => { 
              navigator.clipboard.writeText(proofData); 
              message.success('Đã sao chép chuỗi minh chứng!'); 
            }}
          >
            Sao chép mã chia sẻ
          </Button>
        ]}
        width={600}
      >
        <Paragraph type="secondary" className="mb-4">
          Người tuyển dụng có thể dán đoạn mã này vào cổng Verify của nhà trường để xác thực tính hợp lệ của văn bằng.
        </Paragraph>
        <TextArea 
          value={proofData} 
          readOnly 
          autoSize={{ minRows: 10, maxRows: 15 }} 
          className="font-mono bg-gray-100 p-4 rounded-md border-gray-300" 
        />
      </Modal>
    </div>
  );
}