# Kiến trúc dữ liệu đề xuất

## Kết luận ngắn

Phương án tốt hơn hiện tại là **PostgreSQL + Prisma cho nghiệp vụ, object storage cho file gốc, Hyperledger Fabric chỉ làm lớp neo toàn vẹn**. Không tiếp tục dùng MongoDB làm nguồn chính cho văn bằng và không dựng explorer bằng cách tự sinh block từ database.

## Vì sao thay đổi

| Vấn đề của mô hình cũ                                          | Thiết kế mới                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Một document trộn sinh viên, điểm, số hiệu và trạng thái chain | Tách students, graduation_records, diplomas, diploma_versions, blockchain_anchors |
| Không thể lưu chắc chắn nhiều lần tốt nghiệp/thay thế văn bằng | Khóa nghiệp vụ theo trường, sinh viên, ngành, năm; version và replacement riêng   |
| Import Excel ghi thẳng vào tài khoản hoặc certificate          | source_documents → import_batches → import_rows → review → commit                 |
| 2025 thiếu số văn bằng bị coi là lỗi hoặc tạo record thiếu     | Chỉ tạo graduation_record; diploma chỉ tạo khi đủ cặp số                          |
| Gọi Fabric trong request làm DB và chain lệch khi timeout      | Transaction DB tạo outbox_events; worker retry có lease/idempotency               |
| Explorer giả lập block/hash                                    | Chỉ hiển thị anchor index; block thật cần Fabric block event indexer              |
| Audit phụ thuộc Mongo                                          | audit_logs append-only và có actor/institution                                    |

## Ranh giới dữ liệu

### PostgreSQL

Lưu PII, hồ sơ sinh viên, ngành, lớp, quyết định, hồ sơ tốt nghiệp, văn bằng, trạng thái quy trình, snapshot payload, audit, import staging và outbox.

### Object storage

Lưu file Excel/PDF gốc theo key bất biến {institutionId}/{sha256}.xlsx. Database chỉ lưu metadata, media type, size và checksum. Production nên dùng S3/MinIO có versioning, SSE-KMS, private bucket và lifecycle.

### Hyperledger Fabric

Lưu {uuid, version, schemaVersion, payloadHash, issuerMspId, issueTxId, revokeTxId, isRevoked}. Không đưa họ tên, MSSV, ngày sinh, GPA hay số văn bằng đầy đủ lên chain. Chaincode mới có AnchorDiploma, RevokeDiplomaAnchor, QueryDiplomaAnchor; chaincode cũ giữ để xác minh bản ghi legacy.

## Luồng cấp văn bằng

1. Cán bộ tạo Diploma ở REQUESTED trong cùng transaction với GraduationRecord nếu hồ sơ mới.
2. Người khác có quyền phê duyệt kiểm tra dữ liệu và chuyển APPROVED.
3. Transaction phê duyệt tạo DiplomaVersion, BlockchainAnchor(QUEUED) và OutboxEvent cùng transaction.
4. Worker lấy outbox bằng FOR UPDATE SKIP LOCKED, gọi Fabric, rồi cập nhật COMMITTED/FAILED.
5. API chỉ trả ON_CHAIN khi anchor issue đã COMMITTED; không dùng APPROVED để giả là đã lên chain.
6. Thu hồi tạo event/anchor REVOKE, không xóa snapshot cũ.

## Quy tắc toàn vẹn

- certificate_no và registry_no unique theo institution.
- student_code unique theo institution; không dùng MSSV làm primary key.
- program_aliases có unique normalized name để ngăn ánh xạ mơ hồ.
- raw_data nguồn không bị sửa; correction nằm ở overrides và audit.
- Checksum nguồn phải trùng file lưu object storage.
- Mọi hash v1 dùng canonical JSON; không dùng JSON.stringify phụ thuộc thứ tự key.
- Retry Fabric phải idempotent; cùng UUID/version/hash không tạo anchor khác.

## Bảo mật và vận hành

- Runtime role PostgreSQL chỉ có DML; migration role mới có DDL.
- JWT chỉ chứa account/membership/sessionVersion; guard nạp lại account để thu hồi phiên.
- Refresh token chỉ lưu SHA-256; phát hiện reuse sẽ thu hồi cả family.
- File upload giới hạn 5 MB, kiểm tra ZIP OOXML, chặn path traversal, kiểm tra checksum và không tự tính lại công thức Excel.
- Production bật TLS PostgreSQL, private object storage, backup mã hóa, RPO/RTO được phê duyệt và retention audit tối thiểu theo quy định nhà trường.
