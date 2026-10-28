"use client";

import Link from "next/link";
import {
  ArrowRightOutlined,
  BankOutlined,
  FilePdfOutlined,
  InfoCircleOutlined,
  QrcodeOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import styles from "@/styles/university-portal.module.css";
import {
  UniversityHeader,
  UniversityFooter,
} from "@/components/UniversityChrome";

const steps = [
  {
    title: "Chọn chức năng",
    description:
      "Chọn tra cứu thông tin hoặc xác thực văn bằng theo nhu cầu sử dụng.",
  },
  {
    title: "Cung cấp thông tin",
    description:
      "Nhập thông tin tra cứu; hoặc sử dụng tệp PDF, mã QR để xác thực văn bằng.",
  },
  {
    title: "Xem kết quả",
    description:
      "Đối chiếu thông tin và đọc kết quả kiểm tra, bao gồm các lưu ý về tình trạng văn bằng.",
  },
];

export default function HomePage() {
  return (
    <div className={styles.page} id="dau-trang">
      <a className={styles.skipLink} href="#noi-dung">
        Chuyển đến nội dung chính
      </a>

      <UniversityHeader />

      <main id="noi-dung" tabIndex={-1}>
        <div className={styles.container + " " + styles.mainContent}>
          <section className={styles.introduction} aria-labelledby="home-title">
            <h1 id="home-title">Cổng tra cứu và xác thực văn bằng</h1>
            <span className={styles.headingRule} aria-hidden="true" />
            <p>
              Tra cứu thông tin và kiểm tra tình trạng văn bằng tốt nghiệp do
              nhà trường quản lý.
            </p>
          </section>

          <section className={styles.services} aria-label="Chức năng công khai">
            <article className={styles.serviceCard}>
              <div className={styles.serviceHeading}>
                <SafetyCertificateOutlined
                  className={styles.serviceIcon}
                  aria-hidden="true"
                />
                <div>
                  <h2>Xác thực văn bằng</h2>
                  <p>Kiểm tra văn bằng được cung cấp</p>
                </div>
              </div>
              <p className={styles.serviceDescription}>
                Xác thực bằng tệp PDF hoặc mã QR mà không cần đăng nhập. Xem kết
                quả kiểm tra và tình trạng văn bằng trong hệ thống.
              </p>
              <div className={styles.methods} aria-label="Hình thức xác thực">
                <span>
                  <FilePdfOutlined aria-hidden="true" /> Tệp PDF văn bằng
                </span>
                <span>
                  <QrcodeOutlined aria-hidden="true" /> Mã QR trên văn bằng
                </span>
              </div>
              <Link className={styles.primaryAction} href="/verify">
                Xác thực ngay
                <ArrowRightOutlined aria-hidden="true" />
              </Link>
            </article>

            <article className={styles.serviceCard}>
              <div className={styles.serviceHeading}>
                <SearchOutlined
                  className={styles.serviceIcon}
                  aria-hidden="true"
                />
                <div>
                  <h2>Tra cứu văn bằng</h2>
                  <p>Tìm kiếm thông tin văn bằng</p>
                </div>
              </div>
              <p className={styles.serviceDescription}>
                Tìm văn bằng bằng họ tên, ngày sinh và số định danh, trong phạm
                vi được nhà trường cho phép tra cứu.
              </p>
              <p className={styles.searchNote}>
                Thông tin tra cứu không thay thế kết quả xác thực tệp văn bằng.
              </p>
              <Link className={styles.secondaryAction} href="/search">
                Tra cứu ngay
                <ArrowRightOutlined aria-hidden="true" />
              </Link>
            </article>
          </section>

          <div className={styles.notice}>
            <InfoCircleOutlined aria-hidden="true" />
            <p>
              <strong>Lưu ý khi sử dụng:</strong> Để kiểm tra tính toàn vẹn của
              tệp văn bằng, vui lòng sử dụng tệp PDF được cấp từ hệ thống.
            </p>
          </div>

          <div className={styles.informationGrid}>
            <section
              className={styles.guide}
              id="huong-dan"
              aria-labelledby="guide-title"
            >
              <h2 className={styles.sectionTitle} id="guide-title">
                Hướng dẫn sử dụng
              </h2>
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
                    Dùng tệp PDF khi cần kiểm tra tính toàn vẹn của chính tệp
                    đó. Quét mã QR để mở và kiểm tra thông tin văn bằng được
                    liên kết; mã QR không thay thế việc kiểm tra nội dung tệp
                    PDF.
                  </p>
                </details>
              </div>
            </section>

            <section
              className={styles.accounts}
              aria-labelledby="accounts-title"
            >
              <h2 className={styles.sectionTitle} id="accounts-title">
                Truy cập hệ thống
              </h2>
              <p className={styles.accountsDescription}>
                Dành cho sinh viên và cán bộ nhà trường. Sử dụng tài khoản được
                cấp để truy cập các chức năng theo phân quyền.
              </p>
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
              <p className={styles.accountNote}>
                Tra cứu và xác thực văn bằng được bố trí ở các mục phía trên.
              </p>
            </section>
          </div>
        </div>
      </main>

      <UniversityFooter home />
    </div>
  );
}
