# Điều kiện nghiệm thu trước production

## Đã hoàn thành tại local ngày 11/10/2026

- PostgreSQL schema gồm 25 bảng, 232 cột, 61 FK vật lý, ba migration đã áp dụng.
- Tách admin/migrator/runtime, migrator không superuser, runtime không DDL/DELETE.
- Khóa duy nhất kết quả tốt nghiệp, FK đúng scope, decimal GPA và maker-checker được kiểm thử tại database.
- Snapshot, audit, nguồn file và outbox payload có bảo vệ bất biến.
- API, frontend và chaincode build đạt; unit/regression tests và smoke API đạt.
- Excel preview read-only; file gốc có checksum, chưa commit dữ liệu thật.
- ERD SVG/DBML/Mermaid sinh từ live catalog, không dựng từ model phỏng đoán.

## Chưa được coi là đã nghiệm thu

| Gate                | Trạng thái / việc cần làm                                                    | Bằng chứng nghiệm thu                                      |
| ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Dữ liệu thật        | 1.472 dòng cần review; 483 READY cũng cần xác nhận nghiệp vụ trước commit    | Biên bản đối chiếu, audit override, row counts             |
| Mongo cutover       | Chưa có migration thực dữ liệu Mongo cũ; tool hiện tại chỉ inventory         | Clone/dump, mapping ID, hash/count reconciliation          |
| Fabric upgrade      | Chưa deploy chaincode mới hoặc cấp issuer certificate có attribute           | Test anchor, revoke, retry/idempotency và MSP/policy       |
| Legacy write policy | Chaincode mới chặn issue/revoke cũ, giữ đọc                                  | Chốt phương án xử lý thu hồi legacy trước upgrade          |
| Backup/PITR/HA      | Compose local chưa phải môi trường HA/WAL archive                            | Restore drill, RPO/RTO, cảnh báo giám sát                  |
| Object storage      | Local driver đã có; cấu hình S3/KMS/IAM production chưa kiểm chứng           | Test upload/checksum/versioning/retention và quyền private |
| Hiệu năng           | Chưa load test với dữ liệu lớn/multiple instances                            | p95 latency, query plans, pool/worker limits               |
| Vòng đời nâng cao   | Schema có supersedes/version nhưng chưa có API/UI sửa sai/cấp lại hoàn chỉnh | State-machine tests và nghiệp vụ thay thế được duyệt       |
| Outbox operations   | Worker retry/dead-letter có; chưa có UI replay/alerting đầy đủ               | Dashboard, SOP replay có audit, thử crash/lease recovery   |
| Bảo mật ứng dụng    | Cần review toàn bộ dependency, auth/bootstrap, proxy và log production       | Audit report và regression suite sau cập nhật              |

## Dependency audit đã quan sát

Lần chạy `npm audit --json` ngày 11/10/2026 báo **43 cảnh báo: 4 critical, 26 high, 12 moderate, 1 low** trên toàn monorepo. Đây là báo cáo phụ thuộc tổng thể, không phải chứng minh 43 lỗ hổng đang khai thác được trong luồng database; cũng không được bỏ qua trước release.

Có cảnh báo ở dependency runtime/build hiện hữu như Express/Next/PDF/SheetJS và dependency transitively liên quan công cụ Prisma. Không tự áp dụng đề xuất downgrade/major upgrade hoặc `audit fix --force`. Cần tách môi trường runtime/build, chọn bản vá tương thích, thay parser còn rủi ro nếu cần, rồi chạy lại toàn bộ kiểm thử. Báo cáo chi tiết local nằm trong `.data/dependency-audit-20261011.json`.

## Không được làm để “cho chạy được”

- Không xóa volume hoặc sửa migration history để né lỗi.
- Không tắt TLS, bỏ maker-checker hoặc dùng admin DB trong API.
- Không suy MSSV, ngành, GPA, xếp loại hoặc ngày cấp để lấp dữ liệu thiếu.
- Không chuyển APPROVED thành ON_CHAIN khi chưa có Fabric commit.
- Không tự đánh dấu review mọi dòng Excel bằng ghi chú giả.
- Không xóa Mongo/ledger cũ trước khi chốt cutover và backup.
