"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightOutlined,
  BankOutlined,
  BlockOutlined,
  FilePdfOutlined,
  LoginOutlined,
  QrcodeOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import styles from "./page.module.css";

const steps = [
  {
    title: "Chọn hình thức",
    description:
      "Tra cứu để tìm thông tin; xác thực khi bạn đã có tệp PDF hoặc mã QR trên văn bằng.",
  },
  {
    title: "Cung cấp thông tin",
    description:
      "Nhập thông tin cần tra cứu, tải lên tệp PDF hoặc mở camera để quét mã QR.",
  },
  {
    title: "Xem kết quả",
    description:
      "Đọc thông tin văn bằng, kết quả kiểm tra và các lưu ý về tình trạng văn bằng.",
  },
];

export default function HomePage() {
  return (
    <div className={styles.page} id="dau-trang">
      <a className={styles.skipLink} href="#noi-dung">
        Chuyển đến nội dung chính
      </a>

      <header className={styles.header}>
        <div className={styles.container + " " + styles.headerInner}>
          <Link
            className={styles.brand}
            href="/"
            aria-label="Trang chủ Đại học Thủy Lợi"
          >
            <Image
              src="/logo-tlu.png"
              alt="Logo Trường Đại học Thủy Lợi"
              width={48}
              height={48}
              priority
            />
            <span className={styles.brandText}>
              <strong>TRƯỜNG ĐẠI HỌC THỦY LỢI</strong>
              <span>Cổng thông tin văn bằng</span>
            </span>
          </Link>

          <nav className={styles.navigation} aria-label="Điều hướng chính">
            <Link href="/search" aria-label="Tra cứu văn bằng">
              Tra cứu<span className={styles.navigationDetail}> văn bằng</span>
            </Link>
            <Link href="/verify" aria-label="Xác thực văn bằng">
              Xác thực<span className={styles.navigationDetail}> văn bằng</span>
            </Link>
            <a href="#huong-dan">Hướng dẫn</a>
          </nav>

          <Link className={styles.loginLink} href="/login">
            <LoginOutlined aria-hidden="true" />
            <span>Đăng nhập</span>
          </Link>
        </div>
      </header>

      <main id="noi-dung" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.container + " " + styles.heroInner}>
            <div className={styles.introduction}>
              <p className={styles.eyebrow}>
                KẾT NỐI THÔNG TIN, CỦNG CỐ NIỀM TIN
              </p>
              <h1 id="home-title">
                Cổng tra cứu và <span>xác thực văn bằng</span>
              </h1>
              <p className={styles.lead}>
                Tra cứu thông tin văn bằng. Xác thực bằng tệp PDF hoặc mã QR mà
                không cần đăng nhập.
              </p>
              <a className={styles.guideLink} href="#huong-dan">
                Tìm hiểu cách sử dụng
                <ArrowRightOutlined aria-hidden="true" />
              </a>
              <div className={styles.technologyNote}>
                <BlockOutlined aria-hidden="true" />
                <p>Ứng dụng blockchain trong quản lý và xác thực văn bằng.</p>
              </div>
            </div>

            <div className={styles.services} aria-label="Chức năng công khai">
              <article className={styles.serviceCard + " " + styles.verifyCard}>
                <div className={styles.serviceTopline}>
                  <span className={styles.serviceIcon}>
                    <SafetyCertificateOutlined aria-hidden="true" />
                  </span>
                  <span className={styles.serviceCategory}>
                    KIỂM TRA VĂN BẰNG
                  </span>
                </div>
                <h2>Xác thực văn bằng</h2>
                <p>
                  Bạn đã có văn bằng? Sử dụng tệp PDF hoặc quét mã QR để kiểm
                  tra thông tin và tình trạng văn bằng.
                </p>
                <div className={styles.methods} aria-label="Hình thức xác thực">
                  <span>
                    <FilePdfOutlined aria-hidden="true" /> Tệp PDF
                  </span>
                  <span>
                    <QrcodeOutlined aria-hidden="true" /> Mã QR
                  </span>
                </div>
                <Link className={styles.primaryAction} href="/verify">
                  Xác thực ngay
                  <ArrowRightOutlined aria-hidden="true" />
                </Link>
              </article>

              <article className={styles.serviceCard + " " + styles.searchCard}>
                <div className={styles.searchIcon}>
                  <SearchOutlined aria-hidden="true" />
                </div>
                <div className={styles.searchContent}>
                  <h2>Tra cứu văn bằng</h2>
                  <p>
                    Tìm thông tin văn bằng theo họ tên, mã sinh viên hoặc số
                    hiệu văn bằng, trong phạm vi được nhà trường cho phép tra
                    cứu.
                  </p>
                  <Link className={styles.secondaryAction} href="/search">
                    Tra cứu ngay
                    <ArrowRightOutlined aria-hidden="true" />
                  </Link>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section
          className={styles.guide}
          id="huong-dan"
          aria-labelledby="guide-title"
        >
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>HƯỚNG DẪN SỬ DỤNG</p>
                <h2 id="guide-title">Bắt đầu chỉ với 3 bước</h2>
              </div>
              <p>Chọn đúng chức năng để nhận kết quả phù hợp.</p>
            </div>

            <ol className={styles.steps}>
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className={styles.questions}>
              <details>
                <summary>Tra cứu và xác thực khác nhau thế nào?</summary>
                <p>
                  Tra cứu giúp tìm thông tin văn bằng trong hệ thống. Xác thực
                  giúp kiểm tra văn bằng bạn cung cấp. Việc tìm thấy thông tin
                  không thay thế cho việc kiểm tra tệp PDF.
                </p>
              </details>
              <details>
                <summary>Nên dùng tệp PDF hay mã QR?</summary>
                <p>
                  Dùng tệp PDF khi cần kiểm tra tính toàn vẹn của chính tệp đó.
                  Quét mã QR để mở và kiểm tra thông tin văn bằng được liên kết;
                  mã QR không thay thế việc kiểm tra nội dung tệp PDF.
                </p>
              </details>
            </div>
          </div>
        </section>

        <section className={styles.accounts} aria-labelledby="accounts-title">
          <div className={styles.container + " " + styles.accountsInner}>
            <div>
              <h2 id="accounts-title">
                Dành cho sinh viên và cán bộ nhà trường
              </h2>
              <p>Đăng nhập để sử dụng các chức năng theo tài khoản được cấp.</p>
            </div>
            <div className={styles.accountLinks}>
              <Link href="/login?type=student">
                <UserOutlined aria-hidden="true" />
                Đăng nhập sinh viên
                <ArrowRightOutlined aria-hidden="true" />
              </Link>
              <Link href="/login?type=university">
                <BankOutlined aria-hidden="true" />
                Đăng nhập cán bộ
                <ArrowRightOutlined aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container + " " + styles.footerInner}>
          <div>
            <strong>TRƯỜNG ĐẠI HỌC THỦY LỢI</strong>
            <p>Hệ thống quản lý và xác thực văn bằng</p>
          </div>
          <nav aria-label="Liên kết cuối trang">
            <a href="#huong-dan">Hướng dẫn sử dụng</a>
            <a href="#dau-trang">Về đầu trang ↑</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
