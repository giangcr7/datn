"use client";

import { useEffect, useState } from "react";
import { Input, Spin } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import {
  isRegisterSuggestion,
  registerParams,
  registerStatuses,
  type RegisterFilters,
  type RegisterSuggestion,
} from "@/lib/diploma-register";
import styles from "./RegisterQuickSearch.module.css";

type Props = {
  id: string;
  filters: RegisterFilters;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
};

export default function RegisterQuickSearch({
  id,
  filters,
  disabled,
  onChange,
  onSubmit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RegisterSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [phase, setPhase] = useState("idle");
  const parameters = registerParams(filters, 1, 6).toString();
  const text = filters.search.trim();
  const listId = id + "-suggestions";
  const visible = open && !disabled && text.length >= 2;

  useEffect(() => {
    setItems([]);
    setActive(-1);
    if (!open || disabled || text.length < 2) {
      setPhase("idle");
      return;
    }
    const controller = new AbortController();
    let current = true;
    setPhase("waiting");
    const timer = setTimeout(async () => {
      setPhase("loading");
      try {
        const response = await fetch(
          "/api/certificates/suggestions?" + parameters,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const result = await response.json();
        if (!current) return;
        if (!response.ok || !result.success || !Array.isArray(result.data))
          throw new Error("Không tải được gợi ý");
        setItems(result.data.filter(isRegisterSuggestion).slice(0, 6));
        setPhase("ready");
      } catch {
        if (current && !controller.signal.aborted) setPhase("error");
      }
    }, 300);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [parameters, text, disabled, open]);

  function submit(value: string) {
    setOpen(false);
    onSubmit(value);
  }

  function choose(item: RegisterSuggestion) {
    submit(item.soHieu || item.soVaoSo || item.mssv || item.fullName || text);
  }

  return (
    <div
      className={styles.root}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        aria-activedescendant={
          visible && active >= 0 ? listId + "-" + active : undefined
        }
        aria-describedby={id + "-help"}
        placeholder="MSSV, số hiệu, số vào sổ hoặc tên không dấu"
        autoComplete="off"
        allowClear
        maxLength={255}
        prefix={<SearchOutlined />}
        suffix={phase === "loading" ? <Spin size="small" /> : undefined}
        disabled={disabled}
        value={filters.search}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setOpen(true);
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (items.length)
              setActive((previous) =>
                event.key === "ArrowDown"
                  ? (previous + 1) % items.length
                  : previous <= 0
                    ? items.length - 1
                    : previous - 1,
              );
          } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setActive(-1);
          } else if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (visible && active >= 0 && items[active]) choose(items[active]);
            else submit(filters.search);
          }
        }}
      />
      <span id={id + "-help"} className={styles.help}>
        Nhập từ 2 ký tự để xem gợi ý. Enter để tìm; ↑ ↓ để chọn.
      </span>
      {visible && (
        <div className={styles.panel}>
          <div className={styles.heading}>Gợi ý trong sổ văn bằng</div>
          <ul
            id={listId}
            role="listbox"
            aria-label="Văn bằng phù hợp"
            className={styles.list}
          >
            {items.map((item, index) => (
              <li
                key={item.uuid}
                id={listId + "-" + index}
                role="option"
                aria-selected={active === index}
                className={styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") choose(item);
                }}
              >
                <div className={styles.title}>
                  <strong>{item.fullName || "Văn bằng chưa có họ tên"}</strong>
                  <span className={styles.match}>
                    {item.matchKind === "EXACT_CODE"
                      ? "Khớp mã"
                      : item.matchKind === "EXACT_NAME"
                        ? "Khớp tên"
                        : item.matchKind === "SIMILAR"
                          ? "Tên gần giống"
                          : "Phù hợp"}
                  </span>
                </div>
                <div className={styles.meta}>
                  {[item.mssv, item.soHieu, item.soVaoSo]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className={styles.meta}>
                  {[
                    item.major,
                    item.namTotNghiep,
                    registerStatuses[item.status]?.label,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </li>
            ))}
          </ul>
          <div className={styles.feedback} role="status">
            {phase === "waiting" || phase === "loading"
              ? "Đang tìm hồ sơ phù hợp…"
              : phase === "error"
                ? "Chưa tải được gợi ý. Nhấn Enter để tìm lại."
                : !items.length
                  ? "Chưa có gợi ý theo bộ lọc này. Enter để xem kết quả."
                  : "Chọn một gợi ý để lọc kết quả. Kết quả tìm kiếm không thay thế xác thực văn bằng."}
          </div>
        </div>
      )}
    </div>
  );
}
