const params = new URLSearchParams(window.location.search);
const url = params.get('url');
const expiration = parseInt(params.get('expiration') || '0');
const reason = params.get('reason');
const isParental = params.get('parental') === 'true';
const isSchedule = params.get('schedule') === 'true';
const startTime = params.get('startTime');
const endTime = params.get('endTime');
const days = params.get('days') ? JSON.parse(decodeURIComponent(params.get('days'))) : [];

console.log('Blocked page params:', { url, isParental, isSchedule, startTime, endTime, days });

document.getElementById('blockedUrl').textContent = url || 'все сайты';

if (reason === 'timeRestriction') {
  document.getElementById('blockMessage').textContent = 
    'Доступ в интернет ограничен по расписанию родительского контроля';
  document.getElementById('timerText').textContent = 
    'Попробуйте позже в разрешенное время';
} else if (isParental && isSchedule) {
  updateScheduleTimer();
} else {
  updateTimer();
}

function updateTimer() {
  if (expiration === 0) {
    document.getElementById('timerText').textContent = 'Заблокировано на неопределенный срок';
    return;
  }

  const now = Date.now();
  const remaining = expiration - now;
  
  if (remaining <= 0) {
    console.log('Expiration reached, sending unblock for:', url);
    chrome.runtime.sendMessage({
      action: "unblock",
      url: url,
      isParental: false
    }, () => {
      window.location.href = url;
    });
    return;
  }

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  document.getElementById('timerText').textContent = 
    `До разблокировки: ${hours} ч ${minutes} мин`;
}

function updateScheduleTimer() {
  if (!startTime || !endTime || !days.length) {
    console.warn('Invalid schedule params:', { startTime, endTime, days });
    document.getElementById('timerText').textContent = 'Заблокировано по расписанию';
    return;
  }

  const now = new Date();
  const currentDay = now.getDay(); 
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;

  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const startTimeInMinutes = startHour * 60 + startMinute;
  const endTimeInMinutes = endHour * 60 + endMinute;

  const isActiveDay = days.includes(currentDay === 0 ? 6 : currentDay - 1);

  let isBlocked = false;
  if (startTimeInMinutes <= endTimeInMinutes) {
    isBlocked = isActiveDay && currentTimeInMinutes >= startTimeInMinutes 
    && currentTimeInMinutes < endTimeInMinutes;
  } else {
    isBlocked = isActiveDay && (
      currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes < endTimeInMinutes
    );
  }

  console.log('Schedule check:', { isBlocked, currentTimeInMinutes, startTimeInMinutes, endTimeInMinutes, isActiveDay });

  if (!isBlocked) {
    console.log('Schedule expired, sending unblock for:', url);
    chrome.runtime.sendMessage({
      action: "unblock",
      url: url,
      isParental: true
    }, () => {
      window.location.href = url;
    });
    return;
  }

  document.getElementById('timerText').textContent = 
    `Заблокировано по расписанию до ${endTime} в ${getDayName(days)}`;
}

function getDayName(days) {
  const dayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const today = new Date().getDay(); // 0 = Воскресенье
  const todayIndex = today === 0 ? 6 : today - 1;
  let nextDay = todayIndex;
  for (let i = 0; i < 7; i++) {
    nextDay = (nextDay + 1) % 7;
    if (days.includes(nextDay)) return dayNames[nextDay];
  }
  return dayNames[todayIndex];
}

if (expiration !== 0) {
  setInterval(updateTimer, 1000);
}
if (isParental && isSchedule) {
  setInterval(updateScheduleTimer, 10000); // Проверка каждые 10 секунд
}
updateTimer();
if (isParental && isSchedule) {
  updateScheduleTimer();
}