import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata={
  title:'Kronia Study',
  description:'Plataforma adaptativa de estudos — aprenda de verdade.'
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="pt-BR"><body>{children}</body></html>;
}
