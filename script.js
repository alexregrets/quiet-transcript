const mobileButtons = document.querySelectorAll("[data-mobile-screen]");
const mobileScreens = document.querySelectorAll(".mobile-screen");
const navItems = document.querySelectorAll(".nav-item");

const desktopButtons = document.querySelectorAll("[data-desktop-panel]");
const desktopPanels = document.querySelectorAll(".desktop-panel");
const desktopTabs = document.querySelectorAll(".desktop-tab");
const sidebarLinks = document.querySelectorAll(".sidebar-link[data-desktop-panel]");

const toast = document.getElementById("toast");
const toastButtons = document.querySelectorAll("[data-toast]");
const suggestionButtons = document.querySelectorAll("[data-assistant]");
const assistantInput = document.getElementById("assistant-input");
const assistantSend = document.getElementById("assistant-send");
const chatCard = document.getElementById("chat-card");
const submitReport = document.getElementById("submit-report");
const advanceStatus = document.getElementById("advance-status");
const statusTitle = document.getElementById("status-title");
const statusDepartment = document.getElementById("status-department");
const statusPill = document.getElementById("status-pill");
const statusTimeline = document.getElementById("status-timeline");
const redeemButtons = document.querySelectorAll(".redeem-button");
const pointsValue = document.getElementById("points-value");
const citizenLevel = document.getElementById("citizen-level");

const filterButtons = document.querySelectorAll("[data-filter]");
const mapNodes = document.querySelectorAll(".map-node");
const sensorCount = document.getElementById("sensor-count");
const urgentCount = document.getElementById("urgent-count");
const mapPriority = document.getElementById("map-priority");
const mapCaseTitle = document.getElementById("map-case-title");
const mapAiSummary = document.getElementById("map-ai-summary");
const mapTeam = document.getElementById("map-team");
const mapNextAction = document.getElementById("map-next-action");

let toastTimer;
let currentPoints = 1280;
let statusStep = 0;

const assistantAnswers = {
  "Проверить мое обращение": "Ваше обращение #CB-2048 уже назначено технику. Ожидаемое устранение проблемы с освещением в течение 24 часов.",
  "Найти сервис": "Я могу подобрать сервис по жизненной ситуации: документы, транспорт, семья, налоги, коммунальные услуги или участие в опросах.",
  "Объяснить документы": "Я могу разложить любой процесс на простые шаги, подсказать список документов и помочь с заполнением формы без бюрократических терминов."
};

const filterContent = {
  all: {
    sensors: "Датчики: 182",
    urgent: "Срочные кейсы: 12",
    priority: "Срочно",
    title: "#CB-2048 Сбой уличного освещения",
    summary: "Кластер из 4 обращений рядом со школьным маршрутом. Рекомендована эскалация до вечернего пика.",
    team: "Public Works North Zone",
    action: "Выезд техника подтвержден на 16:30."
  },
  lighting: {
    sensors: "Датчики: 74",
    urgent: "Срочные кейсы: 6",
    priority: "Высокий",
    title: "#CB-2048 Не работает фонарь",
    summary: "Проблема влияет на безопасность пешеходов и вечернюю доступность маршрута к школе.",
    team: "Public Works North Zone",
    action: "Ремонт бригады подтвержден на сегодня."
  },
  roads: {
    sensors: "Датчики: 52",
    urgent: "Срочные кейсы: 3",
    priority: "Средний",
    title: "#CB-1981 Повреждение дорожного покрытия",
    summary: "AI отметил повторяемость жалоб и риск перед утренним трафиком.",
    team: "Road Maintenance Team",
    action: "Инспекция участка в 13:00."
  },
  waste: {
    sensors: "Датчики: 56",
    urgent: "Срочные кейсы: 3",
    priority: "Средний",
    title: "#CB-2017 Переполненный контейнер",
    summary: "Система связывает рост жалоб с ближайшим городским событием и высокой нагрузкой на точку.",
    team: "Sanitation District Center",
    action: "Дополнительный вывоз включен в маршрут на 14:00."
  }
};

function showToast(message) {
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 3200);
}

function activateMobileScreen(screenId) {
  mobileScreens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === `screen-${screenId}`);
  });

  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.mobileScreen === screenId);
  });
}

function activateDesktopPanel(panelId) {
  desktopPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `panel-${panelId}`);
  });

  desktopTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.desktopPanel === panelId);
  });

  sidebarLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.desktopPanel === panelId);
  });
}

function appendChatMessage(role, text) {
  const message = document.createElement("div");
  message.className = `chat-message ${role}`;
  message.textContent = text;
  chatCard.appendChild(message);
  chatCard.scrollTop = chatCard.scrollHeight;
}

function updatePoints(nextPoints) {
  currentPoints = nextPoints;
  pointsValue.textContent = currentPoints.toLocaleString("ru-RU");
  citizenLevel.textContent = currentPoints >= 1000 ? "Чемпион района" : "Активный житель";
}

function renderStatus(step) {
  if (step === 0) {
    statusPill.textContent = "В работе";
    statusTitle.textContent = "Ремонт уличного фонаря";
    statusDepartment.textContent = "Назначено в Public Works North Zone";
    statusTimeline.innerHTML = `
      <div class="timeline-item done">
        <span class="dot"></span>
        <div>
          <strong>Обращение создано</strong>
          <p>Сегодня, 09:12</p>
        </div>
      </div>
      <div class="timeline-item done">
        <span class="dot"></span>
        <div>
          <strong>Автоклассификация и отправка в отдел</strong>
          <p>Сегодня, 09:14</p>
        </div>
      </div>
      <div class="timeline-item current">
        <span class="dot"></span>
        <div>
          <strong>Назначен техник</strong>
          <p>Ожидаемое устранение в течение 24 часов</p>
        </div>
      </div>
    `;
  }

  if (step === 1) {
    statusPill.textContent = "На выезде";
    statusDepartment.textContent = "Бригада уже в пути";
    statusTimeline.innerHTML += `
      <div class="timeline-item current">
        <span class="dot"></span>
        <div>
          <strong>Техник выехал на место</strong>
          <p>Сегодня, 15:40</p>
        </div>
      </div>
    `;
    showToast("Смоделирован следующий этап: бригада выехала на место.");
  }

  if (step === 2) {
    statusPill.textContent = "Решено";
    statusDepartment.textContent = "Задача закрыта и подтверждена системой";
    statusTimeline.innerHTML += `
      <div class="timeline-item done">
        <span class="dot"></span>
        <div>
          <strong>Проблема устранена</strong>
          <p>Сегодня, 17:05</p>
        </div>
      </div>
    `;
    advanceStatus.textContent = "Показать уведомление жителю";
    showToast("Кейс переведен в статус «Решено».");
  }

  if (step >= 3) {
    appendChatMessage("assistant", "Я вижу, что обращение #CB-2048 успешно закрыто. Если хотите, я помогу оценить качество решения или подать новое обращение.");
    showToast("Жителю отправлено уведомление о завершении обращения.");
  }
}

function applyMapFilter(filter) {
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === filter);
  });

  mapNodes.forEach((node) => {
    const matches = filter === "all" || node.classList.contains(`filter-${filter}`);
    node.classList.toggle("is-muted", !matches);
    node.classList.toggle("is-highlighted", matches && filter !== "all");
  });

  const content = filterContent[filter];
  sensorCount.textContent = content.sensors;
  urgentCount.textContent = content.urgent;
  mapPriority.textContent = content.priority;
  mapCaseTitle.textContent = content.title;
  mapAiSummary.textContent = content.summary;
  mapTeam.textContent = content.team;
  mapNextAction.textContent = content.action;
}

mobileButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activateMobileScreen(button.dataset.mobileScreen);
  });
});

desktopButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activateDesktopPanel(button.dataset.desktopPanel);
  });
});

toastButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showToast(button.dataset.toast);
  });
});

suggestionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const prompt = button.dataset.assistant;
    assistantInput.value = prompt;
    appendChatMessage("user", prompt);
    appendChatMessage("assistant", assistantAnswers[prompt] || "Я подготовил краткий ответ и могу провести вас дальше по шагам.");
  });
});

assistantSend.addEventListener("click", () => {
  const prompt = assistantInput.value.trim();
  if (!prompt) {
    showToast("Введите вопрос для AI-ассистента.");
    return;
  }

  appendChatMessage("user", prompt);

  let answer = "Я могу помочь с этим запросом: найти услугу, разложить процесс по шагам и показать, какие действия можно сделать онлайн.";
  if (prompt.toLowerCase().includes("док")) {
    answer = "Для подачи документов я предложу список бумаг, заполню форму вместе с вами и сохраню прогресс в цифровом профиле.";
  } else if (prompt.toLowerCase().includes("статус") || prompt.toLowerCase().includes("обращ")) {
    answer = "Статус обращения можно отследить без звонков: система покажет отдел, срок, этап выполнения и уведомления.";
  } else if (prompt.toLowerCase().includes("оплат")) {
    answer = "Платежи объединены в один раздел: парковка, налоги, коммунальные и другие муниципальные сервисы.";
  }

  appendChatMessage("assistant", answer);
});

assistantInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    assistantSend.click();
  }
});

submitReport.addEventListener("click", () => {
  activateMobileScreen("status");
  statusStep = 0;
  renderStatus(0);
  showToast("Обращение отправлено. Система классифицировала проблему и передала ее в нужный отдел.");
});

advanceStatus.addEventListener("click", () => {
  statusStep += 1;
  renderStatus(statusStep);
});

redeemButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const cost = Number(button.dataset.cost);
    const reward = button.dataset.reward;

    if (button.disabled) {
      showToast(`Награда «${reward}» уже активирована.`);
      return;
    }

    if (currentPoints < cost) {
      showToast(`Недостаточно баллов для награды «${reward}».`);
      return;
    }

    updatePoints(currentPoints - cost);
    button.disabled = true;
    button.textContent = "Активировано";
    showToast(`Награда «${reward}» успешно активирована.`);
  });
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyMapFilter(button.dataset.filter);
  });
});

activateMobileScreen("home");
activateDesktopPanel("dashboard");
applyMapFilter("all");
