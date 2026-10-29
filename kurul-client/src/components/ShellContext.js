import { createContext } from 'react';

// AppShell içindeki sayfalar bu bağlam sayesinde başlıklarını kabuğa bildirir.
// Bağlam yoksa (ör. Kurul Seçimi sayfası) Header kendini normal çizer.
export const ShellContext = createContext(null);
