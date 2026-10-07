'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Statistic,
  Table,
  Tag,
  Button,
  Input,
  Modal,
  Tabs,
  Badge,
  Space,
  Tooltip,
  Descriptions,
  message,
} from 'antd';
import {
  DeploymentUnitOutlined,
  CopyOutlined,
  SearchOutlined,
  ReloadOutlined,
  ApartmentOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  CheckCircleFilled,
  ClusterOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

interface ExplorerClientProps {
  initialOverview: any;
  initialBlocks: any[];
  initialPagination: any;
}

export default function ExplorerClient({
  initialOverview,
  initialBlocks,
  initialPagination,
}: ExplorerClientProps) {
  const [overview, setOverview] = useState<any>(initialOverview);
  const [blocks, setBlocks] = useState<any[]>(initialBlocks);
  const [pagination, setPagination] = useState<any>(initialPagination);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('blocks');

  // Modal states
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);

  // Fetch blocks
  const fetchBlocks = async (page = 1, searchQuery = search) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: '10',
      });
      if (searchQuery) q.append('search', searchQuery);

      const res = await fetch(`/api/explorer/blocks?${q.toString()}`);
      const data = await res.json();
      if (data.success) {
        setBlocks(data.data);
        setPagination(data.pagination);
      }
    } catch {
      message.error('Không thể tải danh sách khối');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const resOverview = await fetch('/api/explorer/overview');
      const dataOverview = await resOverview.json();
      if (dataOverview.success) {
        setOverview(dataOverview.data);
      }
      await fetchBlocks(pagination?.page || 1, search);
      message.success('Đã làm mới dữ liệu Blockchain');
    } catch {
      message.error('Lỗi khi làm mới');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`Đã sao chép ${label}!`);
  };

  // Trích xuất toàn bộ transaction từ danh sách block để hiển thị ở Tab Transactions
  const allTransactions = blocks.flatMap((block) =>
    (block.transactions || []).map((tx: any) => ({
      ...tx,
      blockNumber: block.blockNumber,
      blockTimestamp: block.timestamp,
    }))
  );

  // Cột bảng Khối (Blocks)
  const blockColumns = [
    {
      title: 'Khối (#)',
      dataIndex: 'blockNumber',
      key: 'blockNumber',
      width: 100,
      render: (num: number) => (
        <Tag color="#108ee9" style={{ fontSize: 13, fontWeight: 'bold' }}>
          #{num}
        </Tag>
      ),
    },
    {
      title: 'Block Hash',
      dataIndex: 'blockHash',
      key: 'blockHash',
      render: (hash: string) => (
        <Space size="small">
          <Tooltip placement="top" title={hash}>
            <Text code copyable={false} style={{ cursor: 'pointer' }}>
              {hash ? `${hash.slice(0, 14)}...${hash.slice(-10)}` : 'N/A'}
            </Text>
          </Tooltip>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopy(hash, 'Block Hash')}
          />
        </Space>
      ),
    },
    {
      title: 'Previous Hash',
      dataIndex: 'previousHash',
      key: 'previousHash',
      render: (hash: string) => (
        <Tooltip placement="top" title={hash}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {hash ? `${hash.slice(0, 10)}...${hash.slice(-8)}` : '00000000...'}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: 'Loại khối',
      dataIndex: 'type',
      key: 'type',
      width: 180,
      render: (type: string) => {
        if (type === 'CONFIG_GENESIS') return <Tag color="purple">GENESIS CONFIG</Tag>;
        if (type === 'CHAINCODE_DEPLOYMENT') return <Tag color="blue">DEPLOY CONTRACT</Tag>;
        return <Tag color="green">TRANSACTION</Tag>;
      },
    },
    {
      title: 'Số giao dịch',
      dataIndex: 'txCount',
      key: 'txCount',
      width: 120,
      align: 'center' as const,
      render: (count: number) => <Badge count={count} overflowCount={999} style={{ backgroundColor: '#52c41a' }} />,
    },
    {
      title: 'Thời gian',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (ts: string) => (
        <Space size={4}>
          <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
          <Text style={{ fontSize: 12 }}>{new Date(ts).toLocaleString('vi-VN')}</Text>
        </Space>
      ),
    },
    {
      title: 'Chi tiết',
      key: 'action',
      width: 110,
      align: 'center' as const,
      render: (_: any, record: any) => (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedBlock(record);
            setIsBlockModalOpen(true);
          }}
        >
          Xem
        </Button>
      ),
    },
  ];

  // Cột bảng Giao dịch (Transactions)
  const txColumns = [
    {
      title: 'Transaction ID (TxID)',
      dataIndex: 'txId',
      key: 'txId',
      render: (txId: string) => (
        <Space size="small">
          <Tooltip placement="top" title={txId}>
            <Text code copyable={false}>
              {txId ? `${txId.slice(0, 14)}...${txId.slice(-10)}` : 'N/A'}
            </Text>
          </Tooltip>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopy(txId, 'Transaction ID')}
          />
        </Space>
      ),
    },
    {
      title: 'Khối',
      dataIndex: 'blockNumber',
      key: 'blockNumber',
      width: 90,
      render: (bNum: number) => <Tag color="#108ee9">#{bNum}</Tag>,
    },
    {
      title: 'Hành động Smart Contract',
      key: 'action',
      render: (_: any, tx: any) => {
        if (tx.function === 'RevokeCertificate') {
          return <Tag color="error">RevokeCertificate (Thu hồi)</Tag>;
        }
        if (tx.function === 'IssueCertificate') {
          return <Tag color="success">IssueCertificate (Cấp bằng)</Tag>;
        }
        if (tx.type === 'LIFECYCLE_COMMIT') {
          return <Tag color="processing">Deploy educert v1.0</Tag>;
        }
        return <Tag color="default">{tx.type || 'CONFIG'}</Tag>;
      },
    },
    {
      title: 'Đối tượng / Sinh viên',
      key: 'subject',
      render: (_: any, tx: any) => {
        if (tx.payload?.fullName) {
          return (
            <div>
              <Text strong>{tx.payload.fullName}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 11 }}>
                MSSV: {tx.payload.mssv} | {tx.payload.major}
              </Text>
            </div>
          );
        }
        return <Text type="secondary">{tx.payload?.description || 'Hệ thống'}</Text>;
      },
    },
    {
      title: 'Endorsers',
      dataIndex: 'endorsingMSPs',
      key: 'endorsingMSPs',
      width: 170,
      render: (msps: string[]) => (
        <Space size={2} wrap>
          {(msps || ['Org1MSP', 'Org2MSP']).map((m) => (
            <Tag key={m} color="geekblue" style={{ fontSize: 11 }}>
              {m}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center' as const,
      render: () => <Tag color="success">VALID</Tag>,
    },
    {
      title: 'Chi tiết',
      key: 'action',
      width: 100,
      align: 'center' as const,
      render: (_: any, record: any) => (
        <Button
          type="default"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedTx(record);
            setIsTxModalOpen(true);
          }}
        >
          Xem
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* HEADER SECTION */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0, color: '#002140', display: 'flex', alignItems: 'center', gap: 12 }}>
            <DeploymentUnitOutlined style={{ color: '#1890ff' }} />
            TRÌNH KHÁM PHÁ KHỐI BLOCKCHAIN
          </Title>
          <Text type="secondary">
            Minh bạch hóa sổ cái phân tán Hyperledger Fabric (Ledger Explorer & Audit Trail)
          </Text>
        </div>

        <Space size="middle">
          <Tag color="success" style={{ padding: '6px 12px', fontSize: 13, borderRadius: 16 }}>
            <CheckCircleFilled style={{ marginRight: 6 }} />
            Mạng phân tán đồng bộ (Synchronized)
          </Tag>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={handleRefresh}
          >
            Làm mới
          </Button>
        </Space>
      </div>

      {/* OVERVIEW STATS CARDS */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{
              background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
              color: '#fff',
              borderRadius: 10,
              boxShadow: '0 4px 12px rgba(24,144,255,0.2)',
            }}
          >
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>ĐỘ CAO KHỐI (BLOCK HEIGHT)</span>}
              value={overview?.blockHeight || 0}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<ApartmentOutlined />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
              Từ Genesis #0 đến Block #{Math.max(0, (overview?.blockHeight || 1) - 1)}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{
              background: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
              color: '#fff',
              borderRadius: 10,
              boxShadow: '0 4px 12px rgba(82,196,26,0.2)',
            }}
          >
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.85)' }}>TỔNG GIAO DỊCH ON-CHAIN</span>}
              value={overview?.totalTransactions || 0}
              valueStyle={{ color: '#fff', fontWeight: 'bold' }}
              prefix={<SafetyCertificateOutlined />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
              100% Cam kết trên Sổ cái Ledger
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{
              background: '#fff',
              borderRadius: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <Statistic
              title="KÊNH MẠNG (CHANNEL)"
              value={overview?.channel || 'mychannel'}
              valueStyle={{ color: '#002140', fontSize: 20, fontWeight: 'bold' }}
              prefix={<ClusterOutlined style={{ color: '#722ed1' }} />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              Smart Contract: <Tag color="blue">{overview?.chaincode || 'educert'} v{overview?.version || '1.0'}</Tag>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            variant="borderless"
            style={{
              background: '#fff',
              borderRadius: 10,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <Statistic
              title="SỐ TỔ CHỨC ĐỒNG THUẬN (MSPs)"
              value={overview?.nodes?.length || 3}
              suffix="Nodes"
              valueStyle={{ color: '#002140', fontWeight: 'bold' }}
              prefix={<ClusterOutlined style={{ color: '#fa8c16' }} />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
              Org1MSP (Hà Nội) & Org2MSP (TP.HCM)
            </div>
          </Card>
        </Col>
      </Row>

      {/* SEARCH AND EXPLORER TABS */}
      <Card
        variant="borderless"
        style={{
          borderRadius: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          background: '#fff',
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <Input.Search
            placeholder="Tìm kiếm theo Số khối (#0, #1), Hash khối, Transaction ID hoặc MSSV..."
            allowClear
            enterButton={
              <Button type="primary" icon={<SearchOutlined />}>
                Tìm kiếm trên Ledger
              </Button>
            }
            size="large"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(val) => fetchBlocks(1, val)}
            style={{ maxWidth: 700 }}
          />
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'blocks',
              label: (
                <span>
                  <ApartmentOutlined /> Danh sách Khối Ledger ({overview?.blockHeight || blocks.length})
                </span>
              ),
              children: (
                <Table
                  columns={blockColumns}
                  dataSource={blocks}
                  rowKey="blockNumber"
                  loading={loading}
                  pagination={{
                    current: pagination?.page || 1,
                    pageSize: pagination?.limit || 10,
                    total: pagination?.total || blocks.length,
                    onChange: (page) => fetchBlocks(page),
                    showTotal: (total) => `Tổng cộng ${total} khối`,
                  }}
                />
              ),
            },
            {
              key: 'transactions',
              label: (
                <span>
                  <SafetyCertificateOutlined /> Giao dịch On-Chain ({allTransactions.length})
                </span>
              ),
              children: (
                <Table
                  columns={txColumns}
                  dataSource={allTransactions}
                  rowKey="txId"
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                />
              ),
            },
            {
              key: 'topology',
              label: (
                <span>
                  <ClusterOutlined /> Cấu trúc Nút mạng (Network Topology)
                </span>
              ),
              children: (
                <Row gutter={[16, 16]}>
                  {(overview?.nodes || []).map((node: any, idx: number) => (
                    <Col xs={24} md={8} key={idx}>
                      <Card
                        title={
                          <Space>
                            <Badge status="processing" />
                            <Text strong>{node.name}</Text>
                          </Space>
                        }
                        extra={<Tag color="green">{node.status}</Tag>}
                        style={{ borderRadius: 8, background: '#fafafa' }}
                      >
                        <p><strong>Tổ chức (MSP):</strong> <Tag color="blue">{node.org}</Tag></p>
                        <p><strong>Vị trí:</strong> {node.location}</p>
                        <p><strong>Vai trò:</strong> {node.role}</p>
                        <p><strong>gRPC Endpoint:</strong> <Text code>{node.endpoint}</Text></p>
                      </Card>
                    </Col>
                  ))}
                </Row>
              ),
            },
          ]}
        />
      </Card>

      {/* MODAL CHI TIẾT KHỐI */}
      <Modal
        title={
          <Space>
            <ApartmentOutlined style={{ color: '#1890ff' }} />
            <span>CHI TIẾT KHỐI LEDGER #{selectedBlock?.blockNumber}</span>
          </Space>
        }
        open={isBlockModalOpen}
        onCancel={() => setIsBlockModalOpen(false)}
        width={780}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsBlockModalOpen(false)}>
            Đóng
          </Button>,
        ]}
      >
        {selectedBlock && (
          <div>
            <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Độ cao khối (Block Number)">
                <Tag color="#108ee9" style={{ fontSize: 13, fontWeight: 'bold' }}>
                  #{selectedBlock.blockNumber}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Loại khối">
                <Tag color="purple">{selectedBlock.type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Số lượng giao dịch">
                <Text strong>{selectedBlock.txCount} giao dịch</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Thời điểm ghi sổ (Timestamp)">
                {new Date(selectedBlock.timestamp).toLocaleString('vi-VN')}
              </Descriptions.Item>
              <Descriptions.Item label="Mã băm khối (Block Hash)">
                <Paragraph code copyable style={{ margin: 0 }}>
                  {selectedBlock.blockHash}
                </Paragraph>
              </Descriptions.Item>
              <Descriptions.Item label="Khối liền trước (Previous Hash)">
                <Paragraph code copyable style={{ margin: 0 }}>
                  {selectedBlock.previousHash}
                </Paragraph>
              </Descriptions.Item>
              <Descriptions.Item label="Mã băm dữ liệu (Data Merkle Hash)">
                <Paragraph code copyable style={{ margin: 0 }}>
                  {selectedBlock.dataHash}
                </Paragraph>
              </Descriptions.Item>
            </Descriptions>

            <Title level={5}>Dữ liệu Giao dịch trong khối ({selectedBlock.transactions?.length || 0}):</Title>
            <div
              style={{
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: 12,
                borderRadius: 6,
                maxHeight: 220,
                overflowY: 'auto',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            >
              <pre style={{ margin: 0 }}>
                {JSON.stringify(selectedBlock.transactions, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL CHI TIẾT GIAO DỊCH */}
      <Modal
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
            <span>CHI TIẾT GIAO DỊCH BLOCKCHAIN (TRANSACTION)</span>
          </Space>
        }
        open={isTxModalOpen}
        onCancel={() => setIsTxModalOpen(false)}
        width={780}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsTxModalOpen(false)}>
            Đóng
          </Button>,
        ]}
      >
        {selectedTx && (
          <div>
            <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Transaction ID (TxID)">
                <Paragraph code copyable style={{ margin: 0, fontWeight: 'bold' }}>
                  {selectedTx.txId}
                </Paragraph>
              </Descriptions.Item>
              <Descriptions.Item label="Khối xác nhận (Block #)">
                <Tag color="#108ee9">#{selectedTx.blockNumber}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Kênh (Channel)">
                <Text strong>{selectedTx.channel || 'mychannel'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Hợp đồng thông minh (Smart Contract)">
                <Tag color="blue">{selectedTx.chaincode || 'educert'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Hàm thực thi (Function)">
                <Tag color="cyan">{selectedTx.function || selectedTx.type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Tổ chức đề xuất (Creator MSP)">
                <Tag color="geekblue">{selectedTx.creatorMSP}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Xác thực ký duyệt (Endorsing MSPs)">
                {(selectedTx.endorsingMSPs || ['Org1MSP', 'Org2MSP']).map((m: string) => (
                  <Tag key={m} color="green">
                    ✓ {m} Endorsed
                  </Tag>
                ))}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái xác thực Ledger">
                <Tag color="success">✓ {selectedTx.status || 'VALID (Đã cam kết)'}</Tag>
              </Descriptions.Item>
            </Descriptions>

            <Title level={5}>Dữ liệu Payload Giao dịch:</Title>
            <div
              style={{
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: 12,
                borderRadius: 6,
                maxHeight: 220,
                overflowY: 'auto',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            >
              <pre style={{ margin: 0 }}>
                {JSON.stringify(selectedTx.payload, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
