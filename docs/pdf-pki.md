# TSA và kiểm tra thu hồi chứng thư PDF

## Luồng đang triển khai

1. TP.HCM gửi yêu cầu: kiểm tra fingerprint đã cấu hình, thời hạn, key usage, chuỗi CA và trạng thái thu hồi trước khi dùng khóa ký.
2. Ký PDF ở mức B-T: gửi SHA-256 của giá trị chữ ký đến TSA RFC3161; kiểm tra nonce, messageImprint, chữ ký CMS, ESSCertID, critical EKU timeStamping, chuỗi CA và thu hồi chứng thư TSA. Token được nhúng vào thuộc tính unsigned của chữ ký PDF.
3. Hà Nội phê duyệt: xác minh lại PDF và PKI cơ sở; kiểm tra chứng thư Hà Nội rồi thêm chữ ký B-T thứ hai, giữ nguyên revision đầu.
4. Database lưu metadata kiểm tra trong `diploma_pdf_signatures.validation_evidence`. Snapshot neo Fabric chứa SHA-256 file PDF, fingerprint hai chứng thư và `validationEvidenceHash` cho từng chữ ký. Không ghi OCSP/CRL hay thông tin cá nhân bổ sung lên ledger.
5. Xác thực/tải PDF: đối chiếu file và bằng chứng đã lưu với snapshot; kiểm tra lại CA/TSA và trạng thái thu hồi hiện tại. Thu hồi chứng thư là trạng thái khác với thu hồi văn bằng trên Fabric.

## Chính sách an toàn

- Ưu tiên OCSP có chữ ký hợp lệ và đúng quyền responder. Nếu không dùng được OCSP, thử CRL đầy đủ do đúng CA ký. OCSP báo REVOKED hoặc UNKNOWN thì dừng, không ghi đè bằng CRL.
- Responder OCSP được ủy quyền cần EKU OCSP Signing; nếu không có OCSP no-check thì phải có CRL để kiểm tra thu hồi responder. Trust anchor không được dùng làm chứng thư ký PDF/TSA.
- Bắt buộc `nextUpdate` còn hạn; kiểm tra `thisUpdate`, `producedAt` và tuổi bằng chứng. Không coi mất mạng, dữ liệu cũ hoặc không rõ trạng thái là hợp lệ.
- Lấy endpoint OCSP/CRL từ mapping CA do quản trị cấu hình, không lấy URL từ PDF. Chỉ cho phép host/port được khai báo; chặn private IP, DNS rebinding, redirect, phản hồi quá 5 MB và quá thời gian chờ. Ngoại lệ loopback chỉ ở demo, không ở production.
- Chứng thư RSA tối thiểu 2048 bit hoặc EC P-256/P-384/P-521; chữ ký CA/OCSP/CRL/TSA phải dùng thuật toán được hỗ trợ SHA-256 trở lên. SHA-1 chỉ dùng nhận diện responder/ESSCertID v1, không cho ký dữ liệu.
- `PDF_PKI_CACHE_SECONDS=0` mặc định kiểm tra mới. Nếu bật cache (tối đa 300 giây), kết quả không sống quá `nextUpdate`; có thể trễ phát hiện thu hồi trong khoảng cache.

## Cấu hình triển khai thật

Đặt đường dẫn tuyệt đối, cấp quyền chỉ tài khoản API đọc được. Không đưa mật khẩu, P12/PFX, PEM khóa riêng hoặc tệp settings demo vào Git.

| Biến                      | Nội dung                                                             |
| ------------------------- | -------------------------------------------------------------------- |
| PDF_SIGNING_MODE          | `certificate`; dùng hai P12/PFX và fingerprint ORG1/ORG2 đã cấu hình |
| PDF_PKI_ENABLED           | `true`; production certificate mode không được tắt                   |
| PDF_TSA_URL               | Endpoint RFC3161 do nhà cung cấp TSA cấp                             |
| PDF_PKI_TRUST_BUNDLE_PATH | PEM các root CA được quản trị chấp nhận, gồm CA người ký và CA TSA   |
| PDF_PKI_ISSUERS_PATH      | PEM intermediate CA; không tự tải AIA từ internet                    |
| PDF_PKI_ENDPOINTS_PATH    | JSON mapping fingerprint SHA-256 issuer CA sang endpoint OCSP/CRL    |
| PDF_PKI_ALLOWED_HOSTS     | Các `host[:port]` phân tách dấu phẩy, gồm TSA, OCSP và CRL           |
| PDF_PKI_TIMEOUT_MS        | Mặc định 5000 ms mỗi request; khoảng 100–10000                       |
| PDF_PKI_MAX_AGE_SECONDS   | Mặc định 86400; tuổi tối đa bằng chứng, ngoài giới hạn nextUpdate    |
| PDF_PKI_CACHE_SECONDS     | Mặc định 0; tối đa 300                                               |

Ví dụ cấu trúc file endpoints (thay key bằng fingerprint CA thực, không dùng fingerprint chứng thư cá nhân):

```json
{
  "<64-hex-sha256-of-issuer-ca-certificate>": {
    "ocspUrl": "https://ocsp.ca.example/status",
    "crlUrl": "https://crl.ca.example/full.crl"
  }
}
```

Phải cấu hình endpoint của CA cấp trực tiếp cho từng chứng thư cần kiểm tra thu hồi trong chuỗi người ký và TSA (kể cả khi CA cấp trực tiếp là root). Bản thân trust anchor không kiểm tra thu hồi bằng OCSP/CRL. Chỉ cần một nguồn OCSP/CRL nhưng nên có cả hai. Chưa hỗ trợ delta/indirect/partitioned CRL; nếu CA chỉ phát loại đó thì cần tích hợp riêng trước production. Dịch vụ có authentication đặc thù cần adapter tương ứng; không nhét mật khẩu vào URL.

## Local demo

- `node scripts/setup-pdf-pki.mjs --configure-env` tạo CA, ORG1, ORG2, TSA riêng trong `.data/signing/pki-v2/`; chạy lại dùng cấu hình đã tạo, không ghi đè khóa cũ.
- `start.ps1` tự chạy DEMO TSA/OCSP/CRL tại loopback cổng 3318 nếu .env dùng đúng cấu hình demo. Chạy API riêng thì mở `node scripts/setup-pdf-pki.mjs --serve` trước. Cần OpenSSL (Windows mặc định lấy từ Git for Windows, hoặc đặt `OPENSSL_PATH`).
- API phải khởi động lại để nhận .env mới. Dịch vụ demo không phải TSA/CA công cộng và không tạo giá trị pháp lý cho văn bằng.
- `node scripts/test-pki-services.mjs` chạy OpenSSL RFC3161/OCSP/CRL, giả lập mất mạng, thu hồi, quá hạn, nonce/imprint/khóa sai, chữ ký sửa đổi, hai revision PDF; chỉ dùng fixtures tạm và cổng 3319.
- `node scripts/test-pdf-signatures.mjs` kiểm tra DB/snapshot với transaction rollback. `node scripts/test-reviewed-bulk.mjs --pdf` kiểm tra luồng hàng loạt.

## Tương thích và giới hạn

- Không sửa PDF đã phát hành. Hồ sơ B-B cũ vẫn được kiểm tra theo chính sách cũ và hiển thị rõ chưa có TSA/thu hồi. Hồ sơ chờ B-B không được Hà Nội ký tiếp khi bật PKI; cán bộ cần xử lý lại theo quy trình nghiệp vụ, không tự thay thế lịch sử chữ ký.
- Với B-T mới, kiểm tra chuỗi người ký tại thời điểm TSA; hết hạn chứng thư sau thời điểm đó không tự phủ nhận chữ ký. Tuy nhiên hệ thống vẫn cần lấy bằng chứng thu hồi hiện tại và hiện từ chối mọi trạng thái REVOKED, kể cả thu hồi sau ngày ký; chưa suy luận giá trị chữ ký lịch sử theo reason/invalidityDate.
- Đây là B-T kèm kiểm tra thu hồi online, không phải B-LT/B-LTA. Chưa nhúng OCSP/CRL vào DSS/VRI và chưa lưu full DER bằng chứng thu hồi dài hạn; database chỉ lưu hash/metadata, TSA token nằm trong PDF. Khi nguồn PKI không truy cập được, trạng thái là UNAVAILABLE, không kết luận hợp lệ offline.
- Chưa có HSM, USB token, remote signing hoặc quy trình gia hạn archive timestamp. Trước production phải dùng CA/TSA thật, nghiệm thu trust chain/endpoint/quản lý khóa, phân quyền và hiệu năng với nhà cung cấp; không tự kết luận hiệu lực pháp lý.
