"use client";

import Link from "next/link";
import {
  ArrowRightOutlined,
  BankOutlined,
  InfoCircleOutlined,
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
    title: "Sinh viên đăng nhập",
    description:
      "Sinh viên dùng tài khoản nhà trường cấp để truy cập văn bằng của mình.",
  },
  {
    title: "Tạo liên kết chia sẻ",
    description:
      "Chọn văn bằng và gửi liên kết xác thực có thời hạn đến Gmail người nhận.",
  },
  {
    title: "Người nhận mở liên kết",
    description:
      "Người nhận mở liên kết riêng để xem kết quả xác thực do nhà trường cung cấp.",
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
          </section>

          <section className={styles.services} aria-label="Chức năng công khai">
            <article className={styles.serviceCard}>
              <div className={styles.serviceHeading}>
                <SafetyCertificateOutlined
                  className={styles.serviceIcon}
                  aria-hidden="true"
                />
                <div>
                  <h2>Xác thực văn bằng được chia sẻ</h2>
                  <p>Chỉ truy cập qua liên kết riêng của sinh viên</p>
                </div>
              </div>
              <div className={styles.methods} aria-label="Hình thức xác thực">
                <span>Liên kết chia sẻ có thời hạn</span>
              </div>
              <Link className={styles.primaryAction} href="/login?type=student">
                Sinh viên đăng nhập để chia sẻ
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
              <strong>Lưu ý khi sử dụng:</strong> Kết quả xác thực chỉ hiển thị
              qua liên kết chia sẻ riêng do sinh viên tạo từ tài khoản nhà
              trường.
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
                    giúp kiểm tra kết quả văn bằng qua liên kết chia sẻ riêng.
                    Việc tìm thấy thông tin không thay thế cho liên kết xác
                    thực.
                  </p>
                </details>
                <details>
                  <summary>Làm sao để nhận kết quả xác thực?</summary>
                  <p>
                    Yêu cầu sinh viên gửi liên kết xác thực đến Gmail của bạn.
                    Liên kết có thời hạn và có thể bị sinh viên thu hồi.
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
