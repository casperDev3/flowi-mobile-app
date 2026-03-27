export type Lang = 'uk' | 'en';

export interface Translations {
  // Tabs
  tabTasks: string;
  tabFinance: string;
  tabHealth: string;
  tabOptions: string;

  // Common
  cancel: string;
  delete: string;
  save: string;
  add: string;
  edit: string;
  close: string;
  create: string;
  all: string;
  yes: string;
  no: string;

  // Dates
  today: string;
  yesterday: string;
  tomorrow: string;
  months: string[];
  monthsShort: string[];
  weekdays: string[];
  weekdaysFull: string[];

  // Priority
  priorityHigh: string;
  priorityMedium: string;
  priorityLow: string;

  // Settings
  settings: string;
  sectionSupport: string;
  sectionDev: string;
  sectionAppearance: string;
  sectionNotifications: string;
  sectionData: string;
  sectionAbout: string;
  donate: string;
  developer: string;
  bugList: string;
  bugsValue: string;
  ideas: string;
  features: string;
  theme: string;
  language: string;
  themeSystem: string;
  themeLight: string;
  themeDark: string;
  langUk: string;
  langEn: string;
  taskReminders: string;
  financeAlerts: string;
  sync: string;
  dataManagement: string;
  version: string;
  rateApp: string;
  sendFeedback: string;
  inDevelopment: string;
  inDevelopmentMsg: string;
  notifications: string;

  // Tasks screen
  tasks: string;
  resetAll: string;
  subtasksToday: string;
  noTasksToday: string;
  meetings: string;
  addMeeting: string;
  active: string;
  done: string;
  noTasksForDay: string;
  noTasksAndMeetings: string;
  efficiency: string;
  calendarMode: string;
  listMode: string;
  list: string;
  calendar: string;
  filters: string;
  notes: string;
  archive: string;
  timeRecords: string;
  sortDeadline: string;
  sortPriority: string;
  sortNewest: string;
  sortOldest: string;
  sortAZ: string;
  dateToday: string;
  dateTomorrow: string;
  datePlus2: string;
  datePlus3: string;
  datePlus7: string;
  filtersAndSort: string;
  creationDate: string;
  status: string;
  project: string;
  allProjects: string;
  sorting: string;
  resetAllFilters: string;
  resetFilter: string;
  newTask: string;
  priority: string;
  noProject: string;
  timeEstimate: string;
  deadline: string;
  select: string;
  editTask: string;
  sessions: string;
  reminderDate: string;
  timeLabel: string;
  setReminder: string;
  subtasks: string;
  restore: string;
  completed: string;
  details: string;
  tracker: string;
  history: string;
  trackedTime: string;
  currentSession: string;
  startTimer: string;
  stopTimer: string;
  nothingFound: string;
  noTasks: string;
  tryAnotherQuery: string;
  pressToAdd: string;
  searchPlaceholder: string;
  taskNamePlaceholder: string;
  taskDescPlaceholder: string;
  hoursPlaceholder: string;
  minutesPlaceholder: string;
  addSubtask: string;
  deleteMeeting: string;
  cannotUndo: string;
  meetingTitle: string;
  meetingTitlePlaceholder: string;
  date: string;
  customDuration: string;
  locationPlaceholder: string;
  linkPlaceholder: string;
  meetingNotesPlaceholder: string;
  addMeetingForDay: string;
  allCompleted: string;
  allActive: string;
  allTasks: string;
  min: string;
  week: string;
  month: string;
  quarter: string;
  year: string;
  noDeadline: string;
  withoutDeadline: string;

  // Finance
  finance: string;
  balance: string;
  savings: string;
  noTransactions: string;
  income: string;
  expense: string;
  statistics: string;
  categories: string;
  piggyBanks: string;
  amountUAH: string;
  category: string;
  note: string;
  notePlaceholder: string;
  defaultCategory: string;
  icon: string;
  newCategory: string;
  incomes: string;
  expenses: string;
  catSalary: string;
  catFreelance: string;
  catInvestments: string;
  catGift: string;
  catOther: string;
  catFood: string;
  catTransport: string;
  catEntertainment: string;
  catHealth: string;
  catUtilities: string;
  catClothing: string;

  // Archive
  archiveEmpty: string;
  completedTasksAppear: string;
  deletePermanently: string;
  taskWillBeDeleted: string;
  clearArchive: string;
  clear: string;

  // Notes
  noNotes: string;
  untitled: string;
  titlePlaceholder: string;
  noteTextPlaceholder: string;
  justNow: string;

  // Ideas
  ideasTitle: string;
  priorityImportant: string;
  priorityNormal: string;
  prioritySomeday: string;
  statusIdea: string;
  statusImplemented: string;
  filterSent: string;
  noIdeas: string;
  pressToAddIdea: string;
  newIdea: string;
  editIdea: string;
  nameLabel: string;
  ideaPlaceholder: string;
  detailsOptional: string;
  detailsPlaceholder: string;
  priorityLabel: string;
  addIdea: string;
  deleteIdea: string;
  editAction: string;
  copyText: string;
  sendToDev: string;
  copied: string;
  copiedMsg: string;
  sentToDev: string;
  sendToDevLabel: string;
  ideaCount: string;
  doneCount: string;
  sentCount: string;

  // Bugs
  bugsTitle: string;
  severityCritical: string;
  severityMajor: string;
  severityMinor: string;
  sortSeverity: string;
  deleteBug: string;
  openBugs: string;
  fixedBugs: string;
  sentBugs: string;
  noFixed: string;
  noOpen: string;
  listEmpty: string;
  fixed: string;
  reopenBug: string;
  markFixed: string;
  openCount: string;
  fixedCount: string;
  totalCount: string;
  bugDescPlaceholder: string;
  bugDetailsPlaceholder: string;

  // Projects
  projects: string;
  deleteProject: string;
  projectTasksRemain: string;
  noProjects: string;
  noTasksInProject: string;
  editProject: string;
  newProject: string;
  projectName: string;

  // Meetings screen
  meetingsTitle: string;
  noMeetings: string;
  addMeetingBtn: string;
  meetingCount: string;
  totalTimeLabel: string;
  day: string;
  spanWeek: string;
  spanMonth: string;
  spanQuarter: string;

  // Time records
  timeRecordsTitle: string;
  periodToday: string;
  periodWeek: string;
  periodMonth: string;
  periodAll: string;
  totalTime: string;
  sessionsCount: string;
  tasksCount: string;
  byHours: string;
  byDays: string;
  byWeeks: string;
  byMonths: string;
  noRecords: string;
  reset: string;

  // Time tracker
  tracking: string;
  start: string;
  stop: string;
  totalLabel: string;
  avgLabel: string;
  noRecordsYet: string;
  taskNamePlaceholder2: string;
  duration: string;
  morning: string;
  daytime: string;
  evening: string;
  night: string;

  // Health
  health: string;
  water: string;
  calories: string;
  weight: string;
  steps: string;
  pulse: string;
  sleep: string;
  mood: string;
  moodBad: string;
  moodSoSo: string;
  moodOk: string;
  moodGood: string;
  moodGreat: string;
  connected: string;
  connectTap: string;
  todayLabel: string;
  target: string;
  days7: string;
  recordedToday: string;
  lastRecord: string;
  recordWeight: string;
  goodSleep: string;
  littleLess: string;
  notEnough: string;
  recordSleep: string;
  recordPulse: string;
  noEntriesYet: string;
  bradycardia: string;
  normal: string;
  tachycardia: string;
  addWater: string;
  hrs: string;
  mins: string;

  // Data screen
  autoBackup: string;
  lastBackup: string;
  backupNow: string;
  openLastBackup: string;
  exportData: string;
  importData: string;
  clearAllData: string;
  clearAllDataSub: string;
  saving: string;
  opening: string;
  preparing: string;
  loading: string;

  // Sync
  syncTitle: string;
  waitingConnection: string;
  fetchingData: string;
  mergingData: string;
  postingData: string;
  synced: string;
  error: string;
  startSync: string;
  myDevice: string;
  otherDevice: string;
  keepMine: string;
  acceptOther: string;

  // Notifications
  notifDisabled: string;
  notifDisabledSub: string;
  pushNotifications: string;
  totalNotif: string;
  activeNotif: string;
  pastNotif: string;
  subtaskNotif: string;
  taskNotif: string;
  noNotifications: string;
  noNotifSub: string;
  deleteReminder: string;
  deleteAllReminders: string;
  deleteAll: string;

  // Banks
  noPiggyBanks: string;
  donePiggy: string;
  deposit: string;
  editPiggyBank: string;
  newPiggyBank: string;
  goalUAH: string;
  piggyPlaceholder: string;
  depositSign: string;
  withdrawSign: string;
  depositBtn: string;
  withdrawBtn: string;

  // Finance stats
  balanceTrend: string;
  currentBalance: string;
  noData: string;

  // Apple Health
  grantAccess: string;
}

const uk: Translations = {
  tabTasks: 'Завдання',
  tabFinance: 'Фінанси',
  tabHealth: "Здоров'я",
  tabOptions: 'Опції',

  cancel: 'Скасувати',
  delete: 'Видалити',
  save: 'Зберегти',
  add: 'Додати',
  edit: 'Редагувати',
  close: 'Закрити',
  create: 'Створити',
  all: 'Всі',
  yes: 'Так',
  no: 'Ні',

  today: 'Сьогодні',
  yesterday: 'Вчора',
  tomorrow: 'Завтра',
  months: ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],
  monthsShort: ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'],
  weekdays: ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'],
  weekdaysFull: ['Понеділок','Вівторок','Середа','Четвер',"П'ятниця",'Субота','Неділя'],

  priorityHigh: 'Високий',
  priorityMedium: 'Середній',
  priorityLow: 'Низький',

  settings: 'Налаштування',
  sectionSupport: 'Підтримка',
  sectionDev: 'Розробка',
  sectionAppearance: 'Зовнішній вигляд',
  sectionNotifications: 'Сповіщення',
  sectionData: 'Дані',
  sectionAbout: 'Про додаток',
  donate: 'Задонатити',
  developer: 'Розробник',
  bugList: 'Список багів',
  bugsValue: 'Помилки',
  ideas: 'Ідеї',
  features: 'Функції',
  theme: 'Тема',
  language: 'Мова',
  themeSystem: 'Системна',
  themeLight: 'Світла',
  themeDark: 'Темна',
  langUk: 'Українська',
  langEn: 'English',
  taskReminders: 'Нагадування по завданнях',
  financeAlerts: 'Фінансові сповіщення',
  sync: 'Синхронізація',
  dataManagement: 'Управління даними',
  version: 'Версія',
  rateApp: 'Оцінити додаток',
  sendFeedback: 'Надіслати відгук',
  inDevelopment: 'У розробці',
  inDevelopmentMsg: 'Ця функція ще в розробці.',
  notifications: 'Сповіщення',

  tasks: 'Завдання',
  resetAll: 'Скинути все',
  subtasksToday: 'Підзавдання на сьогодні',
  noTasksToday: 'Немає завдань на сьогодні',
  meetings: 'Зустрічі',
  addMeeting: 'Додати зустріч',
  active: 'активних',
  done: 'виконано',
  noTasksForDay: 'Немає завдань на цей день',
  noTasksAndMeetings: 'Немає завдань і зустрічей',
  efficiency: 'ефективність',
  calendarMode: 'Режим календаря',
  listMode: 'Режим списку',
  list: 'Список',
  calendar: 'Календар',
  filters: 'Фільтри',
  notes: 'Нотатки',
  archive: 'Архів',
  timeRecords: 'Записи часу',
  sortDeadline: 'Дедлайн',
  sortPriority: 'Пріоритет',
  sortNewest: 'Нові',
  sortOldest: 'Старі',
  sortAZ: 'А–Я',
  dateToday: 'Сьогодні',
  dateTomorrow: 'Завтра',
  datePlus2: '+2 дні',
  datePlus3: '+3 дні',
  datePlus7: '+7 днів',
  filtersAndSort: 'Фільтри та сортування',
  creationDate: 'Дата створення',
  status: 'Статус',
  project: 'Проект',
  allProjects: 'Всі проекти',
  sorting: 'Сортування',
  resetAllFilters: 'Скинути всі фільтри',
  resetFilter: 'Скинути фільтр',
  newTask: 'Нове завдання',
  priority: 'Пріоритет',
  noProject: 'Без проекту',
  timeEstimate: 'Оцінка часу',
  deadline: 'Дедлайн',
  select: 'Вибрати',
  editTask: 'Редагувати завдання',
  sessions: 'Сесії',
  reminderDate: 'ДАТА НАГАДУВАННЯ',
  timeLabel: 'ЧАС',
  setReminder: 'Встановити',
  subtasks: 'ПІДЗАВДАННЯ',
  restore: 'Відновити',
  completed: 'Виконано',
  details: 'Деталі',
  tracker: 'Трекер',
  history: 'Історія',
  trackedTime: 'Відстежений час',
  currentSession: 'Поточна сесія',
  startTimer: 'Запустити',
  stopTimer: 'Зупинити',
  nothingFound: 'Нічого не знайдено',
  noTasks: 'Немає завдань',
  tryAnotherQuery: 'Спробуйте інший запит',
  pressToAdd: 'Натисніть + щоб додати',
  searchPlaceholder: 'Пошук завдань...',
  taskNamePlaceholder: 'Назва',
  taskDescPlaceholder: "Опис (необов'язково)",
  hoursPlaceholder: 'Год',
  minutesPlaceholder: 'Хвил',
  addSubtask: 'Додати підзавдання...',
  deleteMeeting: 'Видалити зустріч?',
  cannotUndo: 'Цю дію не можна скасувати.',
  meetingTitle: 'Назва зустрічі',
  meetingTitlePlaceholder: 'Назва зустрічі...',
  date: 'Дата',
  customDuration: 'Своя тривалість',
  locationPlaceholder: 'Місце…',
  linkPlaceholder: 'Zoom / Meet посилання…',
  meetingNotesPlaceholder: 'Нотатки…',
  addMeetingForDay: 'Додати зустріч на цей день',
  allCompleted: 'Виконані',
  allActive: 'Активні',
  allTasks: 'Всі',
  min: 'хв',
  week: 'Тиж',
  month: 'Місяць',
  quarter: 'Квартал',
  year: 'Рік',
  noDeadline: 'Без дедлайну',
  withoutDeadline: 'Без дедлайну',

  finance: 'Фінанси',
  balance: 'Баланс',
  savings: 'Заощадження',
  noTransactions: 'Немає транзакцій',
  income: 'Дохід',
  expense: 'Витрата',
  statistics: 'Статистика',
  categories: 'Категорії',
  piggyBanks: 'Скарбнички',
  amountUAH: 'СУМА (₴)',
  category: 'Категорія',
  note: 'Нотатка',
  notePlaceholder: "Необов'язково...",
  defaultCategory: 'стандартна',
  icon: 'Іконка',
  newCategory: 'Нова категорія',
  incomes: 'Доходи',
  expenses: 'Витрати',
  catSalary: 'Зарплата',
  catFreelance: 'Фріланс',
  catInvestments: 'Інвестиції',
  catGift: 'Подарунок',
  catOther: 'Інше',
  catFood: 'Їжа',
  catTransport: 'Транспорт',
  catEntertainment: 'Розваги',
  catHealth: "Здоров'я",
  catUtilities: 'Комунальні',
  catClothing: 'Одяг',

  archiveEmpty: 'Архів порожній',
  completedTasksAppear: "Виконані завдання з'являться тут",
  deletePermanently: 'Видалити назавжди?',
  taskWillBeDeleted: 'Завдання буде видалено без можливості відновлення.',
  clearArchive: 'Очистити архів?',
  clear: 'Очистити',

  noNotes: 'Немає нотаток',
  untitled: 'Без назви',
  titlePlaceholder: 'Заголовок...',
  noteTextPlaceholder: 'Текст нотатки...',
  justNow: 'щойно',

  ideasTitle: 'Ідеї',
  priorityImportant: 'Важлива',
  priorityNormal: 'Звичайна',
  prioritySomeday: 'Колись',
  statusIdea: 'Ідея',
  statusImplemented: 'Реалізовано',
  filterSent: 'Надіслані',
  noIdeas: 'Поки немає ідей',
  pressToAddIdea: 'Натисніть + щоб додати ідею',
  newIdea: 'Нова ідея',
  editIdea: 'Редагувати ідею',
  nameLabel: 'НАЗВА',
  ideaPlaceholder: 'Ідея або функція...',
  detailsOptional: "ДЕТАЛІ (необов'язково)",
  detailsPlaceholder: 'Опис, мотивація, приклади...',
  priorityLabel: 'ПРІОРИТЕТ',
  addIdea: 'Додати ідею',
  deleteIdea: 'Видалити ідею?',
  editAction: 'Редагувати',
  copyText: 'Копіювати текст',
  sendToDev: '✉️ Надіслати розробнику',
  copied: 'Скопійовано',
  copiedMsg: 'Заголовок та опис скопійовано в буфер обміну.',
  sentToDev: 'Надіслано розробнику',
  sendToDevLabel: 'Надіслати розробнику',
  ideaCount: 'Ідей',
  doneCount: 'Готово',
  sentCount: 'Надіслано',

  bugsTitle: 'Список багів',
  severityCritical: 'Критичний',
  severityMajor: 'Важливий',
  severityMinor: 'Незначний',
  sortSeverity: 'Критичність',
  deleteBug: 'Видалити баг?',
  openBugs: 'Відкриті',
  fixedBugs: 'Виправлені',
  sentBugs: 'Надіслані',
  noFixed: 'Немає виправлених',
  noOpen: 'Немає відкритих багів',
  listEmpty: 'Список порожній',
  fixed: 'Виправлено',
  reopenBug: 'Відкрити знову',
  markFixed: 'Позначити виправленим',
  openCount: 'Відкритих',
  fixedCount: 'Виправлених',
  totalCount: 'Всього',
  bugDescPlaceholder: 'Опис помилки...',
  bugDetailsPlaceholder: 'Де виникає, як відтворити...',

  projects: 'Проєкти',
  deleteProject: 'Видалити проект?',
  projectTasksRemain: "Завдання проекту залишаться, але без прив'язки.",
  noProjects: 'Немає проектів',
  noTasksInProject: 'Немає завдань',
  editProject: 'Редагувати проект',
  newProject: 'Новий проект',
  projectName: 'Назва проекту',

  meetingsTitle: 'Зустрічі',
  noMeetings: 'Немає зустрічей',
  addMeetingBtn: 'Додати зустріч',
  meetingCount: 'зустрічей',
  totalTimeLabel: 'загальний час',
  day: 'День',
  spanWeek: 'Тиждень',
  spanMonth: 'Місяць',
  spanQuarter: 'Квартал',

  timeRecordsTitle: 'Записи часу',
  periodToday: 'Сьогодні',
  periodWeek: 'Тиждень',
  periodMonth: 'Місяць',
  periodAll: 'Весь час',
  totalTime: 'Загальний час',
  sessionsCount: 'Сесій',
  tasksCount: 'Завдань',
  byHours: 'По годинах',
  byDays: 'По днях',
  byWeeks: 'По тижнях',
  byMonths: 'По місяцях',
  noRecords: 'Немає записів',
  reset: 'Скинути',

  tracking: 'Відстеження...',
  start: 'Почати',
  stop: 'Зупинити',
  totalLabel: 'Всього',
  avgLabel: 'Середнє',
  noRecordsYet: 'Ще немає записів',
  taskNamePlaceholder2: 'Назва завдання...',
  duration: 'Тривалість',
  morning: 'Ранок',
  daytime: 'День',
  evening: 'Вечір',
  night: 'Ніч',

  health: "Здоров'я",
  water: 'Вода',
  calories: 'Калорії',
  weight: 'Вага',
  steps: 'Кроки',
  pulse: 'Пульс',
  sleep: 'Сон',
  mood: 'Настрій',
  moodBad: 'Погано',
  moodSoSo: 'Так собі',
  moodOk: 'Нормально',
  moodGood: 'Добре',
  moodGreat: 'Чудово',
  connected: 'Підключено',
  connectTap: 'Натисни, щоб підключити',
  todayLabel: 'Сьогодні',
  target: 'Ціль!',
  days7: '7 днів',
  recordedToday: 'Записано сьогодні',
  lastRecord: 'Останній запис',
  recordWeight: 'Записати вагу',
  goodSleep: 'Добра норма 👍',
  littleLess: 'Трохи мало, норма 7–9 год',
  notEnough: 'Замало для відновлення',
  recordSleep: 'Записати сон',
  recordPulse: 'Записати пульс',
  noEntriesYet: 'Ще немає записів',
  bradycardia: 'Брадикардія',
  normal: 'Норма',
  tachycardia: 'Тахікардія',
  addWater: 'Додати воду',
  hrs: 'год',
  mins: 'хвил',

  autoBackup: 'Авто-резервування',
  lastBackup: 'Остання копія',
  backupNow: 'Зробити копію зараз',
  openLastBackup: 'Відкрити останню копію',
  exportData: 'Вивантажити дані',
  importData: 'Завантажити дані',
  clearAllData: 'Очистити всі дані',
  clearAllDataSub: 'Видалити всі записи без можливості відновлення',
  saving: 'Збереження...',
  opening: 'Відкриття...',
  preparing: 'Підготовка...',
  loading: 'Завантаження...',

  syncTitle: 'Синхронізація',
  waitingConnection: 'Очікує підключення',
  fetchingData: 'Отримання даних…',
  mergingData: "Об'єднання даних…",
  postingData: 'Відправка назад…',
  synced: 'Синхронізовано',
  error: 'Помилка',
  startSync: 'Почати синхронізацію',
  myDevice: 'Мій пристрій',
  otherDevice: 'Інший пристрій',
  keepMine: 'Залишити моє',
  acceptOther: 'Прийняти інше',

  notifDisabled: 'Сповіщення вимкнено',
  notifDisabledSub: 'Натисніть щоб надати дозвіл',
  pushNotifications: 'Push-сповіщення',
  totalNotif: 'Всього',
  activeNotif: 'Активних',
  pastNotif: 'Минулих',
  subtaskNotif: 'Підзавдання',
  taskNotif: 'Завдання',
  noNotifications: 'Немає сповіщень',
  noNotifSub: 'Відкрийте завдання або підзавдання\nщоб встановити нагадування',
  deleteReminder: 'Видалити нагадування?',
  deleteAllReminders: 'Видалити всі нагадування?',
  deleteAll: 'Видалити всі',

  noPiggyBanks: 'Немає скарбничок',
  donePiggy: '✓ Виконано',
  deposit: 'Поповнити',
  editPiggyBank: 'Редагувати скарбничку',
  newPiggyBank: 'Нова скарбничка',
  goalUAH: 'ЦІЛЬ (₴)',
  piggyPlaceholder: 'напр. На відпустку, Новий ноутбук...',
  depositSign: 'Поповнення',
  withdrawSign: 'Зняття',
  depositBtn: 'Поповнити',
  withdrawBtn: 'Зняти',

  balanceTrend: 'Тренд балансу',
  currentBalance: 'Поточний баланс',
  noData: 'Немає даних',

  grantAccess: 'Надати доступ',
};

const en: Translations = {
  tabTasks: 'Tasks',
  tabFinance: 'Finance',
  tabHealth: 'Health',
  tabOptions: 'Options',

  cancel: 'Cancel',
  delete: 'Delete',
  save: 'Save',
  add: 'Add',
  edit: 'Edit',
  close: 'Close',
  create: 'Create',
  all: 'All',
  yes: 'Yes',
  no: 'No',

  today: 'Today',
  yesterday: 'Yesterday',
  tomorrow: 'Tomorrow',
  months: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  monthsShort: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  weekdays: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  weekdaysFull: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],

  priorityHigh: 'High',
  priorityMedium: 'Medium',
  priorityLow: 'Low',

  settings: 'Settings',
  sectionSupport: 'Support',
  sectionDev: 'Development',
  sectionAppearance: 'Appearance',
  sectionNotifications: 'Notifications',
  sectionData: 'Data',
  sectionAbout: 'About',
  donate: 'Donate',
  developer: 'Developer',
  bugList: 'Bug List',
  bugsValue: 'Errors',
  ideas: 'Ideas',
  features: 'Features',
  theme: 'Theme',
  language: 'Language',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  langUk: 'Ukrainian',
  langEn: 'English',
  taskReminders: 'Task Reminders',
  financeAlerts: 'Finance Alerts',
  sync: 'Synchronization',
  dataManagement: 'Data Management',
  version: 'Version',
  rateApp: 'Rate App',
  sendFeedback: 'Send Feedback',
  inDevelopment: 'In Development',
  inDevelopmentMsg: 'This feature is still in development.',
  notifications: 'Notifications',

  tasks: 'Tasks',
  resetAll: 'Reset All',
  subtasksToday: 'Subtasks today',
  noTasksToday: 'No tasks today',
  meetings: 'Meetings',
  addMeeting: 'Add Meeting',
  active: 'active',
  done: 'done',
  noTasksForDay: 'No tasks for this day',
  noTasksAndMeetings: 'No tasks and meetings',
  efficiency: 'efficiency',
  calendarMode: 'Calendar Mode',
  listMode: 'List Mode',
  list: 'List',
  calendar: 'Calendar',
  filters: 'Filters',
  notes: 'Notes',
  archive: 'Archive',
  timeRecords: 'Time Records',
  sortDeadline: 'Deadline',
  sortPriority: 'Priority',
  sortNewest: 'Newest',
  sortOldest: 'Oldest',
  sortAZ: 'A–Z',
  dateToday: 'Today',
  dateTomorrow: 'Tomorrow',
  datePlus2: '+2 days',
  datePlus3: '+3 days',
  datePlus7: '+7 days',
  filtersAndSort: 'Filters & Sorting',
  creationDate: 'Creation Date',
  status: 'Status',
  project: 'Project',
  allProjects: 'All Projects',
  sorting: 'Sorting',
  resetAllFilters: 'Reset All Filters',
  resetFilter: 'Reset Filter',
  newTask: 'New Task',
  priority: 'Priority',
  noProject: 'No Project',
  timeEstimate: 'Time Estimate',
  deadline: 'Deadline',
  select: 'Select',
  editTask: 'Edit Task',
  sessions: 'Sessions',
  reminderDate: 'REMINDER DATE',
  timeLabel: 'TIME',
  setReminder: 'Set',
  subtasks: 'SUBTASKS',
  restore: 'Restore',
  completed: 'Done',
  details: 'Details',
  tracker: 'Tracker',
  history: 'History',
  trackedTime: 'Tracked Time',
  currentSession: 'Current Session',
  startTimer: 'Start',
  stopTimer: 'Stop',
  nothingFound: 'Nothing found',
  noTasks: 'No tasks',
  tryAnotherQuery: 'Try another query',
  pressToAdd: 'Press + to add',
  searchPlaceholder: 'Search tasks...',
  taskNamePlaceholder: 'Title',
  taskDescPlaceholder: 'Description (optional)',
  hoursPlaceholder: 'Hrs',
  minutesPlaceholder: 'Min',
  addSubtask: 'Add subtask...',
  deleteMeeting: 'Delete meeting?',
  cannotUndo: 'This action cannot be undone.',
  meetingTitle: 'Meeting title',
  meetingTitlePlaceholder: 'Meeting title...',
  date: 'Date',
  customDuration: 'Custom duration',
  locationPlaceholder: 'Location…',
  linkPlaceholder: 'Zoom / Meet link…',
  meetingNotesPlaceholder: 'Notes…',
  addMeetingForDay: 'Add meeting for this day',
  allCompleted: 'Completed',
  allActive: 'Active',
  allTasks: 'All',
  min: 'min',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
  noDeadline: 'No deadline',
  withoutDeadline: 'No deadline',

  finance: 'Finance',
  balance: 'Balance',
  savings: 'Savings',
  noTransactions: 'No transactions',
  income: 'Income',
  expense: 'Expense',
  statistics: 'Statistics',
  categories: 'Categories',
  piggyBanks: 'Piggy Banks',
  amountUAH: 'AMOUNT (₴)',
  category: 'Category',
  note: 'Note',
  notePlaceholder: 'Optional...',
  defaultCategory: 'default',
  icon: 'Icon',
  newCategory: 'New Category',
  incomes: 'Income',
  expenses: 'Expenses',
  catSalary: 'Salary',
  catFreelance: 'Freelance',
  catInvestments: 'Investments',
  catGift: 'Gift',
  catOther: 'Other',
  catFood: 'Food',
  catTransport: 'Transport',
  catEntertainment: 'Entertainment',
  catHealth: 'Health',
  catUtilities: 'Utilities',
  catClothing: 'Clothing',

  archiveEmpty: 'Archive is empty',
  completedTasksAppear: 'Completed tasks will appear here',
  deletePermanently: 'Delete permanently?',
  taskWillBeDeleted: 'Task will be deleted without possibility of recovery.',
  clearArchive: 'Clear archive?',
  clear: 'Clear',

  noNotes: 'No notes',
  untitled: 'Untitled',
  titlePlaceholder: 'Title...',
  noteTextPlaceholder: 'Note text...',
  justNow: 'just now',

  ideasTitle: 'Ideas',
  priorityImportant: 'Important',
  priorityNormal: 'Normal',
  prioritySomeday: 'Someday',
  statusIdea: 'Idea',
  statusImplemented: 'Implemented',
  filterSent: 'Sent',
  noIdeas: 'No ideas yet',
  pressToAddIdea: 'Press + to add an idea',
  newIdea: 'New Idea',
  editIdea: 'Edit Idea',
  nameLabel: 'NAME',
  ideaPlaceholder: 'Idea or feature...',
  detailsOptional: 'DETAILS (optional)',
  detailsPlaceholder: 'Description, motivation, examples...',
  priorityLabel: 'PRIORITY',
  addIdea: 'Add Idea',
  deleteIdea: 'Delete idea?',
  editAction: 'Edit',
  copyText: 'Copy text',
  sendToDev: '✉️ Send to developer',
  copied: 'Copied',
  copiedMsg: 'Title and description copied to clipboard.',
  sentToDev: 'Sent to developer',
  sendToDevLabel: 'Send to developer',
  ideaCount: 'Ideas',
  doneCount: 'Done',
  sentCount: 'Sent',

  bugsTitle: 'Bug List',
  severityCritical: 'Critical',
  severityMajor: 'Major',
  severityMinor: 'Minor',
  sortSeverity: 'Severity',
  deleteBug: 'Delete bug?',
  openBugs: 'Open',
  fixedBugs: 'Fixed',
  sentBugs: 'Sent',
  noFixed: 'No fixed bugs',
  noOpen: 'No open bugs',
  listEmpty: 'List is empty',
  fixed: 'Fixed',
  reopenBug: 'Reopen',
  markFixed: 'Mark as fixed',
  openCount: 'Open',
  fixedCount: 'Fixed',
  totalCount: 'Total',
  bugDescPlaceholder: 'Bug description...',
  bugDetailsPlaceholder: 'Where it occurs, how to reproduce...',

  projects: 'Projects',
  deleteProject: 'Delete project?',
  projectTasksRemain: 'Project tasks will remain but without binding.',
  noProjects: 'No projects',
  noTasksInProject: 'No tasks',
  editProject: 'Edit project',
  newProject: 'New project',
  projectName: 'Project name',

  meetingsTitle: 'Meetings',
  noMeetings: 'No meetings',
  addMeetingBtn: 'Add meeting',
  meetingCount: 'meetings',
  totalTimeLabel: 'total time',
  day: 'Day',
  spanWeek: 'Week',
  spanMonth: 'Month',
  spanQuarter: 'Quarter',

  timeRecordsTitle: 'Time Records',
  periodToday: 'Today',
  periodWeek: 'Week',
  periodMonth: 'Month',
  periodAll: 'All Time',
  totalTime: 'Total Time',
  sessionsCount: 'Sessions',
  tasksCount: 'Tasks',
  byHours: 'By Hours',
  byDays: 'By Days',
  byWeeks: 'By Weeks',
  byMonths: 'By Months',
  noRecords: 'No records',
  reset: 'Reset',

  tracking: 'Tracking...',
  start: 'Start',
  stop: 'Stop',
  totalLabel: 'Total',
  avgLabel: 'Average',
  noRecordsYet: 'No records yet',
  taskNamePlaceholder2: 'Task name...',
  duration: 'Duration',
  morning: 'Morning',
  daytime: 'Day',
  evening: 'Evening',
  night: 'Night',

  health: 'Health',
  water: 'Water',
  calories: 'Calories',
  weight: 'Weight',
  steps: 'Steps',
  pulse: 'Pulse',
  sleep: 'Sleep',
  mood: 'Mood',
  moodBad: 'Bad',
  moodSoSo: 'So-so',
  moodOk: 'Okay',
  moodGood: 'Good',
  moodGreat: 'Great',
  connected: 'Connected',
  connectTap: 'Tap to connect',
  todayLabel: 'Today',
  target: 'Goal!',
  days7: '7 days',
  recordedToday: 'Recorded today',
  lastRecord: 'Last record',
  recordWeight: 'Record weight',
  goodSleep: 'Good norm 👍',
  littleLess: 'A bit low, norm is 7–9 hrs',
  notEnough: 'Not enough for recovery',
  recordSleep: 'Record sleep',
  recordPulse: 'Record pulse',
  noEntriesYet: 'No entries yet',
  bradycardia: 'Bradycardia',
  normal: 'Normal',
  tachycardia: 'Tachycardia',
  addWater: 'Add water',
  hrs: 'hrs',
  mins: 'min',

  autoBackup: 'Auto-backup',
  lastBackup: 'Last backup',
  backupNow: 'Backup now',
  openLastBackup: 'Open last backup',
  exportData: 'Export data',
  importData: 'Import data',
  clearAllData: 'Clear all data',
  clearAllDataSub: 'Delete all records without possibility of recovery',
  saving: 'Saving...',
  opening: 'Opening...',
  preparing: 'Preparing...',
  loading: 'Loading...',

  syncTitle: 'Synchronization',
  waitingConnection: 'Waiting for connection',
  fetchingData: 'Fetching data…',
  mergingData: 'Merging data…',
  postingData: 'Posting back…',
  synced: 'Synced',
  error: 'Error',
  startSync: 'Start synchronization',
  myDevice: 'My device',
  otherDevice: 'Other device',
  keepMine: 'Keep mine',
  acceptOther: 'Accept other',

  notifDisabled: 'Notifications disabled',
  notifDisabledSub: 'Tap to grant permission',
  pushNotifications: 'Push notifications',
  totalNotif: 'Total',
  activeNotif: 'Active',
  pastNotif: 'Past',
  subtaskNotif: 'Subtask',
  taskNotif: 'Task',
  noNotifications: 'No notifications',
  noNotifSub: 'Open a task or subtask\nto set a reminder',
  deleteReminder: 'Delete reminder?',
  deleteAllReminders: 'Delete all reminders?',
  deleteAll: 'Delete all',

  noPiggyBanks: 'No piggy banks',
  donePiggy: '✓ Done',
  deposit: 'Deposit',
  editPiggyBank: 'Edit piggy bank',
  newPiggyBank: 'New piggy bank',
  goalUAH: 'GOAL (₴)',
  piggyPlaceholder: 'e.g. Vacation, New laptop...',
  depositSign: 'Deposit',
  withdrawSign: 'Withdraw',
  depositBtn: 'Deposit',
  withdrawBtn: 'Withdraw',

  balanceTrend: 'Balance Trend',
  currentBalance: 'Current balance',
  noData: 'No data',

  grantAccess: 'Grant Access',
};

export const allTranslations: Record<Lang, Translations> = { uk, en };
