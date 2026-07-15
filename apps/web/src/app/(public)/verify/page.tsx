"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Input, Button, Typography, message, Result, Descriptions, Tabs, Upload, Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, InboxOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

// ✅ Parse linh hoạt: nhận JSON proof, UUID thuần, hoặc certHash thuần
function parseProofInput(raw: string): any | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    const uuid = obj.certUUID || obj.uuid;
    if (uuid) return { ...obj, uuid };
    if (obj.certHash) return obj;
  } catch {}
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return { uuid: s };
  }
  if (/^[0-9a-f]{64}$/i.test(s)) {
    return { certHash: s };
  }
  return null;
}

function VerifyContent() {
  const [proofString, setProofString] = useState('');
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState('proof');
  const searchParams = useSearchParams();

  useEffect(() => {
    const proofFromUrl = searchParams.get('proof');
    if (proofFromUrl) {
      setProofString(decodeURIComponent(proofFromUrl));
      // Tự động verify khi có proof từ URL
      setTimeout(() => {
        document.getElementById('btn-verify')?.click();
      }, 500);
    }
  }, []);
  const [loading, setLoading] = useState(false);
  const [certData, setCertData] = useState<any>(null);
  const [verifyResult, setVerifyResult] = useState<{ isValid: boolean; message: string; details?: any } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const executeVerification = async (payload: any) => {
    setLoading(true);
    setErrorMsg('');
    setCertData(null);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setVerifyResult(data);
        setCertData(data.details);
      } else {
        setErrorMsg(data.error || 'Xác thực thất bại.');
      }
    } catch {
      setErrorMsg('Lỗi kết nối đến mạng lưới Blockchain.');
    } finally {
      setLoading(false);
    }
  };

  // Tab 1: xác thực qua Proof JSON / UUID / Hash
  const handleVerifyProof = async () => {
    const parsed = parseProofInput(proofString);

    if (!parsed) {
      message.warning('Chuỗi không hợp lệ. Vui lòng dán Proof JSON, UUID, hoặc Hash 64 ký tự.');
      return;
    }

    // Gửi toàn bộ proof object để verify đúng hash
    if (parsed.uuid) {
      await executeVerification({ ...parsed, uuid: parsed.uuid });
    } else if (parsed.certHash) {
      await executeVerification({ certHash: parsed.certHash });
    }
  };

  // Tab 2: upload PDF (giữ nguyên logic cũ)
  const handlePdfUpload = async (info: any) => {
    const file = info.file as File;
    setLoading(true);
    setErrorMsg('');
    setCertData(null);
    setVerifyResult(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 3.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx as any, viewport } as any).promise;
      const jsQR = (await import('jsqr')).default;
      // Đọc proof từ metadata PDF (subject field)
      const metadata = await pdf.getMetadata();
      const subject = (metadata?.info as any)?.Subject || '';
      
      console.log('Metadata subject:', subject);
      let qrText = subject;
      if (!qrText) {
        setLoading(false);
        setErrorMsg('PDF không chứa thông tin xác thực. Hãy dùng PDF được tạo từ hệ thống này.');
        return false;
      }
      let proof = null;
      try {
        const url = new URL(qrText);
        const proofParam = url.searchParams.get('proof');
        if (proofParam) proof = JSON.parse(decodeURIComponent(proofParam));
      } catch { try { proof = JSON.parse(qrText); } catch {} }
      if (!proof || (!proof.certUUID && !proof.uuid)) {
        setLoading(false);
        setErrorMsg('QR code khong chua thong tin van bang hop le.');
        return false;
      }
      message.success('Da doc QR code tu PDF thanh cong!');
      const uuid = proof.certUUID || proof.uuid;
      await executeVerification({ ...proof, uuid });
    } catch (err) {
      setLoading(false);
      setErrorMsg('Loi doc PDF: ' + String(err));
    }
    return false;
  };

  const tabItems = [
    {
      key: '1',
      label: 'Chuỗi Minh Chứng (Proof)',
      children: (
        <div className="mt-4">
          <Text className="block mb-1 text-gray-600">
            Dán <strong>Proof JSON</strong> (từ nút Copy Proof), hoặc trực tiếp <strong>UUID</strong> / <strong>Hash</strong> của văn bằng:
          </Text>
          <Text type="secondary" className="block mb-3 text-xs">
            Ví dụ JSON: <code>{`{"certUUID":"...","certHash":"..."}`}</code>
          </Text>
          <TextArea
            rows={7}
            placeholder={`Dán Proof JSON:\n{\n  "certUUID": "xxxxxxxx-xxxx-...",\n  "certHash": "abc123...",\n  ...\n}\n\nHoặc chỉ UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\nHoặc chỉ Hash: abc123def456... (64 ký tự)`}
            value={proofString}
            onChange={(e) => setProofString(e.target.value)}
            className="font-mono text-sm mb-4"
          />
          <Button type="primary" block size="large" id="btn-verify" onClick={handleVerifyProof} loading={loading}>
            Kiểm định
          </Button>
        </div>
      ),
    },
  ,
    {
      key: "3",
      label: "📷 Quét QR Code",
      children: (
        <div className="mt-4">
          {!scanning ? (
            <div className="text-center py-8">
              <Button type="primary" size="large" onClick={() => { setScanning(true); setTimeout(() => { if (typeof window !== "undefined") { const { Html5QrcodeScanner } = require("html5-qrcode"); const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 250 }, false); scanner.render((t: string) => { try { const u = new URL(t); const p = u.searchParams.get("proof"); setProofString(p ? decodeURIComponent(p) : t); } catch { setProofString(t); } scanner.clear(); setScanning(false); setTimeout(() => document.getElementById("btn-verify")?.click(), 500); }, () => {}); } }, 300); }}>
                Mở Camera Quét QR
              </Button>
            </div>
          ) : (
            <div>
              <div id="qr-reader" className="w-full" />
              <Button className="mt-4 w-full" onClick={() => setScanning(false)}>Hủy quét</Button>
            </div>
          )}
        </div>
      ),
    },
  ];

  const isValid = verifyResult?.isValid;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-16 px-4">
      <div className="max-w-3xl w-full bg-white p-8 rounded-lg shadow-sm border">
        <div className="mb-8">
          <Title level={3} style={{ margin: 0 }}>Cổng Xác Thực Văn Bằng Số</Title>
        </div>

        <div style={{display:'flex', gap:8, marginBottom:16}}>
          <Button 
            type={activeTab==='proof' ? 'primary' : 'default'} 
            onClick={() => setActiveTab('proof')}
            style={{flex:1}}
          >📄 Proof JSON</Button>
          <Button 
            type={activeTab==='qr' ? 'primary' : 'default'} 
            onClick={() => setActiveTab('qr')}
            style={{flex:1}}
          >📷 Quét QR</Button>
          <Button 
            type={activeTab==='pdf' ? 'primary' : 'default'} 
            onClick={() => setActiveTab('pdf')}
            style={{flex:1}}
          >📁 Upload PDF</Button>
        </div>
        {activeTab === 'proof' && (
          <div className="mt-4">
            <TextArea
              rows={7}
              placeholder="Dán Proof JSON hoặc UUID"
              value={proofString}
              onChange={(e) => setProofString(e.target.value)}
              className="font-mono text-sm mb-4" style={{width:"100%"}}
            />
            <Button type="primary" block size="large" id="btn-verify" onClick={handleVerifyProof} loading={loading} style={{width:"100%", marginTop:8}}>
              Kiểm định
            </Button>
          </div>
        )}
        {activeTab === 'qr' && (
          <div className="mt-4">
            {!scanning ? (
              <div className="text-center py-8">
                <Button type="primary" size="large" onClick={async () => {
                  try {
                    // Xin quyền camera trước
                    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                    stream.getTracks().forEach(t => t.stop());
                    setScanning(true);
                    setTimeout(async () => {
                      try {
                        const { BrowserQRCodeReader } = await import('@zxing/browser');
                        const codeReader = new BrowserQRCodeReader();
                        const videoEl = document.getElementById('zxing-video') as HTMLVideoElement;
                        if (videoEl) {
                          await codeReader.decodeFromVideoDevice(undefined, videoEl, (result) => {
                            if (result) {
                              const text = result.getText();
                              try {
                                const u = new URL(text);
                                const p = u.searchParams.get('proof');
                                setProofString(p ? decodeURIComponent(p) : text);
                              } catch { setProofString(text); }
                              setScanning(false);
                              setActiveTab('proof');
                            }
                          });
                        }
                      } catch(e) {
                        setScanning(false);
                        message.error('Lỗi khởi động camera');
                      }
                    }, 500);
                  } catch(e: any) {
                    message.error('Lỗi camera: ' + (e?.message || String(e)));
                  }
                }}>
                  Mở Camera Quét QR
                </Button>
                <Text type="secondary" className="block mt-3 text-sm">
                  Quét QR Code trên văn bằng để xác thực tự động
                </Text>
              </div>
            ) : (
              <div>
                <video id="zxing-video" style={{width:'100%', borderRadius:8}} autoPlay muted playsInline />
                <Button className="mt-4 w-full" onClick={() => setScanning(false)}>Hủy quét</Button>
              </div>
            )}
          </div>
        )}
        {activeTab === 'pdf' && (
          <div className="mt-4">
            <Dragger
              accept=".pdf"
              beforeUpload={(file) => { handlePdfUpload({file}); return false; }}
              showUploadList={false}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p>Kéo thả hoặc nhấn để upload PDF văn bằng</p>
              <p className="text-gray-400 text-sm">Hệ thống sẽ tự động đọc QR code trong PDF</p>
            </Dragger>
          </div>
        )}

        {/* Kết quả hợp lệ */}
        {verifyResult && isValid && certData && (
          <div className="mt-8 pt-8 border-t">
            <Result
              icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              title="VĂN BẰNG HỢP LỆ & TOÀN VẸN"
              subTitle={
                <Text copyable={{ text: certData.onChainHash }} className="text-gray-500 text-xs font-mono">
                  Hash: {certData.onChainHash?.substring(0, 32)}...
                </Text>
              }
            >
              <Descriptions bordered column={1} size="small" className="bg-gray-50">
                <Descriptions.Item label="Họ và tên"><b>{certData.studentName}</b></Descriptions.Item>
                <Descriptions.Item label="Mã sinh viên">{certData.mssv}</Descriptions.Item>
                <Descriptions.Item label="Ngành học">{certData.major}</Descriptions.Item>
                <Descriptions.Item label="GPA">{certData.gpa}</Descriptions.Item>
                <Descriptions.Item label="Xếp loại">{certData.grade}</Descriptions.Item>
                <Descriptions.Item label="Năm tốt nghiệp">{certData.namTotNghiep}</Descriptions.Item>
                <Descriptions.Item label="Số hiệu bằng">{certData.soHieu}</Descriptions.Item>
                <Descriptions.Item label="Ngày cấp">{certData.issueDate}</Descriptions.Item>
                {certData.txId && (
                <Descriptions.Item label="Tx ID">
                  <Text code style={{ fontSize: 11 }}>{certData.txId}</Text>
                </Descriptions.Item>
                )}
                <Descriptions.Item label="Endorsers">
                  <span className="text-green-600 font-medium">✅ Org1MSP (ĐH Thủy Lợi HN) + Org2MSP (Phân hiệu TP.HCM)</span>
                </Descriptions.Item>
                <Descriptions.Item label="On-chain Hash">
                  <Text code style={{ fontSize: 10 }}>{certData.onChainHash}</Text>
                </Descriptions.Item>
              </Descriptions>
            </Result>
          </div>
        )}

        {/* Kết quả không hợp lệ từ verify */}
        {verifyResult && !isValid && (
          <div className="mt-8 pt-8 border-t">
            <Result
              icon={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
              title="CẢNH BÁO: VĂN BẰNG KHÔNG HỢP LỆ"
              subTitle={<span className="text-red-500 font-medium">{verifyResult.message}</span>}
            />
          </div>
        )}

        {/* Lỗi kết nối / không tìm thấy */}
        {errorMsg && (
          <div className="mt-8 pt-8 border-t">
            <Result
              icon={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
              title="CẢNH BÁO TỪ HỆ THỐNG"
              subTitle={<span className="text-red-500 font-medium">{errorMsg}</span>}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Đang tải...</div>}>
      <VerifyContent />
    </Suspense>
  );
}
