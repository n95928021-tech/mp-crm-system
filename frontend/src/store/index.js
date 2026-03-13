// ══════════════════════════════════════════════
// MP CRM Frontend — Zustand Store
// ══════════════════════════════════════════════

import { create } from 'zustand';

// ─── Auth Store ───
export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false });
  },
}));

// ─── Chat Store ───
export const useChatStore = create((set, get) => ({
  chats: [],
  selectedChat: null,
  filters: {
    marketplaceId: null,
    cabinetId: null,
    status: null,
  },

  setChats: (chats) => set({ chats }),
  setSelectedChat: (chat) => set({ selectedChat: chat }),
  setFilters: (filters) => set({ filters: { ...get().filters, ...filters } }),

  // Обновить чат в списке (при новом сообщении)
  updateChat: (chatId, updates) =>
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chatId ? { ...c, ...updates } : c)),
      selectedChat:
        state.selectedChat?.id === chatId
          ? { ...state.selectedChat, ...updates }
          : state.selectedChat,
    })),

  // Добавить сообщение к выбранному чату
  addMessage: (chatId, message) =>
    set((state) => {
      if (state.selectedChat?.id !== chatId) return state;
      return {
        selectedChat: {
          ...state.selectedChat,
          messages: [...(state.selectedChat.messages || []), message],
        },
      };
    }),
}));

// ─── Task Store ───
export const useTaskStore = create((set) => ({
  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
    })),
  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    })),
}));

// ─── UI Store ───
export const useUIStore = create((set) => ({
  activeView: 'chats', // chats | calendar | analytics
  soundEnabled: true,
  sidebarCollapsed: false,

  setActiveView: (view) => set({ activeView: view }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
