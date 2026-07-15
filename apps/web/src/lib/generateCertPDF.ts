import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';

export async function generateCertPDF(record: any, verifyUrl: string) {
  // Tạo QR base64
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 200, margin: 1 });

  // Tạo div HTML tạm thời
  const div = document.createElement('div');
  div.style.cssText = `
    width: 1122px;
    height: 794px;
    padding: 0;
    margin: 0;
    background: #f8f9ff;
    font-family: 'Times New Roman', Times, serif;
    position: fixed;
    top: -9999px;
    left: -9999px;
  `;

  div.innerHTML = `
    <div style="width:100%;height:100%;border:4px solid #0056b3;box-sizing:border-box;position:relative;">
      <!-- Header -->
      <div style="background:#0056b3;padding:16px 40px;display:flex;align-items:center;justify-content:space-between;">
        <div style="color:white;">
          <div style="font-size:22px;font-weight:bold;letter-spacing:1px;">TRƯỜNG ĐẠI HỌC THỦY LỢI</div>
          <div style="font-size:13px;margin-top:4px;">PHÂN HIỆU TẠI THÀNH PHỐ HỒ CHÍ MINH</div>
        </div>
        <div style="color:white;text-align:right;font-size:12px;">
          <div>Số hiệu: <b>${record.soHieu || ''}</b></div>
          <div>Số vào sổ: <b>${record.soVaoSo || ''}</b></div>
        </div>
      </div>

      <!-- Body -->
      <div style="display:flex;padding:24px 40px;gap:32px;">
        <!-- Left: thông tin -->
        <div style="flex:1;">
          <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:13px;color:#555;margin-bottom:4px;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
            <div style="font-size:12px;color:#555;margin-bottom:12px;">Độc lập – Tự do – Hạnh phúc</div>
            <div style="font-size:26px;font-weight:bold;color:#0056b3;text-transform:uppercase;letter-spacing:2px;">Văn Bằng Tốt Nghiệp</div>
            <div style="width:80px;height:3px;background:#0056b3;margin:8px auto;"></div>
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:15px;">
            <tr><td style="padding:7px 0;color:#666;width:180px;">Họ và tên:</td><td style="padding:7px 0;font-weight:bold;font-size:17px;color:#1a1a1a;">${record.fullName || ''}</td></tr>
            <tr><td style="padding:7px 0;color:#666;">Mã số sinh viên:</td><td style="padding:7px 0;font-weight:bold;">${record.mssv || ''}</td></tr>
            <tr><td style="padding:7px 0;color:#666;">Ngành học:</td><td style="padding:7px 0;font-weight:bold;">${record.major || ''}</td></tr>
            <tr><td style="padding:7px 0;color:#666;">Lớp:</td><td style="padding:7px 0;">${record.className || ''}</td></tr>
            <tr><td style="padding:7px 0;color:#666;">Điểm TB (GPA):</td><td style="padding:7px 0;font-weight:bold;">${record.gpa || ''}</td></tr>
            <tr><td style="padding:7px 0;color:#666;">Xếp loại:</td><td style="padding:7px 0;font-weight:bold;color:#0056b3;font-size:17px;">${record.grade || ''}</td></tr>
            <tr><td style="padding:7px 0;color:#666;">Năm tốt nghiệp:</td><td style="padding:7px 0;font-weight:bold;">${record.namTotNghiep || ''}</td></tr>
            <tr><td style="padding:7px 0;color:#666;">Ngày cấp:</td><td style="padding:7px 0;">${record.issueDate || ''}</td></tr>
          </table>
        </div>

        <!-- Right: QR -->
        <div style="width:200px;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:20px;">
          <img src="${qrDataUrl}" style="width:160px;height:160px;border:2px solid #0056b3;padding:4px;" />
          <div style="font-size:11px;color:#666;text-align:center;margin-top:8px;">Quét QR để xác thực<br/>trên Blockchain</div>
          <div style="margin-top:24px;text-align:center;">
            <div style="font-size:11px;color:#666;margin-bottom:4px;">Đã xác thực bởi:</div>
            <div style="font-size:11px;color:#0a7a3c;font-weight:bold;">✓ ĐH Thủy Lợi HN</div>
            <div style="font-size:11px;color:#0a7a3c;font-weight:bold;">✓ Phân hiệu TP.HCM</div>
          </div>
        </div>
      </div>

      <!-- Hash footer -->
      <div style="position:absolute;bottom:0;left:0;right:0;">
        <div style="background:#e8f0fe;padding:8px 40px;border-top:1px solid #c5d5f5;">
          <span style="font-size:11px;color:#0056b3;font-weight:bold;">BLOCKCHAIN HASH: </span>
          <span style="font-size:10px;color:#333;font-family:monospace;">${record.certHash || ''}</span>
        </div>
        <div style="background:#0056b3;padding:6px;text-align:center;">
          <span style="font-size:10px;color:white;">Hệ thống xác thực văn bằng số – Hyperledger Fabric Blockchain | ${new Date().toLocaleDateString('vi-VN')}</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(div);

  const canvas = await html2canvas(div, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#f8f9ff',
  });

  document.body.removeChild(div);

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.addImage(imgData, 'PNG', 0, 0, 297, 210);
  
  // Nhúng proof vào metadata PDF để đọc được khi upload
  pdf.setProperties({
    title: 'Van Bang Tot Nghiep - ' + record.fullName,
    subject: JSON.stringify({
      certUUID: record.uuid,
      certHash: record.certHash,
      fullName: record.fullName,
      mssv: record.mssv,
      major: record.major,
      gpa: record.gpa,
      grade: record.grade,
      issueDate: record.issueDate,
      soHieu: record.soHieu,
      soVaoSo: record.soVaoSo,
      className: record.className,
      namTotNghiep: record.namTotNghiep,
    }),
    author: 'Truong Dai hoc Thuy Loi',
    keywords: record.certHash,
  });
  pdf.save(`VanBang_${record.mssv}_${record.soHieu}.pdf`);
}
