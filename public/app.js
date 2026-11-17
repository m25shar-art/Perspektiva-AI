let currentUser = JSON.parse(localStorage.getItem('perspektiva_user') || 'null');
let regStep1Data = {};
let selectedClasses = [];
let chatHistory = [];
let currentChatId = null;
let selectedFiles = [];
let activeMode = 'normal';
let selectedAspectRatio = '16:9';
let activeTool = null;
let activeAgent = null;
let recognition = null;
let isRecording = false;

const AGENT_AVATARS = [
  { emoji: '🦉', bg: '#FEF3C7' },
  { emoji: '🤖', bg: '#DBEAFE' },
  { emoji: '🌍', bg: '#DCFCE7' },
  { emoji: '📚', bg: '#FCE7F3' },
  { emoji: '💻', bg: '#E0E7FF' },
  { emoji: '🔬', bg: '#E0F2FE' },
  { emoji: '💼', bg: '#F3F4F6' },
  { emoji: '🚀', bg: '#F3E8FF' },
  { emoji: '🧮', bg: '#CCFBF1' },
  { emoji: '🎨', bg: '#FFE4E6' },
  { emoji: '🦊', bg: '#FFEDD5' },
  { emoji: '🏆', bg: '#FEF9C3' },
];

let modalSelectedAvatar = AGENT_AVATARS[0];

const DEFAULT_AGENTS = [
  {
    id: 'agent-oge-inf',
    name: 'Эксперт ОГЭ Информатика',
    emoji: '🦉',
    bg: '#FEF3C7',
    instructions: 'Ты эксперт ОГЭ и ЕГЭ по информатике. Объясняй решения пошагово, приводи код на Python с комментариями.',
    defaultModel: 'cc/claude-sonnet-5-5',
  },
  {
    id: 'agent-klassruk',
    name: 'Помощник кл. руководителя',
    emoji: '🤖',
    bg: '#DBEAFE',
    instructions: 'Ты опытный классный руководитель. Помогай писать тёплые посты в школьный ВК, сценарии классных часов и письма родителям.',
    defaultModel: 'ag/gemini-3.1-flash-lite-preview',
  },
];

const TOOLS_CONFIG = [
  { id: 'lesson', icon: 'book-open', title: 'План урока по ФГОС', desc: 'Цели, этапы, тайминг и задания' },
  { id: 'test', icon: 'file-check-2', title: 'Генератор теста', desc: 'Вопросы с вариантами и ключами' },
  { id: 'check', icon: 'check-circle-2', title: 'Проверка работы', desc: 'Поиск ошибок и разбор ученику' },
  { id: 'slides', icon: 'presentation', title: 'Структура презентации', desc: 'Тезисы по слайдам и картинки' },
  { id: 'adapt', icon: 'sliders-horizontal', title: 'Адаптация текста', desc: 'Упрощение или усложнение уровня' },
  { id: 'parents', icon: 'message-square-heart', title: 'Памятка родителям', desc: 'Сообщение для родительского чата' },
];

document.addEventListener('DOMContentLoaded', () => {
  initClassesGrid();
  refreshIcons();
  updateSendButtonState();
  if (currentUser) openChatWorkspace();
});

function refreshIcons() {
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  refreshIcons();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function initClassesGrid() {
  const grid = document.getElementById('classes-grid');
  if (!grid) return;
  for (let i = 1; i <= 11; i++) {
    const div = document.createElement('div');
    div.className = 'class-chip';
    div.textContent = `${i} класс`;
    div.onclick = () => {
      div.classList.toggle('selected');
      if (selectedClasses.includes(i)) selectedClasses = selectedClasses.filter((c) => c !== i);
      else selectedClasses.push(i);
    };
    grid.appendChild(div);
  }
}

function getInitials(fullName) {
  const parts = (fullName || 'У').trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0][0].toUpperCase();
}

function getFirstAndMiddleName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length >= 3) return `${parts[1]} ${parts[2]}`;
  if (parts.length === 2) return parts[1];
  return parts[0] || 'коллега';
}

function renderDailyCredits(val) {
  const rem = typeof val === 'number' ? val : (currentUser?.dailyCredits ?? 1000);
  document.getElementById('user-credits').textContent = rem.toLocaleString('ru-RU');
  const pct = Math.max(0, Math.min(100, (rem / 1000) * 100));
  document.getElementById('credits-progress').style.width = `${pct}%`;
}

// Авторизация / Регистрация
async function sendVerificationCode() {
  const email = document.getElementById('reg-email').value.trim();
  if (!email) return alert('Введите электронную почту');

  const btn = document.getElementById('btn-send-code');
  btn.disabled = true;
  btn.textContent = 'Отправка...';

  const res = await fetch('/api/auth/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  btn.disabled = false;
  btn.textContent = 'Отправить код';

  const status = document.getElementById('code-status');
  status.textContent = data.success
    ? (data.devHint ? `Отправлено! ${data.devHint}` : 'Код отправлен на вашу почту.')
    : (data.error || 'Ошибка отправки');
}

document.getElementById('reg-step1-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const pass = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  if (pass !== pass2) return alert('Пароли не совпадают!');

  regStep1Data = {
    fullName: document.getElementById('reg-fullname').value.trim(),
    phone: document.getElementById('reg-phone').value.trim(),
    email: document.getElementById('reg-email').value.trim(),
    emailCode: document.getElementById('reg-code').value.trim(),
    password: pass,
  };
  showView('view-reg-2');
});

document.getElementById('reg-step2-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (selectedClasses.length === 0) return alert('Выберите хотя бы один класс');

  const payload = {
    ...regStep1Data,
    classes: selectedClasses.sort((a, b) => a - b),
    subject: document.getElementById('reg-subject').value.trim(),
  };

  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Ошибка регистрации');

  currentUser = data.user;
  localStorage.setItem('perspektiva_user', JSON.stringify(currentUser));
  openChatWorkspace();
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: document.getElementById('login-email').value.trim(),
      password: document.getElementById('login-password').value,
    }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'Ошибка входа');

  currentUser = data.user;
  localStorage.setItem('perspektiva_user', JSON.stringify(currentUser));
  openChatWorkspace();
});

async function devLogin() {
  try {
    const res = await fetch('/api/auth/dev-login', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
    } else {
      throw new Error('Fallback');
    }
  } catch {
    currentUser = {
      id: 'dev-teacher-1',
      fullName: 'Смирнова Елена Викторовна',
      email: 'dev@perspektiva.ru',
      classes: [7, 8, 9],
      subject: 'Информатика',
      dailyCredits: 1000,
    };
  }
  localStorage.setItem('perspektiva_user', JSON.stringify(currentUser));
  openChatWorkspace();
}

function updatePersonalizedUI() {
  const subj = currentUser.subject || 'ваш предмет';
  const clsNum = currentUser.classes?.length ? currentUser.classes[0] : 7;
  document.getElementById('user-name').textContent = currentUser.fullName;
  document.getElementById('user-avatar').textContent = getInitials(currentUser.fullName);
  document.getElementById('user-meta').textContent = `${subj} • ${currentUser.classes.join(', ')} кл.`;
  renderDailyCredits();
  document.getElementById('chat-input').placeholder =
    `Например: Составь конспект урока по предмету «${subj}» для ${clsNum} класса...`;
}

function openChatWorkspace() {
  updatePersonalizedUI();
  renderAgentsList();
  renderHistoryList();
  newChat(true);
  showView('view-chat');
}

function logout() {
  localStorage.removeItem('perspektiva_user');
  currentUser = null;
  showView('view-landing');
}

function openProfileModal() {
  document.getElementById('modal-subject').value = currentUser.subject || '';
  document.getElementById('modal-classes').value = (currentUser.classes || []).join(', ');
  document.getElementById('profile-modal').style.display = 'flex';
}
function closeProfileModal() { document.getElementById('profile-modal').style.display = 'none'; }
function saveProfileModal() {
  const subj = document.getElementById('modal-subject').value.trim();
  const clsRaw = document.getElementById('modal-classes').value.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n >= 1 && n <= 11);
  if (subj) currentUser.subject = subj;
  if (clsRaw.length) currentUser.classes = clsRaw;
  localStorage.setItem('perspektiva_user', JSON.stringify(currentUser));
  closeProfileModal();
  updatePersonalizedUI();
  if (chatHistory.length === 0) showWelcomeScreen();
}

// Управление ИИ-агентами
function getAgents() {
  if (!currentUser) return DEFAULT_AGENTS;
  const key = `perspektiva_agents_${currentUser.id}`;
  let list = JSON.parse(localStorage.getItem(key) || 'null');
  if (!list) {
    list = DEFAULT_AGENTS;
    localStorage.setItem(key, JSON.stringify(list));
  }
  return list;
}

function renderAgentsList() {
  const container = document.getElementById('agents-list');
  if (!container) return;
  const agents = getAgents();
  container.innerHTML = agents
    .map((a) => {
      const avHtml = a.customImage ? `<img src="${a.customImage}" alt="" />` : a.emoji;
      return `
      <button class="agent-item ${activeAgent?.id === a.id ? 'active' : ''}" onclick="selectAgent('${a.id}')">
        <span class="agent-mini-avatar" style="background:${a.bg || '#E5E7EB'}">${avHtml}</span>
        <span class="agent-item-name">${a.name}</span>
      </button>`;
    })
    .join('');
}

function updateHeaderAgentBadge() {
  const badge = document.getElementById('header-agent-badge');
  if (!badge) return;
  if (!activeAgent) {
    badge.style.display = 'none';
    return;
  }
  const avHtml = activeAgent.customImage ? `<img src="${activeAgent.customImage}" alt="" />` : activeAgent.emoji;
  badge.innerHTML = `
    <span class="agent-mini-avatar" style="background:${activeAgent.bg || '#E5E7EB'}">${avHtml}</span>
    <span>${activeAgent.name}</span>
  `;
  badge.style.display = 'inline-flex';
}

function selectAgent(agentId) {
  const agent = getAgents().find((a) => a.id === agentId);
  if (!agent) return;
  activeAgent = agent;
  if (agent.defaultModel) {
    document.getElementById('model-select').value = agent.defaultModel;
  }
  newChat(false);
  renderAgentsList();
  updateHeaderAgentBadge();
}

function openAgentModal() {
  modalSelectedAvatar = AGENT_AVATARS[0];
  document.getElementById('agent-name').value = '';
  document.getElementById('agent-instructions').value = '';
  document.getElementById('agent-default-model').value = 'gpt-6.1-terra';

  const grid = document.getElementById('avatar-picker-grid');
  grid.innerHTML = AGENT_AVATARS.map(
    (av, idx) => `
    <div class="avatar-option ${idx === 0 ? 'selected' : ''}" style="background:${av.bg}" onclick="pickPresetAvatar(${idx}, this)">
      ${av.emoji}
    </div>`
  ).join('');
  document.getElementById('agent-modal').style.display = 'flex';
  refreshIcons();
}

function closeAgentModal() { document.getElementById('agent-modal').style.display = 'none'; }

function pickPresetAvatar(idx, el) {
  modalSelectedAvatar = { ...AGENT_AVATARS[idx], customImage: null };
  document.querySelectorAll('.avatar-option').forEach((o) => o.classList.remove('selected'));
  el.classList.add('selected');
}

function handleAgentAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    modalSelectedAvatar = { emoji: '', bg: '#F3F4F6', customImage: e.target.result };
    document.querySelectorAll('.avatar-option').forEach((o) => o.classList.remove('selected'));
  };
  reader.readAsDataURL(file);
}

function saveNewAgent() {
  const name = document.getElementById('agent-name').value.trim();
  const instructions = document.getElementById('agent-instructions').value.trim();
  const defaultModel = document.getElementById('agent-default-model').value;
  if (!name || !instructions) return alert('Укажите имя агента и его инструкцию!');

  const newAgent = {
    id: 'agent-' + Date.now(),
    name,
    emoji: modalSelectedAvatar.emoji,
    bg: modalSelectedAvatar.bg,
    customImage: modalSelectedAvatar.customImage || null,
    instructions,
    defaultModel,
  };

  const agents = getAgents();
  agents.unshift(newAgent);
  localStorage.setItem(`perspektiva_agents_${currentUser.id}`, JSON.stringify(agents));
  closeAgentModal();
  selectAgent(newAgent.id);
}

// Режимы (Веб-поиск, Генерация фото + пропорции)
function toggleMode(mode) {
  activeMode = activeMode === mode ? 'normal' : mode;
  document.getElementById('btn-mode-web').classList.toggle('active', activeMode === 'web');
  document.getElementById('btn-mode-image').classList.toggle('active', activeMode === 'image');
  document.getElementById('image-options-bar').style.display = activeMode === 'image' ? 'flex' : 'none';
}

function setAspectRatio(ratio, btn) {
  selectedAspectRatio = ratio;
  document.querySelectorAll('#aspect-group .aspect-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
}

function handleFileSelect(event) {
  selectedFiles = Array.from(event.target.files);
  const preview = document.getElementById('attached-files-preview');
  preview.innerHTML = selectedFiles.map((f) => `<span class="file-chip">${f.name}</span>`).join('');
  updateSendButtonState();
}

function toggleVoiceInput() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) return alert('Голосовой ввод поддерживается в браузерах Chrome, Яндекс и Edge.');

  const btn = document.getElementById('btn-voice');
  if (isRecording && recognition) { recognition.stop(); return; }

  recognition = new SpeechRec();
  recognition.lang = 'ru-RU';
  recognition.interimResults = false;
  recognition.onstart = () => { isRecording = true; btn.classList.add('recording'); };
  recognition.onend = () => { isRecording = false; btn.classList.remove('recording'); };
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const input = document.getElementById('chat-input');
    input.value = (input.value ? input.value + ' ' : '') + transcript;
    updateSendButtonState();
    input.focus();
  };
  recognition.start();
}

function updateSendButtonState() {
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('btn-send');
  if (!input || !btn) return;
  btn.disabled = input.value.trim().length === 0 && selectedFiles.length === 0;
}

document.getElementById('chat-input').addEventListener('input', updateSendButtonState);

function openToolFilter(toolId) {
  activeTool = toolId;
  const bar = document.getElementById('tool-filter-bar');
  const classes = currentUser?.classes?.length ? currentUser.classes : [5, 6, 7, 8, 9, 10, 11];
  const classOptions = classes.map((c) => `<option value="${c}">${c} класс</option>`).join('');

  const configs = {
    lesson: {
      label: 'План урока',
      extra: `
        <div class="filter-field"><label>Тема:</label><input id="tf-topic" placeholder="Введите тему урока..." /></div>
        <div class="filter-field"><label>Тип:</label>
          <select id="tf-extra"><option>Открытие новых знаний</option><option>Закрепление материала</option><option>Контроль знаний</option><option>Комбинированный урок</option></select>
        </div>`,
    },
    test: {
      label: 'Генератор теста',
      extra: `
        <div class="filter-field"><label>Тема:</label><input id="tf-topic" placeholder="Введите тему теста..." /></div>
        <div class="filter-field"><label>Вопросов:</label>
          <select id="tf-extra"><option>5</option><option selected>10</option><option>15</option><option>20</option></select>
        </div>`,
    },
    check: {
      label: 'Проверка работы',
      extra: `
        <div class="filter-field"><label>Тип работы:</label>
          <select id="tf-topic"><option>Сочинение</option><option>Эссе</option><option>Изложение</option><option>Ответ на вопрос</option></select>
        </div>
        <div class="filter-field"><label>Критерии:</label>
          <select id="tf-extra"><option>По стандарту ФГОС / ЕГЭ</option><option>Поддерживающая проверка</option></select>
        </div>`,
    },
    slides: {
      label: 'Презентация',
      extra: `
        <div class="filter-field"><label>Тема:</label><input id="tf-topic" placeholder="Тема презентации..." /></div>
        <div class="filter-field"><label>Слайдов:</label>
          <select id="tf-extra"><option>6</option><option selected>8</option><option>10</option><option>12</option></select>
        </div>`,
    },
    adapt: {
      label: 'Адаптация текста',
      extra: `
        <div class="filter-field"><label>Для кого:</label>
          <select id="tf-topic"><option>Для слабоуспевающих</option><option>Для одарённых учеников</option><option>Простым языком</option></select>
        </div>
        <div class="filter-field"><label>Формат:</label>
          <select id="tf-extra"><option>Учебный текст</option><option>Краткий конспект</option></select>
        </div>`,
    },
    parents: {
      label: 'Памятка родителям',
      extra: `
        <div class="filter-field"><label>Повод:</label><input id="tf-topic" placeholder="Например: подготовка к ВПР..." /></div>
        <div class="filter-field"><label>Тон:</label>
          <select id="tf-extra"><option>Дружелюбный</option><option>Официальный</option></select>
        </div>`,
    },
  };

  const cfg = configs[toolId];
  bar.innerHTML = `
    <span class="filter-badge">${cfg.label}</span>
    <div class="filter-field"><label>Класс:</label><select id="tf-class">${classOptions}</select></div>
    ${cfg.extra}
    <button type="button" class="filter-close-btn" onclick="closeToolFilter()" title="Убрать фильтр">
      <i data-lucide="x"></i>
    </button>
  `;
  bar.style.display = 'flex';
  refreshIcons();
  const topicInput = document.getElementById('tf-topic');
  if (topicInput && topicInput.tagName === 'INPUT') {
    topicInput.focus();
    topicInput.addEventListener('input', () => {
      document.getElementById('btn-send').disabled = topicInput.value.trim().length === 0;
    });
  }
}

function closeToolFilter() {
  activeTool = null;
  const bar = document.getElementById('tool-filter-bar');
  bar.style.display = 'none';
  bar.innerHTML = '';
  updateSendButtonState();
}

function buildPromptFromFilter(userText) {
  if (!activeTool) return userText;
  const cls = document.getElementById('tf-class')?.value || '7';
  const topic = document.getElementById('tf-topic')?.value?.trim() || userText || 'по текущей программе';
  const extra = document.getElementById('tf-extra')?.value || '';
  const subj = currentUser?.subject || 'школьный предмет';

  const prompts = {
    lesson: `Составь подробный план-конспект урока по ФГОС.\nПредмет: ${subj}, ${cls} класс.\nТема: ${topic}.\nТип урока: ${extra}.\nВключи: цели, планируемые результаты, этапы с таймингом, задания и рефлексию.`,
    test: `Составь тест по предмету «${subj}» для ${cls} класса.\nТема: ${topic}.\nКоличество вопросов: ${extra}.\nДай варианты ответов и таблицу с ключами в конце.`,
    check: `Проверь работу ученика (${subj}, ${cls} класс, вид работы: ${topic}, подход: ${extra}). Укажи ошибки, сильные стороны и предложи оценку.\n\nТекст работы:\n${userText}`,
    slides: `Составь структуру презентации по предмету «${subj}» для ${cls} класса.\nТема: ${topic}.\nКоличество слайдов: ${extra}.\nДля каждого слайда напиши заголовок, тезисы и идею иллюстрации.`,
    adapt: `Адаптируй материал по предмету «${subj}» (${cls} класс).\nЦель: ${topic}, формат: ${extra}.\n\nИсходный текст или тема:\n${userText}`,
    parents: `Напиши вежливую и понятную памятку для родительского чата (${cls} класс, предмет: ${subj}).\nПовод: ${topic}.\nТон: ${extra}.`,
  };

  let finalPrompt = prompts[activeTool];
  if (userText && activeTool !== 'check' && activeTool !== 'adapt') {
    finalPrompt += `\nДополнительные пожелания: ${userText}`;
  }
  closeToolFilter();
  return finalPrompt;
}

function showWelcomeScreen() {
  const box = document.getElementById('chat-messages');

  if (activeAgent) {
    const avHtml = activeAgent.customImage ? `<img src="${activeAgent.customImage}" alt="" />` : activeAgent.emoji;
    box.innerHTML = `
      <div class="welcome-screen">
        <div class="agent-welcome-avatar" style="background:${activeAgent.bg || '#E5E7EB'}">${avHtml}</div>
        <h2>${activeAgent.name}</h2>
        <p class="agent-welcome-sub">Готов к работе! Пришлите задание или задайте вопрос.</p>
        <div class="profile-pill">
          <span>Персональный агент</span>
          <button class="profile-edit-link" onclick="newChat(true)">(вернуться к обычному чату)</button>
        </div>
      </div>`;
  } else {
    const name = getFirstAndMiddleName(currentUser?.fullName);
    const subj = currentUser?.subject || 'Не указан';
    const cls = currentUser?.classes?.length ? `${currentUser.classes.join(', ')} кл.` : 'все классы';

    box.innerHTML = `
      <div class="welcome-screen">
        <h2>Здравствуйте, ${name}! Чем займёмся сегодня?</h2>
        <div class="profile-pill">
          <span>Активный профиль: <strong>${subj}, ${cls}</strong></span>
          <button class="profile-edit-link" onclick="openProfileModal()">(изменить)</button>
        </div>
      </div>`;
  }

  document.getElementById('welcome-cards-grid').innerHTML = TOOLS_CONFIG.map(
    (t) => `
    <div class="welcome-card" onclick="openToolFilter('${t.id}')">
      <div class="welcome-card-icon"><i data-lucide="${t.icon}"></i></div>
      <div>
        <div class="welcome-card-title">${t.title}</div>
        <div class="welcome-card-desc">${t.desc}</div>
      </div>
      <i data-lucide="arrow-up-right" class="welcome-card-arrow"></i>
    </div>`
  ).join('');
  refreshIcons();
}

function newChat(resetAgent = false) {
  if (resetAgent) {
    activeAgent = null;
    renderAgentsList();
  }
  updateHeaderAgentBadge();
  currentChatId = Date.now().toString();
  chatHistory = [];
  closeToolFilter();
  document.getElementById('chat-main').classList.add('is-empty');
  showWelcomeScreen();
  renderHistoryList();
  updateSendButtonState();
}

function getSavedChats() {
  if (!currentUser) return [];
  return JSON.parse(localStorage.getItem(`perspektiva_chats_${currentUser.id}`) || '[]');
}

function saveCurrentChat() {
  if (!currentUser || chatHistory.length === 0) return;
  const chats = getSavedChats();
  const firstUserMsg = chatHistory.find((m) => m.role === 'user')?.content || 'Новый диалог';
  const title = firstUserMsg.split('\n')[0].slice(0, 36) + (firstUserMsg.length > 36 ? '...' : '');
  const idx = chats.findIndex((c) => c.id === currentChatId);
  const entry = {
    id: currentChatId,
    title,
    agentId: activeAgent?.id || null,
    messages: chatHistory,
    updatedAt: Date.now(),
  };
  if (idx >= 0) chats[idx] = entry;
  else chats.unshift(entry);
  localStorage.setItem(`perspektiva_chats_${currentUser.id}`, JSON.stringify(chats.slice(0, 40)));
  renderHistoryList();
}

function renderHistoryList() {
  const list = document.getElementById('chat-history-list');
  if (!list) return;
  const chats = getSavedChats();
  if (chats.length === 0) {
    list.innerHTML = `<div class="history-empty"><i data-lucide="history"></i> Пока нет сохранённых диалогов</div>`;
    refreshIcons();
    return;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDay = 86400000;
  const groups = { 'Сегодня': [], 'Вчера': [], 'Предыдущие 7 дней': [], 'Ранее': [] };

  chats.forEach((c) => {
    const t = c.updatedAt || Date.now();
    if (t >= startOfToday) groups['Сегодня'].push(c);
    else if (t >= startOfToday - oneDay) groups['Вчера'].push(c);
    else if (t >= startOfToday - 7 * oneDay) groups['Предыдущие 7 дней'].push(c);
    else groups['Ранее'].push(c);
  });

  let html = '';
  for (const [label, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    html += `<div class="history-group-title">${label}</div>`;
    html += items
      .map(
        (c) => `
      <button class="history-item ${c.id === currentChatId ? 'active' : ''}" onclick="loadChat('${c.id}')" title="${c.title}">
        <i data-lucide="message-square"></i><span>${c.title}</span>
      </button>`
      )
      .join('');
  }
  list.innerHTML = html;
  refreshIcons();
}

function loadChat(chatId) {
  const chat = getSavedChats().find((c) => c.id === chatId);
  if (!chat) return;
  currentChatId = chat.id;
  chatHistory = [...chat.messages];
  activeAgent = chat.agentId ? getAgents().find((a) => a.id === chat.agentId) || null : null;
  renderAgentsList();
  updateHeaderAgentBadge();

  document.getElementById('chat-main').classList.remove('is-empty');
  const box = document.getElementById('chat-messages');
  box.innerHTML = '';
  chatHistory.forEach((m) => appendMessage(m.role, m.content, m.imageUrl || null, false, m.creditMeta || ''));
  renderHistoryList();
}

async function sendMessage(overrideText = null) {
  const input = document.getElementById('chat-input');
  let rawText = overrideText !== null ? overrideText : input.value.trim();

  if (overrideText === null && activeTool) {
    rawText = buildPromptFromFilter(rawText);
  }
  if (!rawText && selectedFiles.length === 0) return;

  document.getElementById('chat-main').classList.remove('is-empty');
  const box = document.getElementById('chat-messages');
  if (box.querySelector('.welcome-screen')) box.innerHTML = '';

  if (overrideText === null) {
    appendMessage('user', rawText || '[Прикреплённые файлы]');
    chatHistory.push({ role: 'user', content: rawText });
    input.value = '';
    updateSendButtonState();
  }

  const apiMessages = [...chatHistory];
  if (activeAgent) {
    apiMessages.unshift({
      role: 'system',
      content: `Ты агент "${activeAgent.name}". Инструкция: ${activeAgent.instructions}`,
    });
  }

  const formData = new FormData();
  formData.append('userId', currentUser.id);
  formData.append('modelId', document.getElementById('model-select').value);
  formData.append('imageModelId', document.getElementById('image-model-select').value);
  formData.append('aspectRatio', selectedAspectRatio);
  formData.append('messagesJson', JSON.stringify(apiMessages));
  formData.append('mode', activeMode);
  selectedFiles.forEach((f) => formData.append('files', f));

  selectedFiles = [];
  document.getElementById('attached-files-preview').innerHTML = '';

  const loadingEl = appendMessage('ai', 'Формирую ответ...', null, true);

  const res = await fetch('/api/chat', { method: 'POST', body: formData });
  const data = await res.json();
  loadingEl.remove();

  if (!res.ok) return appendMessage('ai', `Ошибка: ${data.error}`);

  const creditMeta = `Списано: ${data.creditsSpent} кр. • Модель: ${data.modelLabel}`;
  chatHistory.push({ role: 'assistant', content: data.reply, imageUrl: data.imageUrl, creditMeta });
  appendMessage('ai', data.reply, data.imageUrl, false, creditMeta);
  saveCurrentChat();

  currentUser.dailyCredits = data.remainingCredits;
  localStorage.setItem('perspektiva_user', JSON.stringify(currentUser));
  renderDailyCredits(data.remainingCredits);
}

function appendMessage(role, text, imageUrl = null, isLoading = false, creditMeta = '') {
  const box = document.getElementById('chat-messages');
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = `msg-avatar ${role}`;
  if (role === 'ai') {
    if (activeAgent) {
      avatar.style.background = activeAgent.bg || '#E5E7EB';
      avatar.innerHTML = activeAgent.customImage
        ? `<img src="${activeAgent.customImage}" alt="" />`
        : activeAgent.emoji;
    } else {
      avatar.innerHTML = '<i data-lucide="bot"></i>';
    }
  } else {
    avatar.textContent = getInitials(currentUser?.fullName);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (role === 'ai') {
    const contentDiv = document.createElement('div');
    contentDiv.className = 'markdown-body';
    contentDiv.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : text;
    bubble.appendChild(contentDiv);

    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.className = 'generated-img';
      bubble.appendChild(img);
    }

    if (creditMeta && !isLoading) {
      const metaDiv = document.createElement('div');
      metaDiv.className = 'msg-credit-meta';
      metaDiv.textContent = creditMeta;
      bubble.appendChild(metaDiv);
    }

    if (!isLoading) {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';

      const btnCopy = document.createElement('button');
      btnCopy.className = 'action-chip';
      btnCopy.innerHTML = '<i data-lucide="copy"></i> Копировать';
      btnCopy.onclick = () => copyFormatted(contentDiv, btnCopy);

      const btnWord = document.createElement('button');
      btnWord.className = 'action-chip';
      btnWord.innerHTML = '<i data-lucide="file-text"></i> Скачать в Word (.docx)';
      btnWord.onclick = () => downloadAsWord(contentDiv.innerHTML);

      const btnRegen = document.createElement('button');
      btnRegen.className = 'action-chip';
      btnRegen.innerHTML = '<i data-lucide="refresh-cw"></i> Перегенерировать';
      btnRegen.onclick = () => regenerateLastAnswer();

      actions.append(btnCopy, btnWord, btnRegen);
      bubble.appendChild(actions);
    }
  } else {
    bubble.textContent = text;
  }

  row.append(avatar, bubble);
  box.appendChild(row);
  refreshIcons();

  const scrollArea = document.getElementById('chat-scroll-area');
  scrollArea.scrollTop = scrollArea.scrollHeight;
  return row;
}

async function copyFormatted(element, btn) {
  try {
    const htmlBlob = new Blob([element.innerHTML], { type: 'text/html' });
    const textBlob = new Blob([element.innerText], { type: 'text/plain' });
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
  } catch {
    await navigator.clipboard.writeText(element.innerText);
  }
  const orig = btn.innerHTML;
  btn.innerHTML = '<i data-lucide="check"></i> Скопировано!';
  refreshIcons();
  setTimeout(() => {
    btn.innerHTML = orig;
    refreshIcons();
  }, 1800);
}

function downloadAsWord(htmlContent) {
  const fullHtml = `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><style>
      body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.5; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #999; padding: 6px; }
    </style></head><body>${htmlContent}</body></html>`;

  let blob;
  let ext = 'docx';
  if (typeof htmlDocx !== 'undefined') {
    blob = htmlDocx.asBlob(fullHtml);
  } else {
    blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });
    ext = 'doc';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Материал_Перспектива.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

function regenerateLastAnswer() {
  if (chatHistory.length < 2) return;
  if (chatHistory[chatHistory.length - 1].role === 'assistant') chatHistory.pop();
  const box = document.getElementById('chat-messages');
  if (box.lastElementChild && box.lastElementChild.classList.contains('ai')) box.lastElementChild.remove();
  sendMessage(chatHistory[chatHistory.length - 1]?.content || '');
}

document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!document.getElementById('btn-send').disabled) sendMessage();
  }
});