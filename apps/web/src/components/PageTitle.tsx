import type { ReactNode } from "react";

export default function PageTitle({
  children,
  level = 1,
}: {
  children: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return <Heading className="page-title">{children}</Heading>;
}
