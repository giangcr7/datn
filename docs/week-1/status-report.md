# Báo cáo hiện trạng DiplomaChain

Ngày kiểm kê: **07/10/2026**.

## 1. Phạm vi đã kiểm tra

| Hạng mục | Bằng chứng trong mã nguồn | Trạng thái |
| --- | --- | --- |
| Hyperledger Fabric | `blockchain-network/`, `chaincode/`, `FabricService` | Có mã nguồn; chưa kiểm thử runtime vì Docker daemon không chạy |
| MongoDB | Mongoose schemas, `scripts/start-mongo.js` | Có cấu hình; chưa có service lắng nghe khi kiểm tra |
| NestJS API | Auth, certificate, verify, audit, integrity, health, explorer | Build riêng thành công trong lần chạy Turbo; chưa smoke-test runtime |
| Next.js frontend | Public, admin và student routes | Có mã nguồn; build bị khóa bởi một tiến trình `next build` khác |
| Đăng nhập/phân quyền | `/api/auth/login`, JWT, roles guard | Có triển khai; chưa kiểm thử tích hợp |
| OTP/đổi mật khẩu | `/api/auth/send-otp`, `/api/auth/change-password/:id` | Có triển khai; chưa kiểm thử email thực tế |
| Cấp/duyệt/từ chối văn bằng | `/api/cert/issue`, `approve`, `reject`, `pending` | Có triển khai; chưa kiểm thử với Fabric |
| Xác thực UUID/Proof | `/api/verify` | Có triển khai; chưa kiểm thử với Fabric và MongoDB |
| Thu hồi | `/api/cert/revoke` | Có triển khai; chưa kiểm thử với Fabric |
| Dashboard/explorer/audit | UI admin và API `/statistics`, `/explorer`, `/audit` | Có triển khai; chưa kiểm thử runtime |

## 2. Kết quả lệnh kiểm tra

- `npm run test --workspace=apps/api -- --runInBand`: **đạt**, 1 suite/1 test.
- `npm run build`: shared package và chaincode build thành công; web thất bại vì một `next build` khác đang chạy.
- `npm run lint`: thất bại ở API với **374 lỗi, 51 cảnh báo**. Phần lớn liên quan đến `any`, truy cập/return không an toàn và promise chưa được xử lý.
- `docker ps`: thất bại vì Docker Desktop Linux engine chưa chạy.
- HTTP `localhost:3000`, `localhost:3001/api`, `/api/health`, `/docs`: chưa kết nối được tại thời điểm kiểm tra.

## 3. Danh sách lỗi/rủi ro ưu tiên

### P0 - Chặn kiểm thử end-to-end

1. Docker daemon chưa chạy, vì vậy chưa thể xác nhận Fabric network.
2. API và frontend chưa chạy tại các cổng quy ước.
3. Build frontend bị khóa bởi tiến trình Next.js khác; cần xác định tiến trình sở hữu lock trước khi build lại.

### P1 - Chất lượng và độ tin cậy

1. API còn 374 lỗi lint; `verify.service.ts` là một cụm lỗi lớn do dữ liệu blockchain/JSON chưa được định kiểu.
2. Bộ test tự động mới có một test mặc định, chưa bao phủ các luồng nghiệp vụ chính.
3. `README.md` gốc vẫn là nội dung Turborepo starter, chưa đủ hướng dẫn cài đặt và vận hành DiplomaChain.
4. Một số chuỗi tiếng Việt trong `apps/api/src/main.ts` đang bị mojibake, cần chuẩn hóa UTF-8.
5. Script khởi động công bố thành công sau thời gian chờ cố định nhưng chưa kiểm tra health thực tế của từng service.

### P2 - Hoàn thiện sản phẩm

1. Cần chốt và triển khai role `verifier` cho doanh nghiệp.
2. Cần bổ sung lịch sử tra cứu, mã biên nhận và giới hạn dữ liệu trả về cho doanh nghiệp.
3. Cần xây dựng test tích hợp cho MongoDB/Fabric và dữ liệu mẫu ổn định.

## 4. Tiêu chí kết thúc Tuần 1

- [x] Kiểm kê chức năng từ mã nguồn.
- [x] Chạy build, unit test, lint và kiểm tra runtime cơ bản.
- [x] Lập danh sách lỗi theo mức ưu tiên.
- [x] Chốt phạm vi cổng doanh nghiệp ở mức yêu cầu.
- [x] Vẽ sơ đồ kiến trúc hiện tại và phần mở rộng.
- [x] Viết kịch bản demo ban đầu.
- [ ] Chạy smoke-test đầy đủ sau khi Docker/Fabric, API và frontend hoạt động.
- [ ] Xác nhận thủ công các luồng có email, QR/PDF và quyền người dùng.

## 5. Trình tự kiểm tra lại

1. Mở Docker Desktop và chờ engine sẵn sàng.
2. Khởi động Fabric network theo script trong `blockchain-network/`.
3. Chạy `start.ps1` từ thư mục gốc.
4. Chạy `scripts/week1-smoke-test.ps1`.
5. Thực hiện kịch bản trong `demo-script.md` và ghi lại kết quả từng bước.

