"use client";

import PageTitle from "@/components/PageTitle";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Table,
  Button,
  Typography,
  Badge,
  Input,
  Space,
  message,
  Tooltip,
  Drawer,
  Descriptions,
  Spin,
  Alert,
  Tag,
} from "antd";
import { FileExcelOutlined, ReloadOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";

const { Text } = Typography;

export default function StudentsClient({
  initialData,
}: {
  initialData: any[];
}) {
  const router = useRouter();
  const [data, setData] = useState<any[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [studentDetail, setStudentDetail] = useState<any>(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [studentDetailError, setStudentDetailError] = useState("");
  const studentDetailRequestId = useRef(0);

  const fetchStudents = useCallback(async (page = 1, limit = 20, q = "") => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/students?page=${page}&limit=${limit}&search=${encodeURIComponent(q)}`,
      );
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setPagination((prev) => ({
          ...prev,
          current: page,
          pageSize: limit,
          total: json.total,
        }));
      }
    } catch {
      message.error("Lỗi tải dữ liệu!");
    } finally {
      setLoading(false);
    }
  }, []);

  const openStudentDetail = async (record: any) => {
    const currentRequest = ++studentDetailRequestId.current;
    setSelectedStudent(record);
    setStudentDetail(null);
    setStudentDetailError("");
    setStudentDetailLoading(true);
    try {
      const response = await fetch(
        `/api/students/${encodeURIComponent(record.id)}`,
        { cache: "no-store" },
      );
      const json = await response.json();
      if (!response.ok || json.success === false)
        throw new Error(json.error || "Không tải được chi tiết sinh viên");
      if (currentRequest !== studentDetailRequestId.current) return;
      setStudentDetail(json.data ?? json);
    } catch (error) {
      if (currentRequest === studentDetailRequestId.current)
        setStudentDetailError(
          error instanceof Error
            ? error.message
            : "Không tải được chi tiết sinh viên",
        );
    } finally {
      if (currentRequest === studentDetailRequestId.current)
        setStudentDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const columns = [
    {
      title: "Họ và tên",
      dataIndex: "name",
      key: "name",
      render: (text: string) => <Text strong>{text}</Text>,
    },
    { title: "Email", dataIndex: "email", key: "email" },
    {
      title: "MSSV",
      dataIndex: "studentId",
      key: "studentId",
      render: (text: string) => <Text code>{text}</Text>,
    },
    {
      title: "Tài khoản",
      dataIndex: "hasPassword",
      key: "hasPassword",
      render: (has: boolean) =>
        has ? (
          <Badge status="success" text="Đã kích hoạt" />
        ) : (
          <Badge status="default" text="Chưa kích hoạt" />
        ),
    },
    {
      title: "Ngày tạo",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (date: string) =>
        date ? new Date(date).toLocaleDateString("vi-VN") : "N/A",
    },
    {
      title: "Thao tác",
      key: "action",
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title="Xem đầy đủ hồ sơ sinh viên">
            <Button size="small" onClick={() => void openStudentDetail(record)}>
              Chi tiết
            </Button>
          </Tooltip>
          {!record.hasPassword && (
            <Tooltip title="Gửi lại mật khẩu tạm thời qua email">
              <Button
                size="small"
                onClick={async () => {
                  const response = await fetch(
                    `/api/students/${encodeURIComponent(record.id)}/resend-password`,
                    { method: "POST" },
                  );
                  const result = await response.json();
                  if (!response.ok || !result.success)
                    message.error(
                      result.error || "Không gửi lại được mật khẩu",
                    );
                  else message.success("Đã gửi lại mật khẩu tạm thời");
                }}
              >
                Gửi lại mật khẩu
              </Button>
            </Tooltip>
          )}
          <Tooltip title="Xem văn bằng của sinh viên này">
            <Button
              size="small"
              onClick={() =>
                router.push(`/certificates?search=${record.studentId}`)
              }
            >
              Văn bằng
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="workspace-page">
      <div className="min-w-0">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6 border-b pb-4">
          <PageTitle>Hồ sơ sinh viên của cơ sở</PageTitle>
          <Space>
            <Button
              icon={<FileExcelOutlined />}
              onClick={() => router.push("/students/import")}
            >
              Nhập danh sách sinh viên
            </Button>
            <Button
              icon={<ReloadOutlined />}
              aria-label="Làm mới danh sách"
              title="Làm mới danh sách"
              onClick={() => fetchStudents(1, pagination.pageSize, search)}
            />
          </Space>
        </div>

        <div className="mb-4">
          <Input.Search
            placeholder="Tìm theo tên, MSSV, email..."
            allowClear
            style={{ width: 400, maxWidth: "100%" }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(value) => fetchStudents(1, pagination.pageSize, value)}
          />
          <Drawer
            title={
              studentDetail
                ? `Chi tiết sinh viên — ${studentDetail.name}`
                : `Chi tiết sinh viên — ${selectedStudent?.name || ""}`
            }
            open={!!selectedStudent}
            onClose={() => {
              studentDetailRequestId.current += 1;
              setSelectedStudent(null);
              setStudentDetail(null);
              setStudentDetailError("");
            }}
            width={760}
          >
            {studentDetailLoading ? (
              <div className="flex justify-center py-12">
                <Spin tip="Đang tải hồ sơ sinh viên..." />
              </div>
            ) : studentDetailError ? (
              <Alert
                type="error"
                showIcon
                title="Không tải được chi tiết"
                description={studentDetailError}
              />
            ) : studentDetail ? (
              <Space direction="vertical" size="large" className="w-full">
                <Descriptions title="Thông tin cá nhân" bordered column={1} size="small">
                  <Descriptions.Item label="Họ và tên">{studentDetail.name || "—"}</Descriptions.Item>
                  <Descriptions.Item label="MSSV">{studentDetail.studentId || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Ngày sinh">{studentDetail.dob || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Nơi sinh">{studentDetail.birthPlace || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Giới tính">{studentDetail.gender || "—"}</Descriptions.Item>
                  <Descriptions.Item label="Dân tộc / Quốc tịch">
                    {[studentDetail.ethnicity, studentDetail.nationality].filter(Boolean).join(" / ") || "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Email / Điện thoại">
                    {[studentDetail.email, studentDetail.phone].filter(Boolean).join(" · ") || "—"}
                  </Descriptions.Item>
                </Descriptions>
                <Descriptions title="Tài khoản truy cập" bordered column={1} size="small">
                  <Descriptions.Item label="Trạng thái">
                    {studentDetail.account ? (
                      <Tag color={studentDetail.account.active ? "green" : "red"}>
                        {studentDetail.account.active
                          ? studentDetail.account.status === "ACTIVE"
                            ? "Đang hoạt động"
                            : "Chờ kích hoạt"
                          : "Đã khóa"}
                      </Tag>
                    ) : (
                      "Chưa có tài khoản"
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="Email tài khoản">
                    {studentDetail.account?.email || "—"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Cập nhật gần nhất">
                    {studentDetail.account?.updatedAt
                      ? new Date(studentDetail.account.updatedAt).toLocaleString("vi-VN")
                      : "—"}
                  </Descriptions.Item>
                </Descriptions>
                <div>
                  <Typography.Title level={5}>Ngành, lớp và cơ sở</Typography.Title>
                  <Table
                    rowKey="id"
                    size="small"
                    bordered
                    pagination={false}
                    dataSource={studentDetail.enrollments || []}
                    locale={{ emptyText: "Chưa có thông tin đào tạo" }}
                    columns={[
                      { title: "Ngành", render: (_: unknown, row: any) => row.program?.name || "—" },
                      { title: "Lớp", render: (_: unknown, row: any) => row.academicClass?.code || "—" },
                      { title: "Cơ sở", render: (_: unknown, row: any) => row.campus?.name || row.campus?.code || "—" },
                      { title: "Niên khóa", render: (_: unknown, row: any) => [row.startYear, row.endYear].filter(Boolean).join(" - ") || row.cohortCode || "—" },
                    ]}
                  />
                </div>
                <div>
                  <Typography.Title level={5}>Tốt nghiệp và văn bằng</Typography.Title>
                  {(studentDetail.graduations || []).map((graduation: any) => (
                    <Descriptions
                      key={graduation.id}
                      className="mb-4"
                      title={`${graduation.graduationYear} — ${graduation.program?.name || "Chưa xác định ngành"}`}
                      bordered
                      column={1}
                      size="small"
                      items={[
                        { key: "gpa", label: "GPA / Xếp loại", children: `${graduation.gpa ?? "—"} / ${graduation.classification || "—"}` },
                        { key: "degree", label: "Loại bằng", children: graduation.degreeType || "—" },
                        { key: "decision", label: "Quyết định", children: graduation.decision?.documentNumber || "—" },
                        {
                          key: "diplomas",
                          label: "Văn bằng",
                          children: graduation.diplomas?.length ? (
                            <Space wrap>
                              {graduation.diplomas.map((diploma: any) => (
                                <Button
                                  key={diploma.id}
                                  type="link"
                                  size="small"
                                  onClick={() =>
                                    router.push(
                                      `/certificates?search=${encodeURIComponent(diploma.certificateNo)}`,
                                    )
                                  }
                                >
                                  {diploma.certificateNo} · {diploma.status}
                                </Button>
                              ))}
                            </Space>
                          ) : (
                            "Chưa có văn bằng"
                          ),
                        },
                      ]}
                    />
                  ))}
                  {!studentDetail.graduations?.length && (
                    <Typography.Text type="secondary">Chưa có hồ sơ tốt nghiệp.</Typography.Text>
                  )}
                </div>
              </Space>
            ) : null}
          </Drawer>
        </div>

        <Table
          dataSource={data}
          columns={columns}
          rowKey="id"
          bordered
          size="small"
          loading={loading}
          scroll={{ x: 850 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `Tổng ${total} sinh viên`,
            onChange: (page, pageSize) => fetchStudents(page, pageSize, search),
          }}
        />
      </div>
    </div>
  );
}
