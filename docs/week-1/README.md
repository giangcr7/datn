# Tuần 1 - Khảo sát, kiểm kê và chốt yêu cầu

Thời gian theo kế hoạch: **30/09 - 06/10/2026**.

Thư mục này là bộ đầu ra của Tuần 1:

- [Báo cáo hiện trạng](./status-report.md)
- [Phạm vi cổng xác thực doanh nghiệp](./enterprise-portal-scope.md)
- [Sơ đồ kiến trúc](./architecture.md)
- [Kịch bản demo ban đầu](./demo-script.md)

Chạy lại kiểm tra nhanh trên Windows sau khi đã khởi động hệ thống:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\week1-smoke-test.ps1
```

## Chạy toàn bộ hệ thống bằng một lệnh

Từ thư mục gốc project, chạy:

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

Lệnh này tự kiểm tra Docker, khởi động Fabric network và chaincode nếu cần, sau đó chạy MongoDB, API và frontend.
