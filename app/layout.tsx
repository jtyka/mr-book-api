import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "mr-book API",
  description: "mr-book REST API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
