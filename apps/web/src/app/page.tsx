'use client';
import React from 'react';
import { Card, Typography, Button, Row, Col, Steps, Tag } from 'antd';
import { 
  SafetyCertificateOutlined, LoginOutlined, SearchOutlined,
  BlockOutlined, AuditOutlined, QrcodeOutlined, FileProtectOutlined,
  TeamOutlined, BankOutlined, UserOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Title, Paragraph, Text } = Typography;

export default function HomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white">
      {/* Top Header Navbar */}
      <div
        style={{
          background: '#fff',
          borderBottom: '2px solid #e6f0ff',
          padding: '12px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 8px rgba(0, 59, 147, 0.06)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src="/logo-tlu.png"
            alt="Đại học Thủy Lợi"
            style={{ width: 48, height: 48, objectFit: 'contain' }}
          />
          <div>
            <div style={{ color: '#002140', fontWeight: 'bold', fontSize: 16, lineHeight: 1.2 }}>
              TRƯỜNG ĐẠI HỌC THỦY LỢI
            </div>
            <div style={{ color: '#003b93', fontSize: 12, fontWeight: 600 }}>
              HỆ THỐNG XÁC THỰC VĂN BẰNG SỐ
            </div>
          </div>
        </div>

        <Row gutter={12}>
          <Col>
            <Button icon={<SearchOutlined />} onClick={() => router.push('/search')}>
              Tra cứu
            </Button>
          </Col>
          <Col>
            <Button
              type="primary"
              style={{ background: '#003b93' }}
              icon={<SafetyCertificateOutlined />}
              onClick={() => router.push('/verify')}
            >
              Cổng Xác thực
            </Button>
          </Col>
          <Col>
            <Button
              type="default"
              icon={<LoginOutlined />}
              onClick={() => router.push('/login')}
            >
              Đăng nhập
            </Button>
          </Col>
        </Row>
      </div>

      {/* Hero Section */}
      <div
        style={{
          background: 'linear-gradient(135deg, #001a38 0%, #003b93 60%, #0056b3 100%)',
          padding: '64px 20px',
        }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <img
            src="/logo-tlu.png"
            alt="Logo ĐH Thủy Lợi"
            style={{
              width: 110,
              height: 110,
              objectFit: 'contain',
              background: '#fff',
              borderRadius: '50%',
              padding: 6,
              marginBottom: 20,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
            }}
          />
          <Title level={1} style={{ color: 'white', margin: '0 0 12px', fontSize: 34, fontWeight: 'bold' }}>
            HỆ THỐNG QUẢN LÝ & XÁC THỰC VĂN BẰNG SỐ
          </Title>
          <Paragraph style={{ color: '#d0e2ff', fontSize: 16, maxWidth: 700, margin: '0 auto 28px' }}>
            Nền tảng ứng dụng công nghệ chuỗi khối Hyperledger Fabric — Bảo đảm tính bất biến, minh bạch và chống làm giả văn bằng tốt nghiệp của Trường Đại học Thủy Lợi.
          </Paragraph>

          <Row gutter={16} justify="center">
            <Col>
              <Button
                size="large"
                type="primary"
                style={{ background: 'white', color: '#003b93', border: 'none', fontWeight: 'bold', height: 46, padding: '0 28px' }}
                icon={<SearchOutlined />}
                onClick={() => router.push('/search')}
              >
                Tra cứu văn bằng
              </Button>
            </Col>
            <Col>
              <Button
                size="large"
                ghost
                style={{ fontWeight: 600, height: 46, padding: '0 28px', borderColor: '#fff', color: '#fff' }}
                icon={<SafetyCertificateOutlined />}
                onClick={() => router.push('/verify')}
              >
                Xác thực ngay
              </Button>
            </Col>
          </Row>
        </div>
      </div>

      {/* Tính năng nổi bật */}
      <div style={{ background: '#f8f9ff', padding: '60px 20px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Title level={2} style={{ textAlign: 'center', marginBottom: 48, color: '#003a8c' }}>
            Tính năng nổi bật
          </Title>
          <Row gutter={[24, 24]}>
            {[
              { icon: <BlockOutlined style={{ fontSize: 32, color: '#0056b3' }} />, title: 'Blockchain Hyperledger Fabric', desc: 'Dữ liệu được ghi lên Blockchain với chữ ký của 2 tổ chức — không thể giả mạo hay sửa đổi' },
              { icon: <AuditOutlined style={{ fontSize: 32, color: '#52c41a' }} />, title: 'Xác thực 3 chiều', desc: 'So sánh Proof JSON + MongoDB + Blockchain — phát hiện giả mạo từ bất kỳ nguồn nào' },
              { icon: <QrcodeOutlined style={{ fontSize: 32, color: '#faad14' }} />, title: 'QR Code thông minh', desc: 'Mỗi văn bằng PDF có QR code nhúng — quét là xác thực ngay trên Blockchain' },
              { icon: <FileProtectOutlined style={{ fontSize: 32, color: '#f5222d' }} />, title: 'Thu hồi on-chain', desc: 'Revoke văn bằng ghi lên Blockchain với lý do — minh bạch và không thể xóa lịch sử' },
              { icon: <TeamOutlined style={{ fontSize: 32, color: '#722ed1' }} />, title: 'Đa tổ chức (Multi-org)', desc: 'AND(Org1MSP, Org2MSP) — bắt buộc cả 2 cơ sở đào tạo ký mới ghi được lên chain' },
              { icon: <SafetyCertificateOutlined style={{ fontSize: 32, color: '#13c2c2' }} />, title: 'Audit Trail', desc: 'Xem toàn bộ lịch sử giao dịch của từng văn bằng trực tiếp từ Blockchain' },
            ].map((f, i) => (
              <Col xs={24} sm={12} md={8} key={i}>
                <Card hoverable style={{ borderRadius: 12, height: '100%' }}>
                  <div style={{ marginBottom: 12 }}>{f.icon}</div>
                  <Title level={5} style={{ marginBottom: 8 }}>{f.title}</Title>
                  <Text type="secondary">{f.desc}</Text>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>

      {/* Kiến trúc hệ thống */}
      <div style={{ padding: '60px 20px', background: 'white' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <Title level={2} style={{ textAlign: 'center', marginBottom: 16, color: '#003a8c' }}>
            Kiến trúc hệ thống
          </Title>
          <Row gutter={[16, 16]} justify="center">
            {[
              { label: 'Org1MSP', sub: 'ĐH Thủy Lợi HN', color: '#0056b3', role: 'Cơ sở chính — ký phát hành' },
              { label: 'Org2MSP', sub: 'Phân hiệu TP.HCM', color: '#389e0d', role: 'Cơ sở liên kết — ký xác nhận' },
              { label: 'Orderer', sub: 'Raft Consensus', color: '#722ed1', role: 'Đồng thuận — ghi block' },
              { label: 'MongoDB', sub: 'Off-chain Cache', color: '#d46b08', role: 'Lưu trữ phụ — tìm kiếm nhanh' },
            ].map((o, i) => (
              <Col xs={24} sm={12} md={6} key={i}>
                <Card style={{ borderRadius: 12, borderTop: `4px solid ${o.color}`, textAlign: 'center' }}>
                  <Title level={4} style={{ color: o.color, margin: '0 0 4px' }}>{o.label}</Title>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>{o.sub}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{o.role}</Text>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>

      {/* Hướng dẫn sử dụng */}
      <div style={{ background: '#f8f9ff', padding: '60px 20px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Title level={2} style={{ textAlign: 'center', marginBottom: 48, color: '#003a8c' }}>
            Hướng dẫn sử dụng
          </Title>
          <Row gutter={[32, 32]}>
            {/* Nhà tuyển dụng */}
            <Col xs={24} md={8}>
              <Card style={{ borderRadius: 12, height: '100%', borderTop: '4px solid #52c41a' }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <BankOutlined style={{ fontSize: 40, color: '#52c41a' }} />
                  <Title level={4} style={{ marginTop: 8, color: '#52c41a' }}>Nhà tuyển dụng</Title>
                </div>
                <Steps orientation="vertical" size="small" current={-1} items={[
                  { title: 'Vào trang Tra cứu', content: 'Nhập tên hoặc MSSV ứng viên' },
                  { title: 'Xem kết quả', content: 'Danh sách văn bằng phù hợp' },
                  { title: 'Xác thực', content: 'Nhấn "Xác thực ngay" để verify on-chain' },
                  { title: 'Quét QR', content: 'Hoặc quét QR trên bằng gốc' },
                ]} />
                <Button type="primary" block style={{ background: '#52c41a', border: 'none', marginTop: 16 }}
                  onClick={() => router.push('/search')}>
                  Tra cứu ngay
                </Button>
              </Card>
            </Col>

            {/* Sinh viên */}
            <Col xs={24} md={8}>
              <Card style={{ borderRadius: 12, height: '100%', borderTop: '4px solid #1890ff' }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <UserOutlined style={{ fontSize: 40, color: '#1890ff' }} />
                  <Title level={4} style={{ marginTop: 8, color: '#1890ff' }}>Sinh viên</Title>
                </div>
                <Steps orientation="vertical" size="small" current={-1} items={
                  [
                    { title: 'Đăng nhập', subTitle: 'Dùng tài khoản do nhà trường cấp' },
                    { title: 'Xem văn bằng', subTitle: 'Xem thông tin văn bằng trên Blockchain' },
                    { title: 'Tải PDF', subTitle: 'Tải PDF có QR code nhúng sẵn' },
                    { title: 'Chia sẻ', subTitle: 'Copy proof JSON gửi nhà tuyển dụng' },
                ]} />
                <Button type="primary" block style={{ marginTop: 16 }}
                  onClick={() => router.push('/login?type=student')}>
                  Đăng nhập
                </Button>
              </Card>
            </Col>

            {/* Cán bộ */}
            <Col xs={24} md={8}>
              <Card style={{ borderRadius: 12, height: '100%', borderTop: '4px solid #722ed1' }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <SafetyCertificateOutlined style={{ fontSize: 40, color: '#722ed1' }} />
                  <Title level={4} style={{ marginTop: 8, color: '#722ed1' }}>Cán bộ đào tạo</Title>
                </div>
                <Steps orientation="vertical" size="small" current={-1} items={
                  [
                    { title: 'Đăng nhập', subTitle: 'Dùng email @tlu.edu.vn' },
                    { title: 'Import sinh viên', subTitle: 'Upload Excel danh sách sinh viên' },
                    { title: 'Cấp văn bằng', subTitle: 'Phát hành lên Blockchain với 2 chữ ký' },
                    { title: 'Quản lý', subTitle: 'Xem thống kê, audit trail, revoke' },
                ]} />
                <Button type="primary" block style={{ background: '#722ed1', border: 'none', marginTop: 16 }}
                  onClick={() => router.push('/login?type=university')}>
                  Đăng nhập cán bộ
                </Button>
              </Card>
            </Col>
          </Row>
        </div>
      </div>

      {/* Hướng dẫn sử dụng */}
      <div style={{ background: '#f8f9ff', padding: '60px 20px' }}>
        {/* ... */}
        <Col xs={24} md={8}>
          <Card style={{ borderRadius: 12, height: '100%', borderTop: '4px solid #52c41a' }}>
            {/* ... */}
            <Steps orientation="vertical" size="small" current={-1} items={[
              { title: 'Vào trang Tra cứu', subTitle: 'Nhập tên hoặc MSSV ứng viên' },
              { title: 'Xem kết quả', subTitle: 'Danh sách văn bằng phù hợp' },
              { title: 'Xác thực', subTitle: 'Nhấn "Xác thực ngay" để verify on-chain' },
              { title: 'Quét QR', subTitle: 'Hoặc quét QR trên bằng gốc' },
            ]} />
            {/* ... */}
          </Card>
        </Col>
        {/* ... */}
      </div>

      {/* Footer */}
      <div style={{ background: '#003a8c', padding: '24px 20px', textAlign: 'center' }}>
        <Text style={{ color: '#cce0ff' }}>
          © {new Date().getFullYear()} Trường Đại học Thủy Lợi — Hệ thống Văn bằng Số Blockchain
        </Text>
        <br />
      </div>
    </div>
  );
}
