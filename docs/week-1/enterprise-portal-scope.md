# Phạm vi cổng xác thực doanh nghiệp

## Mục tiêu

Cho phép doanh nghiệp kiểm tra tính hợp lệ của văn bằng mà không có quyền cấp, sửa, duyệt hoặc thu hồi dữ liệu.

## Vai trò và quyền

Role mới: `verifier`.

Được phép:

- Đăng nhập và xem hồ sơ doanh nghiệp của chính mình.
- Xác thực một văn bằng bằng UUID, số hiệu hoặc QR.
- Xem kết quả tối thiểu: họ tên, mã sinh viên, ngành, năm tốt nghiệp, số hiệu và trạng thái.
- Xem lịch sử tra cứu do tài khoản của mình thực hiện.
- Nhận mã biên nhận cho mỗi lần tra cứu.

Không được phép:

- Cấp, duyệt, từ chối hoặc thu hồi văn bằng.
- Xem dữ liệu quản trị, audit toàn hệ thống hoặc thông tin nhạy cảm không cần thiết.
- Sửa dữ liệu MongoDB hay blockchain.

## Luồng chính

1. Quản trị viên tạo/kích hoạt tài khoản doanh nghiệp.
2. Doanh nghiệp đăng nhập với role `verifier`.
3. Người dùng nhập UUID/số hiệu hoặc quét QR.
4. Backend kiểm tra blockchain, trạng thái thu hồi và tính toàn vẹn với MongoDB.
5. Hệ thống trả về trạng thái `VALID`, `REVOKED`, `NOT_FOUND` hoặc `DATA_MISMATCH`.
6. Hệ thống ghi lịch sử tra cứu, thời gian, tài khoản, phương thức và mã biên nhận.

## Yêu cầu phi chức năng

- Không trả dữ liệu nhạy cảm ngoài danh sách đã chốt.
- Rate limit theo tài khoản và địa chỉ IP.
- Mọi lần tra cứu phải có audit trail.
- Giao diện hoạt động trên desktop và mobile.
- Thông báo lỗi không làm lộ cấu hình Fabric, MongoDB hoặc stack trace.

## Tiêu chí nghiệm thu bản đầu

- Tài khoản `verifier` chỉ truy cập được portal doanh nghiệp.
- Ba phương thức UUID, số hiệu và QR cho kết quả nhất quán.
- Văn bằng thu hồi và không tồn tại được phân biệt rõ.
- Mỗi lần tra cứu sinh một mã biên nhận duy nhất và xuất hiện trong lịch sử.
- Các endpoint cấp/duyệt/từ chối/thu hồi trả `403` đối với `verifier`.

