import { create } from 'zustand';
import { DashboardData } from '@/types';

interface NexusState {
  sidebarOpen: boolean;
  activeCampaignId: string | null;
  dashboardData: DashboardData | null;
  setSidebarOpen: (open: boolean) => void;
  setActiveCampaignId: (id: string | null) => void;
  setDashboardData: (data: DashboardData) => void;
}

export const useNexusStore = create<NexusState>((set) => ({
  sidebarOpen: true,
  activeCampaignId: null,
  dashboardData: null,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveCampaignId: (id) => set({ activeCampaignId: id }),
  setDashboardData: (data) => set({ dashboardData: data }),
}));
