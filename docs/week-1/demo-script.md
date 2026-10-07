# Kịch bản demo ban đầu

## Chuẩn bị

- Docker Desktop, Fabric network, MongoDB, API và frontend đều ở trạng thái healthy.
- Có tài khoản nhà trường, sinh viên và dữ liệu văn bằng mẫu.
- Mở sẵn Swagger tại `http://localhost:3001/docs` để đối chiếu khi cần.

## Kịch bản

1. **Đăng nhập nhà trường**: đăng nhập và xác nhận dashboard tải thành công.
2. **Nhập sinh viên**: tạo một sinh viên hoặc nhập từ file hợp lệ.
3. **Yêu cầu/cấp văn bằng**: tạo yêu cầu, kiểm tra danh sách chờ và duyệt yêu cầu.
4. **Kiểm tra blockchain**: mở explorer, tìm transaction và xác nhận hash/trạng thái.
5. **Xác thực công khai**: dùng UUID vừa cấp; kết quả phải là hợp lệ.
6. **Xác thực Proof/QR**: tải proof hoặc quét QR; kết quả phải trùng với UUID.
7. **Tình huống giả mạo**: sửa một trường trong proof; hệ thống phải báo không khớp.
8. **Thu hồi**: nhà trường thu hồi văn bằng và nhập lý do.
9. **Xác thực sau thu hồi**: tra cứu lại; trạng thái phải là đã thu hồi và hiển thị lý do phù hợp.
10. **Audit**: kiểm tra các hành động cấp, xác thực và thu hồi đã được ghi log.

## Bằng chứng cần lưu

- Ảnh dashboard và explorer.
- UUID, transaction ID và hash của văn bằng mẫu.
- Kết quả trước/sau thu hồi.
- Kết quả proof bị sửa.
- Audit log tương ứng.

