"use client";

import PageTitle from "@/components/PageTitle";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from "antd";
import { ArrowRightOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getWorkspace, type WorkspaceUser } from "@/lib/workspace-access";
import {
  dashboardBatchLink,
  dashboardTasks,
  dashboardTime,
  type DashboardBatch,
  type DashboardIssued,
  type DashboardOverview,
} from "@/lib/dashboard";

const { Title, Text, Paragraph } = Typography;
const diplomaStatuses: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: "Đã phát hành", color: "green" },
  REVOKED: { label: "Đã thu hồi", color: "red" },
  SUPERSEDED: { label: "Đã thay thế", color: "default" },
};

export default function DashboardClient({
  user,
  initialOverview,
  loadError,
}: {
  user: WorkspaceUser;
  initialOverview: DashboardOverview | null;
  loadError: boolean;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const workspace = getWorkspace(user);
  const approver = workspace.kind === "approver";
  const data = initialOverview;
  const stats = data?.summary;
  const emptyText = data ? "Chưa có dữ liệu" : "Chưa tải được dữ liệu";
  const indicators = [
    { label: "Hồ sơ cấp văn bằng", value: stats?.totalRecords },
    { label: "Văn bằng trong sổ", value: stats?.registered },
    { label: "Ghi nhận trong tháng", value: stats?.registeredThisMonth },
    { label: "Sinh viên", value: stats?.students },
  ];

  return (
    <div className="workspace-page">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <Tag color={workspace.color}>{workspace.roleLabel}</Tag>
          <PageTitle>Tổng quan</PageTitle>
          <Paragraph type="secondary" style={{ marginBottom: 4 }}>
            {workspace.title} · {user.campusName || workspace.scope}
          </Paragraph>
          <Text type="secondary">
            Cập nhật: {dashboardTime(data?.generatedAt)} (giờ Việt Nam)
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={refreshing}
          onClick={() => startRefresh(() => router.refresh())}
        >
          Làm mới dữ liệu
        </Button>
      </div>
      {loadError && (
        <Alert
          type="error"
          showIcon
          className="mb-6"
          title="Chưa tải được Tổng quan"
          description="Không thể lấy số liệu hiện tại. Các ô chưa có dữ liệu hiển thị —, không phải 0. Anh có thể làm mới để thử lại."
        />
      )}
      <Row gutter={[16, 16]} className="mb-4">
        {indicators.map((indicator) => (
          <Col xs={24} sm={12} xl={6} key={indicator.label}>
            <Card>
              <Statistic
                title={indicator.label}
                value={indicator.value ?? "—"}
                styles={{ content: { color: workspace.color } }}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <Space wrap className="mb-6">
        {approver && (
          <>
            <Link href="/pending?view=replacements">
              <Tag color="blue">
                Thay thế đang soạn: {stats?.replacementDrafts ?? "—"}
              </Tag>
            </Link>
            <Link href="/pending?view=replacements&stage=REQUESTED">
              <Tag color="orange">
                Thay thế chờ duyệt: {stats?.replacementRequested ?? "—"}
              </Tag>
            </Link>
          </>
        )}
        {approver && (
          <Link href="/pending?view=replacements&stage=REJECTED">
            <Tag color="red">
              Thay thế bị từ chối: {stats?.replacementRejected ?? "—"}
            </Tag>
          </Link>
        )}
        <Tag color="green">Đang hiệu lực: {stats?.active ?? "—"}</Tag>
        <Tag color="red">Đã thu hồi: {stats?.revoked ?? "—"}</Tag>
        <Tag>Đã thay thế: {stats?.replaced ?? "—"}</Tag>
        <Tag>Hồ sơ nháp: {stats?.draftRecords ?? "—"}</Tag>
        {approver && (
          <Link href="/pending?view=rejected&stage=DRAFT">
            <Tag color="blue">
              Đang bổ sung: {stats?.reopenedDrafts ?? "—"} · Xử lý
            </Tag>
          </Link>
        )}
        {approver ? (
          <Link href="/pending?view=rejected">
            <Tag color="orange">
              Đã từ chối: {stats?.rejectedRecords ?? "—"} · Xử lý
            </Tag>
          </Link>
        ) : (
          <Tag>Đã từ chối: {stats?.rejectedRecords ?? "—"}</Tag>
        )}
      </Space>

      <Title level={4}>
        {approver ? "Việc cần xử lý" : "Theo dõi phát hành"}
      </Title>
      <Paragraph type="secondary">
        {approver
          ? "Xử lý hồ sơ tại cơ sở chính, từ kiểm tra dữ liệu đến duyệt và phát hành. Các số dòng và số hồ sơ thuộc từng bước, không cộng thành tổng văn bằng."
          : "Theo dõi tình trạng của nhà trường. Tài khoản quản trị không duyệt, ký số hay thu hồi văn bằng."}
      </Paragraph>
      <Row gutter={[16, 16]} className="mb-6">
        {dashboardTasks(data, approver).map((task) => (
          <Col xs={24} md={12} xl={8} key={task.label}>
            <Card style={{ height: "100%" }}>
              <Statistic title={task.label} value={task.value ?? "—"} />
              <Paragraph type="secondary" style={{ marginTop: 12 }}>
                {task.description}
              </Paragraph>
              <Link href={task.href}>
                <Button icon={<ArrowRightOutlined />}>Mở chức năng</Button>
              </Link>
            </Card>
          </Col>
        ))}
      </Row>
      {!!stats?.failedTransactions && (
        <Alert
          type="warning"
          showIcon
          className="mb-6"
          title={`${stats.failedTransactions} giao dịch lỗi đồng bộ`}
          description="Có thể gồm phát hành hoặc thu hồi, kể cả phiên bản cũ. Cần xem lỗi cụ thể; hệ thống không tự coi đây là phát hành thành công."
          action={
            <Link href="/explorer">
              <Button size="small">Xem giao dịch</Button>
            </Link>
          }
        />
      )}

      {approver && (
        <Card
          title="Đợt hồ sơ cần xử lý"
          className="mb-6"
          extra={<Link href="/import">Xem các đợt</Link>}
        >
          <Paragraph type="secondary">
            Tối đa 5 đợt còn việc, ưu tiên đợt tạo trước. Mở đợt để xử lý đúng
            nhóm dữ liệu.
          </Paragraph>
          <Table<DashboardBatch>
            rowKey="id"
            size="small"
            dataSource={data?.imports.batches || []}
            pagination={false}
            scroll={{ x: 780 }}
            locale={{ emptyText }}
            columns={[
              { title: "Tệp dữ liệu", dataIndex: "fileName", ellipsis: true },
              { title: "Cần rà soát", dataIndex: "needsReview", width: 100 },
              { title: "Chờ nhập", dataIndex: "ready", width: 90 },
              {
                title: "Chờ tạo nháp",
                dataIndex: "graduationOnly",
                width: 110,
              },
              { title: "Bản nháp", dataIndex: "prepare", width: 90 },
              {
                title: "Thao tác",
                key: "open",
                width: 110,
                render: (_, batch) => (
                  <Link href={dashboardBatchLink(batch)}>
                    <Button size="small">Mở đợt</Button>
                  </Link>
                ),
              },
            ]}
          />
        </Card>
      )}

      <Title level={4}>Báo cáo cơ bản</Title>
      <Paragraph type="secondary">
        Thống kê văn bằng đã duyệt và có xác nhận phát hành trên blockchain ở
        phiên bản mới nhất, bao gồm cả văn bằng đã thu hồi hoặc thay thế. Nhóm
        ngành và năm lấy từ thông tin bản phát hành.
      </Paragraph>
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} lg={14}>
          <Card
            title="Ghi nhận phát hành trong 6 tháng gần nhất"
            style={{ height: "100%" }}
          >
            <Paragraph type="secondary">
              Theo thời điểm blockchain xác nhận, giờ Việt Nam; không phải ngày
              tạo hồ sơ hay ngày cấp trên bằng.
            </Paragraph>
            {data ? (
              <div style={{ width: "100%", height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byMonth} margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      name="Văn bằng"
                      fill={workspace.color}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description={emptyText} />
            )}
            {!!stats?.undatedRegistrations && (
              <Text type="secondary">
                {stats.undatedRegistrations} văn bằng chưa có thời điểm xác
                nhận, không đưa vào báo cáo tháng.
              </Text>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Theo năm tốt nghiệp" style={{ height: "100%" }}>
            <Table
              rowKey="name"
              size="small"
              dataSource={data?.byYear || []}
              locale={{ emptyText }}
              pagination={{
                pageSize: 5,
                hideOnSinglePage: true,
                showSizeChanger: false,
              }}
              columns={[
                { title: "Năm tốt nghiệp", dataIndex: "name" },
                { title: "Văn bằng", dataIndex: "value", align: "right" },
              ]}
            />
          </Card>
        </Col>
        <Col span={24}>
          <Card title="Văn bằng theo ngành">
            {data?.byMajor.length ? (
              <div
                style={{
                  width: "100%",
                  height: Math.max(240, Math.min(data.byMajor.length, 10) * 40),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.byMajor.slice(0, 10)}
                    layout="vertical"
                    margin={{ right: 30 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={165}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      name="Văn bằng"
                      fill={workspace.color}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description={emptyText} />
            )}
            {!!data && data.byMajor.length > 10 && (
              <Text type="secondary">
                Hiển thị 10 ngành có nhiều văn bằng nhất.
              </Text>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title="Văn bằng ghi nhận gần đây"
        className="mb-6"
        extra={<Link href="/certificates">Mở sổ văn bằng</Link>}
      >
        <Table<DashboardIssued>
          rowKey="id"
          size="small"
          dataSource={data?.recentIssued || []}
          pagination={false}
          scroll={{ x: 760 }}
          locale={{ emptyText }}
          columns={[
            {
              title: "Họ tên",
              dataIndex: "fullName",
              render: (value: string | null) => value || "—",
            },
            {
              title: "MSSV",
              dataIndex: "mssv",
              render: (value: string | null) => value || "—",
            },
            {
              title: "Số hiệu",
              dataIndex: "certificateNo",
              render: (value: string | null) =>
                value ? (
                  <Link
                    href={
                      "/certificates?" + new URLSearchParams({ search: value })
                    }
                  >
                    {value}
                  </Link>
                ) : (
                  "—"
                ),
            },
            {
              title: "Trạng thái",
              dataIndex: "status",
              render: (value: string) => {
                const status = diplomaStatuses[value];
                return (
                  <Tag color={status?.color}>{status?.label || value}</Tag>
                );
              },
            },
            {
              title: "Ghi nhận lúc",
              dataIndex: "committedAt",
              render: (value: string | null) => dashboardTime(value),
            },
          ]}
        />
      </Card>
      <Title level={4}>Truy cập nhanh</Title>
      <Row gutter={[16, 16]}>
        {workspace.links.map((link) => (
          <Col xs={24} md={12} xl={8} key={link.path}>
            <Card
              style={{
                height: "100%",
                borderTop: "3px solid " + workspace.color,
              }}
            >
              <Title level={5}>{link.label}</Title>
              <Paragraph type="secondary">{link.description}</Paragraph>
              <Link href={link.path}>
                <Button icon={<ArrowRightOutlined />}>
                  Mở {link.label.toLocaleLowerCase("vi-VN")}
                </Button>
              </Link>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
