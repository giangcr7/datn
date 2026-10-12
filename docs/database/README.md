# Thiết kế cơ sở dữ liệu DiplomaChain

Tài liệu này là baseline để triển khai dài hạn. Mô hình mới không coi Excel là database và không coi blockchain là nơi lưu hồ sơ đầy đủ.

## Bộ tài liệu

- [Kiến trúc và phương án đề xuất](./architecture.md)
- [ERD Mermaid](./erd.mmd)
- [ERD DBML](./erd.dbml)
- [Từ điển dữ liệu](./data-dictionary.md)
- [Quy trình nhập sổ gốc](./import-guide.md)
- [Runbook triển khai/rollback](./runbook.md)
- [Điều kiện nghiệm thu production](./production-gates.md)

## Quy tắc quan trọng

1. PostgreSQL là nguồn dữ liệu nghiệp vụ duy nhất.
2. File Excel gốc được giữ nguyên, checksum SHA-256 và staging theo sheet/dòng.
3. Sinh viên, kết quả tốt nghiệp và văn bằng là ba thực thể khác nhau.
4. Chưa có số hiệu/số vào sổ thì chỉ tạo hồ sơ tốt nghiệp; không tạo văn bằng giả định.
5. Fabric chỉ neo hash snapshot và trạng thái sự kiện qua outbox; không ghi PII đầy đủ lên chain.
6. Mọi sửa dữ liệu import phải có override, người duyệt, thời gian và lý do.
7. Không tự suy xếp loại từ GPA và không tự sửa dữ liệu khi phát hiện cột bị đảo.

## Trạng thái hiện tại

Ba migration đã áp dụng trong `apps/api/prisma/migrations`. Local PostgreSQL được khởi tạo bằng compose.database.yaml; Fabric có thể tắt bằng FABRIC_ENABLED=false để phát triển và import dữ liệu an toàn.

## ERD và báo cáo nguồn

- [ERD nghiệp vụ](./erd-core.svg) và [ERD đầy đủ](./erd-full.svg).
- [Ràng buộc vật lý](./constraints.md) và [kết quả đọc Excel](./excel-findings.md).
- ERD sinh từ PostgreSQL catalog đã migrate: 25 bảng, 232 cột và 61 khóa ngoại vật lý. SVG/Mermaid hiển thị quan hệ đơn cột để tránh lặp scope; DBML và constraints.md chứa cả composite FK.
- Schema/migration chạy local; Excel mới preview, chưa commit. Mongo cũ và Fabric ledger chưa cutover.
