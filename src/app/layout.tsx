import type { Metadata } from 'next';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/fahkwang/thai-500.css';
import '@fontsource/fahkwang/thai-600.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Soundpad',
  description: 'แตะแพดเพื่อเล่นเสียงจากคลัง Soundpad',
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>;
}
