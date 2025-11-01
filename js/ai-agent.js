// Простой UI для AI чата через OpenRouter (бекенд /api/ai/chat)
(function () {
  var chat = document.getElementById('ai-chat');
  var input = document.getElementById('ai-input');
  var btn = document.getElementById('ai-send');

  function addMsg(text, who) {
    if (typeof who !== 'string') who = 'bot';
    var div = document.createElement('div');
    div.className = 'msg ' + (who === 'bot' ? 'msg-bot' : 'msg-user');
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
  }

  async function send() {
    var text = (input.value || '').trim();
    if (!text) return;
    addMsg(text, 'user');
    input.value = '';
    btn.disabled = true;

    try {
      var lang = (localStorage.getItem('lang') || '"ru"').replace(/"/g, '') || 'ru';
      var res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, locale: lang })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      addMsg(data.reply || 'Нет ответа', 'bot');
    } catch (e) {
      addMsg('AI временно недоступен. Проверьте ключ в .env', 'bot');
    } finally {
      btn.disabled = false;
    }
  }

  function init() {
    if (!btn || !input || !chat) return;
    btn.addEventListener('click', send);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') send();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();