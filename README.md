# DiplomaChain

Hệ thống quản lý, phê duyệt và xác thực văn bằng số, với PostgreSQL làm nguồn dữ liệu nghiệp vụ, file nguồn lưu riêng và Hyperledger Fabric chỉ neo hash.

## Kiến trúc dữ liệu

- `Student → Enrollment → GraduationRecord → Diploma → DiplomaVersion` tách riêng người học, quá trình học, tốt nghiệp, văn bằng và snapshot đã phê duyệt.
- Excel → private storage + checksum → staging → đối chiếu/override có audit → commit hồ sơ hợp lệ.
- Người lập không tự phê duyệt. Transaction phê duyệt tạo snapshot và outbox; chỉ có `ON_CHAIN` sau Fabric commit.
- MongoDB cũ và Fabric ledger cũ chưa tự động cutover; không xóa hoặc ghi đè dữ liệu cũ.

## Chạy local

Yêu cầu: Node.js tương thích Prisma 7 (đã kiểm thử bằng Node 24), npm và Docker Compose. Cài dependencies bằng `npm ci`.

1. Copy `.env.infrastructure.example` thành `.env.infrastructure`; đặt secret khác nhau cho admin, migrator và runtime.
2. Copy `apps/api/.env.example` thành `apps/api/.env`; điền `DATABASE_URL` và `JWT_SECRET`. API chỉ giữ quyền runtime.
3. Copy `apps/api/.env.database.example` thành `apps/api/.env.database`; điền `DIRECT_DATABASE_URL` bằng role migrator.
4. Copy `apps/web/.env.example` thành `apps/web/.env.local`; điền `NEXTAUTH_SECRET`. Đặt email/password bootstrap trong API env; seed không ghi đè mật khẩu đã có.
5. Windows, lần đầu: `powershell -ExecutionPolicy Bypass -File .\run.ps1 -Setup`. Các lần sau: `powershell -ExecutionPolicy Bypass -File .\run.ps1`. Linux/macOS: `bash ./start.sh` (script riêng, vẫn chuẩn bị database và chạy chế độ phát triển).

Trên Windows, chế độ mặc định kiểm tra database chỉ đọc, khởi động PostgreSQL/Fabric hiện có và chạy trực tiếp bản build API/Web. Chỉ build lại khi mã nguồn/cấu hình thay đổi hoặc chưa có bản build; không generate/migrate/seed mỗi lần mở. Dùng `-Setup` khi cài mới hoặc có migration/schema mới, `-Rebuild` để ép build lại, `-Dev` khi cần tự biên dịch lại lúc sửa mã. `-CheckOnly` vẫn chuẩn bị database rồi dừng, không chạy API/Web.

Không tự tải binaries, tạo lại channel hoặc deploy/reset Fabric. URL mặc định: Web `http://localhost:3000`, API `http://localhost:3001/api`, Swagger `http://localhost:3001/docs`. Log nằm trong `.data/logs`; lỗi khởi động có kèm trạng thái HTTP và log gần nhất. Chỉ báo sẵn sàng khi health API và trang đăng nhập trả HTTP 200; thời gian chờ tối đa mặc định 300 giây mỗi dịch vụ là giới hạn dự phòng, không phải thời gian phải chờ mỗi lần mở. Dừng API/Web bằng Enter không xóa database volume.

## Trang chủ công khai

Trang chủ ưu tiên xác thực bằng PDF/QR, tách biệt với tra cứu thông tin và giữ đăng nhập sinh viên/cán bộ ở khu vực riêng. Hướng dẫn ba bước và câu hỏi mở rộng hoạt động ngay trên trang; không hiển thị menu quản trị, số liệu minh họa hay thông tin kỹ thuật xác thực. Việc tra cứu vẫn tuân theo cấu hình công bố dữ liệu hiện có, không tự mở quyền truy cập.

Kiểm thử trang chủ và CSS: `node scripts/test-homepage.mjs`. Để kiểm tra thêm HTTP/CSS trên web đang chạy local, đặt `HOMEPAGE_TEST_BASE_URL=http://localhost:3000` trước khi chạy lệnh; không có thao tác ghi database hoặc blockchain.

## Chữ ký số PDF

Một cơ sở chính TP.HCM, một cán bộ quản lý dữ liệu và duyệt phát hành. Không chuyển hồ sơ sang cơ sở hay người duyệt khác. PDF mới có một chữ ký số; SHA-256 của PDF được đưa vào snapshot neo Fabric. Chỉ tải bản phát hành khi blockchain đã commit; file sửa đổi hoặc văn bằng thu hồi không vượt qua xác thực.

- Local có TSA/OCSP/CRL: chạy `node scripts/setup-pdf-pki.mjs --configure-env` một lần, sau đó `start.ps1` tự khởi động dịch vụ PKI demo cùng API/Web. Nếu chạy API riêng, chạy thêm `node scripts/setup-pdf-pki.mjs --serve`. CA demo nằm riêng trong `.data/signing/pki-v2/`; không thay đổi PDF/khóa demo cũ.
- Triển khai thật: đặt `PDF_SIGNING_MODE=certificate`, cấu hình `PDF_ORG2_*` bằng file P12/PFX của người ký phát hành, mật khẩu và fingerprint SHA-256 tương ứng trong biến môi trường. Không commit khóa riêng/mật khẩu.
- Khi bật `PDF_PKI_ENABLED=true`: chữ ký mới dùng B-T với RFC3161 TSA, kiểm tra chuỗi CA và OCSP trước khi ký, CRL dự phòng. Mất cả hai nguồn/thu hồi/không rõ trạng thái/bằng chứng cũ sẽ chặn ký. Hash bằng chứng lúc ký nằm trong snapshot blockchain; xác minh lại dùng trạng thái thu hồi hiện tại. Chưa có B-LT/B-LTA, HSM hoặc ký từ xa; không tự kết luận giá trị pháp lý. `PDF_SIGNING_MODE=disabled` khóa thao tác ký.
- Production bắt buộc PKI với trust bundle CA do quản trị cấu hình, issuer intermediates và danh sách host cho phép; xem `docs/pdf-pki.md`. Không tin URL OCSP/CRL do PDF gửi lên và không tự chuyển hồ sơ B-B cũ thành B-T.
- Kiểm thử PKI độc lập: `node scripts/test-pki-services.mjs` dùng OpenSSL, CA/storage tạm và không ghi database/blockchain.
- Mẫu PDF song ngữ một trang chỉ hiển thị thông tin văn bằng, mã QR và một dấu ký số. Thông tin chứng thư, TSA/OCSP/CRL, nguồn đối soát và blockchain được lưu trong hồ sơ hệ thống, không in diễn giải kỹ thuật lên bằng. PDF xem trước vẫn có nhãn chưa ký; mẫu trình bày không thay đổi chế độ hay mức độ tin cậy của chứng thư ký.
- Sửa mẫu chỉ áp dụng cho lần ký phát hành mới. Văn bằng cũ giữ nguyên PDF và xác thực theo chính sách hai chữ ký lịch sử; bản đã ký/neo không được dựng lại hoặc ghi đè khi tải. Sau khi đổi mã nguồn, dừng phiên chạy bằng Enter rồi chạy lại `.\start.ps1` để nạp bản build mới (không xóa database hay ledger).
- Kiểm thử an toàn: `node scripts/test-single-campus.mjs` dùng transaction rollback và storage tạm, không ghi ledger; tùy chọn `--sample` lưu PDF tại `output/pdf/mau-van-bang-ky-so.pdf`.
- `POST /api/verify/pdf` nhận multipart trường `file`; `GET /api/cert/:uuid/pdf` tải bản phát hành có kiểm soát quyền, không dựng lại PDF khi tải.
- Cổng xác thực công khai chỉ có tải PDF và quét QR; liên kết QR cũ vẫn tự xác thực, không cần nhập Proof/JSON. Kết quả hợp lệ chỉ hiện trạng thái và thông tin văn bằng; chi tiết hash, giao dịch, chứng thư và PKI không hiển thị trên trang này. Kiểm tra giao diện và QR bằng `node scripts/test-public-verification.mjs`.

## Kiểm tra

PDF ghi storage nhưng transaction bị rollback có thể được dọn bằng `node scripts/cleanup-orphan-pdfs.mjs` (mặc định chỉ thống kê); thêm `--delete` mới xóa file PDF không có tham chiếu DB và cũ hơn 24 giờ. Script hỗ trợ local/S3, dùng cùng advisory lock với luồng ký và không xóa Excel hoặc lịch sử đã tham chiếu. Kiểm thử luồng một cán bộ bằng `node scripts/test-single-campus.mjs`.

```powershell
npm run build -w api
npm run build -w @diploma-chain/web
npm run build --workspace ./chaincode
npm run test -w api -- --runInBand
npm run test:database -w api
node scripts/smoke-api.mjs
npm run db:erd -w api
```

Xem `docs/database/README.md` để mở ERD SVG/DBML/Mermaid, từ điển dữ liệu, mapping Excel và checklist production. File Excel gốc được giữ nguyên. Không đưa dữ liệu chưa đối chiếu vào business tables.

Hướng dẫn mở chương trình, xem PostgreSQL và kiểm thử các luồng: `docs/database/local-run-test-guide.md`.

Mẫu JSON bổ sung: `docs/database/api-test-samples.md`. Import `docs/database/api-test-samples.postman_collection.json` vào Postman để chọn từng request (không chạy cả collection trên dữ liệu thật).

Hướng dẫn demo từng bước, file Excel giả cần chọn và kết quả mong đợi: `docs/database/huong-dan-demo-tung-buoc.md`. Bộ Excel local nằm trong `outputs/demo-20261015/`; không commit workbook hoặc secret lên GitHub.

Luồng nghiệp vụ hiện tại: TP.HCM rà soát → cán bộ duyệt và ký → Fabric commit. Chi tiết migration, tài khoản và tương thích lịch sử: `docs/database/single-campus-workflow.md`. Tài liệu/kịch bản Hà Nội cũ chỉ mô tả luồng lịch sử, không dùng để phát hành mới.

## Giữ thư mục đề tài sạch

- Quy tắc làm việc và dọn file tạm nằm trong `AGENTS.md`. Ảnh rà soát, log kiểm thử và script dùng một lần phải đặt trong thư mục tạm của hệ điều hành, dọn trong `finally` sau khi thực thi; không để phát sinh thư mục rác ở gốc dự án.
- `npm run clean` chỉ xem danh sách cache/file tạm có thể xóa. Dừng API/web và các phiên kiểm thử, sau đó chạy `npm run clean -- -Apply` để dọn. Lệnh mặc định giữ bản build production và thư viện để hệ thống vẫn chạy được.
- Chỉ thêm `-Builds` khi chủ động muốn xóa cả bản build có thể tạo lại; cần build lại trước khi chạy kiểm thử phụ thuộc `dist`. Không dùng `git clean` để dọn dự án đang có mã nguồn chưa commit.
- Không coi dữ liệu PostgreSQL, ledger, `.data`, backup, `.env`, khóa/chứng thư, PDF đã lưu, file Excel gốc, dữ liệu mẫu có tài liệu hướng dẫn, mã kiểm thử hoặc bằng chứng giao dịch đã ghi blockchain là rác. Lệnh dọn không thay thế công cụ kiểm tra PDF mồ côi có đối chiếu database.
