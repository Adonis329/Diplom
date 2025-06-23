document.addEventListener('DOMContentLoaded', () => {
  // Получаем сообщение от background.js
  chrome.runtime.sendMessage({ action: 'getWarningMessage' }, (response) => {
    if (response && response.message) {
      document.getElementById('messageText').textContent = response.message;
    } else {
      document.getElementById('messageText').textContent = 'Неизвестное предупреждение.';
    }
  });

  // Закрытие окна при нажатии кнопки
  document.getElementById('closeButton').addEventListener('click', () => {
    window.close();
  });
});