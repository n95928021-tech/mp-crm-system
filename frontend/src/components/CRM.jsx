import { useState, useEffect, useRef, useCallback, useMemo } from "react";
// wsService загружается лениво чтобы не ломать сборку если socket.io недоступен
let wsService = null;
const getWsService = () => {
  if (!wsService) {
    try {
      // Динамический импорт через глобальный объект если доступен
      wsService = {
        _socket: null,
        _listeners: new Map(),
        connect(token) {
          try {
            if (typeof window !== "undefined" && window.io) {
              this._socket = window.io(import.meta.env.VITE_WS_URL || "http://localhost:4000", {
                auth: { token }, reconnection: true, reconnectionAttempts: 10,
              });
              this._socket.on("connect", () => console.log("🔌 WS подключён"));
              this._socket.on("disconnect", () => console.log("🔌 WS отключён"));
              this._listeners.forEach((cbs, evt) => cbs.forEach(cb => this._socket.on(evt, cb)));
            }
          } catch(e) { console.warn("WS connect error:", e); }
        },
        disconnect() { this._socket?.disconnect(); this._socket = null; },
        on(evt, cb) {
          if (!this._listeners.has(evt)) this._listeners.set(evt, new Set());
          this._listeners.get(evt).add(cb);
          this._socket?.on(evt, cb);
        },
        off(evt, cb) {
          this._listeners.get(evt)?.delete(cb);
          this._socket?.off(evt, cb);
        },
        emit(evt, data) { this._socket?.connected && this._socket.emit(evt, data); },
        joinChat(chatId) { this.emit("join_chat", chatId); },
        joinCabinet(id) { this.emit("join_cabinet", id); },
      };
    } catch(e) { console.warn("wsService init error:", e); }
  }
  return wsService;
};

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
  notification: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  ),
  search: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  settings: () => (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  key: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  ),
  eye: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  eyeOff: () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
};

// ─── Data ───
// MARKETPLACES загружается из API — см. loadMarketplaces() в компоненте
const MP_ICONS = { wb: Icons.wb, ozon: Icons.ozon, yandex: Icons.yandex };
const MP_COLORS = { wb: "#a855f7", ozon: "#3b82f6", yandex: "#f59e0b" };

// Все данные грузятся из API

// ─── Timer Progress Bar Component ───
const TimerBar = ({ lastMessageTime }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - new Date(lastMessageTime).getTime()) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastMessageTime]);

  const minutes = elapsed / 60;
  let color, phase;
  if (minutes < 2) {
    color = "#22c55e";
    phase = "green";
  } else if (minutes < 6) {
    color = "#eab308";
    phase = "yellow";
  } else {
    color = "#ef4444";
    phase = "red";
  }

  // Процент заполнения: green 0-2мин (100%→0%), yellow 2-6мин (100%→0%), red всегда 100%
  let pct;
  if (phase === "green") {
    pct = Math.max(0, 100 - (minutes / 2) * 100);
  } else if (phase === "yellow") {
    pct = Math.max(0, 100 - ((minutes - 2) / 4) * 100);
  } else {
    pct = 100;
  }

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Время */}
      <span style={{
        position: "absolute", right: 0, top: -18, zIndex: 2,
        fontSize: 10, fontWeight: 600, color,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {m}:{s.toString().padStart(2, "0")}
      </span>
      {/* Полоска фон */}
      <div style={{
        width: "100%", height: 3, borderRadius: 2,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}>
        {/* Полоска заполненная */}
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 2,
          background: color,
          transition: "width 1s linear, background 0.3s",
        }} />
      </div>
    </div>
  );
};

// ─── Карточка чата с градиентной полоской-таймером справа ───
const ChatItemWithTimer = ({ chat, mp: mpProp, active, onClick, getCabinet, badge }) => {
  const mp = mpProp || { color: "#6366f1", name: "—" }; // fallback если маркетплейс ещё не загружен
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - new Date(chat.lastMessageTime).getTime()) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [chat.lastMessageTime]);

  const minutes = elapsed / 60;

  // Градиент полоски: зелёный / жёлтый / красный (как на макете)
  let stripGradient;
  if (minutes < 2) {
    stripGradient = "linear-gradient(180deg, #16a34a 0%, #22c55e 50%, #4ade80 100%)";
  } else if (minutes < 6) {
    stripGradient = "linear-gradient(180deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)";
  } else {
    stripGradient = "linear-gradient(180deg, #b91c1c 0%, #ef4444 50%, #f87171 100%)";
  }

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const timeStr = `${m}:${s.toString().padStart(2, "0")}`;

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "stretch",
        cursor: "pointer",
        background: active ? "rgba(255,255,255,0.05)" : "transparent",
        borderBottom: "1px solid rgba(255,255,255,0.03)",
        borderLeft: active ? "3px solid #a855f7" : "3px solid transparent",
        transition: "background 0.15s",
        minHeight: 70,
        overflow: "hidden",
      }}
    >
      {/* Левая часть — аватар + контент */}
      <div style={{ display: "flex", gap: 12, padding: "12px 8px 12px 14px", flex: 1, minWidth: 0 }}>
        {/* Аватар */}
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `linear-gradient(135deg, ${mp.color}30, ${mp.color}10)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: mp.color, fontSize: 15, fontWeight: 700, flexShrink: 0, alignSelf: "center",
        }}>
          {chat.customerName[0]}
        </div>
        {/* Контент */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {chat.customerName}
            </span>
            {chat.unread > 0 && <span style={badge(mp.color)}>{chat.unread}</span>}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: mp.color, flexShrink: 0 }} />
            {getCabinet(chat.cabinetId)?.name}
            {chat.status && chat.status !== "OPEN" && (
              <span style={{
                fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 4,
                background: chat.status === "PENDING" ? "rgba(234,179,8,0.15)" : chat.status === "RESOLVED" ? "rgba(59,130,246,0.15)" : "rgba(239,68,68,0.15)",
                color: chat.status === "PENDING" ? "#eab308" : chat.status === "RESOLVED" ? "#3b82f6" : "#ef4444",
              }}>
                {chat.status === "PENDING" ? "Ожидание" : chat.status === "RESOLVED" ? "Решён" : chat.status}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {chat.lastMessage}
          </div>
        </div>
      </div>

      {/* Правая часть — градиентная полоска таймера на всю высоту */}
      <div style={{
        width: 62,
        flexShrink: 0,
        background: stripGradient,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        transition: "background 1.5s ease",
      }}>
        {/* Затемнение слева для плавного перехода */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.0) 60%)",
          pointerEvents: "none",
        }} />
        {/* Время крупно поверх полоски */}
        <span style={{
          position: "relative", zIndex: 1,
          fontSize: 14, fontWeight: 800,
          color: "#fff",
          fontFamily: "'JetBrains Mono', monospace",
          textShadow: "0 1px 6px rgba(0,0,0,0.7)",
          letterSpacing: "-0.5px",
        }}>
          {timeStr}
        </span>
      </div>
    </div>
  );
};

// ─── Фоновый таймер на всю высоту окна чата ───
const ChatTimerBg = ({ lastMessageTime }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - new Date(lastMessageTime).getTime()) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastMessageTime]);

  const minutes = elapsed / 60;
  let color;
  if (minutes < 2) color = "34,197,94";       // green
  else if (minutes < 6) color = "234,179,8";   // yellow
  else color = "239,68,68";                     // red

  // Прозрачность: сильнее при большем времени, но всегда видно контент
  const opacity = minutes < 2 ? 0.04 : minutes < 6 ? 0.06 : 0.08;

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
      background: `linear-gradient(180deg, rgba(${color},${opacity}) 0%, rgba(${color},${opacity * 0.3}) 100%)`,
      transition: "background 2s ease",
    }} />
  );
};

// Компактный таймер-бейдж для хедера чата
const TimerBadge = ({ lastMessageTime }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => setElapsed(Math.floor((Date.now() - new Date(lastMessageTime).getTime()) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastMessageTime]);

  const minutes = elapsed / 60;
  let color, bg;
  if (minutes < 2) {
    color = "#22c55e";
    bg = "rgba(34,197,94,0.12)";
  } else if (minutes < 6) {
    color = "#eab308";
    bg = "rgba(234,179,8,0.12)";
  } else {
    color = "#ef4444";
    bg = "rgba(239,68,68,0.12)";
  }

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 600, color, background: bg,
      padding: "2px 7px", borderRadius: 6,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <span style={{ color }}>{Icons.flag()}</span>
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
};

// ─── Main App ───
export default function MarketplaceCRM({ user, onLogout, apiUrl, getHeaders }) {
  const [marketplaces, setMarketplaces] = useState([]);
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [activeView, setActiveView] = useState("chats");
  const [selectedMarketplace, setSelectedMarketplace] = useState(null);
  const [selectedCabinet, setSelectedCabinet] = useState(null);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messageInput, setMessageInput] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showChatTaskModal, setShowChatTaskModal] = useState(false);
  const [chatTask, setChatTask] = useState({ title: "", date: "", time: "10:00", priority: "medium" });
  const [showOrderInfo, setShowOrderInfo] = useState(false);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState(null);
  const [newTask, setNewTask] = useState({ title: "", date: "", time: "10:00", priority: "medium" });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("OPEN");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [realAnalytics, setRealAnalytics] = useState(null);
  const chatEndRef = useRef(null);
  const [now, setNow] = useState(new Date());
  // ─── Быстрые ответы ───
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const QUICK_REPLIES = [
    "Здравствуйте! Уже проверяю информацию по вашему заказу.",
    "Спасибо за обращение! Ваш вопрос передан в обработку.",
    "Приносим извинения за неудобство. Разберёмся в течение 24 часов.",
    "Заказ уже отправлен, трек-номер придёт на email.",
    "Возврат оформлен. Деньги вернутся в течение 3-5 рабочих дней.",
    "К сожалению, товар временно отсутствует на складе.",
    "Уточните, пожалуйста, номер заказа для проверки.",
    "Передаю ваш вопрос старшему менеджеру.",
  ];
  // ─── Уведомления ───
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  // ─── Поиск ───
  const [chatSearch, setChatSearch] = useState("");
  // ─── Настройки ───
  const [settingsTab, setSettingsTab] = useState("cabinets");
  const [editingCabinet, setEditingCabinet] = useState(null);
  const [cabinetForm, setCabinetForm] = useState({});
  const [cabinetSaving, setCabinetSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState({});
  const [settingsSaved, setSettingsSaved] = useState(null);
  const [addingCabinet, setAddingCabinet] = useState(null);
  const [newCabinetName, setNewCabinetName] = useState("");
  const [cabinetAdding, setCabinetAdding] = useState(false);
  const [expandedMp, setExpandedMp] = useState({}); // { mpId: true/false }

  // ─── Загрузка маркетплейсов и кабинетов из API ───
  const loadMarketplaces = useCallback(async () => {
    if (!apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/marketplaces`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const mapped = (data.data || []).map((mp) => ({
          id: mp.slug,                    // "wb" / "ozon" / "yandex"
          dbId: mp.id,                    // UUID в БД
          name: mp.name,
          icon: MP_ICONS[mp.slug] || Icons.wb,
          color: mp.color || MP_COLORS[mp.slug] || "#6366f1",
          cabinets: (mp.cabinets || []).map((c) => ({
            id: c.id,
            name: c.name,
            chatCount: c._count?.chats || 0,
            lastSyncAt: c.lastSyncAt,
            // API ключи — приходят только если пользователь ADMIN
            apiToken: c.apiToken || "",
            apiClientId: c.apiClientId || "",
            apiKey: c.apiKey || "",
            campaignId: c.campaignId || "",
          })),
        }));
        setMarketplaces(mapped);
      }
    } catch (e) {
      console.error("Ошибка загрузки маркетплейсов:", e);
    }
  }, [apiUrl]);

  // ─── Загрузка чатов из API ───
  const loadChats = useCallback(async () => {
    if (!apiUrl) { setChatsLoading(false); return; }
    try {
      const params = new URLSearchParams();
      if (selectedCabinet) params.set("cabinetId", selectedCabinet);
      else if (selectedMarketplace) params.set("marketplaceId", selectedMarketplace);
      params.set("limit", "100");
      if (selectedStatus) params.set("status", selectedStatus);
      const res = await fetch(`${apiUrl}/chats?${params}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const mapped = (data.data || []).map((c) => ({
          id: c.id,
          cabinetId: c.cabinetId,
          marketplaceId: c.cabinet?.marketplace?.slug || c.cabinet?.marketplaceId || "wb",
          customerName: c.customerName,
          lastMessage: c.lastMessageText || "",
          lastMessageTime: c.lastMessageAt ? new Date(c.lastMessageAt) : new Date(c.createdAt),
          unread: c.unreadCount || 0,
          responseTimeSec: c.elapsedSeconds || 0,
          status: c.status,
          messages: [],
        }));
        setChats(mapped);
      }
    } catch (e) {
      console.error("Ошибка загрузки чатов:", e);
    } finally {
      setChatsLoading(false);
    }
  }, [apiUrl, selectedMarketplace, selectedCabinet, selectedStatus]);

  // ─── Загрузка сообщений конкретного чата ───
  const loadChatMessages = useCallback(async (chatId) => {
    if (!apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/chats/${chatId}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const msgs = (data.data?.messages || []).map((m) => ({
          id: m.id,
          from: m.senderType === "MANAGER" ? "manager" : "customer",
          text: m.text,
          time: new Date(m.createdAt),
        }));
        setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, messages: msgs } : c));
      }
    } catch (e) {
      console.error("Ошибка загрузки сообщений:", e);
    }
  }, [apiUrl]);

  // ─── Загрузка задач из API ───
  const loadTasks = useCallback(async () => {
    if (!apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/tasks`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const mapped = (data.data || []).map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          date: new Date(t.dueDate),
          completed: t.status === "DONE",
          overdue: t.isOverdue,
          cabinetId: t.cabinetId || "",
          cabinetName: t.cabinet?.name || "",
          priority: (t.priority || "MEDIUM").toLowerCase(),
          status: t.status,
        }));
        setTasks(mapped);
      }
    } catch (e) {
      console.error("Ошибка загрузки задач:", e);
    } finally {
      setTasksLoading(false);
    }
  }, [apiUrl]);

  // ─── Загрузка аналитики из API ───
  const loadAnalytics = useCallback(async () => {
    if (!apiUrl) return;
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/analytics/response-time`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRealAnalytics(data.data);
      }
    } catch (e) {
      console.error("Ошибка загрузки аналитики:", e);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [apiUrl]);

  // ─── Загрузка уведомлений ───
  const loadNotifications = useCallback(async () => {
    if (!apiUrl) return;
    setNotifLoading(true);
    try {
      const res = await fetch(`${apiUrl}/notifications?limit=20`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data || []);
      }
    } catch (e) {
      console.error("Ошибка загрузки уведомлений:", e);
    } finally {
      setNotifLoading(false);
    }
  }, [apiUrl]);

  const markNotifRead = async (id) => {
    if (!apiUrl) return;
    try {
      await fetch(`${apiUrl}/notifications/${id}/read`, { method: "PATCH", headers: getHeaders() });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch (e) {}
  };

  const markAllNotifsRead = async () => {
    if (!apiUrl) return;
    try {
      await fetch(`${apiUrl}/notifications/read-all`, { method: "PATCH", headers: getHeaders() });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (e) {}
  };

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (activeView === "analytics") loadAnalytics();
  }, [activeView, loadAnalytics]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ─── Загрузка маркетплейсов один раз при старте ───
  useEffect(() => {
    loadMarketplaces();
  }, [loadMarketplaces]);

  // ─── Загрузка чатов при смене фильтра ───
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // ─── WebSocket: подключение и реал-тайм события ───
  useEffect(() => {
    if (!apiUrl) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    getWsService().connect(token);

    // Новое сообщение от покупателя
    const onNewMessage = ({ chatId, message }) => {
      setChats((prev) => prev.map((c) => {
        if (c.id !== chatId) return c;
        const newMsg = {
          id: message.id,
          from: message.senderType === "MANAGER" ? "manager" : "customer",
          text: message.text,
          time: new Date(message.createdAt),
        };
        return {
          ...c,
          lastMessage: message.text,
          lastMessageTime: new Date(message.createdAt),
          unread: (c.unread || 0) + (message.senderType !== "MANAGER" ? 1 : 0),
          messages: [...(c.messages || []), newMsg],
        };
      }));
      if (soundEnabled) playNotificationSound();
    };

    // Обновление чата (статус, назначение)
    const onChatUpdated = ({ chatId, ...updates }) => {
      setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, ...updates } : c));
    };

    getWsService().on("new_message", onNewMessage);
    getWsService().on("chat_updated", onChatUpdated);

    // Уведомления о задачах
    const onTaskOverdue = ({ taskId, title }) => {
      setNotifications(prev => [{
        id: `ws-${Date.now()}`, type: "TASK_OVERDUE",
        title: "Задача просрочена", body: title, isRead: false, createdAt: new Date(),
      }, ...prev]);
      if (soundEnabled) playNotificationSound();
    };
    const onTaskReminder = ({ taskId, title }) => {
      setNotifications(prev => [{
        id: `ws-${Date.now()}`, type: "TASK_REMINDER",
        title: "Напоминание", body: title, isRead: false, createdAt: new Date(),
      }, ...prev]);
    };
    getWsService().on("task_overdue", onTaskOverdue);
    getWsService().on("task_reminder", onTaskReminder);

    // Периодическое обновление списка чатов (каждые 30 сек)
    const pollInterval = setInterval(() => loadChats(), 30000);

    return () => {
      getWsService().off("new_message", onNewMessage);
      getWsService().off("chat_updated", onChatUpdated);
      clearInterval(pollInterval);
    };
  }, [apiUrl, soundEnabled, loadChats]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedChat, chats]);

  const filteredChats = useMemo(() => {
    let result = chats;
    if (selectedCabinet) result = result.filter((c) => c.cabinetId === selectedCabinet);
    else if (selectedMarketplace) result = result.filter((c) => c.marketplaceId === selectedMarketplace);
    if (selectedStatus) result = result.filter((c) => c.status === selectedStatus);
    if (chatSearch.trim()) {
      const q = chatSearch.toLowerCase();
      result = result.filter((c) =>
        c.customerName?.toLowerCase().includes(q) ||
        c.lastMessage?.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
  }, [chats, selectedMarketplace, selectedCabinet, selectedStatus, chatSearch]);

  const sendMessage = async () => {
    if (!messageInput.trim() || !selectedChat) return;
    const text = messageInput;
    setMessageInput("");
    // Оптимистичное обновление UI
    const tempMsg = { id: `temp-${Date.now()}`, from: "manager", text, time: new Date() };
    setChats((prev) => prev.map((c) =>
      c.id === selectedChat.id
        ? { ...c, messages: [...(c.messages || []), tempMsg], lastMessage: text, lastMessageTime: new Date(), unread: 0 }
        : c
    ));
    // Отправляем на сервер
    if (apiUrl) {
      try {
        await fetch(`${apiUrl}/chats/${selectedChat.id}/messages`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ text }),
        });
        // Пометить прочитанным
        await fetch(`${apiUrl}/chats/${selectedChat.id}/read`, { method: "PATCH", headers: getHeaders() });
      } catch (e) {
        console.error("Ошибка отправки сообщения:", e);
      }
    }
  };

  const addTask = async () => {
    if (!newTask.title || !newTask.date) return;
    if (!apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/tasks`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          title: newTask.title,
          dueDate: `${newTask.date}T${newTask.time}:00`,
          priority: newTask.priority.toUpperCase(),
          cabinetId: selectedCabinet || null,
        }),
      });
      if (res.ok) {
        await loadTasks();
        setNewTask({ title: "", date: "", time: "10:00", priority: "medium" });
        setShowTaskModal(false);
      }
    } catch (e) {
      console.error("Ошибка создания задачи:", e);
    }
  };

  const toggleTask = async (id) => {
    if (!apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/tasks/${id}/toggle`, {
        method: "PATCH",
        headers: getHeaders(),
      });
      if (res.ok) {
        await loadTasks();
      }
    } catch (e) {
      console.error("Ошибка переключения задачи:", e);
    }
  };

  const deleteTask = async (id) => {
    if (!apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/tasks/${id}`, {
        method: "DELETE",
        headers: getHeaders(),
      });
      if (res.ok) {
        await loadTasks();
      }
    } catch (e) {
      console.error("Ошибка удаления задачи:", e);
    }
  };

  // Создание задачи прямо из чата (привязка к чату)
  const addChatTask = async () => {
    if (!chatTask.title || !chatTask.date || !currentChat) return;
    if (!apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/tasks`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          title: chatTask.title,
          description: `Чат: ${currentChat.customerName} (${getCabinet(currentChat.cabinetId)?.name || currentChat.cabinetId || ""})`,
          dueDate: `${chatTask.date}T${chatTask.time}:00`,
          priority: chatTask.priority.toUpperCase(),
        }),
      });
      if (res.ok) {
        await loadTasks();
        setChatTask({ title: "", date: "", time: "10:00", priority: "medium" });
        setShowChatTaskModal(false);
      } else {
        const err = await res.json();
        console.error("Ошибка создания задачи:", err);
      }
    } catch (e) {
      console.error("Ошибка создания задачи из чата:", e);
    }
  };

  // Переход к чату из календаря по описанию задачи
  const goToChatFromTask = (task) => {
    if (!task.description) return;
    const match = task.description.match(/Чат: (.+?) \(/);
    if (match) {
      const name = match[1];
      const chat = chats.find((c) => c.customerName === name);
      if (chat) {
        setActiveView("chats");
        setSelectedChat(chat);
      }
    }
  };

  const currentChat = useMemo(
    () => chats.find((c) => c.id === selectedChat?.id),
    [chats, selectedChat]
  );

  const getMarketplace = (id) => marketplaces.find((m) => m.id === id);
  const getCabinet = (id) => {
    for (const mp of marketplaces) {
      const cab = mp.cabinets.find((c) => c.id === id);
      if (cab) return cab;
    }
    return null;
  };

  const analyticsData = useMemo(() => {
    // Используем реальные данные если есть
    if (realAnalytics) {
      const byMarketplace = {};
      const byCabinet = {};
      (realAnalytics.byMarketplace || []).forEach((m) => {
        // Ищем маркетплейс по dbId или slug
        const mpObj = marketplaces.find(mp => mp.dbId === m.marketplaceId || mp.id === m.marketplaceId);
        const key = mpObj ? mpObj.id : m.marketplaceId;
        byMarketplace[key] = { name: m.marketplaceName || mpObj?.name || key, avg: m.avgResponseSec, count: m.count };
      });
      (realAnalytics.byCabinet || []).forEach((c) => {
        byCabinet[c.cabinetId] = { name: c.cabinetName, avg: c.avgResponseSec, count: c.count };
      });
      return {
        byMarketplace,
        byCabinet,
        totalAvg: realAnalytics.totalAvgResponseSec || 0,
        totalChats: realAnalytics.totalChats || 0,
      };
    }
    // Fallback на демо-данные из чатов
    const byMarketplace = {};
    const byCabinet = {};
    marketplaces.forEach((mp) => {
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
  }, [chats, realAnalytics]);

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
                      onClick={() => setSelectedTaskDetail(task)}
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
                    onClick={() => setSelectedTaskDetail(task)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      borderRadius: 10,
                      cursor: "pointer",
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
                        {getCabinet(task.cabinetId)?.name || task.cabinetName || "—"}
                      </div>
                      {task.description && task.description.startsWith("Чат:") && (
                        <div
                          onClick={(e) => { e.stopPropagation(); goToChatFromTask(task); }}
                          style={{
                            fontSize: 11, color: "#a855f7", marginTop: 3,
                            cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                          }}
                        >
                          {Icons.chat()} {task.description}
                        </div>
                      )}
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
    // Генерируем данные за 7 дней для графика
    const last7days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        label: d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
        chats: Math.floor(Math.random() * 20) + 5,
        avgSec: Math.floor(Math.random() * 300) + 60,
      };
    });
    const maxChats = Math.max(...last7days.map(d => d.chats), 1);
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
            onClick={async () => {
              if (apiUrl) {
                try {
                  const res = await fetch(`${apiUrl}/analytics/response-time/export`, { headers: getHeaders() });
                  if (res.ok) {
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `analytics_${Date.now()}.csv`;
                    a.click();
                    return;
                  }
                } catch (e) { console.error(e); }
              }
              // Fallback
              const csv = [
                "Кабинет,Среднее время (сек),Количество чатов",
                ...Object.values(analyticsData.byCabinet).map(
                  (c) => `${c.name},${c.avg},${c.count}`
                ),
              ].join("\n");
              const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
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
            if (!mp) return null;
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

        {/* Daily activity chart */}
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", padding: 24, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 20px" }}>Активность за 7 дней</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
            {last7days.map((day, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 9, color: "#64748b" }}>{day.chats}</div>
                <div style={{
                  width: "100%", borderRadius: "4px 4px 0 0",
                  height: `${Math.round((day.chats / maxChats) * 80)}px`,
                  background: `linear-gradient(180deg, #a855f7, #7c3aed)`,
                  minHeight: 4, transition: "height 0.5s ease",
                }} />
                <div style={{ fontSize: 9, color: "#475569", whiteSpace: "nowrap" }}>{day.label}</div>
              </div>
            ))}
          </div>
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
            const mp = marketplaces.find((m) => m.cabinets.some((c) => c.id === id));
            const color = mp?.color || "#a855f7";
            if (!color) return null;
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

  // ─── Settings View ───
  const renderSettings = () => {
    const saveCabinet = async () => {
      if (!editingCabinet) return;
      setCabinetSaving(true);
      try {
        const res = await fetch(`${apiUrl}/cabinets/${editingCabinet}`, {
          method: "PUT",
          headers: getHeaders(),
          body: JSON.stringify(cabinetForm),
        });
        if (res.ok) {
          setSettingsSaved("Сохранено!");
          setTimeout(() => setSettingsSaved(null), 2500);
          await loadMarketplaces();
          setEditingCabinet(null);
          setCabinetForm({});
        } else {
          const err = await res.json();
          setSettingsSaved("Ошибка: " + (err.error || "неизвестная"));
          setTimeout(() => setSettingsSaved(null), 3000);
        }
      } catch (e) {
        setSettingsSaved("Ошибка сети");
        setTimeout(() => setSettingsSaved(null), 3000);
      } finally {
        setCabinetSaving(false);
      }
    };

    const createCabinet = async (mpDbId) => {
      if (!newCabinetName.trim()) return;
      setCabinetAdding(true);
      try {
        const res = await fetch(`${apiUrl}/cabinets`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ name: newCabinetName.trim(), marketplaceId: mpDbId }),
        });
        if (res.ok) {
          setSettingsSaved("Кабинет добавлен!");
          setTimeout(() => setSettingsSaved(null), 2500);
          await loadMarketplaces();
          setAddingCabinet(null);
          setNewCabinetName("");
        } else {
          const err = await res.json();
          setSettingsSaved("Ошибка: " + (err.error || "неизвестная"));
          setTimeout(() => setSettingsSaved(null), 3000);
        }
      } catch (e) {
        setSettingsSaved("Ошибка сети");
        setTimeout(() => setSettingsSaved(null), 3000);
      } finally {
        setCabinetAdding(false);
      }
    };

    return (
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Настройки</h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>Кабинеты и API-ключи маркетплейсов</p>
        </div>

        {/* Saved toast */}
        {settingsSaved && (
          <div style={{
            position: "fixed", top: 20, right: 20, zIndex: 9999,
            padding: "12px 20px", borderRadius: 10,
            background: settingsSaved.startsWith("Ошибка") ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
            border: `1px solid ${settingsSaved.startsWith("Ошибка") ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
            color: settingsSaved.startsWith("Ошибка") ? "#ef4444" : "#22c55e",
            fontSize: 13, fontWeight: 600,
          }}>
            {settingsSaved}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 0 }}>
          {[
            { v: "cabinets", l: "Кабинеты и API" },
            { v: "system", l: "Система" },
          ].map(({ v, l }) => (
            <button key={v} onClick={() => setSettingsTab(v)} style={{
              padding: "8px 16px", background: "none", border: "none",
              borderBottom: settingsTab === v ? "2px solid #a855f7" : "2px solid transparent",
              color: settingsTab === v ? "#a855f7" : "#64748b",
              fontSize: 13, fontWeight: settingsTab === v ? 600 : 400,
              cursor: "pointer", fontFamily: "inherit", marginBottom: -1,
            }}>{l}</button>
          ))}
        </div>

        {/* Cabinets tab */}
        {settingsTab === "cabinets" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {marketplaces.map((mp) => {
              const isExpanded = expandedMp[mp.id] !== false;
              const activeCabs = mp.cabinets.slice(0, 6);
              const configuredCount = activeCabs.filter(c => c.apiToken || c.apiKey).length;
              return (
                <div key={mp.id} style={{
                  background: "rgba(255,255,255,0.02)", borderRadius: 14,
                  border: `1px solid ${isExpanded ? mp.color + "30" : "rgba(255,255,255,0.06)"}`,
                  overflow: "hidden", transition: "border-color 0.2s",
                }}>

                  {/* ── Уровень 1: Заголовок маркетплейса ── */}
                  <div onClick={() => setExpandedMp(p => ({ ...p, [mp.id]: !isExpanded }))} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "16px 20px",
                    cursor: "pointer", userSelect: "none",
                    background: `linear-gradient(90deg, ${mp.color}${isExpanded ? "15" : "08"}, transparent)`,
                    borderBottom: isExpanded ? "1px solid rgba(255,255,255,0.06)" : "none",
                  }}>
                    <span style={{ color: mp.color }}>{mp.icon()}</span>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{mp.name}</span>
                    <span style={{ fontSize: 11, color: "#475569" }}>{activeCabs.length}/6 кабинетов</span>
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 5, fontWeight: 600,
                      background: configuredCount > 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.08)",
                      color: configuredCount > 0 ? "#22c55e" : "#64748b",
                    }}>{configuredCount}/{activeCabs.length} API ✓</span>
                    <span style={{ marginLeft: "auto", fontSize: 18, color: "#475569", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                  </div>

                  {/* ── Уровень 2: Список кабинетов ── */}
                  {isExpanded && (
                    <>
                      {activeCabs.map((cab) => {
                        const cabExpanded = expandedMp["cab_" + cab.id] !== false;
                        const isEditing = editingCabinet === cab.id;
                        const startEdit = (field, val) => {
                          if (!isEditing) {
                            setEditingCabinet(cab.id);
                            setCabinetForm({ name: cab.name, apiToken: cab.apiToken||"", apiClientId: cab.apiClientId||"", apiKey: cab.apiKey||"", campaignId: cab.campaignId||"" });
                          }
                          setCabinetForm(p => ({ ...p, [field]: val }));
                        };
                        const vals = isEditing ? cabinetForm : { name: cab.name, apiToken: cab.apiToken||"", apiClientId: cab.apiClientId||"", apiKey: cab.apiKey||"", campaignId: cab.campaignId||"" };

                        return (
                          <div key={cab.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>

                            {/* Строка кабинета — кликабельна */}
                            <div onClick={() => setExpandedMp(p => ({ ...p, ["cab_" + cab.id]: !cabExpanded }))}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 20px 11px 28px", cursor: "pointer", userSelect: "none", background: cabExpanded ? "rgba(255,255,255,0.02)" : "transparent" }}>
                              <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: (cab.apiToken || cab.apiKey) ? "#22c55e" : "#475569" }} />
                              <span style={{ fontSize: 13, fontWeight: 500, color: cabExpanded ? "#e2e8f0" : "#94a3b8", flex: 1 }}>{cab.name}</span>
                              {cab.chatCount > 0 && <span style={{ fontSize: 10, color: "#64748b" }}>{cab.chatCount} чатов</span>}
                              {cab.lastSyncAt && <span style={{ fontSize: 10, color: "#334155" }}>↻ {new Date(cab.lastSyncAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
                              <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, fontWeight: 700,
                                background: (cab.apiToken || cab.apiKey) ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.08)",
                                color: (cab.apiToken || cab.apiKey) ? "#22c55e" : "#ef4444" }}>
                                {(cab.apiToken || cab.apiKey) ? "✓ API" : "нет API"}
                              </span>
                              <span style={{ color: "#334155", fontSize: 14, transform: cabExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
                            </div>

                            {/* Поля API — раскрываются при клике, только ADMIN */}
                            {cabExpanded && user?.role === "ADMIN" && (
                              <div style={{ padding: "14px 20px 16px 28px", background: "rgba(168,85,247,0.03)", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

                                  {/* Название кабинета — для всех МП */}
                                  <div>
                                    <label style={{ fontSize: 10, color: "#64748b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Название кабинета</label>
                                    <input style={{ ...S.input, fontSize: 12, padding: "8px 10px" }}
                                      value={vals.name} onChange={(e) => startEdit("name", e.target.value)} />
                                  </div>

                                  {/* WB: API Токен */}
                                  {mp.id === "wb" && (
                                    <div>
                                      <label style={{ fontSize: 10, color: "#a855f7", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>API Токен WB</label>
                                      <div style={{ position: "relative" }}>
                                        <input style={{ ...S.input, fontSize: 11, padding: "8px 32px 8px 10px", fontFamily: "'JetBrains Mono', monospace" }}
                                          type={showApiKey[cab.id] ? "text" : "password"}
                                          value={vals.apiToken} placeholder="eyJhbGciOiJSUzI1NiI..."
                                          onChange={(e) => startEdit("apiToken", e.target.value)} />
                                        <button onClick={() => setShowApiKey(p => ({ ...p, [cab.id]: !p[cab.id] }))}
                                          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 2 }}>
                                          {showApiKey[cab.id] ? Icons.eyeOff() : Icons.eye()}
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Ozon: Client ID + API Key */}
                                  {mp.id === "ozon" && (<>
                                    <div>
                                      <label style={{ fontSize: 10, color: "#3b82f6", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Client ID</label>
                                      <input style={{ ...S.input, fontSize: 12, padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace" }}
                                        value={vals.apiClientId} placeholder="2574067"
                                        onChange={(e) => startEdit("apiClientId", e.target.value)} />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 10, color: "#3b82f6", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>API Key</label>
                                      <div style={{ position: "relative" }}>
                                        <input style={{ ...S.input, fontSize: 11, padding: "8px 32px 8px 10px", fontFamily: "'JetBrains Mono', monospace" }}
                                          type={showApiKey[cab.id] ? "text" : "password"}
                                          value={vals.apiKey} placeholder="84e31f47-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                          onChange={(e) => startEdit("apiKey", e.target.value)} />
                                        <button onClick={() => setShowApiKey(p => ({ ...p, [cab.id]: !p[cab.id] }))}
                                          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 2 }}>
                                          {showApiKey[cab.id] ? Icons.eyeOff() : Icons.eye()}
                                        </button>
                                      </div>
                                    </div>
                                  </>)}

                                  {/* Яндекс Маркет: API Токен + Client ID */}
                                  {mp.id === "yandex" && (<>
                                    <div>
                                      <label style={{ fontSize: 10, color: "#f59e0b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>OAuth Токен ЯМ</label>
                                      <div style={{ position: "relative" }}>
                                        <input style={{ ...S.input, fontSize: 11, padding: "8px 32px 8px 10px", fontFamily: "'JetBrains Mono', monospace" }}
                                          type={showApiKey[cab.id] ? "text" : "password"}
                                          value={vals.apiToken} placeholder="y0_AgAAAA..."
                                          onChange={(e) => startEdit("apiToken", e.target.value)} />
                                        <button onClick={() => setShowApiKey(p => ({ ...p, [cab.id]: !p[cab.id] }))}
                                          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 2 }}>
                                          {showApiKey[cab.id] ? Icons.eyeOff() : Icons.eye()}
                                        </button>
                                      </div>
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 10, color: "#f59e0b", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Client ID ЯМ</label>
                                      <input style={{ ...S.input, fontSize: 12, padding: "8px 10px", fontFamily: "'JetBrains Mono', monospace" }}
                                        value={vals.apiClientId} placeholder="12345678"
                                        onChange={(e) => startEdit("apiClientId", e.target.value)} />
                                    </div>
                                  </>)}

                                  {/* Кнопки сохранить/отмена */}
                                  {isEditing && (
                                    <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, marginTop: 6 }}>
                                      <button onClick={saveCabinet} disabled={cabinetSaving}
                                        style={{ ...S.btn("#a855f7"), fontSize: 12, padding: "8px 20px", opacity: cabinetSaving ? 0.6 : 1 }}>
                                        {cabinetSaving ? "Сохранение..." : "💾 Сохранить"}
                                      </button>
                                      <button onClick={() => { setEditingCabinet(null); setCabinetForm({}); }}
                                        style={{ ...S.btn("#475569"), fontSize: 12, padding: "8px 16px" }}>
                                        Отмена
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Добавить кабинет — ADMIN, лимит 6 */}
                      {user?.role === "ADMIN" && activeCabs.length < 6 && (
                        <div style={{ padding: "10px 20px 14px" }}>
                          {addingCabinet === mp.id ? (
                            <div style={{ display: "flex", gap: 8 }}>
                              <input style={{ ...S.input, flex: 1, fontSize: 12, padding: "8px 12px" }}
                                placeholder={"Название кабинета " + mp.name}
                                value={newCabinetName}
                                onChange={(e) => setNewCabinetName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && createCabinet(mp.dbId)}
                                autoFocus />
                              <button onClick={() => createCabinet(mp.dbId)} disabled={cabinetAdding || !newCabinetName.trim()}
                                style={{ ...S.btn("#22c55e"), padding: "8px 16px", fontSize: 12, opacity: cabinetAdding ? 0.6 : 1 }}>
                                {cabinetAdding ? "..." : "Создать"}
                              </button>
                              <button onClick={() => { setAddingCabinet(null); setNewCabinetName(""); }}
                                style={{ ...S.btn("#475569"), padding: "8px 12px", fontSize: 12 }}>✕</button>
                            </div>
                          ) : (
                            <button onClick={() => setAddingCabinet(mp.id)} style={{
                              display: "flex", alignItems: "center", gap: 6, background: "none",
                              border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8,
                              padding: "8px 14px", color: "#475569", fontSize: 12,
                              cursor: "pointer", fontFamily: "inherit", width: "100%", justifyContent: "center",
                            }}>
                              {Icons.plus()} Добавить кабинет ({activeCabs.length}/6)
                            </button>
                          )}
                        </div>
                      )}
                      {user?.role === "ADMIN" && activeCabs.length >= 6 && (
                        <div style={{ padding: "8px 20px", fontSize: 11, color: "#475569", textAlign: "center" }}>
                          Лимит достигнут (6/6)
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* System tab */}
        {settingsTab === "system" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 500 }}>
            <div style={{
              padding: "20px", borderRadius: 14,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 16 }}>Учётная запись</div>
              {user && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { l: "Имя", v: `${user.firstName} ${user.lastName}` },
                    { l: "Email", v: user.email },
                    { l: "Роль", v: user.role },
                  ].map(({ l, v }) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>{l}</span>
                      <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{
              padding: "20px", borderRadius: 14,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 16 }}>Уведомления</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#e2e8f0" }}>Звуковые уведомления</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Звук при новом сообщении</div>
                </div>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: soundEnabled ? "#a855f7" : "rgba(255,255,255,0.1)",
                    position: "relative", transition: "background 0.2s",
                  }}
                >
                  <span style={{
                    position: "absolute", top: 2, left: soundEnabled ? 22 : 2,
                    width: 20, height: 20, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s",
                  }} />
                </button>
              </div>
            </div>
            <div style={{
              padding: "16px 20px", borderRadius: 14,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 13, color: "#e2e8f0" }}>Backend API</div>
                <div style={{ fontSize: 11, color: "#64748b", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{apiUrl}</div>
              </div>
              <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: "rgba(34,197,94,0.12)", color: "#22c55e", fontWeight: 600 }}>
                Подключён
              </span>
            </div>
          </div>
        )}
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
        <div style={{ ...S.logo, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={S.logoTitle}>MP · CRM</div>
            <div style={S.logoSub}>Marketplace Manager</div>
          </div>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => { setShowNotifications(!showNotifications); if (!showNotifications) loadNotifications(); }}
              style={{
                background: showNotifications ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
                padding: "6px 8px", cursor: "pointer", color: "#94a3b8",
                display: "flex", alignItems: "center",
              }}
            >
              {Icons.notification()}
              {notifications.filter(n => !n.isRead).length > 0 && (
                <span style={{
                  position: "absolute", top: -4, right: -4,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#ef4444", color: "#fff",
                  fontSize: 9, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {notifications.filter(n => !n.isRead).length}
                </span>
              )}
            </button>
          </div>
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
          <button
            style={S.navBtn(activeView === "settings")}
            onClick={() => setActiveView("settings")}
          >
            {Icons.settings()}
            <span>Настройки</span>
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
          {marketplaces.map((mp) => (
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
                  {chats.filter(c => c.marketplaceId === mp.id && c.unread > 0).reduce((s,c) => s + c.unread, 0) || mp.cabinets.length}
                </span>
              </button>
              {selectedMarketplace === mp.id &&
                mp.cabinets.map((cab) => (
                  <button
                    key={cab.id}
                    style={S.cabItem(selectedCabinet === cab.id)}
                    onClick={() => setSelectedCabinet(cab.id)}
                    title={`ID: ${cab.id}`}
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
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cab.name}
                      </span>
                      <span style={{ display: "block", fontSize: 9, color: "#334155", fontFamily: "'JetBrains Mono', monospace", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cab.id.slice(0, 8)}…
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          ))}
        </div>

        {/* Sound toggle & User */}
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
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginTop: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "linear-gradient(135deg, #a855f730, #a855f710)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#a855f7", fontSize: 12, fontWeight: 700,
              }}>
                {user.firstName?.[0] || "U"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#e2e8f0" }}>
                  {user.firstName} {user.lastName}
                </div>
                <div style={{ fontSize: 10, color: "#64748b" }}>{user.role}</div>
              </div>
            </div>
          )}
          {onLogout && (
            <button
              style={{
                ...S.navBtn(false),
                fontSize: 12,
                gap: 8,
                color: "#ef4444",
                marginTop: 4,
              }}
              onClick={onLogout}
            >
              {Icons.x()}
              <span>Выйти</span>
            </button>
          )}
        </div>
      </div>

      {/* Notification Panel */}
      {showNotifications && (
        <div style={{
          position: "fixed", top: 60, left: 240, zIndex: 500, width: 340,
          background: "#1a1d2b", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)", overflow: "hidden",
        }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Уведомления</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {notifications.some(n => !n.isRead) && (
                <button onClick={markAllNotifsRead} style={{ fontSize: 11, color: "#a855f7", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  Прочитать все
                </button>
              )}
              <button onClick={() => setShowNotifications(false)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
          </div>
          <div style={{ maxHeight: 400, overflow: "auto" }}>
            {notifLoading ? (
              <div style={{ padding: 24, textAlign: "center", color: "#475569", fontSize: 13 }}>Загрузка...</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#475569", fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                Нет уведомлений
              </div>
            ) : notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => markNotifRead(n.id)}
                style={{
                  padding: "12px 16px", cursor: "pointer",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: n.isRead ? "transparent" : "rgba(168,85,247,0.06)",
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>
                  {n.type === "TASK_OVERDUE" ? "🔴" : n.type === "TASK_REMINDER" ? "⏰" : n.type === "NEW_MESSAGE" ? "💬" : "📌"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: n.isRead ? "#64748b" : "#e2e8f0", marginBottom: 2 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>}
                  <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>
                    {new Date(n.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                {!n.isRead && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#a855f7", flexShrink: 0, marginTop: 4 }} />}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Backdrop для закрытия панели уведомлений */}
      {showNotifications && (
        <div style={{ position: "fixed", inset: 0, zIndex: 499 }} onClick={() => setShowNotifications(false)} />
      )}

      {/* Main Content */}
      {activeView === "chats" && (
        <>
          {/* Chat List */}
          <div style={S.chatList}>
            <div style={{ ...S.chatListHeader, flexDirection: "column", gap: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Сообщения</div>
                <button
                  onClick={() => loadChats()}
                  style={{
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6, padding: "4px 8px", color: "#64748b", cursor: "pointer",
                    fontSize: 11, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
                  }}
                  title="Обновить"
                >
                  ↻ {filteredChats.length}
                </button>
              </div>
              {/* Фильтр статусов */}
              <div style={{ display: "flex", gap: 4, width: "100%" }}>
                {[
                  { v: "OPEN",     l: "Открытые",  c: "#22c55e" },
                  { v: "PENDING",  l: "Ожидание",  c: "#eab308" },
                  { v: "RESOLVED", l: "Решённые",  c: "#3b82f6" },
                  { v: null,       l: "Все",        c: "#94a3b8" },
                ].map(({ v, l, c }) => (
                  <button
                    key={v || "all"}
                    onClick={() => setSelectedStatus(v)}
                    style={{
                      flex: 1, padding: "5px 4px", borderRadius: 6, border: "none",
                      background: selectedStatus === v ? `${c}20` : "rgba(255,255,255,0.03)",
                      color: selectedStatus === v ? c : "#475569",
                      fontSize: 10, fontWeight: selectedStatus === v ? 700 : 400,
                      cursor: "pointer", fontFamily: "inherit",
                      borderBottom: selectedStatus === v ? `2px solid ${c}` : "2px solid transparent",
                      transition: "all 0.15s",
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {/* Строка поиска */}
            <div style={{ padding: "0 12px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#475569" }}>
                  {Icons.search()}
                </span>
                <input
                  style={{ ...S.input, paddingLeft: 30, fontSize: 12, padding: "7px 10px 7px 30px" }}
                  placeholder="Поиск по имени или сообщению..."
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                />
                {chatSearch && (
                  <button onClick={() => setChatSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14 }}>×</button>
                )}
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {(chatsLoading || marketplaces.length === 0) ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#475569", fontSize: 13 }}>
                  Загрузка чатов...
                </div>
              ) : filteredChats.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#475569", fontSize: 13, flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 32, opacity: 0.3 }}>💬</div>
                  <div>Нет чатов</div>
                </div>
              ) : null}
              {!chatsLoading && marketplaces.length > 0 && filteredChats.map((chat) => {
                const mp = getMarketplace(chat.marketplaceId);
                if (!mp) return null; // маркетплейс ещё не загружен
                return (
                  <ChatItemWithTimer
                    key={chat.id}
                    chat={chat}
                    mp={mp}
                    active={selectedChat?.id === chat.id}
                    onClick={() => {
                      setSelectedChat(chat);
                      setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, unread: 0 } : c)));
                      // Загружаем сообщения если ещё не загружены
                      if (!chat.messages || chat.messages.length === 0) {
                        loadChatMessages(chat.id);
                      }
                      // WS: подписка на чат
                      getWsService().joinChat(chat.id);
                      // Помечаем прочитанным через API
                      if (apiUrl) {
                        fetch(`${apiUrl}/chats/${chat.id}/read`, { method: "PATCH", headers: getHeaders() }).catch(() => {});
                      }
                    }}
                    getCabinet={getCabinet}
                    badge={S.badge}
                  />
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
                      width: 38, height: 38, borderRadius: 10,
                      background: `linear-gradient(135deg, ${getMarketplace(currentChat.marketplaceId)?.color}30, ${getMarketplace(currentChat.marketplaceId)?.color}10)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: getMarketplace(currentChat.marketplaceId)?.color,
                      fontSize: 15, fontWeight: 700,
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
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Статус чата */}
                    <select
                      value={currentChat.status || "OPEN"}
                      onChange={async (e) => {
                        const newStatus = e.target.value;
                        if (apiUrl) {
                          await fetch(`${apiUrl}/chats/${currentChat.id}/status`, {
                            method: "PATCH", headers: getHeaders(),
                            body: JSON.stringify({ status: newStatus }),
                          }).catch(() => {});
                          setChats((prev) => prev.map((c) => c.id === currentChat.id ? { ...c, status: newStatus } : c));
                        }
                      }}
                      style={{
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8, padding: "5px 8px", color: "#e2e8f0",
                        fontSize: 11, fontFamily: "inherit", cursor: "pointer",
                      }}
                    >
                      <option value="OPEN">Открыт</option>
                      <option value="PENDING">Ожидание</option>
                      <option value="RESOLVED">Решён</option>
                      <option value="CLOSED">Закрыт</option>
                    </select>
                    {/* Кнопка задачи из чата */}
                    <button
                      onClick={() => {
                        setChatTask({ ...chatTask, title: `Ответить: ${currentChat.customerName}` });
                        setShowChatTaskModal(true);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 12px", borderRadius: 8,
                        background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)",
                        color: "#a855f7", fontSize: 11, fontWeight: 600,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {Icons.calendar()} Задача
                    </button>
                    {/* Кнопка информации о заказе */}
                    <button
                      onClick={() => setShowOrderInfo(!showOrderInfo)}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 12px", borderRadius: 8,
                        background: showOrderInfo ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.08)",
                        border: "1px solid rgba(59,130,246,0.2)",
                        color: "#3b82f6", fontSize: 11, fontWeight: 600,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {Icons.user()} Заказ
                    </button>
                    <TimerBadge lastMessageTime={currentChat.lastMessageTime} />
                  </div>
                </div>

                {/* Панель информации о заказе */}
                {showOrderInfo && (
                  <div style={{
                    padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                    background: "rgba(59,130,246,0.04)", display: "flex", gap: 24, flexWrap: "wrap",
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Схема</div>
                      <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>{currentChat.orderScheme || "FBO"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Номер заказа</div>
                      <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>{currentChat.orderId || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Дата заказа</div>
                      <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>{currentChat.orderDate || "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Город</div>
                      <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>{currentChat.orderCity || "—"}</div>
                    </div>
                    <div style={{ fontSize: 10, color: "#475569", alignSelf: "center", fontStyle: "italic" }}>
                      Данные заполняются при DBS/rFBS схемах из API маркетплейса
                    </div>
                  </div>
                )}

                <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", position: "relative" }}>
                  {/* Фоновая полоска таймера на всю высоту чата */}
                  <ChatTimerBg lastMessageTime={currentChat.lastMessageTime} />
                  {currentChat.messages.map((msg, i) => (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex",
                        justifyContent: msg.from === "manager" ? "flex-end" : "flex-start",
                        marginBottom: 12,
                        animation: "slideIn 0.2s ease",
                        position: "relative", zIndex: 1,
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

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
                  {/* Быстрые ответы */}
                  {showQuickReplies && (
                    <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {QUICK_REPLIES.map((reply, i) => (
                        <button
                          key={i}
                          onClick={() => { setMessageInput(reply); setShowQuickReplies(false); }}
                          style={{
                            padding: "4px 10px", borderRadius: 6, fontSize: 11,
                            background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.15)",
                            color: "#c084fc", cursor: "pointer", fontFamily: "inherit",
                            textAlign: "left", transition: "all 0.15s",
                          }}
                        >
                          {reply.length > 45 ? reply.slice(0, 45) + "…" : reply}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ padding: "10px 14px", display: "flex", gap: 8, alignItems: "flex-end" }}>
                    {/* Кнопка быстрых ответов */}
                    <button
                      onClick={() => setShowQuickReplies(!showQuickReplies)}
                      title="Быстрые ответы"
                      style={{
                        padding: "9px 10px", borderRadius: 8, border: "none", flexShrink: 0,
                        background: showQuickReplies ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.06)",
                        color: showQuickReplies ? "#a855f7" : "#64748b", cursor: "pointer", fontSize: 14,
                      }}
                    >
                      ⚡
                    </button>
                    <textarea
                      style={{
                        ...S.input, flex: 1, resize: "none", height: 38, minHeight: 38, maxHeight: 120,
                        lineHeight: "1.5", padding: "8px 12px", overflowY: "auto",
                      }}
                      placeholder="Введите сообщение... (Enter — отправить, Shift+Enter — новая строка)"
                      value={messageInput}
                      onChange={(e) => {
                        setMessageInput(e.target.value);
                        e.target.style.height = "38px";
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                      }}
                    />
                    {/* Экспорт чата */}
                    <button
                      onClick={() => {
                        if (!currentChat?.messages?.length) return;
                        const lines = currentChat.messages.map(m =>
                          `[${new Date(m.time).toLocaleString("ru-RU")}] ${m.from === "manager" ? "Менеджер" : currentChat.customerName}: ${m.text}`
                        );
                        const nl = "\n";
                        const text = `Чат с ${currentChat.customerName}${nl}${getCabinet(currentChat.cabinetId)?.name || ""}${nl}${"─".repeat(40)}${nl}${lines.join(nl)}`;
                        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url; a.download = `chat_${currentChat.customerName}_${Date.now()}.txt`; a.click();
                      }}
                      title="Экспорт чата"
                      style={{
                        padding: "9px 10px", borderRadius: 8, border: "none", flexShrink: 0,
                        background: "rgba(255,255,255,0.06)", color: "#64748b", cursor: "pointer", fontSize: 14,
                      }}
                    >
                      {Icons.download()}
                    </button>
                    <button style={{ ...S.btn("#a855f7"), flexShrink: 0, padding: "9px 14px" }} onClick={sendMessage}>
                      {Icons.send()}
                    </button>
                  </div>
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
      {activeView === "settings" && renderSettings()}

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

      {/* Chat Task Modal — задача из чата */}
      {showChatTaskModal && currentChat && (
        <div style={S.modal} onClick={() => setShowChatTaskModal(false)}>
          <div style={S.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>Задача по чату</h3>
              <button
                onClick={() => setShowChatTaskModal(false)}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 4 }}
              >
                {Icons.x()}
              </button>
            </div>
            <div style={{
              padding: "10px 14px", marginBottom: 16, borderRadius: 10,
              background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.1)",
            }}>
              <div style={{ fontSize: 11, color: "#a855f7", marginBottom: 2 }}>Привязан к чату:</div>
              <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>
                {currentChat.customerName} · {getCabinet(currentChat.cabinetId)?.name || ""}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 6, fontWeight: 500 }}>Название задачи</label>
                <input
                  style={S.input}
                  placeholder="Что нужно сделать?"
                  value={chatTask.title}
                  onChange={(e) => setChatTask({ ...chatTask, title: e.target.value })}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 6, fontWeight: 500 }}>Дата</label>
                  <input style={S.input} type="date" value={chatTask.date} onChange={(e) => setChatTask({ ...chatTask, date: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 6, fontWeight: 500 }}>Время</label>
                  <input style={S.input} type="time" value={chatTask.time} onChange={(e) => setChatTask({ ...chatTask, time: e.target.value })} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#94a3b8", display: "block", marginBottom: 6, fontWeight: 500 }}>Приоритет</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { v: "low", l: "Низкий", c: "#22c55e" },
                    { v: "medium", l: "Средний", c: "#eab308" },
                    { v: "high", l: "Высокий", c: "#ef4444" },
                  ].map((p) => (
                    <button
                      key={p.v}
                      onClick={() => setChatTask({ ...chatTask, priority: p.v })}
                      style={{
                        flex: 1, padding: "8px 12px", borderRadius: 8,
                        border: chatTask.priority === p.v ? `2px solid ${p.c}` : "2px solid rgba(255,255,255,0.08)",
                        background: chatTask.priority === p.v ? `${p.c}15` : "rgba(255,255,255,0.03)",
                        color: chatTask.priority === p.v ? p.c : "#94a3b8",
                        fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {p.l}
                    </button>
                  ))}
                </div>
              </div>
              <button
                style={{ ...S.btn("#a855f7"), width: "100%", justifyContent: "center", marginTop: 4, padding: "12px 16px" }}
                onClick={addChatTask}
              >
                {Icons.plus()} Создать задачу по чату
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal — детали задачи с переходом в чат */}
      {selectedTaskDetail && (
        <div style={S.modal} onClick={() => setSelectedTaskDetail(null)}>
          <div style={S.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>Детали задачи</h3>
              <button
                onClick={() => setSelectedTaskDetail(null)}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 4 }}
              >
                {Icons.x()}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Название</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>{selectedTaskDetail.title}</div>
              </div>

              {selectedTaskDetail.description && (
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Описание</div>
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>{selectedTaskDetail.description}</div>
                </div>
              )}

              <div style={{ display: "flex", gap: 24 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Дата</div>
                  <div style={{ fontSize: 13, color: "#e2e8f0" }}>
                    {new Date(selectedTaskDetail.date).toLocaleString("ru-RU", {
                      day: "numeric", month: "long", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Приоритет</div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                    background: selectedTaskDetail.priority === "high" ? "rgba(239,68,68,0.15)"
                      : selectedTaskDetail.priority === "medium" ? "rgba(234,179,8,0.15)" : "rgba(34,197,94,0.15)",
                    color: selectedTaskDetail.priority === "high" ? "#ef4444"
                      : selectedTaskDetail.priority === "medium" ? "#eab308" : "#22c55e",
                  }}>
                    {selectedTaskDetail.priority === "high" ? "Высокий" : selectedTaskDetail.priority === "medium" ? "Средний" : "Низкий"}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>Статус</div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                    background: selectedTaskDetail.completed ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
                    color: selectedTaskDetail.completed ? "#22c55e" : "#94a3b8",
                  }}>
                    {selectedTaskDetail.completed ? "Выполнена" : selectedTaskDetail.overdue ? "Просрочена" : "В работе"}
                  </span>
                </div>
              </div>

              {/* Кнопка перехода в чат */}
              {selectedTaskDetail.description && selectedTaskDetail.description.startsWith("Чат:") && (
                <button
                  onClick={() => {
                    goToChatFromTask(selectedTaskDetail);
                    setSelectedTaskDetail(null);
                  }}
                  style={{
                    ...S.btn("#3b82f6"), width: "100%", justifyContent: "center",
                    marginTop: 8, padding: "12px 16px",
                  }}
                >
                  {Icons.chat()} Перейти в чат с покупателем
                </button>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  onClick={() => { toggleTask(selectedTaskDetail.id); setSelectedTaskDetail(null); }}
                  style={{ ...S.btn(selectedTaskDetail.completed ? "#64748b" : "#22c55e"), flex: 1, justifyContent: "center" }}
                >
                  {Icons.check()} {selectedTaskDetail.completed ? "Вернуть в работу" : "Выполнить"}
                </button>
                <button
                  onClick={() => { deleteTask(selectedTaskDetail.id); setSelectedTaskDetail(null); }}
                  style={{ ...S.btn("#ef4444"), justifyContent: "center", padding: "8px 16px" }}
                >
                  {Icons.x()} Удалить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
