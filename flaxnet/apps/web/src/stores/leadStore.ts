import { create } from 'zustand';

type LeadStore = {
  selectedLeadId: string | null;
  setSelectedLeadId: (id: string | null) => void;
};

export const useLeadStore = create<LeadStore>((set) => ({
  selectedLeadId: null,
  setSelectedLeadId: (id) => set({ selectedLeadId: id }),
}));
