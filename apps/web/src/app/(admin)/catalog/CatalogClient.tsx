"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { workflowJson } from "@/lib/diploma-workflow";

interface Program {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  nationalCode: string | null;
  active: boolean;
  aliases: { id: string; originalName: string; createdAt: string }[];
}

interface ProgramValues {
  code: string;
  name: string;
  nameEn: string;
  nationalCode?: string;
  note: string;
}

interface AliasValues {
  programId: string;
  originalName: string;
  note: string;
}

export default function CatalogClient() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [programOpen, setProgramOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [aliasOpen, setAliasOpen] = useState(false);
  const [programForm] = Form.useForm<ProgramValues>();
  const [aliasForm] = Form.useForm<AliasValues>();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPrograms(await workflowJson<Program[]>("/api/catalog/programs"));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Không tải được danh mục",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openProgram(program?: Program) {
    setEditing(program || null);
    programForm.resetFields();
    if (program)
      programForm.setFieldsValue({
        code: program.code,
        name: program.name,
        nameEn: program.nameEn || "",
        nationalCode: program.nationalCode || "",
      });
    setProgramOpen(true);
  }

  function openAlias(programId?: string) {
    aliasForm.resetFields();
    aliasForm.setFieldsValue({ programId });
    setAliasOpen(true);
  }

  async function saveProgram(values: ProgramValues) {
    setSaving(true);
    try {
      await workflowJson(
        "/api/catalog/programs" + (editing ? "/" + editing.id : ""),
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      setProgramOpen(false);
      message.success("Đã lưu ngành và ánh xạ tên chính thức.");
      await load();
    } catch (failure) {
      message.error(
        failure instanceof Error ? failure.message : "Không lưu được ngành",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveAlias(values: AliasValues) {
    setSaving(true);
    try {
      await workflowJson("/api/catalog/program-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setAliasOpen(false);
      message.success(
        "Đã bổ sung ánh xạ. Kiểm tra lại dữ liệu để áp dụng cho hồ sơ đang rà soát.",
      );
      await load();
    } catch (failure) {
      message.error(
        failure instanceof Error ? failure.message : "Không lưu được ánh xạ",
      );
    } finally {
      setSaving(false);
    }
  }

  const query = search.trim().toLocaleLowerCase("vi-VN");
  const matches = (...values: (string | null)[]) =>
    values.some((value) => value?.toLocaleLowerCase("vi-VN").includes(query));
  const aliases = programs.flatMap((program) =>
    program.aliases.map((alias) => ({
      ...alias,
      programName: program.name,
      programCode: program.code,
    })),
  );

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <Typography.Title level={2}>Danh mục</Typography.Title>
      <Typography.Paragraph type="secondary">
        Quản lý ngành đào tạo và các tên ngành được chấp thuận khi nhập dữ liệu
        cấp văn bằng.
      </Typography.Paragraph>
      <Alert
        type="info"
        showIcon
        className="mb-5"
        title="Bổ sung ánh xạ khi tên ngành trong file khác tên chính thức"
        description={
          <span>
            Sau khi bổ sung, mở <Link href="/import">Kiểm tra dữ liệu</Link> và
            chọn kiểm tra lại lô hồ sơ. Thay đổi danh mục không sửa PDF hay dữ
            liệu văn bằng đã ký.
          </span>
        }
      />
      {error && <Alert type="error" showIcon title={error} className="mb-4" />}
      <div className="flex flex-wrap gap-2 mb-4">
        <Input.Search
          allowClear
          placeholder="Tìm mã ngành, tên ngành hoặc tên ánh xạ"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ width: 380, maxWidth: "100%" }}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => void load()}
          loading={loading}
        >
          Tải lại
        </Button>
      </div>
      <Tabs
        items={[
          {
            key: "programs",
            label: `Ngành đào tạo (${programs.length})`,
            children: (
              <>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  className="mb-4"
                  onClick={() => openProgram()}
                >
                  Thêm ngành
                </Button>
                <Table<Program>
                  rowKey="id"
                  loading={loading}
                  scroll={{ x: 900 }}
                  dataSource={programs.filter((program) =>
                    matches(
                      program.code,
                      program.name,
                      program.nameEn,
                      program.nationalCode,
                    ),
                  )}
                  pagination={{ pageSize: 20, showSizeChanger: false }}
                  columns={[
                    { title: "Mã ngành", dataIndex: "code" },
                    { title: "Tên ngành", dataIndex: "name" },
                    {
                      title: "Tên tiếng Anh",
                      dataIndex: "nameEn",
                      render: (value: string | null) => value || "Chưa có",
                    },
                    {
                      title: "Mã ngành quốc gia",
                      dataIndex: "nationalCode",
                      render: (value: string | null) => value || "—",
                    },
                    {
                      title: "Trạng thái",
                      dataIndex: "active",
                      render: (active: boolean) => (
                        <Tag color={active ? "green" : "default"}>
                          {active ? "Đang sử dụng" : "Ngừng sử dụng"}
                        </Tag>
                      ),
                    },
                    {
                      title: "Thao tác",
                      key: "actions",
                      render: (_, program) => (
                        <Space wrap>
                          <Button
                            size="small"
                            onClick={() => openProgram(program)}
                          >
                            Cập nhật
                          </Button>
                          <Button
                            size="small"
                            onClick={() => openAlias(program.id)}
                          >
                            Thêm ánh xạ
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: "aliases",
            label: `Ánh xạ tên ngành (${aliases.length})`,
            children: (
              <>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  className="mb-4"
                  onClick={() => openAlias()}
                >
                  Thêm ánh xạ
                </Button>
                <Table
                  rowKey="id"
                  loading={loading}
                  scroll={{ x: 650 }}
                  dataSource={aliases.filter((alias) =>
                    matches(
                      alias.originalName,
                      alias.programName,
                      alias.programCode,
                    ),
                  )}
                  pagination={{ pageSize: 20, showSizeChanger: false }}
                  columns={[
                    {
                      title: "Tên ngành trong dữ liệu nguồn",
                      dataIndex: "originalName",
                    },
                    { title: "Ngành chính thức", dataIndex: "programName" },
                    { title: "Mã ngành", dataIndex: "programCode" },
                    {
                      title: "Ngày bổ sung",
                      dataIndex: "createdAt",
                      render: (value: string) =>
                        new Date(value).toLocaleDateString("vi-VN", {
                          timeZone: "Asia/Ho_Chi_Minh",
                        }),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? "Cập nhật ngành đào tạo" : "Thêm ngành đào tạo"}
        open={programOpen}
        onCancel={() => !saving && setProgramOpen(false)}
        onOk={() => programForm.submit()}
        confirmLoading={saving}
        okText="Lưu ngành"
        cancelText="Hủy"
      >
        <Form form={programForm} layout="vertical" onFinish={saveProgram}>
          <Form.Item
            name="code"
            label="Mã ngành"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={80} disabled={!!editing} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Tên ngành tiếng Việt"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item
            name="nameEn"
            label="Tên ngành tiếng Anh"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item name="nationalCode" label="Mã ngành quốc gia">
            <Input maxLength={30} />
          </Form.Item>
          <Form.Item
            name="note"
            label="Căn cứ / lý do cập nhật"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Bổ sung ánh xạ tên ngành"
        open={aliasOpen}
        onCancel={() => !saving && setAliasOpen(false)}
        onOk={() => aliasForm.submit()}
        confirmLoading={saving}
        okText="Lưu ánh xạ"
        cancelText="Hủy"
      >
        <Form form={aliasForm} layout="vertical" onFinish={saveAlias}>
          <Form.Item
            name="originalName"
            label="Tên ngành xuất hiện trong file nguồn"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item
            name="programId"
            label="Ngành chính thức tương ứng"
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={programs.map((program) => ({
                value: program.id,
                label: `${program.code} — ${program.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="note"
            label="Căn cứ / lý do ánh xạ"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
