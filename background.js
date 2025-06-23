// Функция для обновления динамических правил блокировки
const updateDynamicRules = async () => {
  try {
    const result = await chrome.storage.local.get(['blockedSites', 'parentalBlockedSites']);
    const blockedSites = result.blockedSites?.siteList || [];
    const parentalBlockedSites = result.parentalBlockedSites || [];
    
    const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIdsToRemove = currentRules.map(rule => rule.id);

    const newRules = blockedSites
      .filter(site => site.expirationTime === 0 || Date.now() < site.expirationTime)
      .map((site, index) => {
        const redirectUrl = chrome.runtime.getURL(
          `blocked.html?url=${encodeURIComponent(site.url)}&expiration=${site.expirationTime}`
        );
        
        return {
          id: index + 1,
          action: { 
            type: "redirect",
            redirect: { url: redirectUrl }
          },
          condition: {
            urlFilter: site.type === 'entire' ? `||${site.url}^` : site.url,
            resourceTypes: ["main_frame"]
          }
        };
      });

    const parentalRules = parentalBlockedSites
      .filter(site => {
        if (site.type === 'full') return true;
        if (site.type === 'schedule' && site.schedule) {
          const now = new Date();
          const currentDay = now.getDay();
          const currentTime = now.getHours() * 60 + now.getMinutes();
          const [startHour, startMinute] = site.schedule.startTime.split(':').map(Number);
          const [endHour, endMinute] = site.schedule.endTime.split(':').map(Number);
          const startTime = startHour * 60 + startMinute;
          const endTime = endHour * 60 + endMinute;
          const isActiveDay = site.schedule.days.includes(currentDay);

          let isActiveTime = startTime <= endTime
            ? currentTime >= startTime && currentTime < endTime
            : currentTime >= startTime || currentTime < endTime;

          return isActiveDay && isActiveTime;
        }
        return false;
      })
      .map((site, index) => {
        const scheduleParams = site.type === 'schedule' && site.schedule
          ? `&schedule=true&startTime=${encodeURIComponent(site.schedule.startTime)}&endTime=${encodeURIComponent(site.schedule.endTime)}&days=${encodeURIComponent(JSON.stringify(site.schedule.days))}`
          : '';
        const redirectUrl = chrome.runtime.getURL(
          `blocked.html?url=${encodeURIComponent(site.url)}&parental=true${scheduleParams}`
        );

        return {
          id: 1001 + index,
          action: {
            type: "redirect",
            redirect: { url: redirectUrl }
          },
          condition: {
            urlFilter: site.url.startsWith('http') ? site.url : `||${site.url}^`,
            resourceTypes: ["main_frame"],
            isUrlFilterCaseSensitive: false
          }
        };
      });

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIdsToRemove,
      addRules: [...newRules, ...parentalRules]
    });
  } catch (error) {
    console.error('Error updating dynamic rules:', error);
  }
};

// Состояние для отслеживания рабочих сайтов и активности
let workSites = [];
let lastMouseMoveTime = Date.now();
let lastNonWorkTabTime = null;
let lastPopupTime = 0;
const TAB_CHECK_INTERVAL = 1000;
const MOUSE_INACTIVITY_THRESHOLD = 5 * 60 * 1000;
const NON_WORK_TAB_THRESHOLD = 10 * 1000;
const POPUP_COOLDOWN = 30 * 1000;

// Функция для открытия окна с предупреждением
function showWarningWindow(message) {
  const now = Date.now();
  if (now - lastPopupTime < POPUP_COOLDOWN) {
    console.log('Warning window opening skipped due to cooldown');
    return;
  }

  chrome.windows.create({
    url: chrome.runtime.getURL('warning.html'),
    type: 'popup',
    width: 800,
    height: 600,
    focused: true
  }, (window) => {
    if (chrome.runtime.lastError) {
      console.error('Error creating warning window:', chrome.runtime.lastError.message);
    } else {
      console.log('Warning window created successfully');
      chrome.runtime.sendMessage({ action: 'getWarningMessage', message }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message to warning window:', chrome.runtime.lastError.message);
        }
      });
      if (window && window.id) {
        chrome.windows.update(window.id, { focused: true });
      }
      lastPopupTime = now;
    }
  });
}

// Обработчик сообщений
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message);
  if (message.action === 'updateParentalRules') {
    updateDynamicRules().then(() => sendResponse({ success: true }));
  } else if (message.action === 'unblock') {
    handleUnblock(message.url, message.isParental).then(() => sendResponse({ success: true }));
  } else if (message.action === 'updateWorkSites') {
    workSites = message.sites || [];
    console.log('Updated workSites:', workSites);
    sendResponse({ success: true });
  } else if (message.action === 'mouseMoved') {
    lastMouseMoveTime = Date.now();
    console.log('Mouse moved, lastMouseMoveTime:', lastMouseMoveTime);
  }
  return true;
});

// Отслеживание активности вкладок
function checkActiveTab() {
  const enabledWorkSites = workSites.filter(site => site.enabled).map(site => site.url);
  console.log('Checking active tab, enabled work sites:', enabledWorkSites);

  if (enabledWorkSites.length === 0) {
    lastNonWorkTabTime = null;
    console.log('No enabled work sites, skipping tab check');
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]?.url) {
      console.log('No valid URL for active tab, skipping');
      return;
    }

    const activeUrl = new URL(tabs[0].url).hostname;
    console.log('Active URL:', activeUrl, 'Enabled work sites:', enabledWorkSites);

    const isOnWorkSite = enabledWorkSites.some(workSite => activeUrl === workSite);
    console.log('Is on work site:', isOnWorkSite);

    if (isOnWorkSite) {
      lastNonWorkTabTime = null;
      console.log('User is on a work site, resetting lastNonWorkTabTime');
    } else {
      if (!lastNonWorkTabTime) {
        lastNonWorkTabTime = Date.now();
        console.log('User left work site, setting lastNonWorkTabTime:', lastNonWorkTabTime);
      } else {
        const timeElapsed = Date.now() - lastNonWorkTabTime;
        console.log('Time elapsed since lastNonWorkTabTime (non-work site):', timeElapsed);
        if (timeElapsed >= NON_WORK_TAB_THRESHOLD) {
          showWarningWindow('Вы перешли на другую вкладку. Пожалуйста, вернитесь к рабочей странице.');
          lastNonWorkTabTime = Date.now();
        }
      }
    }
  });
}

// Проверка бездействия мыши
function checkMouseInactivity() {
  const enabledWorkSites = workSites.filter(site => site.enabled);
  console.log('Checking mouse inactivity, enabled work sites:', enabledWorkSites);

  if (enabledWorkSites.length === 0) {
    console.log('No enabled work sites, skipping mouse inactivity check');
    return;
  }

  if (Date.now() - lastMouseMoveTime >= MOUSE_INACTIVITY_THRESHOLD) {
    showWarningWindow('Вы бездействуете на рабочей странице. Пожалуйста, возобновите работу.');
    lastMouseMoveTime = Date.now();
  }
}

// Периодическая проверка
setInterval(() => {
  console.log('Running periodic check at:', new Date());
  checkActiveTab();
  checkMouseInactivity();
  updateDynamicRules();
}, TAB_CHECK_INTERVAL);

// Инициализация
chrome.runtime.onStartup.addListener(() => {
  updateDynamicRules().catch(err => console.error('Error during startup rules update:', err));
  chrome.storage.local.get(['workSites'], result => {
    workSites = result.workSites || [];
    console.log('Initial workSites on startup from storage:', workSites);
  });
});

chrome.storage.local.get(['blockedSites'], () => {
  updateDynamicRules().catch(err => console.error('Error updating rules on storage load:', err));
});

async function handleUnblock(url, isParental) {
  try {
    if (isParental) {
      const { parentalBlockedSites = [] } = await chrome.storage.local.get(['parentalBlockedSites']);
      const updatedSites = parentalBlockedSites.filter(site => site.url !== url);
      await chrome.storage.local.set({ parentalBlockedSites: updatedSites });
    } else {
      const { blockedSites = { siteList: [] } } = await chrome.storage.local.get(['blockedSites']);
      const updatedSites = blockedSites.siteList.filter(site => site.url !== url);
      await chrome.storage.local.set({ blockedSites: { siteList: updatedSites } });
    }
    await updateDynamicRules();
  } catch (error) {
    console.error('Error handling unblock:', error);
  }
}

// Скрипт для активных вкладок для отслеживания мыши
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const url = new URL(tab.url).hostname;
    const enabledWorkSites = workSites.filter(site => site.enabled).map(site => site.url);
    console.log('Tab updated, URL:', url, 'Enabled work sites:', enabledWorkSites);
    if (enabledWorkSites.some(workSite => url === workSite)) {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          document.addEventListener('mousemove', () => {
            chrome.runtime.sendMessage({ action: 'mouseMoved' });
          });
        }
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Script injection error:', chrome.runtime.lastError.message);
        } else {
          console.log('Mouse tracking script injected for tab:', tabId);
        }
      });
    }
  }
});