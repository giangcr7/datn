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

Trang chủ theo bố cục cổng thông tin giáo dục: đầu trang nhận diện trường, thanh điều hướng xanh, tiêu đề trang gọn và hai khối chức năng cân đối. Không dùng khẩu hiệu quảng bá, nền chuyển màu, thẻ nổi hay hiệu ứng xuất hiện. Xác thực PDF/QR tách biệt với tra cứu thông tin; hướng dẫn và đăng nhập sinh viên/cán bộ đặt ở khu vực riêng. Không hiển thị menu quản trị, số liệu minh họa hay thông tin kỹ thuật xác thực. Tra cứu cá nhân sử dụng biểu mẫu định danh bên dưới; danh bạ tìm rộng theo tên/MSSV vẫn đóng mặc định.

Kiểm thử trang chủ và CSS: `node scripts/test-homepage.mjs`. Để kiểm tra thêm HTTP/CSS trên web đang chạy local, đặt `HOMEPAGE_TEST_BASE_URL=http://localhost:3000` trước khi chạy lệnh; không có thao tác ghi database hoặc blockchain.

## Giao diện thống nhất

- Các trang công khai, đăng nhập, kích hoạt và đổi mật khẩu dùng chung đầu trang, điều hướng và chân trang theo mẫu trang chủ. Không sao chép thêm logo/đầu trang vào từng màn hình.
- Bảng màu đặt tại `apps/web/src/lib/school-theme.ts`; root layout xuất các biến `--school-*`, Ant Design dùng cùng bộ theme. CSS chung tại `apps/web/src/styles`; nền sáng, xanh nhà trường, điểm nhấn vàng, khối trắng có viền và góc bo nhỏ. Không thay màu cảnh báo, lỗi hay trạng thái nghiệp vụ thành màu thương hiệu.
- Màn hình nghiệp vụ dùng `workspace-page` và `PageTitle`; nội dung tab con dùng `workspace-section` và tiêu đề cấp hai. Giữ nguyên menu theo quyền, luồng phê duyệt, tra cứu và xác thực. Tailwind được cấu hình qua PostCSS để các lớp bố cục thực sự có CSS; không nạp Preflight nhằm giữ mẫu trang chủ đã duyệt.
- Kiểm tra theme, các trang, menu và CSS responsive: `node scripts/test-university-ui.mjs`. Kiểm tra biên dịch HTTP cho các màn hình công khai/cán bộ/sinh viên: `node scripts/test-university-ui-web.mjs` (bản web riêng trong OS temp, phiên đăng nhập giả lập và backend chỉ đọc; tự dừng/dọn trong finally, không dùng env hay dữ liệu thật). Đây không thay thế kiểm tra hình ảnh bằng trình duyệt.
- Nếu đang chạy bản production, thay đổi mã nguồn chưa tự cập nhật giao diện. Chỉ build lại và khởi động lại Web sau khi dừng phiên chạy hiện tại theo quy trình; không ghi đè `apps/web/.next` khi Web đang hoạt động.

## Tra cứu văn bằng trong kho

- Trang `/search` có tiêu đề giữa, nền xanh nhạt, ô nhập và nút tra cứu xanh theo nhận diện nhà trường. Hiển thị đủ 14 trường trong ba nhóm: người được cấp (họ tên, ngày sinh, MSSV); đào tạo (lớp, ngành, trình độ, năm tốt nghiệp, xếp loại, điểm trung bình); văn bằng (số hiệu, số vào sổ, ngày cấp, số và ngày quyết định). Không thêm ô CCCD khi kho chưa có dữ liệu đối chiếu.
- Bắt buộc họ tên, ngày sinh và ít nhất một số định danh (MSSV/số hiệu/số vào sổ). Các trường khác không bắt buộc; nếu nhập, tất cả điều kiện phải khớp. Tên người và tên ngành không phân biệt dấu tiếng Việt/chữ hoa; các số định danh và trường khác khớp chính xác, giữ số 0 đầu mã.
- `POST /api/search` chuyển JSON sang `POST /cert/lookup`. Tra cứu cá nhân không yêu cầu đăng nhập, giới hạn 10 lần/phút theo cơ chế throttling API; không ghi họ tên/ngày sinh lên URL và không cache kết quả. `GET /cert/search?q=...` vẫn giữ chính sách `PUBLIC_DIRECTORY_ENABLED` và phạm vi tài khoản cũ, không trở thành danh bạ công khai.
- Chỉ tìm trong phiên bản mới nhất đã duyệt và đã commit phát hành. Điều kiện và kết quả cùng dùng snapshot đã phát hành, không nhầm với thông tin gốc đã được sửa hoặc bản thay thế. Hiển thị rõ văn bằng đã thu hồi/được thay thế; không biến kết quả tra cứu thành kết luận xác thực PDF. Không trả ngày sinh, GPA, hash, giao dịch, bằng chứng ký hay thông tin tài khoản.
- Kiểm thử form, CSS, request và proxy (đặt `LOOKUP_TEST_BASE_URL` để kiểm tra thêm HTML/CSS từ bản web local đang chạy): `node scripts/test-diploma-lookup.mjs`. Kiểm thử DTO/service/HTTP và giới hạn tần suất: từ `apps/api` chạy `npm test -- --runInBand --no-cache diploma-lookup.spec.ts`. Kiểm thử SQL PostgreSQL: `node scripts/test-diploma-lookup-db.mjs` (cần database local và bản build API hiện có); chỉ dùng bảng TEMP trên kết nối riêng, luôn rollback, không tạo hồ sơ nghiệp vụ hay giao dịch blockchain.

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
