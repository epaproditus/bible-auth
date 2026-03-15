import './globals.css'

export const metadata = {
  title: 'Bible Auth',
  description: 'TOTP vault with scripture gate',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-black antialiased">{children}</body>
    </html>
  )
}
