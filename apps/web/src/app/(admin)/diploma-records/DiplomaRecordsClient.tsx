"use client";

import PageTitle from "@/components/PageTitle";

import Link from "next/link";
import { Alert, Button, Card, Col, Row, Steps } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import type { WorkspaceLink } from "@/lib/workspace-access";

export default function DiplomaRecordsClient({
  links,
}: {
  links: WorkspaceLink[];
}) {
  return (
    <div className="workspace-page">
      <PageTitle>Hồ sơ cấp văn bằng</PageTitle>
      <p className="text-gray-500 mb-6">
        Quản lý hồ sơ từ nhập dữ liệu đến duyệt và phát hành tại cơ sở chính.
        Một cán bộ xử lý, không chuyển hồ sơ sang đơn vị khác.
      </p>
      <Card className="mb-6">
        <Steps
          size="small"
          current={-1}
          items={[
            { title: "Nhập hồ sơ" },
            { title: "Kiểm tra dữ liệu" },
            { title: "Duyệt và ký số" },
            { title: "Blockchain xác nhận" },
          ]}
        />
      </Card>
      <Alert
        type="info"
        showIcon
        className="mb-6"
        title="Chỉ ghi nhận đã phát hành sau khi blockchain xác nhận"
        description="Hồ sơ đã duyệt nhưng đang chờ blockchain chưa phải văn bằng đã phát hành. Văn bằng hoàn tất được theo dõi tại Sổ văn bằng."
      />
      <Row gutter={[16, 16]}>
        {links.map((link) => (
          <Col xs={24} md={12} xl={8} key={link.path}>
            <Card style={{ height: "100%" }}>
              <h2 className="text-lg font-semibold mb-3">{link.label}</h2>
              <p className="text-gray-500 mb-5">{link.description}</p>
              <Link href={link.path}>
                <Button type="primary" icon={<ArrowRightOutlined />}>
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
