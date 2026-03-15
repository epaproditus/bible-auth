import './globals.css'

export const metadata = {
  title: 'Bible Auth',
  description: 'TOTP vault with scripture voice gate',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
