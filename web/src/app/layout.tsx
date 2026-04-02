import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DAILY F&I - 신뢰할 수 있는 대출 중개 서비스",
  description:
    "(주)데일리에프앤아이대부 | 2024-금감원-2626 | 대부중개업 정식 등록 | 개인회생, 파산, 신용회복, 오토론, 신용대출, 무직자, 부동산 대출 전문 중개",
  keywords: "대부중개, 대출, 개인회생, 파산, 신용회복, 오토론, 신용대출, 무직자대출, 부동산대출, DAILY F&I",
  openGraph: {
    title: "DAILY F&I - 신뢰할 수 있는 대출 중개 서비스",
    description: "(주)데일리에프앤아이대부 | 2024-금감원-2626(대부중개업) | 회생·파산·신용회복, 오토론, 신용대출, 무직자, 부동산 대출 전문 중개 | 중개수수료 0%",
    url: "https://home.dailyfni.co.kr",
    siteName: "DAILY F&I",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "DAILY F&I - 대부중개업 정식 등록 (2024-금감원-2626)",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DAILY F&I - 신뢰할 수 있는 대출 중개 서비스",
    description: "(주)데일리에프앤아이대부 | 대부중개업 정식 등록 | 중개수수료 0%",
    images: ["/logo.png"],
  },
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
