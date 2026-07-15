'use client';
import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Tag, Typography, Space, Input, message, Card } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, EyeOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function PendingPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<{ open: boolean; uuid: string }>({ open: false, uuid: '' });
  const [rejectReason, setRejectReason] = useState('');
  const [detailModal, setDetailModal] = useState<{ open: boolean; record: any }>({ open: false, record: null });

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cert/pending');
      const json = await res.json();
      setData(json.data || []);
    } catch {
      message.error('Không thể tải danh sách chờ duyệt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPending(); }, []);

  const handleApprove = async (uuid: string) => {
    Modal.confirm({
      title: 'Xác nhận phê duyệt',
      content: 'Văn bằng này sẽ được ghi lên Blockchain sau khi phê duyệt. Bạn có chắc chắn?',
      okText: 'Phê duyệt',
      cancelText: 'Hủy',
      okButtonProps: { style: { background: '#52c41a', borderColor: '#52c41a' } },
      onOk: async () => {
        try {
          const res = await fetch('/api/cert/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid }),
          });
          const json = await res.json();
          if (json.success) {
            message.success('Phê duyệt thành công — văn bằng đã lên Blockchain!');
            fetchPending();
          } else {
            message.error(json.error || 'Phê duyệt thất bại');
          }
        } catch {
          message.error('Lỗi kết nối');
        }
      },
    });
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      message.warning('Vui lòng nhập lý do từ chối');
      return;
    }
    try {
      const res = await fetch('/api/cert/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: rejectModal.uuid, reason: rejectReason }),
      });
      const json = await res.json();
      if (json.success) {
        message.success('Đã từ chối yêu cầu');
        setRejectModal({ open: false, uuid: '' });
        setRejectReason('');
        fetchPending();
      } else {
        message.error(json.error || 'Từ chối thất bại');
      }
    } catch {
      message.error('Lỗi kết nối');
    }
  };

  const columns = [
    { title: 'MSSV', dataIndex: 'mssv', key: 'mssv', width: 120 },
    { title: 'Họ và tên', dataIndex: 'fullName', key: 'fullName', width: 180 },
    { title: 'Ngành', dataIndex: 'major', key: 'major', width: 160 },
    { title: 'GPA', dataIndex: 'gpa', key: 'gpa', width: 80 },
    { title: 'Xếp loại', dataIndex: 'grade', key: 'grade', width: 100 },
    {
      title: 'Cơ sở',
      dataIndex: 'org',
      key: 'org',
      width: 100,
      render: (org: string) => (
        <Tag color={org === 'ORG1' ? 'blue' : 'green'}>
          {org === 'ORG1' ? 'Hà Nội' : 'TP.HCM'}
        </Tag>
      ),
    },
    {
      title: 'Ngày yêu cầu',
      dataIndex: 'requestedAt',
      key: 'requestedAt',
      width: 140,
      render: (d: string) => d ? new Date(d).toLocaleDateString('vi-VN') : '—',
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 200,
      render: (_: any, record: any) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setDetailModal({ open: true, record })}
          >
            Xem
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
            onClick={() => handleApprove(record.uuid)}
          >
            Duyệt
          </Button>
          <Button
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => setRejectModal({ open: true, uuid: record.uuid })}
          >
            Từ chối
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>Danh sách chờ phê duyệt</Title>
            <Text type="secondary">Phân hiệu TP.HCM — xác nhận trước khi ghi lên Blockchain</Text>
          </div>
          <Tag color="orange" style={{ fontSize: 14, padding: '4px 12px' }}>
            {data.length} yêu cầu đang chờ
          </Tag>
        </div>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="uuid"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Không có yêu cầu nào đang chờ duyệt' }}
        />
      </Card>

      {/* Modal từ chối */}
      <Modal
        title="Từ chối yêu cầu"
        open={rejectModal.open}
        onOk={handleReject}
        onCancel={() => { setRejectModal({ open: false, uuid: '' }); setRejectReason(''); }}
        okText="Xác nhận từ chối"
        cancelText="Hủy"
        okButtonProps={{ danger: true }}
      >
        <Text>Vui lòng nhập lý do từ chối để thông báo cho cán bộ Hà Nội:</Text>
        <TextArea
          style={{ marginTop: 12 }}
          rows={4}
          placeholder="VD: Thông tin sinh viên không khớp hồ sơ..."
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
        />
      </Modal>

      {/* Modal xem chi tiết */}
      <Modal
        title="Chi tiết yêu cầu"
        open={detailModal.open}
        onCancel={() => setDetailModal({ open: false, record: null })}
        footer={null}
        width={600}
      >
        {detailModal.record && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            {[
              ['MSSV', detailModal.record.mssv],
              ['Họ và tên', detailModal.record.fullName],
              ['Ngành học', detailModal.record.major],
              ['GPA', detailModal.record.gpa],
              ['Xếp loại', detailModal.record.grade],
              ['Số hiệu', detailModal.record.soHieu],
              ['Số vào sổ', detailModal.record.soVaoSo],
              ['Lớp', detailModal.record.className],
              ['Năm tốt nghiệp', detailModal.record.namTotNghiep],
              ['Cơ sở', detailModal.record.org === 'ORG1' ? 'Hà Nội' : 'TP.HCM'],
              ['Ngày yêu cầu', detailModal.record.requestedAt ? new Date(detailModal.record.requestedAt).toLocaleString('vi-VN') : '—'],
            ].map(([label, value]) => (
              <tr key={label} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px 12px', fontWeight: 500, width: '40%', background: '#fafafa' }}>{label}</td>
                <td style={{ padding: '8px 12px' }}>{value || '—'}</td>
              </tr>
            ))}
          </table>
        )}
      </Modal>
    </div>
  );
}
