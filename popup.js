document.addEventListener('DOMContentLoaded', () => {
  // DOM элементы
  const elements = {
    tabButtons: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    siteUrl: document.getElementById('siteUrl'),
    blockButton: document.getElementById('blockButton'),
    blockedList: document.getElementById('blockedList'),
    parentalControls: document.getElementById('parentalControls'),
    siteToBlock: document.getElementById('siteToBlock'),
    addSiteBtn: document.getElementById('addSiteBtn'),
    blockedSitesList: document.getElementById('blockedSitesList'),
    blockSettingsModal: document.getElementById('blockSettingsModal'),
    blockTypeSelect: document.getElementById('blockTypeSelect'),
    blockStartTime: document.getElementById('blockStartTime'),
    blockEndTime: document.getElementById('blockEndTime'),
    saveBlockSettings: document.getElementById('saveBlockSettings'), // Исправлено имя
    removeSiteBtn: document.getElementById('removeSiteBtn'),
    modalSiteName: document.getElementById('modalSiteName'),
    dayButtons: document.querySelectorAll('.day-btn'),
    pinModal: document.getElementById('pinModal'),
    pinInput: document.getElementById('pinInput'),
    submitPinBtn: document.getElementById('submitPinBtn'),
    cancelPinBtn: document.getElementById('cancelPinBtn'),
    setPinModal: document.getElementById('setPinModal'),
    newPinInput: document.getElementById('newPinInput'),
    confirmPinInput: document.getElementById('confirmPinInput'),
    savePinBtn: document.getElementById('savePinBtn'),
    cancelSetPinBtn: document.getElementById('cancelSetPinBtn'),
    workSiteUrl: document.getElementById('workSiteUrl'),
    addWorkSiteButton: document.getElementById('addWorkSiteButton'),
    workSitesList: document.getElementById('workSitesList'),
    notification: document.getElementById('notification'),
    inactivityTimer: document.getElementById('inactivityTimer'),
    nonWorkTimer: document.getElementById('nonWorkTab'), // Оставлено как в HTML
    counterButtons: document.querySelectorAll('.counter-btn'),
    pauseWorkBtn: document.getElementById('pauseWorkSitesBtn'),
  };

  // Проверка, что все элементы найдены
  Object.entries(elements).forEach(([key, value]) => {
    if (!value || (value instanceof NodeList && value.length === 0)) {
      console.error(`Element ${key} not found in DOM`); // Исправлена кавычка
    }
  });

  // Состояние приложения
  const state = {
    currentTab: 'work',
    blockedSites: [],
    settings: { // Удалено siteList, так как не используется
      blockType: 'page',
      blockTime: '0',
      parentalBlockType: 'page',
    },
    parentalBlockedSites: [],
    currentEditingSite: null,
    currentPage: null,
    isParentalUnlocked: false,
    workSites: [],
    timers: {
      inactivityMinutes: 5, // Начальное значение
      nonWorkMinutes: 10, // Исправлено имя
    },
    isPaused: false,
  };

  // Инициализация приложения
  function init() {
    console.log('Initializing extension');
    loadBlockedSites();
    loadParentalSettings();
    loadWorkSites();
    loadTimers();
    setupCurrentTabUrl();
    setupEventListeners();
    switchTab('work').catch(err => console.error('Error initializing tab:', err));
  }

  // Загрузка сохраненных значений времени
  function loadTimers() {
    chrome.storage.local.get(['timers'], (result) => {
      state.timers.inactivityMinutes = result.timers?.inactivityTimer || 5;
      state.timers.nonWorkMinutes = result.timers?.nonWorkTimer || 10; // Исправлено имя
      elements.inactivityTimer.value = state.timers.inactivityMinutes;
      elements.nonWorkTimer.value = state.timers.nonWorkMinutes; // Исправлено имя
      updateBackgroundTimers();
    });
  }

  // Обновление таймеров в background.js
  function updateBackgroundTimers() {
    chrome.runtime.sendMessage({
      action: 'updateTimers',
      timers: {
        inactivityMinutes: Number(state.timers.inactivityMinutes),
        nonWorkMinutes: Number(state.timers.nonWorkMinutes),
      },
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('Error sending updateTimers message:', chrome.runtime.lastError.message);
      } else {
        console.log('updateTimers message sent, response:', response);
      }
    });
  }

  // Сохранение таймеров
  function saveTimers() {
    chrome.storage.local.set({
      timers: {
        inactivityTimer: state.timers.inactivityMinutes,
        nonWorkTimer: state.timers.nonWorkMinutes,
      },
    }, () => {
      console.log('Timers saved:', state.timers);
      updateBackgroundTimers();
    });
  }

  // Настройка обработчиков событий
  function setupEventListeners() {
    elements.tabButtons.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', async () => {
          if (btn.dataset.tab === 'parental' && !state.isParentalUnlocked) {
            await checkPinAndShowModal();
          } else {
            await switchTab(btn.dataset.tab);
          }
        });
      }
    });

    document.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.settings.blockType = btn.dataset.type;
      });
    });

    document.querySelectorAll('[data-time]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-time]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.settings.blockTime = btn.dataset.time;
      });
    });

    document.querySelectorAll('[data-parental-block-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-parental-block-type]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.settings.parentalBlockType = btn.dataset.parentalBlockType;
      });
    });

    if (elements.blockButton) {
      elements.blockButton.addEventListener('click', handleBlock);
    }

    if (elements.addSiteBtn) {
      elements.addSiteBtn.addEventListener('click', addSite);
    }

    if (elements.blockTypeSelect) {
      elements.blockTypeSelect.addEventListener('change', toggleScheduleSettings);
    }

    if (elements.saveBlockSettings) {
      elements.saveBlockSettings.addEventListener('click', saveBlockSettings);
    }

    if (elements.removeSiteBtn) {
      elements.removeSiteBtn.addEventListener('click', removeSite);
    }

    elements.dayButtons.forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          btn.classList.toggle('active');
        });
      }
    });

    if (elements.submitPinBtn) {
      elements.submitPinBtn.addEventListener('click', verifyPin);
    }

    if (elements.cancelPinBtn) {
      elements.cancelPinBtn.addEventListener('click', () => {
        elements.pinModal.classList.add('hidden');
        switchTab('block').catch(err => console.error('Error switching to block tab:', err));
      });
    }

    if (elements.savePinBtn) {
      elements.savePinBtn.addEventListener('click', saveNewPin);
    }

    if (elements.cancelSetPinBtn) {
      elements.cancelSetPinBtn.addEventListener('click', () => {
        elements.setPinModal.classList.add('hidden');
        switchTab('block').catch(err => console.error('Error switching to block tab:', err));
      });
    }

    if (elements.addWorkSiteButton) {
      elements.addWorkSiteButton.addEventListener('click', addWorkSite);
    }

    // Обработчик для счетчиков
    elements.counterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const timerType = btn.dataset.timer;
        const action = btn.dataset.action;
        const input = timerType === 'inactivity' ? elements.inactivityTimer : elements.nonWorkTimer;
        let value = parseInt(input.value);

        if (action === 'increment' && value < 60) {
          value += 1;
        } else if (action === 'decrement' && value > 1) {
          value -= 1;
        }

        input.value = value;
        state.timers[timerType === 'inactivity' ? 'inactivityMinutes' : 'nonWorkMinutes'] = value;
        saveTimers();
      });
    });

    // Обработчик для кнопки паузы
    if (elements.pauseWorkBtn) {
      elements.pauseWorkBtn.addEventListener('click', () => {
        state.isPaused = !state.isPaused; // Исправлено currentPaused
        state.workSites.forEach(s => {
          s.enabled = !state.isPaused;
        }); // Убрана лишняя скобка
        elements.pauseWorkBtn.classList.toggle('paused');
        elements.pauseWorkBtn.textContent = state.isPaused ? 'Возобновить' : 'Пауза';
        saveWorkSites();
      });
    }

    // Обработчик уведомлений от background.js
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { // Исправлена кавычка
      if (message.action === 'showNotification' && elements.notification) {
        elements.notification.textContent = message.message;
        elements.notification.style.display = 'block';
        setTimeout(() => {
          elements.notification.style.display = 'none';
        }, 10000); // Исправлено время и синтаксис
      }
    });
  }

  async function checkPinAndShowModal() {
    const result = await chrome.storage.local.get(['parentalPin']);
    const storedPin = result.parentalPin;

    if (!storedPin) {
      elements.setPinModal.classList.remove('hidden');
      elements.pinModal.classList.add('hidden');
      elements.parentalControls.classList.add('hidden');
    } else if (!state.isParentalUnlocked) {
      elements.pinModal.classList.remove('hidden');
      elements.setPinModal.classList.add('hidden');
      elements.parentalControls.classList.add('hidden');
    } else {
      elements.pinModal.classList.add('hidden');
      elements.setPinModal.classList.add('hidden');
      elements.parentalControls.classList.remove('hidden');
      await switchTab('parental');
    }
  }

  async function verifyPin() {
    const enteredPin = elements.pinInput.value.trim();
    if (!/^\d{4}$/.test(enteredPin)) {
      alert('Пин-код должен состоять из 4 цифр');
      elements.pinInput.value = '';
      return;
    }

    const result = await chrome.storage.local.get(['parentalPin']);
    const storedPin = result.parentalPin;

    if (enteredPin === storedPin) {
      state.isParentalUnlocked = true;
      elements.pinModal.classList.add('hidden');
      elements.parentalControls.classList.remove('hidden');
      await switchTab('parental');
    } else {
      alert('Неверный пин-код');
      elements.pinInput.value = '';
    }
  }

  async function saveNewPin() {
    const newPin = elements.newPinInput.value.trim(); // Исправлено обращение
    const confirmPin = elements.confirmPinInput.value.trim();

    if (!/^\d{4}$/.test(newPin)) { // Исправлено регулярное выражение
      alert('Пин-код должен состоять из 4 цифр');
      elements.newPinInput.value = '';
      elements.confirmPinInput.value = '';
      return;
    }

    if (newPin !== confirmPin) {
      alert('Пин-коды не совпадают');
      elements.newPinInput.value = '';
      elements.confirmPinInput.value = '';
      return;
    }

    await chrome.storage.local.set({ parentalPin: newPin });
    alert('Пин-код успешно установлен');
    elements.setPinModal.classList.add('hidden');
    state.isParentalUnlocked = true;
    elements.parentalControls.classList.remove('hidden');
    await switchTab('parental');
    elements.newPinInput.value = '';
    elements.confirmPinInput.value = '';
  }

  async function switchTab(tabId) {
    console.log('Switching to tab:', tabId);
    state.currentTab = tabId;

    elements.tabContents.forEach(tab => {
      if (tab) tab.classList.remove('active');
    });
    elements.tabButtons.forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    const tabContent = document.getElementById(`${tabId}Tab`);
    const tabButton = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);

    if (tabContent && tabButton) {
      tabContent.classList.add('active');
      tabButton.classList.add('active');
      if (elements.notification) elements.notification.style.display = 'none';
    } else {
      console.error(`Tab content or button not found for tabId: ${tabId}`);
    }

    if (tabId === 'list') updateBlockedList();
    if (tabId === 'parental' && state.isParentalUnlocked) {
      elements.parentalControls.classList.remove('hidden');
    }
    if (tabId === 'work') updateWorkSitesList();
  }

  function setupCurrentTabUrl() {
    if (!elements.siteUrl || !elements.workSiteUrl) {
      console.error('siteUrl or workSiteUrl element not found');
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { // Исправлен синтаксис
      if (tabs[0]?.url) {
        elements.siteUrl.value = tabs[0].url;
        elements.workSiteUrl.value = tabs[0].url;
        state.currentPage = tabs[0].url;
      }
    });
  }

  function handleBlock() {
    if (!elements.siteUrl) {
      console.error('siteUrl element not found');
      return;
    }
    const urlInput = elements.siteUrl.value.trim();
    if (!urlInput) {
      alert('Введите URL сайта');
      return;
    }

    try {
      const url = new URL(urlInput);
      const expirationTime = state.settings.blockTime === '0' ? 0 : Date.now() +
        parseInt(state.settings.blockTime) * 60 * 1000;

      const blockedSite = {
        url: state.settings.blockType === 'entire' ? url.hostname : url.href,
        type: state.settings.blockType,
        expirationTime: expirationTime, // Исправлено
        addedAt: Date.now(),
        isParental: false,
      };

      saveBlockedSite(blockedSite);
    } catch (error) {
      alert('Введите корректный URL (например, https://example.com)');
      console.error('Error parsing URL:', error);
    }
  }

  function saveBlockedSite(blockedSite) {
    if (!Array.isArray(state.blockedSites)) {
      state.blockedSites = [];
    }
    const newList = state.blockedSites.filter(s => s.url !== blockedSite.url);
    newList.push(blockedSite);
    state.blockedSites = newList;

    chrome.storage.local.set({ blockedSites: { siteList: newList } }, () => {
      console.log('Blocked sites saved:', newList);
      updateBlockedList();
      chrome.runtime.sendMessage({ action: 'updateDynamicRules' }, response => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError.message);
        } else {
          console.log('Message response:', response);
        }
      });
      switchTab('list').catch(err => console.error('Error switching to list tab:', err));
    });
  }

  function loadBlockedSites() {
    chrome.storage.local.get(['blockedSites'], result => {
      console.log('Loaded blockedSites:', result);
      state.blockedSites = Array.isArray(result.blockedSites?.siteList) ? result.blockedSites.siteList : []; // Исправлена опечатка
      updateBlockedList();
    });
  }

  function updateBlockedList() {
    if (!elements.blockedList) {
      console.error('blockedList element not found');
      return;
    }
    elements.blockedList.innerHTML = ''; // Очищаем список

    if (!Array.isArray(state.blockedSites)) { // Исправлено blocksSites
      console.error('state.blockedSites is not an array:', state.blockedSites); // Исправлена опечатка
      state.blockedSites = [];
    }

    state.blockedSites // Исправлено blocksSites
      .filter(site => site.expirationTime === 0 || Date.now() < site.expirationTime)
      .forEach((site, index) => {
        const li = document.createElement('li');
        li.className = 'blocked-item';
        const timeLeft = site.expirationTime === 0 ? 'Навсегда' : `До: ${new Date(site.expirationTime).toLocaleString()}`;

        li.innerHTML = `
          <div class="site-info">
            <span class="site-url">${site.url}</span>
            <small>${timeLeft}${site.isParental ? ' (Родительский контроль)' : ''}</small>
          </div>
          <button class="remove-btn" data-index="${index}" ${site.isParental ? 'disabled' : ''}>×</button>
        `;

        if (!site.isParental) {
          const removeBtn = li.querySelector('.remove-btn');
          if (removeBtn) {
            removeBtn.addEventListener('click', () => {
              removeBlockedSite(index);
            });
          }
        }

        elements.blockedList.appendChild(li);
      });
  }

  function removeBlockedSite(index) {
    if (!Array.isArray(state.blockedSites)) { // Исправлено blocksSites
      state.blockedSites = [];
    }
    state.blockedSites.splice(index, 1); // Исправлено blocksSites
    chrome.storage.local.set({ blockedSites: { siteList: state.blockedSites } }, () => {
      console.log('Blocked site removed, new list:', state.blockedSites);
      updateBlockedList();
      chrome.runtime.sendMessage({ action: 'updateDynamicRules' }, response => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError.message);
        } else {
          console.log('Message response:', response);
        }
      });
    });
  }

  function addWorkSite() {
    if (!elements.workSiteUrl) {
      console.error('workSiteUrl element not found');
      return;
    }
    const urlInput = elements.workSiteUrl.value.trim();
    if (!urlInput) {
      alert('Введите URL сайта');
      return;
    }

    try {
      const url = new URL(urlInput);
      const siteUrl = url.hostname;
      if (state.workSites.some(s => s.url === siteUrl)) {
        alert('Этот сайт уже добавлен!');
        return;
      }

      const workSite = {
        url: siteUrl,
        enabled: !state.isPaused,
      };

      state.workSites.push(workSite);
      saveWorkSites();
      elements.workSiteUrl.value = '';
      updateWorkSitesList();
    } catch (error) {
      alert('Введите корректный URL (например, https://example.com)');
      console.error('Error parsing URL:', error);
    }
  }

  function saveWorkSites() {
    chrome.storage.local.set({ workSites: state.workSites }, () => {
      console.log('Work sites saved to storage:', state.workSites);
      chrome.runtime.sendMessage({ action: 'updateWorkSites', sites: state.workSites }, response => {
        if (chrome.runtime.lastError) {
          console.error('Error sending updateWorkSites message:', chrome.runtime.lastError.message);
        } else {
          console.log('updateWorkSites message sent, response:', response);
        }
      });
    });
  }

  function loadWorkSites() {
    chrome.storage.local.get(['workSites'], result => {
      console.log('Loaded workSites:', result);
      state.workSites = Array.isArray(result.workSites) ? result.workSites : [];
      updateWorkSitesList();
      state.isPaused = state.workSites.every(s => !s.enabled);
      elements.pauseWorkBtn.classList.toggle('paused', state.isPaused);
      elements.pauseWorkBtn.textContent = state.isPaused ? 'Возобновить' : 'Пауза';
    });
  }

  function updateWorkSitesList() {
    if (!elements.workSitesList) {
      console.error('workSitesList element not found');
      return;
    }
    elements.workSitesList.innerHTML = '';

    if (!Array.isArray(state.workSites)) {
      console.error('state.workSites is not an array:', state.workSites);
      state.workSites = [];
    }

    state.workSites.forEach((site, index) => {
      const li = document.createElement('li');
      li.className = 'work-site-item';
      const displayUrl = site.url.length > 20 ? site.url.substring(0, 17) + '...' : site.url;
      li.innerHTML = `
        <span class="site-url">${displayUrl}</span>
        <label class="switch">
          <input type="checkbox" class="toggle-btn" data-index="${index}" ${site.enabled ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        <button class="remove-btn" data-index="${index}">×</button>
      `;

      const toggleBtn = li.querySelector('.toggle-btn');
      const removeBtn = li.querySelector('.remove-btn');

      if (toggleBtn) {
        toggleBtn.addEventListener('change', () => {
          state.workSites[index].enabled = toggleBtn.checked;
          state.isPaused = state.workSites.every(s => !s.enabled);
          elements.pauseWorkBtn.classList.toggle('paused', state.isPaused);
          elements.pauseWorkBtn.textContent = state.isPaused ? 'Возобновить' : 'Пауза';
          saveWorkSites();
        });
      }

      if (removeBtn) {
        removeBtn.addEventListener('click', () => {
          removeWorkSite(index);
        });
      }

      elements.workSitesList.appendChild(li);
    });
  }

  function removeWorkSite(index) {
    if (!Array.isArray(state.workSites)) {
      state.workSites = [];
    }
    state.workSites.splice(index, 1);
    state.isPaused = state.workSites.every(s => !s.enabled);
    elements.pauseWorkBtn.classList.toggle('paused', state.isPaused);
    elements.pauseWorkBtn.textContent = state.isPaused ? 'Возобновить' : 'Пауза';
    saveWorkSites();
    updateWorkSitesList();
  }

  function loadParentalSettings() {
    chrome.storage.local.get(['parentalBlockedSites'], result => {
      console.log('Loaded parental settings:', result);
      state.parentalBlockedSites = Array.isArray(result.parentalBlockedSites) ? result.parentalBlockedSites : [];
      renderParentalBlockedSites();
    });
  }

  function addSite() {
    if (!elements.siteToBlock) {
      console.error('siteToBlock element not found');
      return;
    }
    let site = elements.siteToBlock.value.trim();
    if (!site && state.settings.parentalBlockType === 'page' && state.currentPage) {
      site = state.currentPage;
    }
    if (!site) {
      alert('Введите домен сайта (например, youtube.com) или откройте страницу для блокировки');
      return;
    }

    try {
      const url = new URL(site.startsWith('http') ? site : `https://${site}`);
      const siteUrl = state.settings.parentalBlockType === 'entire' ? url.hostname : url.href;

      if (state.parentalBlockedSites.some(s => s.url === siteUrl)) {
        alert('Этот сайт уже заблокирован!');
        return;
      }

      state.parentalBlockedSites.push({
        url: siteUrl,
        type: 'full',
        schedule: null,
      });

      saveParentalSettings();
      elements.siteToBlock.value = '';
    } catch (error) {
      alert('Введите корректный домен (например, youtube.com)');
      console.error('Error parsing URL:', error);
    }
  }

  function saveParentalSettings() {
    chrome.storage.local.set({
      parentalBlockedSites: state.parentalBlockedSites,
    }, () => {
      console.log('Parental settings saved:', state.parentalBlockedSites);
      renderParentalBlockedSites();
      chrome.runtime.sendMessage({ action: 'updateParentalRules' }, response => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError.message);
        } else {
          console.log('Message response:', response);
        }
      });
    });
  }

  function renderParentalBlockedSites() {
    if (!elements.blockedSitesList) {
      console.error('blockedSitesList element not found');
      return;
    }
    elements.blockedSitesList.innerHTML = '';

    if (!Array.isArray(state.parentalBlockedSites)) {
      console.error('state.parentalBlockedSites is not an array:', state.parentalBlockedSites);
      state.parentalBlockedSites = [];
    }

    state.parentalBlockedSites.forEach((site, index) => {
      const li = document.createElement('li');
      li.className = 'blocked-site-item';
      li.innerHTML = `
        <span class="site-url">${site.url}</span>
        <button class="edit-btn" data-index="${index}">Настроить</button>
      `;

      const editBtn = li.querySelector('.edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          openSettingsModal(index);
        });
      }

      elements.blockedSitesList.appendChild(li);
    });
  }

  function openSettingsModal(index) {
    if (!elements.modalSiteName || !elements.blockTypeSelect || !elements.blockSettingsModal) {
      console.error('Modal elements not found');
      return;
    }
    state.currentEditingSite = index;
    const site = state.parentalBlockedSites[index];

    elements.modalSiteName.textContent = site.url;
    elements.blockTypeSelect.value = site.type;
    toggleScheduleSettings();

    if (site.schedule && Array.isArray(site.schedule.days)) {
      elements.blockStartTime.value = site.schedule.startTime || '22:00';
      elements.blockEndTime.value = site.schedule.endTime || '07:00';
      elements.dayButtons.forEach(btn => {
        btn.classList.toggle('active', site.schedule.days.includes(parseInt(btn.dataset.day)));
      });
    } else {
      elements.blockStartTime.value = '22:00';
      elements.blockEndTime.value = '07:00';
      elements.dayButtons.forEach(btn => {
        btn.classList.add('active');
      });
    }

    elements.blockSettingsModal.classList.remove('hidden');
  }

  function toggleScheduleSettings() {
    if (!elements.blockTypeSelect || !document.getElementById('scheduleSettings')) {
      console.error('Schedule settings elements not found');
      return;
    }
    const isSchedule = elements.blockTypeSelect.value === 'schedule';
    document.getElementById('scheduleSettings').classList.toggle('hidden', !isSchedule);
  }

  function saveBlockSettings() {
    if (!elements.blockTypeSelect || !elements.blockSettingsModal) {
      console.error('Block settings elements not found');
      return;
    }
    const index = state.currentEditingSite;
    const site = state.parentalBlockedSites[index];

    site.type = elements.blockTypeSelect.value;

    if (site.type === 'schedule') {
      site.schedule = {
        startTime: elements.blockStartTime.value || '22:00',
        endTime: elements.blockEndTime.value || '07:00',
        days: Array.from(elements.dayButtons)
          .filter(btn => btn.classList.contains('active'))
          .map(btn => parseInt(btn.dataset.day)),
      };
    } else {
      site.schedule = null;
    }

    saveParentalSettings();
    elements.blockSettingsModal.classList.add('hidden');
  }

  function removeSite() {
    if (!Array.isArray(state.parentalBlockedSites)) {
      state.parentalBlockedSites = [];
    }
    state.parentalBlockedSites.splice(state.currentEditingSite, 1);
    saveParentalSettings();
    if (elements.blockSettingsModal) {
      elements.blockSettingsModal.classList.add('hidden');
    }
  }

  init();
});