import { Navigate, Route, Routes } from 'react-router-dom';
import Lobby from './pages/Lobby';
import Profile from './pages/Profile';
import Room from './pages/Room';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/room" element={<Room />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
