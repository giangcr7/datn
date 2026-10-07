# Kiến trúc hệ thống

```mermaid
flowchart LR
    Public[Người tra cứu công khai]
    Student[Sinh viên]
    University[Nhà trường / Admin]
    Verifier[Doanh nghiệp / Verifier]

    Web[Next.js Web\nPort 3000]
    API[NestJS API\nPort 3001]
    Auth[JWT + RBAC + OTP]
    Mongo[(MongoDB\nngười dùng, văn bằng, audit)]
    Gateway[Fabric Gateway]
    Fabric[(Hyperledger Fabric\nledger + chaincode)]
    Mail[SMTP / Email]

    Public --> Web
    Student --> Web
    University --> Web
    Verifier --> Web
    Web -->|REST / JSON| API
    API --> Auth
    API --> Mongo
    API --> Gateway
    Gateway --> Fabric
    Auth --> Mongo
    Auth --> Mail
```

## Ranh giới tin cậy

- Frontend không được kết nối trực tiếp MongoDB hoặc Fabric.
- Backend là điểm thực thi xác thực đầu vào, phân quyền, rate limit và audit.
- MongoDB lưu dữ liệu nghiệp vụ có thể truy vấn; Fabric lưu hash, trạng thái và bằng chứng bất biến.
- Kết quả xác thực phải đối chiếu dữ liệu đầu vào, MongoDB và blockchain.

