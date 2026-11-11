import Link from 'next/link';
import { AudioLines } from 'lucide-react';

export function ConsoleHeader({ children }: { children: React.ReactNode }) {
  return (
    <header className="console-header">
      <Link href="/" className="brand" aria-label="Soundpad หน้าเล่น">
        <span className="brand-icon"><AudioLines size={22} aria-hidden="true" /></span>
        <span>Soundpad</span>
      </Link>
      <div className="header-actions">{children}</div>
    </header>
  );
}
