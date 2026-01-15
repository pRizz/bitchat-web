import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import PrivateTab from './pages/PrivateTab';
import SettingsTab from './pages/SettingsTab';

function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/private" replace />} />
        <Route path="private" element={<PrivateTab />} />
        <Route path="private/:peerId" element={<PrivateTab />} />
        <Route path="settings" element={<SettingsTab />} />
        {/* Phase 2: Location channels */}
        {/* <Route path="location" element={<LocationTab />} /> */}
        {/* Phase 3: BLE Mesh */}
        {/* <Route path="mesh" element={<MeshTab />} /> */}
      </Route>
    </Routes>
  );
}

export default App;
