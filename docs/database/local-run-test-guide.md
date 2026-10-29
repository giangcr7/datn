# Hướng dẫn mở chương trình xem database và kiểm thử

Hướng dẫn Windows PowerShell tại D:\datn\diplomachain. PostgreSQL là nơi lưu nghiệp vụ; Web/API là nơi thao tác; Fabric chỉ neo hash sau phê duyệt.

## 1. Trạng thái kiểm tra ngày 15 tháng 10 năm 2026

- API unit test đạt 9 suites, 40 tests; build API, Web và chaincode đạt.
- Kiểm tra cuối đạt 27 kiểm tra database, 36 kiểm tra workflow PostgreSQL, 20 kiểm tra Web/API và 19 kiểm tra E2E Fabric thật. Chi tiết và giới hạn còn lại: xem ket-qua-kiem-thu-demo.md.
- Đã E2E HCM gửi → Hà Nội duyệt → outbox → Fabric commit → ON_CHAIN → VERIFIED; ca từ chối, proof bị sửa, idempotency và thu hồi on-chain đều đạt.
- Bốn file env local và node_modules đã có. Không copy đè file cấu hình bằng file mẫu.
- Local dùng FABRIC_ENABLED=true, channel diploma, chaincode educert sequence 2 và issuer wallet riêng của Hà Nội. Không ghi private key/mật khẩu lên Git.

## 2. Mở project và chạy hằng ngày

1. Mở Docker Desktop, chờ engine chạy.
2. Mở VS Code > File > Open Folder > D:\datn\diplomachain. Có thể bỏ qua VS Code nếu chỉ cần chạy bằng PowerShell.
3. Mở Terminal > New Terminal hoặc PowerShell, chạy:

~~~powershell
cd D:\datn\diplomachain
docker info
powershell -ExecutionPolicy Bypass -File .\run.ps1
~~~

run.ps1 gọi start.ps1: kiểm tra Docker/Node/npm và cổng → start ledger Fabric hiện có (nếu bật) → start PostgreSQL → kiểm tra database chỉ đọc → dùng lại bản build API/Web → khởi động hai dịch vụ. Chỉ build lại khi mã nguồn/cấu hình thay đổi hoặc chưa có bản build; không generate/migrate/seed mỗi lần chạy. Không tự deploy/reset Fabric.

Chờ ứng dụng khởi động rồi mở:

| Thành phần | Địa chỉ | Mục đích |
|---|---|---|
| Web | http://localhost:3000 | Giao diện sử dụng |
| Đăng nhập cán bộ | http://localhost:3000/login?type=university | Tài khoản được cấp |
| Swagger | http://localhost:3001/docs | Gọi API, xem request/response |
| API health | http://localhost:3001/api/health | Kiểm tra kết nối DB/Fabric |
| PostgreSQL | 127.0.0.1:5432 | Kết nối bằng công cụ DB, không phải website |

Giữ terminal chạy run.ps1 mở; nhấn Enter tại terminal đó để dừng API/Web và dịch vụ PKI demo do script mở. Không xóa database volume. Script chỉ báo thành công sau khi API health và trang login trả HTTP 200, đồng thời in tổng thời gian khởi động. Giới hạn chờ mặc định là 300 giây mỗi dịch vụ (có thể đặt bằng `-StartupTimeoutSeconds`); đây là ngưỡng dự phòng, không phải thời gian chờ cố định. Nếu dịch vụ thoát sớm, script báo ngay mã thoát và log gần nhất; nếu health lỗi, báo cả trạng thái HTTP/nội dung lỗi. Cổng 3000/3001 phải trống, không tự chuyển Web sang cổng khác.

Các tùy chọn dùng với cả `run.ps1` và `start.ps1`:

| Tùy chọn | Khi nào dùng |
|---|---|
| Không thêm tùy chọn | Mở chương trình hằng ngày, chạy bản build có sẵn |
| `-Setup` | Cài mới hoặc có migration/schema mới: generate Prisma, migrate deploy, seed rồi mở chương trình |
| `-Rebuild` | Ép build lại cả API/Web khi cần kiểm tra bản build |
| `-Dev` | Lập trình: API watch và Next dev tự nhận thay đổi mã nguồn |
| `-CheckOnly` | Chuẩn bị database rồi dừng, không mở API/Web |

## 3. Nếu cài mới và cách chạy riêng

Máy hiện tại đã có Node 24, npm và dependencies. Nếu clone sang máy khác hoặc thiếu node_modules, chạy npm ci ở thư mục gốc. Chỉ copy file mẫu chưa tồn tại và điền secret riêng:

| File local | File mẫu | Vai trò |
|---|---|---|
| .env.infrastructure | .env.infrastructure.example | Mật khẩu/cổng PostgreSQL |
| apps/api/.env | apps/api/.env.example | DATABASE_URL runtime, JWT, bootstrap |
| apps/api/.env.database | apps/api/.env.database.example | DIRECT_DATABASE_URL migration |
| apps/web/.env.local | apps/web/.env.example | URL API và NEXTAUTH_SECRET |

Không commit secret/Excel thật. Seed không tạo sinh viên giả, không reset mật khẩu tài khoản đã tồn tại. Sau khi điền cấu hình ở máy mới, chạy `powershell -ExecutionPolicy Bypass -File .\run.ps1 -Setup` một lần. Nếu báo migration đã áp dụng bị sửa hoặc migration thất bại, cần kiểm tra nguyên nhân; không reset database để bỏ qua lỗi.

Muốn nhìn log trực tiếp, thay run.ps1 bằng ba terminal. Không chạy hai cách cùng lúc vì trùng cổng.

Terminal 1:

~~~powershell
cd D:\datn\diplomachain
docker compose --env-file .env.infrastructure -f compose.database.yaml up -d --wait
npm run db:generate -w api
npm run db:migrate -w api
npm run db:seed -w api
~~~

Terminal 2:

~~~powershell
cd D:\datn\diplomachain
npm run start:dev -w api
~~~

Terminal 3:

~~~powershell
cd D:\datn\diplomachain
npm run dev -w @diploma-chain/web
~~~

Dừng bằng Ctrl+C từng terminal API/Web. Chỉ khởi động và chuẩn bị DB:

~~~powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1 -CheckOnly
~~~

## 4. Mở và xem database

### DBeaver hoặc pgAdmin

Tạo kết nối PostgreSQL, điền:

| Thông số | Giá trị |
|---|---|
| Host | 127.0.0.1 |
| Port | 5432 |
| Database | diplomachain |
| User | diplomachain_app |
| Password | APP_DB_PASSWORD trong .env.infrastructure |
| Schema | public |

Mở schema public → Tables → bảng cần xem dữ liệu. Runtime role có quyền INSERT/UPDATE có kiểm soát, không phải tài khoản chỉ đọc; không sửa trực tiếp dữ liệu để demo. Migration dùng diplomachain_migrator với DIRECT_DATABASE_URL, không đưa role admin vào API.

### psql có sẵn trong container

~~~powershell
docker compose --env-file .env.infrastructure -f compose.database.yaml exec postgres psql -U diplomachain_app -d diplomachain
~~~

Trong psql:

~~~sql
SET default_transaction_read_only = on;
\dt public.*
SELECT current_database(), current_user;
SELECT COUNT(*) AS total_students FROM students;
SELECT COUNT(*) AS total_graduations FROM graduation_records;
SELECT COUNT(*) AS total_diplomas FROM diplomas;
\q
~~~

Lệnh \dt và \q chỉ dùng trong psql; với DBeaver/pgAdmin dùng SQL SELECT bình thường. COUNT students không phải số dòng Excel/số hồ sơ tốt nghiệp/số văn bằng. Web còn lọc theo quyền campus/institution; preview Excel chưa có nghĩa đã commit vào DB.

Các truy vấn kiểm tra trạng thái và lý do chưa nhập:

~~~sql
SELECT workflow_status, status, COUNT(*) FROM diplomas
GROUP BY workflow_status, status;

SELECT status, COUNT(*) FROM import_rows GROUP BY status;

SELECT r.batch_id, r.sheet_name, r.row_number, r.status,
       v.field, v.code, v.severity, v.message
FROM import_rows r
JOIN validation_issues v ON v.row_id = r.id
WHERE r.status = 'NEEDS_REVIEW' AND v.resolved_at IS NULL
ORDER BY r.batch_id, r.sheet_name, r.row_number;

SELECT v.diploma_id, a.event_type, a.status,
       a.transaction_id, a.last_error
FROM blockchain_anchors a
JOIN diploma_versions v ON v.id = a.version_id
ORDER BY a.created_at DESC LIMIT 20;
~~~

NEEDS_REVIEW nghĩa là chờ đối soát, không phải đã xóa. Một dòng có nhiều issue nên không cộng issue thành số sinh viên bị loại. Dòng thiếu số bằng có thể commit graduation-only nếu hồ sơ hợp lệ.

Mở ERD bằng trình duyệt: docs/database/erd-core.svg hoặc erd-full.svg. Schema nguồn: apps/api/prisma/schema.prisma. File Excel staging được lưu riêng dưới .data/documents theo cấu hình local; PostgreSQL lưu metadata/checksum và dữ liệu từng dòng.

## 5. Chức năng luồng chạy và bảng tương ứng

| Chức năng và nơi test | Luồng và bảng |
|---|---|
| Đăng nhập /login | POST /api/auth/login đọc accounts + account_memberships → kiểm tra mật khẩu/quyền → refresh_sessions + audit_logs → JWT |
| Refresh/logout/đổi mật khẩu | accounts + refresh_sessions; refresh xoay token, reuse vô hiệu hóa phiên; đổi mật khẩu/logout-all cập nhật phiên |
| Sinh viên /students, /students/import | GET/POST /api/students và POST /api/students/import → students, accounts, account_memberships, audit_logs; không phải importer sổ gốc |
| Kích hoạt /register/student | Tài khoản đã được cấp + email khớp → send-otp → otp_challenges + gửi email → register đặt mật khẩu |
| Preview /import | POST /api/imports/registry/preview → đọc/validate trong bộ nhớ → báo lỗi; không ghi business tables |
| Staging/review /import | source_documents + import_batches + import_rows + validation_issues; review lưu overrides/audit, không ghi đè raw gốc |
| Commit /import | Dòng READY → students → enrollments/academic_classes/programs → graduation_records, graduation_decisions khi có → diplomas DRAFT nếu đủ cặp số; event/audit |
| Lập yêu cầu /issue hoặc Swagger | POST /api/cert/request → hồ sơ học/tốt nghiệp → diplomas REQUESTED, status DRAFT + event/audit |
| Gửi bản nháp /certificates | POST /api/cert/{uuid}/submit với issuedOn → DRAFT thành REQUESTED + event/audit |
| Duyệt /pending | POST /api/cert/approve/{uuid} → diploma_versions snapshot/hash + blockchain_anchors QUEUED + outbox_events PENDING → APPROVED/ACTIVE + event/audit |
| Từ chối /pending | POST /api/cert/reject/{uuid} → REJECTED + diploma_events/audit_logs; không tạo snapshot phát hành |
| Danh sách/tìm kiếm/thống kê | /certificates, /dashboard → đọc diplomas và liên kết student/graduation/program/version/anchor theo quyền |
| Xác thực /verify | POST /api/verify → trạng thái + snapshot/hash + ISSUE anchor COMMITTED → truy vấn Fabric → so hash/trạng thái thu hồi |
| Thu hồi /certificates | POST /api/cert/revoke → diplomas REVOKED + event/audit + REVOKE anchor/outbox; worker đồng bộ chain sau |
| Lịch sử/nhật ký | GET /api/cert/{uuid}/history đọc diploma_events; GET /api/audit đọc audit_logs, yêu cầu admin |
| Sinh viên xem bằng | /student/dashboard → JWT STUDENT → văn bằng của student liên kết; PDF/proof/QR tạo từ dữ liệu trả về, không tạo bản ghi bằng mới |
| Explorer /explorer | /api/explorer/* truy vấn Fabric, cần network hoạt động |
| Integrity trên Swagger | /api/integrity/check đọc snapshot có anchor COMMITTED + Fabric → integrity_alerts; alerts/resolve xem và xử lý cảnh báo |

Enrollment là hồ sơ theo học, không phải bảng điểm. Chưa triển khai subjects/courses/course_grades/transcripts; GPA/xếp loại tốt nghiệp ở graduation_records.

## 6. Test một chu trình bằng Swagger

Chỉ dùng dữ liệu giả trên local/test hoặc bản sao DB. Request/staging/review/commit/approve/revoke tạo hoặc cập nhật dữ liệu thật trong DB đang kết nối, không tự rollback. Không dùng sinh viên thật làm ca thu hồi thử.

### Ba vai trò thao tác

- HCM: BOOTSTRAP_ORG2_EMAIL/PASSWORD, role university; lập/gửi hồ sơ.
- Hà Nội: BOOTSTRAP_ORG1_EMAIL/PASSWORD, role university; isHeadquarters=true và canApproveDiplomas=true; duyệt/từ chối/thu hồi toàn trường.
- Admin: BOOTSTRAP_ADMIN_EMAIL/PASSWORD, role admin; xem user/audit, không được phê duyệt hoặc thu hồi nghiệp vụ.
- Nếu đã đổi password thì dùng mật khẩu mới; seed không reset mật khẩu/quyền đã cấu hình.

### Lập và duyệt

1. Mở http://localhost:3001/docs; POST /api/auth/login → Try it out → nhập email/password người lập và role university → Execute.
2. Copy access_token → Authorize → dán token.
3. GET /api/imports/programs xem danh mục ngành.
4. Tạo trước hồ sơ bằng POST /api/students theo mẫu trong api-test-samples.md (hoặc import hồ sơ đã đối soát). Sau đó POST /api/cert/request với dữ liệu giả bên dưới, dùng đúng MSSV/họ tên đã tạo và cặp số chưa có trong DB test. Request không tự tạo sinh viên từ MSSV mới.

~~~json
{
  "mssv": "0099999991",
  "fullName": "Sinh viên kiểm thử",
  "dob": "2002-01-01",
  "major": "Công nghệ thông tin",
  "gpa": 2.8,
  "grade": "Khá",
  "soHieu": "TEST-20261015-001",
  "soVaoSo": "TEST/20261015/001",
  "className": "TEST-IT",
  "namTotNghiep": 2024,
  "issueDate": "2024-10-15",
  "org": "ORG2"
}
~~~

5. Lưu uuid; GET /api/cert/{uuid} phải ở trạng thái chờ duyệt, chưa có snapshot/hash phát hành.
6. Vẫn dùng token người lập, POST /api/cert/approve/{uuid} với {}: phải bị chặn tự duyệt.
7. Login university Hà Nội, thay token trong Authorize, gọi approve với {}: tạo APPROVED/ACTIVE, snapshot, anchor và outbox; issuer là Org1MSP.
8. Chờ worker; GET /api/cert/{uuid} phải chuyển ANCHOR_PENDING → ON_CHAIN sau Fabric commit. Duyệt lại UUID phải conflict, không tạo snapshot/outbox thứ hai.
9. POST /api/verify với {"certUUID":"UUID-vừa-tạo"}: isValid=true, verificationStatus=VERIFIED sau commit; khi chain tắt/không commit thì không kết luận hợp lệ.
10. Admin và HCM gọi POST /api/cert/revoke đều bị 403; Hà Nội gọi thì tạo REVOKE outbox, sau worker commit Verify trả REVOKED.
11. GET /api/cert/{uuid}/history xem REQUESTED, APPROVED, ANCHOR_COMMITTED; sau thu hồi thêm REVOKED/ANCHOR_COMMITTED.

Để test từ chối, lập yêu cầu khác với cặp số khác rồi POST /api/cert/reject/{uuid} với {"reason":"Dữ liệu kiểm thử không đạt"}. Không gọi POST /api/cert/issue: luồng cấp trực tiếp cũ chủ động bị chặn.

## 7. Test import sổ gốc

1. Login cán bộ ORG2 → http://localhost:3000/import → chọn .xlsx tối đa 5 MB.
2. Kiểm tra không ghi dữ liệu → xem tổng dòng theo sheet, mã lỗi/cảnh báo. Không commit file thật chỉ để demo.
3. Trên DB test, Lưu file và staging → file/checksum + batch/rows/issues, chưa tạo hồ sơ/văn bằng từ batch.
4. Chọn batch → NEEDS_REVIEW → đối soát, sửa corrections và note; không đoán MSSV/ngành/ngày cấp hoặc suy xếp loại từ GPA.
5. Commit các dòng READY → mỗi dòng một transaction; dòng xung đột về NEEDS_REVIEW với COMMIT_CONFLICT, dòng khác có thể vẫn được nhập.
6. So imported/diplomas/conflicts với trạng thái dòng. Số student mới có thể thấp hơn imported vì student đã tồn tại.
7. Đủ cặp số → DRAFT ở /certificates → gửi duyệt, xác nhận ngày cấp. Thiếu cặp số → graduation-only, không bằng giả.
8. Hà Nội → /pending → duyệt; local cuối cùng là ON_CHAIN sau Fabric commit.
9. Upload lại cùng file/campus/mapping phải reused batch; commit lại không nhập lại dòng IMPORTED.

## 8. Test tự động

Bộ mẫu JSON theo từng endpoint còn thiếu: `docs/database/api-test-samples.md`.

Chạy tại thư mục gốc:

~~~powershell
npm run test -w api -- --runInBand
npm run build -w api
npm run build -w @diploma-chain/web
npm run build --workspace ./chaincode
~~~

Package chaincode tên educert-chaincode: dùng --workspace ./chaincode hoặc -w educert-chaincode, không dùng -w chaincode.

Sau khi DB chạy/migrate/seed và API build xong:

~~~powershell
npm run test:database -w api
node scripts/test-workflow.mjs
node scripts/smoke-api.mjs
node scripts/smoke-web.mjs
node --test scripts/test-local-startup.mjs
npm run db:erd -w api
~~~

- test:database thử FK/unique/immutability/quyền runtime trong transaction; ROLLBACK fixtures, không giữ dữ liệu test.
- test-workflow gọi service thật trên PostgreSQL: một cán bộ tại cơ sở chính lập, duyệt, từ chối và thu hồi; kiểm tra tài khoản thiếu quyền, admin, phạm vi campus/institution, audit và import writer. Chạy trên database kiểm thử riêng; fixtures rollback, không gửi giao dịch Fabric.
- `node scripts/test-change-password-redirect.mjs` kiểm tra điều hướng sau đổi mật khẩu về đúng cổng Nhà trường/Admin/Sinh viên, đăng xuất trước khi chuyển trang và giữ nguyên phiên khi đổi mật khẩu thất bại; không đổi mật khẩu tài khoản thật.
- Cấu hình NextAuth dùng chung nằm ở `apps/web/src/lib/auth-options.ts`; route đăng nhập chỉ xuất `GET`/`POST`. Chạy `npm run build -w @diploma-chain/web` để kiểm tra production, không thay bằng việc chỉ chạy development.
- smoke-web cần build API/Web. Nếu API đang chạy: đặt $env:SMOKE_USE_RUNNING_API="true" trước node scripts/smoke-web.mjs; script dùng Next.js riêng ở cổng 3100, kiểm tra ba phiên NextAuth/quyền/menu/proxy, không tạo sinh viên/văn bằng.
- smoke-api mở API build cổng 3101 rồi tắt; kiểm tra health/login/membership/quyền đọc/danh mục/refresh/logout. Fabric/outbox tắt, không phát hành bằng. Có ghi session/audit; reuse test có thể vô hiệu hóa phiên cũ của tài khoản bootstrap. Không chạy với tài khoản phục vụ production.
- Chạy smoke sau build, không chạy trong lúc tạo lại dist; cổng 3101 phải trống. Smoke không thay cho test workflow đầy đủ.
- test-local-startup chạy trên Windows PowerShell 5.1: kiểm tra cache build, health thành công/lỗi/chậm, giới hạn chờ và tiến trình thoát sớm; không ghi database/blockchain.
- db:erd sinh lại tài liệu từ catalog PostgreSQL, cần DB; không phải bài test nghiệp vụ.
- Test âm: thiếu JWT 401; sai quyền/campus bị từ chối; MSSV không tồn tại/sai 10 chữ số, GPA ngoài 0..4, ngày cấp trước ngày sinh/năm tốt nghiệp hoặc tương lai bị từ chối; trùng số bằng/số vào sổ không nhân đôi; tự duyệt bị chặn. Proxy imports/cert/issue/revoke đã giữ HTTP status backend thay vì đổi mọi lỗi thành 400/500.

## 9. Lỗi thường gặp và giới hạn hiện tại

- Đã sửa /issue đọc đúng array danh mục ngành. Đã ẩn menu quản trị tài khoản với cán bộ, chặn mở trực tiếp /users và bỏ nút/link tạo/sửa/quên mật khẩu chưa triển khai. Đây là loại bỏ điều hướng hỏng, không phải đã triển khai các chức năng đó.
- HCM không có nút duyệt; Hà Nội có quyền toàn trường dựa trên cờ trụ sở + membership; admin không duyệt thay. Maker-checker khác Fabric endorsement policy.
- PUBLIC_DIRECTORY_ENABLED mặc định false: public search tên/MSSV có thể 403; dùng UUID/proof hoặc cán bộ đã login, không mở toàn bộ thông tin cá nhân chỉ để demo.
- OTP cần tài khoản được cấp trước, email khớp và cấu hình mail. Import sổ gốc không tự tạo email/password.
- Verify VERIFIED/Explorer cần Fabric đang chạy, issuer wallet Hà Nội và chaincode đúng channel. Startup không reset/deploy; xem luong-ha-noi-blockchain.md trước demo.
- Khi Fabric bật, worker khoảng 5 giây/lượt nếu OUTBOX_ENABLED không tắt; chỉ sau commit mới COMMITTED/txId/ON_CHAIN. Lỗi lưu last_error/retry, không giả thành công.
- ECONNREFUSED 5432 hoặc lỗi dockerDesktopLinuxEngine: mở Docker Desktop, docker info, compose ps. Sai password: đối chiếu env với role đang có trên volume; đổi env không tự đổi password DB.
- EADDRINUSE: dừng đúng phiên project cũ trước khi mở phiên mới.
- Không docker compose down -v, prisma migrate reset hay xóa .data để xử lý lỗi kết nối; có thể mất DB/file nguồn.

Kiểm tra hoạt động và log:

~~~powershell
docker compose --env-file .env.infrastructure -f compose.database.yaml ps
Invoke-RestMethod http://localhost:3001/api/health
Get-NetTCPConnection -LocalPort 3000,3001,5432 -State Listen
Get-Content .data/logs/api.err.log -Tail 50 -Wait
~~~

## 10. E2E có ghi blockchain thật

Chỉ local/test: `node scripts/test-headquarters-chain.mjs --write-demo`. Lệnh tạo ba hồ sơ giả mới và giao dịch vĩnh viễn trên ledger; không tự rollback. Báo cáo ở `outputs/headquarters-<timestamp>/result.json`. Luồng demo Web chi tiết: `luong-ha-noi-blockchain.md`.
