import './globals.css';

export const metadata = {
  title: 'missile.io — dodge the swarm',
  description:
    'missile.io — a fast HTML5 arcade game. Dodge the homing missile swarm, survive 2 minutes in space.',
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M16 2 L22 14 L22 22 L16 19 L10 22 L10 14 Z' fill='%23ff5a5a'/%3E%3Ccircle cx='16' cy='25' r='3' fill='%23ffb02e'/%3E%3C/svg%3E",
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
