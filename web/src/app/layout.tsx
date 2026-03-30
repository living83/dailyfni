import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "대부중개 - 신뢰할 수 있는 대출 중개 서비스",
  description:
    "대부중개법 규정을 완벽히 준수하는 투명하고 신뢰할 수 있는 대출 중개 서비스입니다. 개인회생, 오토론, 신용대출, 부동산 대출 상담을 제공합니다.",
  keywords: "대부중개, 대출, 개인회생, 파산, 오토론, 신용대출, 부동산대출",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
