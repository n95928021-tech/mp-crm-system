import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── Sound utility ───
const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
};

// ─── Icons ───
const Icons = {
  wb: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 8l2 8 2-5 2 5 2-8" />
    </svg>
  ),
  ozon: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  ),
  yandex: () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 7v10M9 13l3-3 3 3" />
    </svg>
  ),
  chat: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  ),
  calendar: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  analytics: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  ),
  send: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  plus: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  bell: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  ),
  check: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  x: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  download: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  flag: () => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none">
      <path d="M4 2v20M4 4h12l-3 4 3 4H4" />
    </svg>
  ),
  user: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  clock: () => (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
};

// ─── Data ───
const MARKETPLACES = [
  {
    id: "wb",
    name: "Wildberries",
    icon: Icons.wb,
    color: "#a855f7",
    cabinets: [
      { id: "wb1", name: "WB Основной" },
      { id: "wb2", name: "WB Одежда" },
      { id: "wb3", name: "WB Электроника" },
      { id: "wb4", name: "WB Косметика" },
      { id: "wb5", name: "WB Дом и сад" },
    ],
  },
  {
    id: "ozon",
    name: "Ozon",
    icon: Icons.ozon,
    color: "#3b82f6",
    cabinets: [
      { id: "oz1", name: "Ozon Основной" },
      { id: "oz2", name: "Ozon Premium" },
      { id: "oz3", name: "Ozon Склад МСК" },
      { id: "oz4", name: "Ozon Склад СПБ" },
    ],
  },
  {
    id: "yandex",
    name: "Яндекс Маркет",
    icon: Icons.yandex,
    color: "#f59e0b",
    cabinets: [{ id: "ym1", name: "ЯМ Основной" }],
  },
];

const NAMES = [
  "Алексей", "Мария", "Дмитрий", "Елена", "Сергей", "Анна",
  "Иван", "Ольга", "Павел", "Наталья", "Артём", "Юлия",
];
const MSGS = [
  "Здравствуйте! Подскажите по заказу",
  "Когда будет доставка?",
  "Хочу оформить возврат",
  "Товар не соответствует описанию",
  "Спасибо за быструю доставку!",
  "Можно ли изменить адрес?",
  "Есть ли скидка на повторный заказ?",
  "Проблема с оплатой",
  "Товар пришёл повреждённый",
  "Отличное качество, спасибо!",
];

const generateChats = () => {
  const chats = [];
  MARKETPLACES.forEach((mp) => {
    mp.cabinets.forEach((cab) => {
      const count = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < count; i++) {
        const name = NAMES[Math.floor(Math.random() * NAMES.length)];
        const minAgo = Math.floor(Math.random() * 15);
        const lastMsg = new Date(Date.now() - minAgo * 60000);
        const responseTime = Math.floor(Math.random() * 600);
        chats.push({
          id: `${cab.id}-chat-${i}`,
          cabinetId: cab.id,
          marketplaceId: mp.id,
          customerName: name,
          lastMessage: MSGS[Math.floor(Math.random() * MSGS.length)],
          lastMessageTime: lastMsg,
          unread: Math.random() > 0.5 ? Math.floor(Math.random() * 5) + 1 : 0,
          responseTimeSec: responseTime,
          messages: [
            {
              id: 1,
              from: "customer",
              text: MSGS[Math.floor(Math.random() * MSGS.length)],
              time: new Date(lastMsg - 300000),
            },
            {
              id: 2,
              from: "manager",
              text: "Добрый день! Сейчас проверю информацию.",
              time: new Date(lastMsg - 180000),
            },
            {
              id: 3,
              from: "customer",
              text: MSGS[Math.floor(Math.random() * MSGS.length)],
              time: lastMsg,
            },
          ],
        });
      }
    });
  });
  return chats;
};

const generateTasks = () => {
  const tasks = [];
  const titles = [
    "Обновить карточки товаров",
    "Загрузить новые фото",
    "Ответить на отзывы",
    "Проверить остатки",
    "Настроить рекламу",
    "Подготовить акцию",
    "Обновить цены",
    "Проверить возвраты",
    "Собрать аналитику",
    "Оформить поставку",
  ];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setDate(d.getDate() + Math.floor(Math.random() * 14) - 3);
    d.setHours(9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 4) * 15);
    const overdue = d < new Date() && Math.random() > 0.4;
    tasks.push({
      id: `task-${i}`,
      title: titles[i % titles.length],
      date: d,
      completed: Math.random() > 0.7,
      overdue: overdue && !Math.random() > 0.7,
      cabinetId: MARKETPLACES[Math.floor(Math.random() * 3)].cabinets[0].id,
      priority: ["low", "medium", "high"][Math.floor(Math.random() * 3)],
    });
  }
  return tasks;
};

// ─── Timer Badge Component ───
const TimerBadge = ({ lastMessageTime }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - lastMessageTime.getTime()) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastMessageTime]);

  const minutes = elapsed / 60;
  let color, bg;
  if (minutes < 2) {
    color = "#22c55e";
    bg = "rgba(34,197,94,0.12)";
  } else if (minutes < 5) {
    color = "#eab308";
    bg = "rgba(234,179,8,0.12)";
  } else {
    color = "#ef4444";
    bg = "rgba(239,68,68,0.12)";
  }

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: bg,
        padding: "2px 7px",
        borderRadius: 6,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      <span style={{ color }}>{Icons.flag()}</span>
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
};

// ─── Main App ───
export default function MarketplaceCRM() {
  const [chats, setChats] = useState(() => generateChats());
  const [tasks, setTasks] = useState(() => generateTasks());
  const [activeView, setActiveView] = useState("chats");
  const [selectedMarketplace, setSelectedMarketplace] = useState(null);
  const [selectedCabinet, setSelectedCabinet] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messageInput, setMessageInput] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", date: "", time: "10:00", priority: "medium" });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const chatEndRef = useRef(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Simulate new message
  useEffect(() => {
    const interval = setInterval(() => {
      setChats((prev) => {
        const idx = Math.floor(Math.random() * prev.length);
        const updated = [...prev];
        const chat = { ...updated[idx] };
        chat.lastMessage = MSGS[Math.floor(Math.random() * MSGS.length)];
        chat.lastMessageTime = new Date();
        chat.unread = (chat.unread || 0) + 1;
        chat.messages = [
          ...chat.messages,
          {
            id: chat.messages.length + 1,
            from: "customer",
            text: chat.lastMessage,
            time: new Date(),
          },
        ];
        updated[idx] = chat;
        if (soundEnabled) playNotificationSound();
        return updated;
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [soundEnabled]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedChat, chats]);

  const filteredChats = useMemo(() => {
    let result = chats;
    if (selectedCabinet) result = result.filter((c) => c.cabinetId === selectedCabinet);
    else if (selectedMarketplace) result = result.filter((c) => c.marketplaceId === selectedMarketplace);
    return result.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
  }, [chats, selectedMarketplace, selectedCabinet]);

  const sendMessage = () => {
    if (!messageInput.trim() || !selectedChat) return;
    setChats((prev) =>
      prev.map((c) =>
        c.id === selectedChat.id
          ? {
              ...c,
              messages: [
                ...c.messages,
                { id: c.messages.length + 1, from: "manager", text: messageInput, time: new Date() },
              ],
              lastMessage: messageInput,
              lastMessageTime: new Date(),
              unread: 0,
            }
          : c
      )
    );
    setMessageInput("");
  };

  const addTask = () => {
    if (!newTask.title || !newTask.date) return;
    const d = new Date(`${newTask.date}T${newTask.time}`);
    setTasks((prev) => [
      ...prev,
      {
        id: `task-${Date.now()}`,
        title: newTask.title,
        date: d,
        completed: false,
        overdue: false,
        cabinetId: selectedCabinet || "wb1",
        priority: newTask.priority,
      },
    ]);
    setNewTask({ title: "", date: "", time: "10:00", priority: "medium" });
    setShowTaskModal(false);
  };

  const toggleTask = (id) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const currentChat = useMemo(
    () => chats.find((c) => c.id === selectedChat?.id),
    [chats, selectedChat]
  );

  const getMarketplace = (id) => MARKETPLACES.find((m) => m.id === id);
  const getCabinet = (id) => {
    for (const mp of MARKETPLACES) {
      const cab = mp.cabinets.find((c) => c.id === id);
      if (cab) return cab;
    }
    return null;
  };

  const analyticsData = useMemo(() => {
    const byMarketplace = {};
    const byCabinet = {};
    MARKETPLACES.forEach((mp) => {
      const mpChats = chats.filter((c) => c.marketplaceId === mp.id);
      const avg = mpChats.length
        ? mpChats.reduce((s, c) => s + c.responseTimeSec, 0) / mpChats.length
        : 0;
      byMarketplace[mp.id] = { name: mp.name, avg: Math.round(avg), count: mpChats.length };
      mp.cabinets.forEach((cab) => {
        const cabChats = chats.filter((c) => c.cabinetId === cab.id);
        const cabAvg = cabChats.length
          ? cabChats.reduce((s, c) => s + c.responseTimeSec, 0) / cabChats.length
          : 0;
        byCabinet[cab.id] = { name: cab.name, avg: Math.round(cabAvg), count: cabChats.length };
      });
    });
    const totalAvg = chats.length
      ? Math.round(chats.reduce((s, c) => s + c.responseTimeSec, 0) / chats.length)
      : 0;
    return { byMarketplace, byCabinet, totalAvg, totalChats: chats.length };
  }, [chats]);

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}м ${s}с`;
  };

  const totalUnread = chats.reduce((s, c) => s + (c.unread || 0), 0);

  // ─── Styles ───
  const S = {
    app: {
      display: "flex",
      height: "100vh",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      background: "#0c0e14",
      color: "#e2e8f0",
      overflow: "hidden",
    },
    sidebar: {
      width: 260,
      background: "#10131b",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    },
    logo: {
      padding: "20px 20px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    logoTitle: {
      fontSize: 20,
      fontWeight: 800,
      letterSpacing: "-0.5px",
      background: "linear-gradient(135deg, #a855f7, #3b82f6, #f59e0b)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
    },
    logoSub: {
      fontSize: 11,
      color: "#64748b",
      marginTop: 2,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
    },
    navSection: {
      padding: "12px 12px 4px",
    },
    navLabel: {
      fontSize: 10,
      fontWeight: 700,
      color: "#475569",
      textTransform: "uppercase",
      letterSpacing: "1.2px",
      padding: "0 8px 8px",
    },
    navBtn: (active) => ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      width: "100%",
      padding: "9px 12px",
      border: "none",
      borderRadius: 8,
      background: active ? "rgba(255,255,255,0.07)" : "transparent",
      color: active ? "#f1f5f9" : "#94a3b8",
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      cursor: "pointer",
      transition: "all 0.15s",
      textAlign: "left",
      fontFamily: "inherit",
    }),
    mpItem: (active, color) => ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      width: "100%",
      padding: "8px 12px",
      border: "none",
      borderRadius: 8,
      background: active ? `${color}15` : "transparent",
      color: active ? color : "#94a3b8",
      fontSize: 13,
      fontWeight: active ? 600 : 400,
      cursor: "pointer",
      transition: "all 0.15s",
      textAlign: "left",
      fontFamily: "inherit",
      borderLeft: active ? `3px solid ${color}` : "3px solid transparent",
    }),
    cabItem: (active) => ({
      display: "flex",
      alignItems: "center",
      gap: 8,
      width: "100%",
      padding: "6px 12px 6px 40px",
      border: "none",
      borderRadius: 6,
      background: active ? "rgba(255,255,255,0.05)" : "transparent",
      color: active ? "#e2e8f0" : "#64748b",
      fontSize: 12,
      cursor: "pointer",
      transition: "all 0.15s",
      textAlign: "left",
      fontFamily: "inherit",
    }),
    chatList: {
      width: 340,
      background: "#12151f",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    },
    chatListHeader: {
      padding: "16px 20px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    chatItem: (active) => ({
      display: "flex",
      gap: 12,
      padding: "12px 16px",
      cursor: "pointer",
      background: active ? "rgba(255,255,255,0.05)" : "transparent",
      borderBottom: "1px solid rgba(255,255,255,0.03)",
      transition: "background 0.15s",
      borderLeft: active ? "3px solid #a855f7" : "3px solid transparent",
    }),
    chatArea: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      background: "#0f1219",
    },
    badge: (color) => ({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      background: color || "#a855f7",
      color: "#fff",
      fontSize: 10,
      fontWeight: 700,
      padding: "0 5px",
    }),
    input: {
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8,
      padding: "10px 14px",
      color: "#e2e8f0",
      fontSize: 13,
      fontFamily: "inherit",
      outline: "none",
      width: "100%",
      transition: "border-color 0.2s",
    },
    btn: (color) => ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 16px",
      background: color || "#a855f7",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: "inherit",
      transition: "opacity 0.15s",
    }),
    modal: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(8px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    },
    modalContent: {
      background: "#1a1d2b",
      borderRadius: 16,
      padding: 28,
      width: 420,
      maxWidth: "90vw",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
    },
  };

  // ─── Calendar View ───
  const renderCalendar = () => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const monthNames = [
      "Январь","Февраль","Март","Апрель","Май","Июнь",
      "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
    ];
    const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1;

    const getTasksForDate = (day) => {
      return tasks.filter((t) => {
        const d = new Date(t.date);
        return d.getDate() === day && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
    };

    return (
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
              {monthNames[currentMonth]} {currentYear}
            </h2>
            <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>Задачи и напоминания</p>
          </div>
          <button style={S.btn("#a855f7")} onClick={() => setShowTaskModal(true)}>
            {Icons.plus()} Добавить задачу
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 1,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {dayNames.map((d) => (
            <div
              key={d}
              style={{
                padding: "10px 8px",
                background: "#14172180",
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                textAlign: "center",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {d}
            </div>
          ))}
          {Array.from({ length: adjustedFirst }).map((_, i) => (
            <div key={`e-${i}`} style={{ background: "#0f1219", minHeight: 90 }} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayTasks = getTasksForDate(day);
            const isToday = day === today.getDate();
            return (
              <div
                key={day}
                style={{
                  background: isToday ? "rgba(168,85,247,0.06)" : "#0f1219",
                  minHeight: 90,
                  padding: 8,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? "#a855f7" : "#94a3b8",
                    marginBottom: 4,
                    width: 24,
                    height: 24,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    background: isToday ? "#a855f7" : "transparent",
                    ...(isToday ? { color: "#fff" } : {}),
                  }}
                >
                  {day}
                </div>
                {dayTasks.map((task) => {
                  const isOverdue = !task.completed && new Date(task.date) < now;
                  return (
                    <div
                      key={task.id}
                      onClick={() => toggleTask(task.id)}
                      style={{
                        fontSize: 10,
                        padding: "3px 6px",
                        marginBottom: 2,
                        borderRadius: 4,
                        background: task.completed
                          ? "rgba(34,197,94,0.12)"
                          : isOverdue
                          ? "rgba(239,68,68,0.15)"
                          : task.priority === "high"
                          ? "rgba(249,115,22,0.12)"
                          : "rgba(255,255,255,0.05)",
                        color: task.completed
                          ? "#22c55e"
                          : isOverdue
                          ? "#ef4444"
                          : "#e2e8f0",
                        cursor: "pointer",
                        textDecoration: task.completed ? "line-through" : "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        animation: isOverdue ? "pulse-red 1.5s ease-in-out infinite" : "none",
                      }}
                    >
                      {isOverdue && !task.completed && (
                        <span style={{ color: "#ef4444", flexShrink: 0 }}>{Icons.clock()}</span>
                      )}
                      {task.title}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Task list below calendar */}
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Все задачи</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {tasks
              .sort((a, b) => new Date(a.date) - new Date(b.date))
              .map((task) => {
                const isOverdue = !task.completed && new Date(task.date) < now;
                return (
                  <div
                    key={task.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: isOverdue
                        ? "rgba(239,68,68,0.08)"
                        : "rgba(255,255,255,0.03)",
                      border: isOverdue
                        ? "1px solid rgba(239,68,68,0.2)"
                        : "1px solid rgba(255,255,255,0.05)",
                      animation: isOverdue ? "pulse-red 2s ease-in-out infinite" : "none",
                    }}
                  >
                    <button
                      onClick={() => toggleTask(task.id)}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        border: task.completed
                          ? "2px solid #22c55e"
                          : "2px solid rgba(255,255,255,0.2)",
                        background: task.completed ? "#22c55e" : "transparent",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        color: "#fff",
                      }}
                    >
                      {task.completed && Icons.check()}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: task.completed ? "#64748b" : isOverdue ? "#ef4444" : "#e2e8f0",
                          textDecoration: task.completed ? "line-through" : "none",
                        }}
                      >
                        {task.title}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                        {new Date(task.date).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {getCabinet(task.cabinetId)?.name || "—"}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background:
                          task.priority === "high"
                            ? "rgba(239,68,68,0.15)"
                            : task.priority === "medium"
                            ? "rgba(234,179,8,0.15)"
                            : "rgba(34,197,94,0.15)",
                        color:
                          task.priority === "high"
                            ? "#ef4444"
                            : task.priority === "medium"
                            ? "#eab308"
                            : "#22c55e",
                      }}
                    >
                      {task.priority === "high" ? "Высокий" : task.priority === "medium" ? "Средний" : "Низкий"}
                    </span>
                    {isOverdue && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: "rgba(239,68,68,0.2)",
                          color: "#ef4444",
                        }}
                      >
                        Просрочено
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    );
  };

  // ─── Analytics View ───
  const renderAnalytics = () => {
    const maxAvg = Math.max(
      ...Object.values(analyticsData.byCabinet).map((c) => c.avg),
      1
    );
    return (
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Аналитика ответов</h2>
            <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
              Среднее время ответа по кабинетам
            </p>
          </div>
          <button
            style={S.btn("#3b82f6")}
            onClick={() => {
              const csv = [
                "Кабинет,Среднее время (сек),Количество чатов",
                ...Object.values(analyticsData.byCabinet).map(
                  (c) => `${c.name},${c.avg},${c.count}`
                ),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "analytics.csv";
              a.click();
            }}
          >
            {Icons.download()} Выгрузить CSV
          </button>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          <div
            style={{
              background: "linear-gradient(135deg, rgba(168,85,247,0.12), rgba(168,85,247,0.04))",
              border: "1px solid rgba(168,85,247,0.15)",
              borderRadius: 14,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 11, color: "#a855f7", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Общее среднее
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
              {formatTime(analyticsData.totalAvg)}
            </div>
          </div>
          {Object.entries(analyticsData.byMarketplace).map(([id, data]) => {
            const mp = getMarketplace(id);
            return (
              <div
                key={id}
                style={{
                  background: `linear-gradient(135deg, ${mp.color}15, ${mp.color}05)`,
                  border: `1px solid ${mp.color}25`,
                  borderRadius: 14,
                  padding: 18,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: mp.color,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {mp.name}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>
                  {formatTime(data.avg)}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                  {data.count} чатов
                </div>
              </div>
            );
          })}
        </div>

        {/* Bar chart */}
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.06)",
            padding: 24,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 20, margin: "0 0 20px" }}>
            По кабинетам
          </h3>
          {Object.entries(analyticsData.byCabinet).map(([id, data]) => {
            const pct = (data.avg / maxAvg) * 100;
            const mp = MARKETPLACES.find((m) => m.cabinets.some((c) => c.id === id));
            const color = mp?.color || "#a855f7";
            return (
              <div key={id} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: "#94a3b8", fontWeight: 500 }}>{data.name}</span>
                  <span style={{ color: "#e2e8f0", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatTime(data.avg)}
                  </span>
                </div>
                <div
                  style={{
                    height: 8,
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: `linear-gradient(90deg, ${color}, ${color}88)`,
                      borderRadius: 4,
                      transition: "width 0.5s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Render ───
  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        button:hover { opacity: 0.85; }
        input:focus, textarea:focus, select:focus { border-color: rgba(168,85,247,0.4) !important; outline: none; }
        @keyframes pulse-red {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
          50% { box-shadow: 0 0 12px 2px rgba(239,68,68,0.15); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={S.logo}>
          <div style={S.logoTitle}>MP · CRM</div>
          <div style={S.logoSub}>Marketplace Manager</div>
        </div>

        <div style={S.navSection}>
          <div style={S.navLabel}>Навигация</div>
          <button
            style={S.navBtn(activeView === "chats")}
            onClick={() => setActiveView("chats")}
          >
            {Icons.chat()}
            <span>Чаты</span>
            {totalUnread > 0 && <span style={{ ...S.badge(), marginLeft: "auto" }}>{totalUnread}</span>}
          </button>
          <button
            style={S.navBtn(activeView === "calendar")}
            onClick={() => setActiveView("calendar")}
          >
            {Icons.calendar()}
            <span>Календарь</span>
          </button>
          <button
            style={S.navBtn(activeView === "analytics")}
            onClick={() => setActiveView("analytics")}
          >
            {Icons.analytics()}
            <span>Аналитика</span>
          </button>
        </div>

        <div style={S.navSection}>
          <div style={S.navLabel}>Маркетплейсы</div>
          <button
            style={S.mpItem(!selectedMarketplace && !selectedCabinet, "#94a3b8")}
            onClick={() => {
              setSelectedMarketplace(null);
              setSelectedCabinet(null);
            }}
          >
            Все кабинеты
          </button>
          {MARKETPLACES.map((mp) => (
            <div key={mp.id}>
              <button
                style={S.mpItem(selectedMarketplace === mp.id && !selectedCabinet, mp.color)}
                onClick={() => {
                  setSelectedMarketplace(mp.id);
                  setSelectedCabinet(null);
                }}
              >
                {mp.icon()}
                <span>{mp.name}</span>
                <span style={{ ...S.badge(mp.color), marginLeft: "auto", fontSize: 9 }}>
                  {mp.cabinets.length}
                </span>
              </button>
              {selectedMarketplace === mp.id &&
                mp.cabinets.map((cab) => (
                  <button
                    key={cab.id}
                    style={S.cabItem(selectedCabinet === cab.id)}
                    onClick={() => setSelectedCabinet(cab.id)}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: selectedCabinet === cab.id ? mp.color : "#334155",
                        flexShrink: 0,
                      }}
                    />
                    {cab.name}
                  </button>
                ))}
            </div>
          ))}
        </div>

        {/* Sound toggle */}
        <div style={{ marginTop: "auto", padding: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            style={{
              ...S.navBtn(false),
              fontSize: 12,
              gap: 8,
            }}
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            {Icons.bell()}
            <span>Звук: {soundEnabled ? "Вкл" : "Выкл"}</span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: soundEnabled ? "#22c55e" : "#64748b",
                marginLeft: "auto",
              }}
            />
          </button>
        </div>
      </div>

      {/* Main Content */}
      {activeView === "chats" && (
        <>
          {/* Chat List */}
          <div style={S.chatList}>
            <div style={S.chatListHeader}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Сообщения</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  {filteredChats.length} чатов
                </div>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {filteredChats.map((chat) => {
                const mp = getMarketplace(chat.marketplaceId);
                return (
                  <div
                    key={chat.id}
                    style={S.chatItem(selectedChat?.id === chat.id)}
                    onClick={() => {
                      setSelectedChat(chat);
                      setChats((prev) =>
                        prev.map((c) => (c.id === chat.id ? { ...c, unread: 0 } : c))
                      );
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: `linear-gradient(135deg, ${mp.color}30, ${mp.color}10)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: mp.color,
                        fontSize: 15,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {chat.customerName[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
                          {chat.customerName}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <TimerBadge lastMessageTime={chat.lastMessageTime} />
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          marginBottom: 4,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: mp.color,
                            flexShrink: 0,
                          }}
                        />
                        {getCabinet(chat.cabinetId)?.name}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#94a3b8",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {chat.lastMessage}
                      </div>
                      {chat.unread > 0 && (
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                          <span style={S.badge(mp.color)}>{chat.unread}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chat Area */}
          <div style={S.chatArea}>
            {currentChat ? (
              <>
                <div
                  style={{
                    padding: "14px 24px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: `linear-gradient(135deg, ${getMarketplace(currentChat.marketplaceId)?.color}30, ${getMarketplace(currentChat.marketplaceId)?.color}10)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: getMarketplace(currentChat.marketplaceId)?.color,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    {currentChat.customerName[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{currentChat.customerName}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {getCabinet(currentChat.cabinetId)?.name} ·{" "}
                      {getMarketplace(currentChat.marketplaceId)?.name}
                    </div>
                  </div>
                  <div style={{ marginLeft: "auto" }}>
                    <TimerBadge lastMessageTime={currentChat.lastMessageTime} />
                  </div>
                </div>

                <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
                  {currentChat.messages.map((msg, i) => (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        justifyContent: msg.from === "manager" ? "flex-end" : "flex-start",
                        marginBottom: 12,
                        animation: "slideIn 0.2s ease",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "65%",
                          padding: "10px 16px",
                          borderRadius: msg.from === "manager" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                          background:
                            msg.from === "manager"
                              ? "linear-gradient(135deg, #a855f7, #7c3aed)"
                              : "rgba(255,255,255,0.06)",
                          color: msg.from === "manager" ? "#fff" : "#e2e8f0",
                          fontSize: 13,
                          lineHeight: 1.5,
                        }}
                      >
                        {msg.text}
                        <div
                          style={{
                            fontSize: 10,
                            color: msg.from === "manager" ? "rgba(255,255,255,0.6)" : "#475569",
                            marginTop: 4,
                            textAlign: "right",
                          }}
                        >
                          {new Date(msg.time).toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div
                  style={{
                    padding: "14px 20px",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    gap: 10,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <input
                    style={{ ...S.input, flex: 1 }}
                    placeholder="Введите сообщение..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  />
                  <button style={S.btn("#a855f7")} onClick={sendMessage}>
                    {Icons.send()}
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  gap: 12,
                  color: "#334155",
                }}
              >
                <div style={{ fontSize: 48, opacity: 0.3 }}>{Icons.chat()}</div>
                <div style={{ fontSize: 15, fontWeight: 500 }}>Выберите чат</div>
                <div style={{ fontSize: 12 }}>Выберите диалог из списка слева</div>
              </div>
            )}
          </div>
        </>
      )}

      {activeView === "calendar" && renderCalendar()}
      {activeView === "analytics" && renderAnalytics()}

      {/* Task Modal */}
      {showTaskModal && (
        <div style={S.modal} onClick={() => setShowTaskModal(false)}>
          <div style={S.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>Новая задача</h3>
              <button
                onClick={() => setShowTaskModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                {Icons.x()}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 6, fontWeight: 500 }}>
                  Название задачи
                </label>
                <input
                  style={S.input}
                  placeholder="Что нужно сделать?"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 6, fontWeight: 500 }}>
                    Дата
                  </label>
                  <input
                    style={S.input}
                    type="date"
                    value={newTask.date}
                    onChange={(e) => setNewTask({ ...newTask, date: e.target.value })}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 6, fontWeight: 500 }}>
                    Время
                  </label>
                  <input
                    style={S.input}
                    type="time"
                    value={newTask.time}
                    onChange={(e) => setNewTask({ ...newTask, time: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 6, fontWeight: 500 }}>
                  Приоритет
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { v: "low", l: "Низкий", c: "#22c55e" },
                    { v: "medium", l: "Средний", c: "#eab308" },
                    { v: "high", l: "Высокий", c: "#ef4444" },
                  ].map((p) => (
                    <button
                      key={p.v}
                      onClick={() => setNewTask({ ...newTask, priority: p.v })}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border:
                          newTask.priority === p.v
                            ? `2px solid ${p.c}`
                            : "2px solid rgba(255,255,255,0.08)",
                        background:
                          newTask.priority === p.v ? `${p.c}15` : "rgba(255,255,255,0.03)",
                        color: newTask.priority === p.v ? p.c : "#94a3b8",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {p.l}
                    </button>
                  ))}
                </div>
              </div>
              <button
                style={{ ...S.btn("#a855f7"), width: "100%", justifyContent: "center", marginTop: 4, padding: "12px 16px" }}
                onClick={addTask}
              >
                {Icons.plus()} Создать задачу
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
