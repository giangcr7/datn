# Runbook triển khai và cutover

## Khởi tạo local

```powershell
npm ci
Copy-Item .env.infrastructure.example .env.infrastructure
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/api/.env.database.example apps/api/.env.database
Copy-Item apps/web/.env.example apps/web/.env.local
# Điền secret trước khi chạy tiếp; không dùng nguyên giá trị replace-...
docker compose --env-file .env.infrastructure -f compose.database.yaml up -d --wait
npm run db:generate -w api
npm run db:migrate -w api
npm run db:seed -w api
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

API chỉ dùng `DATABASE_URL` của `diplomachain_app`. CLI migration đọc `DIRECT_DATABASE_URL` trong `apps/api/.env.database`. Không mount file migration secret vào API production. Password có ký tự đặc biệt phải URL-encode trong connection string.

Seed chỉ tạo tài khoản nếu đặt `BOOTSTRAP_*_EMAIL/PASSWORD`; password tối thiểu 12 ký tự và không ghi đè password hiện hữu. Không in secret ra console hoặc đưa vào git. Cần ít nhất hai cán bộ độc lập cho maker-checker; một người không được tự phê duyệt yêu cầu của mình.

## Quyền database

| Role                    | Mục đích                                | Giới hạn                                                          |
| ----------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| `diplomachain_admin`    | Bootstrap/quản trị có kiểm soát         | Không dùng trong API hoặc pipeline migration thông thường         |
| `diplomachain_migrator` | Sở hữu object nghiệp vụ, chạy migration | Không SUPERUSER, CREATEDB, CREATEROLE, REPLICATION hoặc BYPASSRLS |
| `diplomachain_app`      | API, seed danh mục, outbox              | Không DDL/DELETE; bảng lịch sử chỉ SELECT/INSERT                  |

Compose init script chỉ chạy trên volume mới. Đổi env không tự đổi password/role trong volume có dữ liệu. Local hiện tại đã được backup và chuyển quyền sở hữu các object nghiệp vụ trong schema public sang migrator mới; bootstrap cũ được đổi tên `diplomachain_bootstrap` và `NOLOGIN`. Không dùng `docker compose down -v` để xử lý lỗi kết nối.

## Kiểm tra trước release

```powershell
docker compose --env-file .env.infrastructure -f compose.database.yaml ps
npx prisma migrate status --config apps/api/prisma.config.ts
npm run build -w api
npm run build -w @diploma-chain/web
npm run build -w chaincode
npm run test -w api -- --runInBand
npm run test:database -w api
node scripts/smoke-api.mjs
npm run db:erd -w api
```

Chạy smoke sau khi build hoàn tất, không chạy song song với quá trình đang xóa/tạo lại `dist`. `GET /api/health` phải báo PostgreSQL UP. `FABRIC_ENABLED=false` báo Fabric DISABLED và không xử lý outbox; đây không phải xác nhận blockchain đã sẵn sàng. Smoke test dùng port riêng, Fabric/outbox tắt, không phát hành văn bằng và chỉ tác động phiên bootstrap local.

## Release migration

1. Backup và thử restore trước migration quan trọng.
2. Review CHECK, trigger, composite FK, partial index và quyền runtime.
3. Điều phối writer nếu migration gây lock hoặc chuyển đổi dữ liệu dài.
4. Chạy `npm run db:migrate -w api` bằng migrator; không `db push` và không sửa migration đã áp dụng.
5. Kiểm tra migration history, health, quyền runtime và smoke nghiệp vụ.

## Cutover MongoDB — chưa thực hiện

MongoDB cũ chưa được migrate hoặc xóa. `npm run legacy:inspect -w api` chỉ kiểm kê collection/count khi cung cấp `MONGODB_URI` bằng env riêng; không xuất PII hoặc ghi database. Schema Mongo được giữ để tham chiếu lịch sử, không còn được gắn vào runtime API.

1. Đóng băng ghi Mongo, tạo dump mã hóa, ghi count/checksum và thử restore.
2. Viết/review migration theo nguồn: giữ UUID/hash gốc, map ObjectId trong `legacy_id_maps`; không mang refresh token/OTP cũ sang hệ thống mới.
3. Đối chiếu tenant/campus, chương trình lịch sử, ngày cấp và 11 trường hash legacy. Mâu thuẫn phải vào review, không upsert đè.
4. Chạy trên clone trước, so row counts/hash và kiểm thử xác thực. Legacy revocation chưa có luồng cutover hoàn chỉnh.
5. Chỉ đổi traffic sau nghiệm thu; giữ Mongo read-only theo thời hạn lưu trữ đã được duyệt.

## Cutover Fabric — chưa thực hiện

Chaincode mới đã build nhưng chưa nâng cấp trên network hiện có. Startup không tự deploy hoặc tự chọn channel theo script cũ.

1. Backup ledger; chốt `FABRIC_CHANNEL`/`FABRIC_CHAINCODE` khớp network thật.
2. Review lifecycle, endorsement policy và identity từng MSP.
3. Enroll identity có attribute `diploma.issuer=true` trong certificate; MSP phải khớp campus.
4. Deploy upgrade có chủ đích, kiểm thử anchor/revoke/idempotency trên hồ sơ thử nghiệm.
5. Sau đó mới bật Fabric/outbox; theo dõi pending/dead-letter, không sửa trạng thái thành ON_CHAIN bằng tay.

Chaincode mới giữ endpoint đọc legacy nhưng chặn `IssueCertificate` và `RevokeCertificate` cũ. Muốn xử lý thu hồi hồ sơ legacy phải có phương án migration riêng trước upgrade; không được phát hành lại toàn bộ PII bằng giao dịch cũ.

## Excel và file nguồn

File gốc đã preview, chưa stage/commit dữ liệu thật. Có 1.955 dòng, 483 READY và 1.472 NEEDS_REVIEW; xem `excel-findings.md` và `import-guide.md`. READY chỉ có nghĩa là hợp lệ với mapping/validator, không thay thế nghiệm thu của nhà trường.

Driver hiện tại lưu nguồn .xlsx trong local private storage hoặc S3. PDF tải từ web là bản xuất trên client, không mặc nhiên là scan gốc có chữ ký. Muốn lưu PDF chính thức cần bổ sung quy trình upload/kiểm duyệt riêng.

## Backup, rollback và phục hồi

- Database: full backup + WAL/PITR, mã hóa, định nghĩa RPO/RTO và thử restore định kỳ. Compose local một node không phải HA/PITR.
- Restore dump vào database mới; dùng `--no-owner` nếu role nguồn không còn tồn tại, review/reapply quyền trước đổi connection string.
- App lỗi nhưng schema tương thích: rollback image, giữ dữ liệu; không sửa/xóa migration history.
- Outbox lỗi: giữ event/anchor, sửa worker và retry theo lease. FAILED sau 10 lần là dead-letter cần thao tác có audit; chưa có màn hình replay.
- Fabric lỗi: trả pending/unavailable, không VERIFIED. Ledger không thể được suy lại từ PostgreSQL.
- File nguồn lỗi: đối chiếu checksum/object key và khôi phục file nguyên bản, không ghi đè hoặc sửa checksum.

## Cổng kiểm soát trước production

- TLS termination, DB TLS, CORS allowlist và tắt mọi TLS bypass.
- Secret manager cho DB/JWT/SMTP/Fabric; thay tài khoản bootstrap và yêu cầu đổi password.
- `PUBLIC_DIRECTORY_ENABLED=false` mặc định. Chỉ mở tra cứu tên/MSSV sau khi có chính sách công khai; projection không chứa DOB/GPA/proof/account.
- `POST /api/verify` dùng UUID/hash như định danh chia sẻ, không chứng minh quyền sở hữu. Không đưa proof đầy đủ vào URL nếu không cần chia sẻ PII.
- Review dependency audit và các release gate trong `production-gates.md`; không tự chạy `npm audit fix --force`.
- Cutover Mongo, deploy Fabric, review dữ liệu thật, restore drill và load test phải nghiệm thu riêng. Build/test local đạt chưa đồng nghĩa hệ thống production-ready hoàn toàn.
