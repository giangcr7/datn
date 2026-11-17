# Huong dan van hanh AI phat hien bat thuong

## Pham vi da trien khai

He thong hien dung rule engine giai thich duoc, khong tu nhan la model hoc may.
Moi rule tao ra mot canh bao co `riskScore`, `severity`, `ruleVersion` va
`evidence`. He thong khong tu dong sua du lieu, approve, revoke hay ghi
`COMMITTED` len blockchain.

Quy tac `rules-v1` hien tai:

- `HASH_MISMATCH`: payload da tinh lai khong khop hash da luu.
- `ANCHOR_PENDING_TOO_LONG`: ho so da approve nhung ISSUE chua committed qua 24 gio.
- `ANCHOR_NOT_COMMITTED`: ho so da approve nhung ISSUE chua committed trong thoi gian ngan.
- `ANCHOR_FAILURE_PATTERN`: phien ban hien tai co anchor FAILED.
- `MULTIPLE_ACTIVE_DIPLOMAS`: mot sinh vien co nhieu van bang ACTIVE.
- `POST_APPROVAL_MUTATION`: co thay doi quy trinh sau thoi diem approve.
- `VERSION_CHURN`: van bang co tu 3 phien ban tro len.
- `ANOMALY_RISK`: tong hop diem cua cac tin hieu tren cung mot van bang, toi da 100.

San luong phat hanh cao cua tai khoan nha truong khong phai la bat thuong vi
nha truong duoc phep phat hanh theo nghiep vu. He thong chi luu san luong trong
audit/thong ke; khong cong diem rui ro chi vi co nhieu van bang trong mot khoang
thoi gian. Neu can phat hien tai khoan bi chiem quyen, phai dung tin hieu dang
nhap, IP, pham vi co so, thay doi du lieu, hash va anchor thay vi dem so luong
phat hanh.

Muc do duoc tinh tu diem: `LOW` duoi 40, `MEDIUM` tu 40, `HIGH` tu 70,
`CRITICAL` tu 90.

## API va giao dien

Nhan vien `admin` va `university` tai co so chinh truy cap menu
`Phat hien bat thuong` tai `/anomalies`.

- `POST /api/integrity/anomaly-scan?days=7&limit=500`: chay scan thu cong.
- `GET /api/integrity/anomalies?resolved=false&severity=HIGH`: xem danh sach va evidence.
- `POST /api/integrity/anomalies/:id/resolve`: xac nhan da xu ly, bat buoc co note.
- `POST /api/integrity/anomalies/:id/reopen`: mo lai canh bao khi phat hien lai.

Job tu dong chay cung lich integrity luc 02:00 gio Viet Nam. Scan mac dinh 7
ngay va gioi han 500 ho so moi lan; co the chay lai de cap nhat `lastSeenAt`.

## Trien khai

1. Kiem tra `DATABASE_URL`, `JWT_SECRET` va ket noi Fabric trong moi truong dich vu.
2. Chay migration:

   ```powershell
   npm run db:migrate -w api
   ```

3. Build va test API:

   ```powershell
   npm run build -w api
   npm test -w api -- --runInBand integrity/anomaly-engine.spec.ts
   ```

4. Build web:

   ```powershell
   npm run build -w web
   ```

5. Dang nhap bang tai khoan admin hoac approver, mo `Phat hien bat thuong`,
   chay scan 7 ngay va kiem tra evidence truoc khi resolve.

## Quy trinh xu ly canh bao

1. Uu tien `CRITICAL` va `HIGH`.
2. Mo chi tiet, doi chieu evidence voi so van bang, audit log va blockchain.
3. Neu la loi du lieu, tao yeu cau chinh sua theo workflow hien hanh; khong sua
   truc tiep bang SQL va khong xoa canh bao.
4. Neu la loi anchor, kiem tra outbox/Fabric va dung chuc nang retry da co.
5. Ghi note ket qua, sau do resolve. Neu rule van phat hien lai, mo lai canh bao
   hoac tao record moi theo unique open alert.

## Lo trinh mo rong ML/LLM

Giai doan tiep theo chi nen them sau khi co du lieu da review:

- Luu tap feature an danh tu evidence va ket qua resolve/false-positive.
- Dao model anomaly khong giam sat (Isolation Forest, robust z-score) trong
  worker rieng; khong dua model vao request public search.
- Luu `modelVersion`, feature snapshot va confidence cung voi evidence.
- Chay shadow mode, so sanh voi `rules-v1`, sau do moi cho model bo sung diem.
- LLM chi dung de tom tat ly do cho nhan vien; khong duoc lam nguon quyet dinh
  duy nhat va khong nhan MSSV/PII neu khong can thiet.
