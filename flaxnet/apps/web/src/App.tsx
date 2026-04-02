import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/shared/Layout';
import Leads from '@/pages/Leads';
import Pipeline from '@/pages/Pipeline';
import Settings from '@/pages/Settings';
import SettingsBilling from '@/pages/SettingsBilling';
import Admin from '@/pages/Admin';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/leads" replace />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/settings" element={<Settings />}>
          <Route path="billing" element={<SettingsBilling />} />
        </Route>
        <Route path="*" element={<Navigate to="/leads" replace />} />
      </Route>
    </Routes>
  );
}
