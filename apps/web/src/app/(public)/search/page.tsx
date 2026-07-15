"use client";
import React, { useState, useEffect, useRef } from "react";
import { Input, Card, Tag, Button, Spin, Empty, Typography, Row, Col } from "antd";
import { SearchOutlined, SafetyCertificateOutlined, WarningOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";

const { Title, Text } = Typography;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<any>(null);
  const router = useRouter();

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/search?q=" + encodeURIComponent(query));
        const data = await res.json();
        if (data.success) setResults(data.results);
      } catch {}
      finally { setLoading(false); setSearched(true); }
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div style={{ background: "#0056b3", padding: "40px 20px", textAlign: "center" }}>
        <Title level={2} style={{ color: "white", margin: 0 }}>Tra Cứu Văn Bằng Tốt Nghiệp</Title>
        <Text style={{ color: "#cce0ff", display: "block", marginTop: 8 }}>Trường Đại học Thủy Lợi — Hệ thống Blockchain</Text>
        <div style={{ maxWidth: 600, margin: "24px auto 0" }}>
          <Input size="large" placeholder="Nhập họ tên hoặc mã số sinh viên..." prefix={<SearchOutlined />}
            value={query} onChange={e => setQuery(e.target.value)} style={{ borderRadius: 8 }} allowClear />
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
        {loading && <div className="text-center py-12"><Spin size="large" /><div className="mt-4 text-gray-500">Đang tìm kiếm...</div></div>}

        {!loading && searched && results.length === 0 && <Empty description="Không tìm thấy văn bằng nào phù hợp" />}

        {!loading && results.length > 0 && (
          <>
            <Text type="secondary" className="block mb-4">Tìm thấy <strong>{results.length}</strong> kết quả</Text>
            <Row gutter={[16, 16]}>
              {results.map(cert => (
                <Col span={24} key={cert.uuid}>
                  <Card hoverable style={{ borderRadius: 12, border: cert.isRevoked ? "1px solid #ff4d4f" : "1px solid #e8e8e8" }}>
                    <Row align="middle" justify="space-between">
                      <Col xs={24} md={16}>
                        <div className="flex items-center gap-3 mb-2">
                          <Text strong style={{ fontSize: 18 }}>{cert.fullName}</Text>
                          {cert.isRevoked
                            ? <Tag color="red" icon={<WarningOutlined />}>ĐÃ THU HỒI</Tag>
                            : <Tag color="green" icon={<SafetyCertificateOutlined />}>HỢP LỆ</Tag>}
                        </div>
                        <Row gutter={[16, 4]}>
                          <Col span={12}><Text type="secondary">MSSV: </Text><Text strong>{cert.mssv}</Text></Col>
                          <Col span={12}><Text type="secondary">Ngành: </Text><Text>{cert.major}</Text></Col>
                          <Col span={12}><Text type="secondary">Xếp loại: </Text><Text strong style={{ color: "#0056b3" }}>{cert.grade}</Text></Col>
                          <Col span={12}><Text type="secondary">Năm TN: </Text><Text>{cert.namTotNghiep}</Text></Col>
                          <Col span={12}><Text type="secondary">Số hiệu: </Text><Text>{cert.soHieu}</Text></Col>
                          <Col span={12}><Text type="secondary">Ngày cấp: </Text><Text>{cert.issueDate}</Text></Col>
                        </Row>
                      </Col>
                      <Col xs={24} md={8} style={{ textAlign: "right", marginTop: 8 }}>
                        <Button type="primary" size="large" icon={<SafetyCertificateOutlined />}
                          onClick={() => router.push("/verify?proof=" + encodeURIComponent(JSON.stringify({ uuid: cert.uuid, certUUID: cert.uuid })))}
                          disabled={cert.isRevoked} style={{ borderRadius: 8 }}>
                          Xác thực ngay
                        </Button>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              ))}
            </Row>
          </>
        )}

        {!searched && !loading && (
          <div className="text-center py-16 text-gray-400">
            <SearchOutlined style={{ fontSize: 48, marginBottom: 16 }} />
            <div>Nhập tên hoặc MSSV để bắt đầu tìm kiếm</div>
          </div>
        )}
      </div>
    </div>
  );
}
