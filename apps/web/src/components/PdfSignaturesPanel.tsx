"use client";

import { Alert, Descriptions, Space, Tag, Typography } from "antd";

type RevocationEvidence = {
  method: "OCSP" | "CRL";
  status: string;
  thisUpdate: string;
  nextUpdate: string;
  checkedAt: string;
};

type PkiEvidence = {
  trustAnchorSha256: string;
  revocation: RevocationEvidence[];
  timestamp: {
    time: string;
    authority: string;
    tokenSha256: string;
    revocation: RevocationEvidence[];
  };
};

const pkiLabels: Record<string, string> = {
  VALID: "Đã xác minh CA, TSA và trạng thái thu hồi",
  REVOKED: "Chứng thư đã bị thu hồi",
  STALE: "Bằng chứng thu hồi đã cũ",
  UNKNOWN: "CA không xác định được trạng thái chứng thư",
  UNAVAILABLE: "Dịch vụ PKI chưa khả dụng — chưa đủ bằng chứng",
  NOT_CONFIGURED: "Chưa cấu hình dịch vụ PKI",
  INVALID: "Bằng chứng PKI không hợp lệ",
  NOT_CHECKED: "Hồ sơ cũ — chưa kiểm tra TSA/OCSP/CRL",
};

type Signature = {
  fieldName: string;
  signatureOrder: number;
  organization: string;
  signerName: string;
  certificateSerial: string;
  certificateSha256: string;
  certificateSubject: string;
  certificateIssuer: string;
  signedAt: string;
  validTo: string;
  cryptographicallyValid: boolean;
  pkiStatus?: string;
  pkiError?: string;
  pkiEvidence?: PkiEvidence;
};
export default function PdfSignaturesPanel({
  verification,
}: {
  verification?: {
    valid: boolean;
    signingMode: string;
    signedPdfHash: string;
    pkiStatus?: string;
    signatures: Signature[];
  } | null;
}) {
  if (!verification)
    return (
      <Alert
        type="warning"
        showIcon
        title="Chưa có PDF ký số"
        description="Kết quả đối chiếu dữ liệu/QR không chứng minh file PDF đã được ký. Hồ sơ cũ không được tự xem là bản đã ký số."
      />
    );
  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Alert
        showIcon
        type={verification.signingMode === "demo" ? "warning" : "info"}
        title="Chữ ký PDF được đối chiếu với chứng thư đã neo blockchain"
        description={
          verification.pkiStatus === "VALID"
            ? "Đã kiểm tra chuỗi CA, dấu thời gian TSA và OCSP/CRL. Hash PDF và bằng chứng kiểm tra lúc ký được ràng buộc với snapshot blockchain. " +
              (verification.signingMode === "demo"
                ? "Kết quả xác thực trong phạm vi hệ thống; chứng thư không có giá trị tin cậy công cộng. Hệ thống không tự kết luận giá trị pháp lý."
                : "Hệ thống không tự kết luận giá trị pháp lý.")
            : verification.pkiStatus && verification.pkiStatus !== "NOT_CHECKED"
              ? "Chưa xác minh đầy đủ PKI. Không xem chữ ký hợp lệ chỉ vì hash PDF khớp blockchain."
              : "Hồ sơ dùng chính sách cũ: chỉ kiểm tra mật mã, hash file và fingerprint chứng thư; chưa có TSA/OCSP/CRL. Không tự kết luận giá trị pháp lý."
        }
      />
      <Alert
        showIcon
        type={
          verification.valid && verification.pkiStatus === "VALID"
            ? "success"
            : "warning"
        }
        title={
          pkiLabels[verification.pkiStatus || "NOT_CHECKED"] ||
          "Không xác minh được PKI"
        }
      />
      <Typography.Text copyable={{ text: verification.signedPdfHash }}>
        SHA-256 PDF: {verification.signedPdfHash}
      </Typography.Text>
      {verification.signatures.map((signature) => (
        <Descriptions
          bordered
          size="small"
          column={1}
          key={signature.fieldName}
          title={
            "Chữ ký " +
            signature.signatureOrder +
            " · " +
            signature.organization
          }
        >
          <Descriptions.Item label="Mật mã">
            <Tag color={signature.cryptographicallyValid ? "green" : "red"}>
              {signature.cryptographicallyValid ? "Hợp lệ" : "Không hợp lệ"}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Người thao tác">
            {signature.signerName}
          </Descriptions.Item>
          <Descriptions.Item label="Chủ thể chứng thư">
            {signature.certificateSubject}
          </Descriptions.Item>
          <Descriptions.Item label="Đơn vị cấp chứng thư">
            {signature.certificateIssuer}
          </Descriptions.Item>
          <Descriptions.Item label="Serial">
            {signature.certificateSerial}
          </Descriptions.Item>
          <Descriptions.Item label="Fingerprint SHA-256">
            <Typography.Text copyable>
              {signature.certificateSha256}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Thời gian máy chủ">
            {new Date(signature.signedAt).toLocaleString("vi-VN")} (không phải
            dấu thời gian tin cậy)
          </Descriptions.Item>
          <Descriptions.Item label="TSA / PKI">
            <Tag color={signature.pkiStatus === "VALID" ? "green" : "orange"}>
              {pkiLabels[signature.pkiStatus || "NOT_CHECKED"] ||
                "Không hợp lệ"}
            </Tag>
            {signature.pkiError && <div>{signature.pkiError}</div>}
          </Descriptions.Item>
          {signature.pkiEvidence && (
            <>
              <Descriptions.Item label="Dấu thời gian TSA">
                {new Date(signature.pkiEvidence.timestamp.time).toLocaleString(
                  "vi-VN",
                )}
                <div>{signature.pkiEvidence.timestamp.authority}</div>
              </Descriptions.Item>
              <Descriptions.Item label="CA gốc tin cậy (SHA-256)">
                <Typography.Text copyable>
                  {signature.pkiEvidence.trustAnchorSha256}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Kiểm tra thu hồi chứng thư">
                {signature.pkiEvidence.revocation.map((evidence, index) => (
                  <div key={index}>
                    <Tag color="green">{evidence.method}: Không bị thu hồi</Tag>
                    Kiểm tra lúc{" "}
                    {new Date(evidence.checkedAt).toLocaleString("vi-VN")}; bằng
                    chứng có hạn đến{" "}
                    {new Date(evidence.nextUpdate).toLocaleString("vi-VN")}.
                  </div>
                ))}
              </Descriptions.Item>
              <Descriptions.Item label="Thu hồi chứng thư TSA">
                {signature.pkiEvidence.timestamp.revocation.map(
                  (evidence, index) => (
                    <div key={index}>
                      <Tag color="green">
                        {evidence.method}: Không bị thu hồi
                      </Tag>
                      Bằng chứng có hạn đến{" "}
                      {new Date(evidence.nextUpdate).toLocaleString("vi-VN")}.
                    </div>
                  ),
                )}
              </Descriptions.Item>
            </>
          )}
          <Descriptions.Item label="Hạn chứng thư">
            {new Date(signature.validTo).toLocaleString("vi-VN")}
          </Descriptions.Item>
        </Descriptions>
      ))}
    </Space>
  );
}
