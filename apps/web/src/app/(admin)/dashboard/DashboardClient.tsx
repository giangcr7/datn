"use client";
import React, { useState, useEffect } from "react";
import { Card, Row, Col, Typography, Statistic, Button, message, Tag } from "antd";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer, Legend } from "recharts";
import Link from "next/link";
import { SyncOutlined, DatabaseOutlined, SafetyCertificateOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

const COLORS = ['#0056b3', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];

export default function DashboardClient({ stats }: { stats: any }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [chartData, setChartData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/statistics')
      .then(r => r.json())
      .then(d => { if (d.success) setChartData(d.data); });
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        message.success(data.message);
        setTimeout(() => window.location.reload(), 1000);
      } else {
        message.error("Lỗi: " + data.error);
      }
    } catch { message.error("Không thể kết nối!"); }
    finally { setIsSyncing(false); }
  };

  const isSynced = stats.totalOnChain === stats.totalOffChain;

  return (
    <div className="p-8 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-10 border-b pb-6">
          <Title level={2} style={{ margin: 0, color: "#002140" }}>
            HỆ THỐNG QUẢN TRỊ VĂN BẰNG BLOCKCHAIN
          </Title>
          <Button type="primary" danger icon={<SyncOutlined spin={isSyncing} />} loading={isSyncing} onClick={handleSync} size="large">
            Sync từ Blockchain
          </Button>
        </div>

        {/* Thống kê tổng quan */}
        <Row gutter={24} className="mb-8">
          <Col span={6}>
            <Card variant="borderless" className="bg-gray-50">
              <Statistic title="TỔNG SINH VIÊN" value={stats.totalStudents} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" className="bg-gray-50">
              <Statistic title="OFF-CHAIN (MONGODB)" value={stats.totalOffChain} suffix="Bản ghi" />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" className="bg-gray-50">
              <Statistic title="ON-CHAIN (BLOCKCHAIN)" value={stats.totalOnChain} valueStyle={{ color: "#3f8600" }} prefix={<SafetyCertificateOutlined />} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" className="bg-gray-50">
              <Statistic title="ĐÃ THU HỒI" value={chartData?.totalRevoked || 0} valueStyle={{ color: "#cf1322" }} />
              <Tag color={isSynced ? "success" : "error"} className="mt-2">
                {isSynced ? "Dữ liệu đồng nhất" : "Cần đồng bộ"}
              </Tag>
            </Card>
          </Col>
        </Row>

        {/* Biểu đồ */}
        {chartData && (
          <>
            {/* Row 1: Cấp bằng theo tháng + Revoke theo tháng */}
            <Row gutter={24} className="mb-6">
              <Col span={14}>
                <Card title="📈 Văn bằng cấp theo tháng (12 tháng gần nhất)" variant="borderless" className="bg-gray-50">
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData.byMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#0056b3" strokeWidth={2} dot={false} name="Số văn bằng" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col span={10}>
                <Card title="⚠️ Thu hồi theo tháng" variant="borderless" className="bg-gray-50">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData.byRevoke}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#f5222d" name="Số thu hồi" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            </Row>

            {/* Row 2: Top ngành + Xếp loại + Năm */}
            <Row gutter={24} className="mb-8">
              <Col span={12}>
                <Card title="🏆 Top 10 ngành học" variant="borderless" className="bg-gray-50">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData.byMajor} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#0056b3" name="Số văn bằng" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col span={6}>
                <Card title="🎓 Phân bố xếp loại" variant="borderless" className="bg-gray-50">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={chartData.byGrade} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                        label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {chartData.byGrade.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col span={6}>
                <Card title="📅 Theo năm tốt nghiệp" variant="borderless" className="bg-gray-50">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData.byYear}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#0056b3" strokeWidth={2} dot={false} name="Số văn bằng" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            </Row>
          </>
        )}

        {/* Điều hướng */}
        <Row gutter={[24, 24]}>
          {[
            { name: "Quản lý Sinh viên", path: "/students", color: "#096dd9" },
            { name: "Cấp phát Văn bằng", path: "/issue", color: "#389e0d" },
            { name: "Kho Văn bằng", path: "/certificates", color: "#531dab" },
            { name: "Import Văn bằng", path: "/import", color: "#722ed1" },
            { name: "Import Sinh viên", path: "/students/import", color: "#13c2c2" },
          ].map(m => (
            <Col xs={24} sm={6} key={m.path}>
              <Card variant="borderless" className="bg-gray-50 text-center hover:shadow-md transition-shadow cursor-pointer">
                <Link href={m.path}>
                  <Button type="primary" block size="large" style={{ background: m.color, border: 'none' }}>
                    {m.name}
                  </Button>
                </Link>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
}
