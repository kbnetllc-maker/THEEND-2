import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/shared/Layout';
import Admin from '@/pages/Admin';
import Automations from '@/pages/Automations';
import Conversations from '@/pages/Conversations';
import Dashboard from '@/pages/Dashboard';
import DealAnalyzer from '@/pages/DealAnalyzer';
import Leads from '@/pages/Leads';
import Pipeline from '@/pages/Pipeline';
import Settings from '@/pages/Settings';
import SettingsBilling from '@/pages/SettingsBilling';
import Tasks from '@/pages/Tasks';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/conversations" element={<Conversations />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/automations" element={<Automations />} />
        <Route path="/tools/deal-analyzer" element={<DealAnalyzer />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/settings" element={<Settings />}>
          <Route path="billing" element={<SettingsBilling />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
