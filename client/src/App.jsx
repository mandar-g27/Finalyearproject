import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthApp from './pages/app';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Redirect root to /auth */}
        <Route path="/" element={<Navigate to="/auth" replace />} />
        {/* Main public auth flow */}
        <Route path="/auth" element={<AuthApp />} />
        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
