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
- [Luồng hiện tại: một cơ sở TP.HCM, một cán bộ duyệt](./single-campus-workflow.md)
- [Luồng hai cơ sở trước đây (lịch sử)](./luong-ha-noi-blockchain.md)
- [Hướng dẫn demo từng bước](./huong-dan-demo-tung-buoc.md)
- [Kết quả kiểm thử và lưu ý demo](./ket-qua-kiem-thu-demo.md)

## Quy tắc quan trọng

1. PostgreSQL là nguồn dữ liệu nghiệp vụ duy nhất.
2. File Excel gốc được giữ nguyên, checksum SHA-256 và staging theo sheet/dòng.
3. Sinh viên, kết quả tốt nghiệp và văn bằng là ba thực thể khác nhau.
4. Chưa có số hiệu/số vào sổ thì chỉ tạo hồ sơ tốt nghiệp; không tạo văn bằng giả định.
5. Fabric chỉ neo hash snapshot và trạng thái sự kiện qua outbox; không ghi PII đầy đủ lên chain.
6. Mọi sửa dữ liệu import phải có override, người duyệt, thời gian và lý do.
7. Không tự suy xếp loại từ GPA và không tự sửa dữ liệu khi phát hiện cột bị đảo.

## Trạng thái hiện tại

Luồng hiện tại dùng một cơ sở chính TP.HCM và một cán bộ duyệt phát hành, PDF mới có một chữ ký số. Migration `20261027160000_single_campus_approval` bảo toàn văn bằng và chữ ký lịch sử. Bằng chứng TSA/OCSP/CRL tiếp tục được kiểm tra; `Org1MSP` là danh tính phát hành kỹ thuật của nhà trường, không còn bước chuyển hồ sơ sang Hà Nội. Local PostgreSQL được khởi tạo bằng compose.database.yaml; không reset dữ liệu hoặc ledger khi đổi luồng.

## ERD và báo cáo nguồn

- [ERD nghiệp vụ](./erd-core.svg) và [ERD đầy đủ](./erd-full.svg).
- [Ràng buộc vật lý](./constraints.md) và [kết quả đọc Excel](./excel-findings.md).
- ERD sinh từ PostgreSQL catalog đã migrate: 27 bảng, 263 cột và 68 khóa ngoại vật lý, gồm `signed_diploma_documents` và `diploma_pdf_signatures.validation_evidence`. SVG/Mermaid hiển thị quan hệ đơn cột để tránh lặp scope; DBML và constraints.md chứa cả composite FK.
- Schema/migration chạy local; Excel mới preview, chưa commit. Fabric local đã có chaincode `educert` sequence 2 và issuer Hà Nội; production vẫn cần gate cutover riêng.
