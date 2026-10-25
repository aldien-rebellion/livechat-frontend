import Workspace from './pages/Workspace'
import Auth from './pages/Auth'
import AuthProvider from './contexts/AuthProvider'
import { useAuth } from './hooks/useAuth'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'

function PrivateRoute() {
  const { session } = useAuth()
  return session ? <Outlet /> : <Navigate to="/login" replace />
}

function GuestRoute() {
  const { session } = useAuth()
  return session ? <Navigate to="/workspace" replace /> : <Outlet />
}

export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route element={<GuestRoute />}>
      <Route path="/login" element={<Auth key="login" mode="login" />} />
      <Route path="/register" element={<Auth key="register" mode="register" />} />
    </Route>
    <Route element={<PrivateRoute />}><Route path="/workspace" element={<Workspace />} /></Route>
    <Route path="*" element={<Navigate to="/workspace" replace />} />
  </Routes></AuthProvider></BrowserRouter>
}
