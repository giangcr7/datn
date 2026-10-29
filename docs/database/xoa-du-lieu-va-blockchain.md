# Xóa dữ liệu PostgreSQL và blockchain trong DiplomaChain

Tài liệu hướng dẫn thao tác, không tự thực hiện xóa. Phải phân biệt dữ liệu thật
cần lưu bằng chứng với môi trường kiểm thử được phép hủy.

## 1. Chọn đúng nhu cầu

| Nhu cầu                                            | Cách xử lý                                                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Văn bằng đã phát hành bị sai hoặc không còn hợp lệ | Vào **Sổ văn bằng → Thu hồi**, ghi lý do; theo dõi ở **Đối chiếu blockchain**. Nếu cấp lại, dùng luồng văn bằng thay thế.           |
| Hồ sơ nhập bị lỗi hoặc trùng                       | Sửa, kiểm tra lại hoặc bỏ qua dòng trong **Hồ sơ cấp văn bằng → Kiểm tra dữ liệu**; không xóa sổ bằng hay ledger để xử lý lỗi nhập. |
| Cần chạy đồ án từ đầu, không có dữ liệu cũ         | Ưu tiên database và mạng/channel Fabric thử nghiệm riêng, giữ nguyên môi trường cũ.                                                 |
| Muốn hủy toàn bộ dữ liệu thử nghiệm                | Sao lưu, xác nhận đúng database/network, dừng ứng dụng và worker rồi mới tạo lại môi trường đó. Xem mục 4 và 5.                     |
| Xóa nghiệp vụ nhưng giữ ba tài khoản               | Chốt ba account ID và quan hệ quyền trước khi viết kế hoạch riêng; không xóa tất cả rồi kỳ vọng tài khoản tự còn nguyên.            |

## 2. Mở database và kiểm tra trước khi làm

Dùng DBeaver hoặc pgAdmin kết nối PostgreSQL local:

- Host: `127.0.0.1`; port mặc định `5432` (xem `POSTGRES_PORT` nếu đã đổi).
- Database theo cấu hình local: `diplomachain`.
- User ứng dụng: `diplomachain_app`; mật khẩu lấy từ `APP_DB_PASSWORD` trong
  `.env.infrastructure`. Không gửi mật khẩu vào chat/Git.
- DBeaver: mở **Schemas → public → Tables → bảng → View Data**.
- Kiểm tra đích thực tế bằng SQL, không chỉ nhìn nhãn connection:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
SELECT COUNT(*) AS students FROM students;
SELECT COUNT(*) AS diplomas FROM diplomas;
SELECT status, COUNT(*) FROM import_rows GROUP BY status;
SELECT status, COUNT(*) FROM blockchain_anchors GROUP BY status;
SELECT id, email, student_id FROM accounts ORDER BY email;
ROLLBACK;
```

Không chỉnh dữ liệu trực tiếp bằng lưới View Data. Role runtime không được cấp
`DELETE`. Các bảng `diploma_versions`, `diploma_events`, `audit_logs`,
`source_documents` có trigger chống sửa/xóa lịch sử. Đây là ràng buộc của dự án,
không phải lỗi kết nối; không tắt trigger để vượt qua.

## 3. Sao lưu những gì?

1. Dừng ứng dụng/worker của môi trường định reset để không phát sinh hồ sơ/giao
   dịch khi chốt dữ liệu. Không dừng dịch vụ của dự án khác.
2. Dùng **Tools → Backup** trong DBeaver hoặc **Backup** trong pgAdmin cho đúng
   database. Lưu đầy đủ schema và data; kiểm tra phục hồi vào database khác trước
   khi xóa bản gốc. Xem thêm [runbook](./runbook.md).
3. Lưu riêng Excel nguồn, PDF đã ký và thư mục tài liệu liên quan. SQL backup
   không tự chứa các tệp này.
4. Sao lưu nhất quán ledger peer/orderer cùng cấu hình, MSP, CA, certificate, khóa
   và wallet cần để phục hồi. SQL backup không thay thế backup Fabric.
5. Lưu backup ở nơi riêng được quản lý, không commit lên GitHub. Không xem dump,
   ledger, PDF đã ký hay khóa là file rác.

## 4. Xóa trắng database: CHỈ cho bản thử nghiệm được phép hủy

Thao tác này mất toàn bộ nghiệp vụ, danh mục, tài khoản và lịch sử trong database
đã chọn. Không dùng trên database đang lưu bằng chứng cần giữ. Không xóa database
`diplomachain` hiện tại chỉ vì đó là tên mặc định trong tài liệu.

An toàn hơn: tạo database mới có tên riêng, ví dụ `diplomachain_test`, rồi chuyển
cấu hình thử nghiệm sang đó. Nếu cần xóa một database test cũ:

1. Hoàn tất sao lưu/kiểm tra phục hồi; kiểm tra tên server, port và database.
   Chỉ tiếp tục khi chắc chắn đây là bản test được phép hủy.
2. Đăng nhập bằng tài khoản quản trị database và kết nối maintenance database
   `postgres`, không kết nối database sắp xóa. Ứng dụng/worker test phải dừng.
   Không ép ngắt các kết nối chưa xác định chủ sở hữu.
3. Trong pgAdmin chọn đúng **Databases → database test → Delete/Drop**, đọc lại
   tên trong xác nhận. Đây là xóa database, không phải chỉ xóa connection trong
   DBeaver. Không chọn toàn bộ PostgreSQL server/volume Docker.
4. Tạo lại database test trống, owner `diplomachain_migrator`. Trong database mới,
   quản trị viên cần khôi phục quyền runtime/default privileges giống cấu hình
   ở `infra/postgres/init-users.sh` (quyền có phạm vi database). Không chạy lại
   nguyên script tạo role vì các role cấp server có thể đã tồn tại.
5. Đặt `DATABASE_URL` dùng role `diplomachain_app` và `DIRECT_DATABASE_URL` dùng
   `diplomachain_migrator`, cùng trỏ đúng database test. Kiểm tra cả
   `apps/api/.env` và `apps/api/.env.database`: biến môi trường có thể ưu tiên hơn
   file. Không đưa URL chứa mật khẩu lên Git.
6. Sau khi xác nhận đích test, từ thư mục dự án chạy:

   ```powershell
   npm run db:generate -w api
   npm run db:migrate -w api
   npm run db:seed -w api
   ```

7. Seed hiện chỉ tạo tài khoản bootstrap **ADMIN** và **ORG2** khi có cấu hình;
   không tự khôi phục mọi tài khoản cũ hoặc tạo đủ ba tài khoản. Muốn giữ ba tài
   khoản cũ phải phục hồi chọn lọc cả quyền, institution, campus và liên kết sinh
   viên; không phục hồi refresh token/OTP cũ.
8. Trước khi khởi động API/worker, bảo đảm Fabric và thư mục tài liệu cũng thuộc
   môi trường test tương ứng; kiểm tra số bản ghi và đăng nhập.

Không dùng `TRUNCATE ... CASCADE` hàng loạt để giữ tài khoản: `accounts.student_id`
liên kết đến `students`; cascade có thể kéo theo bảng tài khoản/bằng chứng.
Xóa vài bảng còn có thể làm lệch bộ đếm import, outbox và quan hệ SQL/PDF/chain.
Không dùng `prisma migrate reset` để bỏ qua lỗi migration hoặc sửa lịch sử.

## 5. Dữ liệu trên blockchain xử lý thế nào?

Chaincode hiện có neo phát hành và ghi sự kiện thu hồi, không có chức năng xóa
lịch sử giao dịch. **Thu hồi tạo giao dịch mới; giao dịch phát hành cũ vẫn còn.**
Xóa PostgreSQL hoặc PDF không xóa giao dịch Fabric; ngược lại cũng không tự xóa
SQL. Xóa world state trên một peer không phải cách xóa blockchain và có thể làm
hỏng/không nhất quán mạng.

Dữ liệu thật: dùng **Thu hồi**, giữ lịch sử kiểm toán. Với Fabric local thực sự
được phép hủy, muốn trắng ledger phải dựng lại mạng thử nghiệm hoặc chuyển sang
mạng/channel mới; đó không phải xóa từng giao dịch.

Quy trình reset mạng test cần đủ các bước:

1. Dừng ứng dụng/worker test; sao lưu và ghi nhận network, channel, chaincode,
   peer/orderer, volume và danh tính đang dùng.
2. Kiểm kê bằng lệnh chỉ đọc:

   ```powershell
   docker ps -a --format "table {{.Names}}\t{{.Status}}"
   docker volume ls
   docker inspect --format '{{json .Mounts}}' peer0.org1.example.com
   docker inspect --format '{{json .Mounts}}' peer0.org2.example.com
   docker inspect --format '{{json .Mounts}}' orderer.example.com
   ```

   Ba tên container trên là tên local theo dự án; nếu không tồn tại hoặc không
   khớp cấu hình thực tế thì dừng, không đoán tên volume.

3. Chỉ gỡ container/volume ledger đã xác nhận thuộc riêng mạng test cần hủy.
   Không xóa volume PostgreSQL, mạng Fabric khác hay thư mục khóa/PDF. Phải chốt
   danh sách thực tế trước, không dùng lệnh quét mọi container/volume trên máy.
4. Dựng lại orderer/peer và channel, triển khai lại chaincode, cấu hình issuer,
   xác nhận gateway kết nối mạng mới. `scripts/start-fabric-local.ps1` chỉ khởi
   động container đã có, không triển khai lại mạng đã bị xóa.
5. Chuyển đồng bộ API, worker, database test trống và thư mục tài liệu test sang
   môi trường mới; kiểm tra phát hành/xác thực trước khi dùng. Không dùng lại
   outbox hay PDF đã ký của môi trường cũ như thể đã neo lên chain mới.

**Không chạy mù `blockchain-network/network.sh down`.** Script hiện có thể gỡ
volume mạng, quét container Fabric theo nhãn, xóa vật liệu CA/MSP và gói
`*.tar.gz`; nó không phải lệnh xóa dữ liệu có phạm vi một văn bằng. Gói
`educert.tar.gz` hoặc mạng khác trên máy có thể bị ảnh hưởng.

## 6. Kết luận cho hệ thống hiện tại

- Sửa sai nghiệp vụ: thu hồi/thay thế, không xóa lịch sử.
- Cần chạy lại đồ án từ đầu: ưu tiên môi trường test riêng.
- Muốn giữ ba tài khoản: chốt account ID và phạm vi trước; cần script kiểm thử
  trên bản sao, không dùng lệnh xóa tất cả.
- Hướng dẫn này không chạy SQL thay đổi dữ liệu, không xóa ledger, không tạo lại
  chứng thư/PDF và không tự khởi động/dừng dịch vụ.
