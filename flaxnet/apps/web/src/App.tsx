import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/shared/Layout';
import Dashboard from '@/pages/Dashboard';
import Leads from '@/pages/Leads';
import Pipeline from '@/pages/Pipeline';
import Conversations from '@/pages/Conversations';
import DealAnalyzer from '@/pages/DealAnalyzer';
import Tasks from '@/pages/Tasks';
import Settings from '@/pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/conversations" element={<Conversations />} />
        <Route path="/deals" element={<DealAnalyzer />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
