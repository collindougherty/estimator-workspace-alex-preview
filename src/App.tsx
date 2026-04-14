import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import './App.css'
import { AuthProvider } from './hooks/AuthProvider'
import { useAuth } from './hooks/useAuth'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ProjectPage } from './pages/ProjectPage'

const AppRouter = () => {
  const { isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <main className="loading-screen">
        <div className="loading-card">
          <p className="eyebrow">Contractor app</p>
          <h1>Loading workspace…</h1>
          <p>Preparing workspace.</p>
        </div>
      </main>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate replace to="/" /> : <LoginPage />}
      />
      <Route
        path="/"
        element={user ? <DashboardPage /> : <Navigate replace to="/login" />}
      />
      <Route
        path="/projects/:projectId"
        element={user ? <ProjectPage /> : <Navigate replace to="/login" />}
      />
      <Route path="*" element={<Navigate replace to={user ? '/' : '/login'} />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
