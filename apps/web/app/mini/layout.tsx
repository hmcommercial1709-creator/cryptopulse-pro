import type { ReactNode } from 'react';
import StartAppAttribution from './attribution';

export default function MiniLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <StartAppAttribution />
      {children}
    </>
  );
}
