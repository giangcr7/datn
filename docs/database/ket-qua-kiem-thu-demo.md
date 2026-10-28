# Kết quả kiểm thử và bàn giao demo

Ngày kiểm tra: 15/10/2026, môi trường local tại D:\datn\diplomachain. Đây là nghiệm thu luồng demo, không phải chứng nhận sẵn sàng production.

## Kết quả chạy lại

| Hạng mục | Kết quả | Phạm vi |
| --- | --- | --- |
| Build API, Web, chaincode | Đạt cả 3 | Biên dịch và kiểm tra kiểu |
| API Jest | 9 suites, 40/40 tests | Nghiệp vụ, phân quyền, audit, auth, import, outbox |
| Kiểm tra database | 27/27 | Ràng buộc và quyền; fixture rollback |
| Workflow PostgreSQL | 36/36 | Request/submit/approve/reject/revoke/verify, scope và audit; fixture rollback, không gọi Fabric |
| Web/API smoke | 20/20 | NextAuth HCM/Hà Nội/admin, nhãn workspace, phân quyền và HTTP 400/401/403/404 |
| E2E Fabric thật | 19/19 | HCM gửi → Hà Nội duyệt → Fabric commit → ON_CHAIN → VERIFIED; từ chối và thu hồi |
| ERD | Đạt | 25 bảng, 235 cột, 63 khóa ngoại; DBML parse thành công |
| Khởi động lại dạng CheckOnly | Đạt | Khởi động container hiện có, generate/migrate/seed; không reset ledger, không ghi đè mật khẩu |
| Mẫu Postman | JSON hợp lệ | 6 nhóm request, 30 biến; không chứa mật khẩu/token thật |

Báo cáo E2E mới nhất: `outputs/headquarters-20261015064744-dc5e16/result.json`. Dữ liệu là hồ sơ giả; file và giao dịch ledger được giữ lại có chủ đích. Không đưa outputs, wallet hoặc env chứa secret lên GitHub.

## Những điều đã xác nhận bằng kiểm thử

1. Chỉ cán bộ university tại trụ sở, có capability phê duyệt, mới được duyệt. HCM và admin gọi approve nhận 403.
2. Hà Nội thấy được hồ sơ HCM. Sau duyệt, cơ sở nguồn vẫn ORG2; nơi phát hành và MSP là Hà Nội/ORG1/Org1MSP.
3. Phê duyệt tạo snapshot/hash/outbox. Chỉ sau ISSUE anchor COMMITTED mới ON_CHAIN và xác thực VERIFIED.
4. Đối chiếu ledger thật có transaction ID và đúng MSP phát hành; không chỉ kiểm tra trạng thái trong PostgreSQL.
5. Proof bị sửa không hợp lệ; gửi lại cùng dữ liệu giữ giao dịch cũ; hash xung đột bị blockchain từ chối.
6. Từ chối có lý do không tạo snapshot/anchor phát hành.
7. Hà Nội thu hồi được trên blockchain; sau REVOKE commit, xác thực trả REVOKED và isValid=false.
8. Admin xem được lịch sử nhưng không có quyền phê duyệt/thu hồi nghiệp vụ.

## Sửa lỗi và lưu ý từ lần rà soát cuối

- Sửa start.ps1: biểu thức nhận diện FABRIC_ENABLED và đường dẫn scripts\start-fabric-local.ps1 bị mất dấu gạch chéo, khiến không tự khởi động Fabric đúng cách. Đã chạy lại run.ps1 -CheckOnly thành công.
- Sửa mô tả tài liệu cũ còn gọi admin là người duyệt hoặc yêu cầu Fabric disabled; hướng dẫn hiện dùng luồng Hà Nội phát hành và Fabric connected=true.
- Sửa bộ sinh Mermaid để không phát sinh khoảng trắng cuối dòng, rồi sinh lại ERD từ database hiện có.
- Khi chạy Web smoke và E2E cùng lúc, tổng số lần login vượt giới hạn 5 lần/phút/IP nên một lần login admin bị chặn. Chạy lại Web smoke riêng đạt 20/20; giữ nguyên giới hạn bảo vệ API, không nới/tắt rate limit để test qua.
- Workflow có DeprecationWarning từ tầng Prisma/pg về truy vấn trên cùng connection, nhưng 36/36 kiểm tra đạt. Chưa thay đổi dependency chỉ để ẩn cảnh báo; cần kiểm tra lại trước khi nâng phiên bản pg.

## Dữ liệu để anh demo tiếp

- Bốn sinh viên giả 0099999992–0099999995 đã tồn tại; không cần tạo/import lại. Import lại phải tránh tạo trùng.
- DEMO-20261015-IMP-01 đang REQUESTED tại thời điểm kiểm tra, có thể chuyển Hà Nội để duyệt tiếp.
- Hai mã DEMO-20261015-REQ-01/REQ-02 chưa có tại thời điểm kiểm tra; dùng bảng nhập liệu mục 9 trong hướng dẫn demo để trình diễn lập yêu cầu mới. Nếu anh đã tạo sau đó thì tiếp tục hồ sơ hiện có, không nhập lại.
- Hai file đã có trong `outputs/demo-20261015`: `01-sinh-vien-demo.xlsx` và `02-so-goc-demo.xlsx`.
- Hướng dẫn thao tác chi tiết và demo ngắn: `docs/database/huong-dan-demo-tung-buoc.md`. Mẫu JSON/Postman đã có trong api-test-samples.md và api-test-samples.postman_collection.json.

## Giới hạn cần nói rõ

- Import sổ còn có nhánh tạo sinh viên còn thiếu; chưa có chính sách bắt buộc sinh viên tồn tại trước mọi lần import. Bộ demo tạo sinh viên trước, không chứng minh được ràng buộc cứng này.
- Chưa kiểm thử tự động toàn bộ thao tác trực quan QR, tải PDF, camera hoặc OTP/email giao nhận thật trong lần chạy này. Các bước kiểm tra thủ công được ghi trong hướng dẫn; không coi API smoke là bằng chứng các phần đó đã được thử đầy đủ.
- Giao diện dùng chung khung quản trị và phân biệt quyền/nhãn/menu; chưa phải ba ứng dụng riêng biệt.
- Không commit dữ liệu Excel thật, không xóa volume, không reset migration/ledger để làm lại demo. Cutover legacy, restore drill, tải lớn và hardening production vẫn cần nghiệm thu riêng.
