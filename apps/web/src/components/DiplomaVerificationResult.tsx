"use client";

import { Button, Descriptions, Result } from "antd";
import type { DiplomaVerification } from "@/lib/public-verification";

const degreeLabels: Record<string, string> = {
  BACHELOR: "Bằng cử nhân",
  ENGINEER: "Bằng kỹ sư",
  MASTER: "Bằng thạc sĩ",
  DOCTOR: "Bằng tiến sĩ",
  OTHER: "Loại khác",
};
const pendingStatuses = new Set([
  "UNAVAILABLE",
  "PKI_UNAVAILABLE",
  "ANCHOR_PENDING",
  "NOT_APPROVED",
  "REPLACEMENT_PENDING",
]);

export default function DiplomaVerificationResult({
  verification,
}: {
  verification: DiplomaVerification;
}) {
  if (!verification.isValid) {
    const pending = pendingStatuses.has(verification.verificationStatus || "");
    return (
      <Result
        status={pending ? "warning" : "error"}
        title={pending ? "CHƯA THỂ XÁC THỰC VĂN BẰNG" : "VĂN BẰNG KHÔNG HỢP LỆ"}
        subTitle={verification.message}
        extra={
          verification.details?.replacementUuid ? (
            <Button
              href={
                "/verify?proof=" +
                encodeURIComponent(
                  JSON.stringify({
                    uuid: verification.details.replacementUuid,
                  }),
                )
              }
            >
              Xác thực văn bằng thay thế
            </Button>
          ) : undefined
        }
      />
    );
  }
  const details = verification.details;
  const issueDate = details?.issueDate?.replace(
    /^(\d{4})-(\d{2})-(\d{2})$/,
    "$3/$2/$1",
  );
  return (
    <Result
      status="success"
      title="VĂN BẰNG HỢP LỆ"
      subTitle="Thông tin văn bằng đã được xác thực."
    >
      {details && (
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Họ và tên">
            <strong>{details.studentName || "-"}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="Mã sinh viên">
            {details.mssv || "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Ngành đào tạo">
            {details.major || "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Loại văn bằng">
            {degreeLabels[details.degreeType || ""] || "Chưa có thông tin"}
          </Descriptions.Item>
          <Descriptions.Item label="Xếp loại">
            {details.grade || "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Năm tốt nghiệp">
            {details.namTotNghiep || "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Số hiệu văn bằng">
            {details.soHieu || "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Số vào sổ">
            {details.soVaoSo || "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Ngày cấp">
            {issueDate || "Chưa có thông tin"}
          </Descriptions.Item>
          {details.printedDiploma?.issuePlace && (
            <Descriptions.Item label="Nơi cấp">
              {details.printedDiploma.issuePlace}
            </Descriptions.Item>
          )}
        </Descriptions>
      )}
    </Result>
  );
}
