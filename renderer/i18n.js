const locales = {
  en: {
    'app.title': 'BLIP',
    'app.slogan': "You're on the grid. You're the signal.",
    'grid.title': 'SELECT YOUR BLIP ID',
    'grid.hint': 'Choose a free number. 8×8. 1–64.',
    'grid.occupied': 'Occupied',
    'grid.free': 'Free',
    'grid.yours': 'Yours',
    'grid.confirm': 'Confirm',
    'dial.title': 'ENTER BLIP ID',
    'dial.placeholder': '1–64',
    'dial.call': 'CALL',
    'dial.message': 'MESSAGE',
    'call.outgoing': 'CALLING...',
    'call.incoming': 'INCOMING CALL',
    'call.accept': 'ACCEPT',
    'call.reject': 'REJECT',
    'call.mute': 'MUTE',
    'call.deafen': 'DEAFEN',
    'call.end': 'END',
    'call.signal_lost': 'SIGNAL LOST',
    'call.signal_lost_hint': 'Peer not found. Check the number.',
    'chat.input_placeholder': 'Type a message...',
    'chat.send': 'SEND',
    'chat.empty': 'No messages yet.',
    'peers.title': 'PEERS',
    'peers.online': 'ONLINE',
    'peers.offline': 'OFFLINE',
    'peers.none': 'No peers online',
    'settings.title': 'SETTINGS',
    'settings.name': 'Display Name',
    'settings.name_placeholder': 'Enter name...',
    'settings.id': 'Your BLIP ID',
    'settings.change_id': 'Change ID',
    'settings.language': 'Language',
    'error.id_taken': 'ID TAKEN',
    'error.id_taken_hint': 'This number is already in use. Choose another.',
    'error.connection_failed': 'CONNECTION FAILED',
    'status.connected': 'CONNECTED',
    'status.disconnected': 'DISCONNECTED',
    'nav.dial': 'DIAL',
    'nav.chat': 'CHAT',
    'nav.peers': 'PEERS',
    'nav.settings': 'SETTINGS',
    'chat.title': 'CHAT',
    'chat.pick_peer': 'Open a peer from PEERS or dial an ID.',
    'chat.no_active': 'No conversation selected.',
    'call.connected': 'ON CALL',
  },
  ru: {
    'app.title': 'BLIP',
    'app.slogan': 'Ты в сети. Ты сигнал.',
    'grid.title': 'ВЫБЕРИ СВОЙ BLIP ID',
    'grid.hint': 'Выбери свободный номер. 8×8. 1–64.',
    'grid.occupied': 'Занято',
    'grid.free': 'Свободно',
    'grid.yours': 'Твой',
    'grid.confirm': 'Подтвердить',
    'dial.title': 'ВВЕДИ BLIP ID',
    'dial.placeholder': '1–64',
    'dial.call': 'ЗВОНОК',
    'dial.message': 'СООБЩЕНИЕ',
    'call.outgoing': 'ВЫЗОВ...',
    'call.incoming': 'ВХОДЯЩИЙ ВЫЗОВ',
    'call.accept': 'ПРИНЯТЬ',
    'call.reject': 'ОТКЛОНИТЬ',
    'call.mute': 'МИКРО',
    'call.deafen': 'ЗВУК',
    'call.end': 'СБРОС',
    'call.signal_lost': 'СИГНАЛ ПОТЕРЯН',
    'call.signal_lost_hint': 'Абонент не найден. Проверь номер.',
    'chat.input_placeholder': 'Введи сообщение...',
    'chat.send': 'ОТПР',
    'chat.empty': 'Сообщений пока нет.',
    'peers.title': 'АБОНЕНТЫ',
    'peers.online': 'В СЕТИ',
    'peers.offline': 'НЕ В СЕТИ',
    'peers.none': 'Никого в сети',
    'settings.title': 'НАСТРОЙКИ',
    'settings.name': 'Имя',
    'settings.name_placeholder': 'Введи имя...',
    'settings.id': 'Твой BLIP ID',
    'settings.change_id': 'Сменить ID',
    'settings.language': 'Язык',
    'error.id_taken': 'ID ЗАНЯТ',
    'error.id_taken_hint': 'Этот номер уже используется. Выбери другой.',
    'error.connection_failed': 'ОШИБКА ПОДКЛЮЧЕНИЯ',
    'status.connected': 'ПОДКЛЮЧЕН',
    'status.disconnected': 'ОТКЛЮЧЕН',
    'nav.dial': 'НАБОР',
    'nav.chat': 'ЧАТ',
    'nav.peers': 'АБОНЕНТЫ',
    'nav.settings': 'НАСТРОЙКИ',
    'chat.title': 'ЧАТ',
    'chat.pick_peer': 'Выбери абонента в АБОНЕНТЫ или набери ID.',
    'chat.no_active': 'Чат не выбран.',
    'call.connected': 'НА СВЯЗИ',
  },
};

let currentLang = localStorage.getItem('blip_lang') || 'en';

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (locales[lang]) {
    currentLang = lang;
    localStorage.setItem('blip_lang', lang);
  }
}

export function t(key) {
  return locales[currentLang]?.[key] ?? locales.en[key] ?? key;
}

export function onLangChange(cb) {
  window.addEventListener('blip-lang-change', cb);
  return () => window.removeEventListener('blip-lang-change', cb);
}

export function applyLangChange() {
  window.dispatchEvent(new Event('blip-lang-change'));
}
