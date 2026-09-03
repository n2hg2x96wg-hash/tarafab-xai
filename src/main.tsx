import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import './index.css'
import App from './App.tsx'
import { AppSettingsProvider } from './context/AppSettingsContext'
import { ClientProvider } from './context/ClientContext'
import { AdminAuthProvider } from './context/AdminAuthContext'
import { ToastProvider } from './components/ui/Toast'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppSettingsProvider>
      <ClientProvider>
        <ToastProvider>
          <AdminAuthProvider>
            <App />
          </AdminAuthProvider>
        </ToastProvider>
      </ClientProvider>
    </AppSettingsProvider>
  </StrictMode>,
)
