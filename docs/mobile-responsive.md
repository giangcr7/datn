# Giao diện trên điện thoại và máy tính bảng

- Dưới 992px: menu công khai, menu nhà trường/quản trị và menu sinh viên mở trong ngăn trượt. Có thể đóng bằng nút đóng, chạm vùng nền hoặc phím Escape; chọn chức năng sẽ đóng menu. Chuyển sang màn hình lớn cũng đóng ngăn trượt.
- Từ 992px: giữ thanh điều hướng và sidebar của máy tính, bao gồm khả năng thu gọn sidebar.
- Từ 640px trở xuống: giảm khoảng đệm, cho bộ lọc và nút dài xuống dòng; các bảng rộng cuộn ngang bên trong bảng, không kéo giãn cả trang. Hộp thoại và ngăn thông báo/chat không vượt chiều ngang màn hình.
- Giữ màu xanh/vàng của nhà trường và Roboto tiếng Việt. Ô nhập dùng cỡ chữ 16px trên điện thoại, không khóa khả năng phóng to của trình duyệt. Nút chat thu gọn thành biểu tượng có nhãn hỗ trợ trình đọc màn hình.
- Đây là giao diện web responsive dùng cùng địa chỉ và cùng phân quyền, không phải ứng dụng cài đặt riêng. Không thay đổi dữ liệu, cách ký PDF hoặc blockchain.

## Kiểm thử

Các kiểm thử sử dụng phiên đăng nhập giả lập và backend chỉ đọc trong thư mục tạm; không gọi database, dịch vụ ký hoặc ledger thật:

```powershell
node scripts/test-homepage.mjs
node scripts/test-university-ui.mjs
node scripts/test-university-ui-web.mjs
```

Kiểm thử trình duyệt tùy chọn dùng module Playwright đã có ngoài dự án, không thêm dependency vào ứng dụng:

```powershell
$env:WORKDESK_BROWSER_MODULE = 'C:\duong-dan\playwright-core\index.mjs'
$env:WORKDESK_BROWSER_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node scripts/test-university-ui-web.mjs
Remove-Item Env:WORKDESK_BROWSER_MODULE, Env:WORKDESK_BROWSER_EXECUTABLE
```

Khi bật kiểm thử trình duyệt, script build và chạy bản production biệt lập bằng Webpack để tránh dev server tích lũy bộ nhớ khi kiểm tra nhiều trang. Bao phủ 25 đường dẫn ở các chiều rộng 320, 390, 768, 991, 992 và 1280px; kiểm tra tràn trang, mốc đổi menu, tab đăng nhập, điều hướng, đóng menu, cuộn bảng, hộp thoại, thông báo và gửi chat bằng Enter.

Ảnh xem trước chỉ được tạo khi đặt rõ WORKDESK_TEST_PREVIEW_DIR đến một thư mục trong thư mục tạm của hệ điều hành; người chạy chịu trách nhiệm dọn thư mục ảnh đó. Profile trình duyệt, bản build và dependency link của script luôn được dọn trong finally.

Đây là kiểm thử trình duyệt với viewport và thao tác cảm ứng giả lập, không thay thế kiểm tra camera QR, bàn phím ảo và tải PDF trên điện thoại thật.
