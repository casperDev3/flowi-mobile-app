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
  monthsGenitive: string[];
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
  carryover: string;
  currency: string;
  newCurrency: string;
  currencyTicker: string;
  currencySymbol: string;
  // Finance — primary currency picker
  primaryCurrency: string;
  primaryCurrencyDesc: string;
  primaryBadge: string;
  cryptoBadge: string;
  cryptoKind: string;
  fiatKind: string;
  // Finance — balance split
  balanceSplit: string;
  balanceSplitDesc: string;
  fromTransactions: string;
  addCrypto: string;
  removeCurrencyTitle: string;
  removeCurrencyMsg: string;
  remove: string;
  // Finance — others
  otherCurrencies: string;
  showAllCount: string;          // "Показати всі ({count})"
  allCurrencies: string;
  // Shared
  sharedTitle: string;
  noGroups: string;
  noGroupsHint: string;
  createGroup: string;
  joinByCode: string;
  searchGroups: string;
  searchSections: string;
  noListsFound: string;
  noLists: string;
  pressPlusToAdd: string;
  syncingShort: string;
  participants: string;        // pluralized helper handles UA forms
  notifyMembers: string;
  notifyMembersDesc: string;
  notifyButton: string;
  notifyMessagePh: string;
  notifyThrottleMsg: string;
  notifyForegroundHint: string;
  leaveGroupTitle: string;
  leaveGroupMsg: string;
  leave: string;
  refreshCodeNow: string;
  shareCode: string;
  shareCodeDesc: string;
  joinTitle: string;
  joinDesc: string;
  joinAction: string;
  newGroupTitle: string;
  newGroupDesc: string;
  groupNamePh: string;
  newListTitle: string;
  newListType: string;
  createList: string;
  deleteListTitle: string;
  deleteListMsg: string;
  rename: string;
  renamePh: string;
  emptyListTitle: string;
  emptyListHint: string;
  showCompleted: string;        // "Показати виконані ({n})"
  hideCompleted: string;
  clearCompleted: string;
  ofPurchased: string;          // "{done} з {total} куплено"
  priorities: { high: string; medium: string; low: string };
  addPlaceholder: string;
  notePlaceholderShort: string;
  errGeneric: string;
  errCreateGroup: string;
  errCreateList: string;
  errRename: string;
  errDelete: string;
  errInvalidCode: string;
  errNotifyFailed: string;
  offlineBanner: string;
  // Format helpers
  amountWithCurrency: string;   // "СУМА ({symbol})"
  // Filter dropdown
  compactView: string;
  filterTitle: string;
  sortTitle: string;
  filterActive: string;
  filterAll: string;
  filterDone: string;
  sortPriorityShort: string;
  // Misc Shared
  qtyShort: string;
  textLabel: string;
  inGroup: string;
  edit_: string;
  close_: string;
  newCodeAction: string;
  joinCodePh: string;
  noteFullPh: string;
  notifChangesInSection: string; // "Зміни у «{name}»"
  notifChangesInGroup: string;   // "У групі зʼявились зміни"

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
  repeat: string;
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
  // Health profile & personalized goals
  healthProfile: string;
  profileSub: string;
  profileHint: string;
  sexLabel: string;
  male: string;
  female: string;
  ageLabel: string;
  heightLabel: string;
  activityLabel: string;
  actSedentary: string;
  actLight: string;
  actModerate: string;
  actActive: string;
  actVeryActive: string;
  goalLabel: string;
  goalLose: string;
  goalMaintain: string;
  goalGain: string;
  saveProfile: string;
  yearsShort: string;
  // Calories balance & macros
  consumed: string;
  burned: string;
  deficit: string;
  surplus: string;
  dailyLimit: string;
  overLimit: string;
  withinLimit: string;
  protein: string;
  fats: string;
  carbs: string;
  proteinShort: string;
  macrosOptional: string;
  // BMI
  bmi: string;
  bmiUnderweight: string;
  bmiNormal: string;
  bmiOverweight: string;
  bmiObese: string;
  // Reminders
  reminders: string;
  waterReminder: string;
  sleepReminder: string;
  remindersSub: string;
  // Health hub & modules
  summary: string;
  sections: string;
  workoutsLabel: string;
  workoutsSub: string;
  nutrition: string;
  activity: string;
  sleepRecovery: string;
  bodyMetrics: string;
  prevention: string;
  dueToday: string;
  restingPulse: string;
  insights: string;
  thisWeek: string;
  back: string;
  // Body measurements
  bodyMeasurements: string;
  bodyMeasurementsSub: string;
  addBodyEntry: string;
  bodyEntryTitle: string;
  mWaist: string;
  mHips: string;
  mChest: string;
  mThigh: string;
  mBiceps: string;
  mNeck: string;
  mCalf: string;
  mBodyfat: string;
  whtr: string;
  whr: string;
  leanMass: string;
  bodyfatEst: string;
  whtrHealthy: string;
  whtrIncreased: string;
  whtrHigh: string;
  weightReminder: string;
  weightReminderBody: string;
  measurementsReminder: string;
  measurementsReminderBody: string;
  noMeasurements: string;
  perMonth: string;
  // Prevention sub-modules
  meds: string;
  medsSub: string;
  checkups: string;
  checkupsSub: string;
  vaccines: string;
  vaccinesSub: string;
  habits: string;
  habitsSub: string;
  // Meds
  addMed: string;
  medName: string;
  medDose: string;
  medTimes: string;
  taken: string;
  takeNow: string;
  medActive: string;
  finished: string;
  adherence: string;
  // Checkups / vaccines
  addCheckup: string;
  addVaccine: string;
  title: string;
  result: string;
  nextDate: string;
  kindAnalysis: string;
  kindVisit: string;
  kindProcedure: string;
  doseNo: string;
  upcoming: string;
  past: string;
  // Habits
  addHabit: string;
  streak: string;
  daysStreak: string;
  // Report export
  exportReport: string;
  reportSub: string;

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

  // Containers
  tabContainers: string;
  containers: string;
  newContainer: string;
  containerName: string;
  containerNamePlaceholder: string;
  containerLocation: string;
  containerLocationPlaceholder: string;
  noContainers: string;
  searchItems: string;
  addItem: string;
  itemName: string;
  itemNamePlaceholder: string;
  noItems: string;
  foundIn: string;
  editContainer: string;
  deleteContainer: string;
  containerItems: string;
  itemTags: string;
  itemNote: string;
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
  monthsGenitive: ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'],
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
  carryover: 'Перенесено з минулого',
  currency: 'Валюта',
  newCurrency: 'Нова валюта',
  currencyTicker: 'Тікер (BTC, ETH, USDT...)',
  currencySymbol: 'Символ (необовʼязково)',
  primaryCurrency: 'Основна валюта',
  primaryCurrencyDesc: 'Валюта, що відображається у верхній картці балансу. Інші валюти показуються нижче дрібніше.',
  primaryBadge: 'ОСНОВНА',
  cryptoBadge: 'CRYPTO',
  cryptoKind: 'Криптовалюта',
  fiatKind: 'Фіат',
  balanceSplit: 'Розподіл балансу',
  balanceSplitDesc: 'Вкажіть, скільки накопиченого залишку у кожній валюті. Корисно, якщо частина гривневих заощаджень фактично у доларах чи криптовалюті. Місячні доходи та витрати не змінюються.',
  fromTransactions: 'З транзакцій',
  addCrypto: 'Додати криптовалюту',
  removeCurrencyTitle: 'Видалити {code}?',
  removeCurrencyMsg: 'Транзакції залишаться, але валюта зникне з фільтрів.',
  remove: 'Видалити',
  otherCurrencies: 'Інші валюти',
  showAllCount: 'Показати всі ({count})',
  allCurrencies: 'Всі валюти',
  sharedTitle: 'Спільне',
  noGroups: 'Немає груп',
  noGroupsHint: 'Створіть групу або приєднайтесь за кодом',
  createGroup: 'Створити',
  joinByCode: 'Ввести код',
  searchGroups: 'Пошук груп...',
  searchSections: 'Пошук списків...',
  noListsFound: 'Нічого не знайдено',
  noLists: 'Немає списків',
  pressPlusToAdd: 'Натисніть + щоб додати',
  syncingShort: 'синхр...',
  participants: 'учасників',
  notifyMembers: 'Сповістити учасників',
  notifyMembersDesc: 'Всі учасники з відкритим додатком отримають push-сповіщення.',
  notifyButton: 'Сповістити',
  notifyMessagePh: 'Повідомлення (необовʼязково)...',
  notifyThrottleMsg: 'Сповіщення можна надсилати раз на 10 секунд.',
  notifyForegroundHint: 'Сповіщення доходять учасникам з відкритим додатком.',
  leaveGroupTitle: 'Вийти з групи',
  leaveGroupMsg: 'Покинути «{name}»?',
  leave: 'Вийти',
  refreshCodeNow: 'Оновити код зараз',
  shareCode: 'Код для приєднання',
  shareCodeDesc: 'Поділіться кодом — «{name}»',
  joinTitle: 'Приєднатись до групи',
  joinDesc: 'Введіть секретний код (ABCD-1234). Дійсний 24 год.',
  joinAction: 'Приєднатись',
  newGroupTitle: 'Нова спільна група',
  newGroupDesc: 'Після створення отримаєте код (дійсний 24 год).',
  groupNamePh: 'Назва групи',
  newListTitle: 'Новий список',
  newListType: 'Тип: {type}',
  createList: 'Створити список',
  deleteListTitle: 'Видалити список',
  deleteListMsg: 'Видалити «{name}» та всі елементи?',
  rename: 'Перейменувати',
  renamePh: 'Нова назва',
  emptyListTitle: 'Список порожній',
  emptyListHint: 'Додайте перший елемент нижче',
  showCompleted: 'Показати виконані ({n})',
  hideCompleted: 'Сховати виконані',
  clearCompleted: 'Очистити',
  ofPurchased: '{done} з {total} куплено',
  priorities: { high: 'Висока', medium: 'Середня', low: 'Низька' },
  addPlaceholder: 'Додати...',
  notePlaceholderShort: 'Нотатка...',
  errGeneric: 'Помилка',
  errCreateGroup: 'Не вдалося створити групу.',
  errCreateList: 'Не вдалося створити список.',
  errRename: 'Не вдалося перейменувати.',
  errDelete: 'Не вдалося видалити.',
  errInvalidCode: 'Невірний або застарілий код.',
  errNotifyFailed: 'Не вдалося надіслати сповіщення.',
  offlineBanner: 'Офлайн — зміни синхронізуються після відновлення мережі.',
  amountWithCurrency: 'СУМА ({symbol})',
  compactView: 'Компактний вигляд',
  filterTitle: 'ФІЛЬТР',
  sortTitle: 'СОРТУВАННЯ',
  filterActive: 'Активні',
  filterAll: 'Всі',
  filterDone: 'Виконані',
  sortPriorityShort: 'Пріор.',
  qtyShort: 'К-сть',
  textLabel: 'Текст',
  inGroup: 'у групі',
  edit_: 'Редагувати',
  close_: 'Закрити',
  newCodeAction: 'Оновити код зараз',
  joinCodePh: 'XXXX-0000',
  noteFullPh: 'Нотатка (необовʼязково)',
  notifChangesInSection: 'Зміни у «{name}»',
  notifChangesInGroup: 'У групі зʼявились зміни',

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
  repeat: 'Повторювати',
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
  healthProfile: 'Профіль здоров\'я',
  profileSub: 'Стать, вік, зріст і ціль для персональних норм',
  profileHint: 'Заповніть профіль для персональних цілей',
  sexLabel: 'СТАТЬ',
  male: 'Чоловіча',
  female: 'Жіноча',
  ageLabel: 'ВІК',
  heightLabel: 'ЗРІСТ (СМ)',
  activityLabel: 'РІВЕНЬ АКТИВНОСТІ',
  actSedentary: 'Сидячий',
  actLight: 'Легкий',
  actModerate: 'Помірний',
  actActive: 'Активний',
  actVeryActive: 'Дуже активний',
  goalLabel: 'ЦІЛЬ',
  goalLose: 'Схуднути',
  goalMaintain: 'Підтримка',
  goalGain: 'Набрати',
  saveProfile: 'Зберегти профіль',
  yearsShort: 'р.',
  consumed: 'Спожито',
  burned: 'Спалено',
  deficit: 'дефіцит',
  surplus: 'профіцит',
  dailyLimit: 'Денний ліміт',
  overLimit: 'Перевищено',
  withinLimit: 'У межах норми',
  protein: 'Білки',
  fats: 'Жири',
  carbs: 'Вуглеводи',
  proteinShort: 'б',
  macrosOptional: 'БЖВ (г, необов\'язково)',
  bmi: 'ІМТ',
  bmiUnderweight: 'Недостатня',
  bmiNormal: 'Норма',
  bmiOverweight: 'Надмірна',
  bmiObese: 'Ожиріння',
  reminders: 'Нагадування',
  waterReminder: 'Нагадувати пити воду',
  sleepReminder: 'Нагадувати про сон',
  remindersSub: 'Щоденні нагадування про звички',
  summary: 'Зведена статистика',
  sections: 'Розділи',
  workoutsLabel: 'Тренування',
  workoutsSub: 'Переглянути та додати',
  nutrition: 'Харчування',
  activity: 'Активність',
  sleepRecovery: 'Сон і відновлення',
  bodyMetrics: 'Показники тіла',
  prevention: 'Профілактика',
  dueToday: 'сьогодні',
  restingPulse: 'Пульс спокою',
  insights: 'Інсайти',
  thisWeek: 'цього тижня',
  back: 'Назад',
  bodyMeasurements: 'Заміри тіла',
  bodyMeasurementsSub: 'Вага та обводи',
  addBodyEntry: 'Запис тіла',
  bodyEntryTitle: 'Новий запис',
  mWaist: 'Талія',
  mHips: 'Стегна',
  mChest: 'Груди',
  mThigh: 'Стегно',
  mBiceps: 'Біцепс',
  mNeck: 'Шия',
  mCalf: 'Литка',
  mBodyfat: '% жиру',
  whtr: 'Талія/зріст',
  whr: 'Талія/стегна',
  leanMass: 'Суха маса',
  bodyfatEst: '% жиру (оцінка)',
  whtrHealthy: 'Норма',
  whtrIncreased: 'Підвищений',
  whtrHigh: 'Високий',
  weightReminder: 'Нагадувати зважуватись',
  weightReminderBody: 'Час зважитись 🏋️',
  measurementsReminder: 'Нагадувати про заміри',
  measurementsReminderBody: 'Час зробити заміри тіла 📏',
  noMeasurements: 'Ще немає вимірів',
  perMonth: 'за міс',
  meds: 'Ліки та добавки',
  medsSub: 'Нагадування про прийом',
  checkups: 'Медогляди',
  checkupsSub: 'Аналізи та візити',
  vaccines: 'Щеплення',
  vaccinesSub: 'Календар вакцинації',
  habits: 'Звички',
  habitsSub: 'Щоденні чек-лісти',
  addMed: 'Додати ліки',
  medName: 'НАЗВА',
  medDose: 'ДОЗА',
  medTimes: 'ЧАС ПРИЙОМУ',
  taken: 'Прийнято',
  takeNow: 'Прийняти',
  medActive: 'Активні',
  finished: 'Завершені',
  adherence: 'Дотримання',
  addCheckup: 'Додати огляд',
  addVaccine: 'Додати щеплення',
  title: 'НАЗВА',
  result: 'РЕЗУЛЬТАТ',
  nextDate: 'НАСТУПНА ДАТА',
  kindAnalysis: 'Аналіз',
  kindVisit: 'Візит',
  kindProcedure: 'Процедура',
  doseNo: 'ДОЗА №',
  upcoming: 'Майбутні',
  past: 'Минулі',
  addHabit: 'Додати звичку',
  streak: 'Серія',
  daysStreak: 'дн.',
  exportReport: 'Експорт звіту для лікаря',
  reportSub: 'Поділитися зведенням здоров\'я',

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

  tabContainers: 'Ящики',
  containers: 'Контейнери',
  newContainer: 'Новий контейнер',
  containerName: 'Назва',
  containerNamePlaceholder: 'напр. Коробка на антресолях',
  containerLocation: 'Місцезнаходження',
  containerLocationPlaceholder: 'напр. Коридор, верхня полиця',
  noContainers: 'Немає контейнерів',
  searchItems: 'Пошук речей...',
  addItem: 'Додати річ',
  itemName: 'Назва речі',
  itemNamePlaceholder: 'напр. Зимові рукавиці',
  noItems: 'Контейнер порожній',
  foundIn: 'Знаходиться в',
  editContainer: 'Редагувати контейнер',
  deleteContainer: 'Видалити контейнер',
  containerItems: 'Речі',
  itemTags: 'Теги (через кому)',
  itemNote: 'Нотатка (необов\'язково)',
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
  monthsGenitive: ['January','February','March','April','May','June','July','August','September','October','November','December'],
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
  carryover: 'Carried over',
  currency: 'Currency',
  newCurrency: 'New currency',
  currencyTicker: 'Ticker (BTC, ETH, USDT...)',
  currencySymbol: 'Symbol (optional)',
  primaryCurrency: 'Primary currency',
  primaryCurrencyDesc: 'Currency shown in the main balance card. Others appear smaller below.',
  primaryBadge: 'PRIMARY',
  cryptoBadge: 'CRYPTO',
  cryptoKind: 'Cryptocurrency',
  fiatKind: 'Fiat',
  balanceSplit: 'Balance split',
  balanceSplitDesc: 'Specify how much of the carried-over savings is in each currency. Useful when part of your hryvnia savings is actually in USD or crypto. Monthly income and expenses are not affected.',
  fromTransactions: 'From transactions',
  addCrypto: 'Add cryptocurrency',
  removeCurrencyTitle: 'Remove {code}?',
  removeCurrencyMsg: 'Existing transactions remain, but the currency disappears from filters.',
  remove: 'Remove',
  otherCurrencies: 'Other currencies',
  showAllCount: 'Show all ({count})',
  allCurrencies: 'All currencies',
  sharedTitle: 'Shared',
  noGroups: 'No groups',
  noGroupsHint: 'Create a group or join with a code',
  createGroup: 'Create',
  joinByCode: 'Enter code',
  searchGroups: 'Search groups...',
  searchSections: 'Search lists...',
  noListsFound: 'Nothing found',
  noLists: 'No lists',
  pressPlusToAdd: 'Press + to add',
  syncingShort: 'syncing…',
  participants: 'members',
  notifyMembers: 'Notify members',
  notifyMembersDesc: 'All members with the app open will receive a push notification.',
  notifyButton: 'Notify',
  notifyMessagePh: 'Message (optional)...',
  notifyThrottleMsg: 'You can send a notification once per 10 seconds.',
  notifyForegroundHint: 'Notifications reach members with the app open.',
  leaveGroupTitle: 'Leave group',
  leaveGroupMsg: 'Leave «{name}»?',
  leave: 'Leave',
  refreshCodeNow: 'Refresh code now',
  shareCode: 'Join code',
  shareCodeDesc: 'Share the code — «{name}»',
  joinTitle: 'Join group',
  joinDesc: 'Enter secret code (ABCD-1234). Valid 24h.',
  joinAction: 'Join',
  newGroupTitle: 'New shared group',
  newGroupDesc: 'After creation you receive a code (valid 24h).',
  groupNamePh: 'Group name',
  newListTitle: 'New list',
  newListType: 'Type: {type}',
  createList: 'Create list',
  deleteListTitle: 'Delete list',
  deleteListMsg: 'Delete «{name}» and all items?',
  rename: 'Rename',
  renamePh: 'New name',
  emptyListTitle: 'Empty list',
  emptyListHint: 'Add the first item below',
  showCompleted: 'Show completed ({n})',
  hideCompleted: 'Hide completed',
  clearCompleted: 'Clear',
  ofPurchased: '{done} of {total} bought',
  priorities: { high: 'High', medium: 'Medium', low: 'Low' },
  addPlaceholder: 'Add...',
  notePlaceholderShort: 'Note...',
  errGeneric: 'Error',
  errCreateGroup: 'Failed to create group.',
  errCreateList: 'Failed to create list.',
  errRename: 'Failed to rename.',
  errDelete: 'Failed to delete.',
  errInvalidCode: 'Invalid or expired code.',
  errNotifyFailed: 'Failed to send notification.',
  offlineBanner: 'Offline — changes will sync once back online.',
  amountWithCurrency: 'AMOUNT ({symbol})',
  compactView: 'Compact view',
  filterTitle: 'FILTER',
  sortTitle: 'SORT',
  filterActive: 'Active',
  filterAll: 'All',
  filterDone: 'Completed',
  sortPriorityShort: 'Prio.',
  qtyShort: 'Qty',
  textLabel: 'Text',
  inGroup: 'in group',
  edit_: 'Edit',
  close_: 'Close',
  newCodeAction: 'Refresh code now',
  joinCodePh: 'XXXX-0000',
  noteFullPh: 'Note (optional)',
  notifChangesInSection: 'Changes in «{name}»',
  notifChangesInGroup: 'New changes in the group',

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
  repeat: 'Repeat',
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
  healthProfile: 'Health profile',
  profileSub: 'Sex, age, height & goal for personal targets',
  profileHint: 'Set up your profile for personalized goals',
  sexLabel: 'SEX',
  male: 'Male',
  female: 'Female',
  ageLabel: 'AGE',
  heightLabel: 'HEIGHT (CM)',
  activityLabel: 'ACTIVITY LEVEL',
  actSedentary: 'Sedentary',
  actLight: 'Light',
  actModerate: 'Moderate',
  actActive: 'Active',
  actVeryActive: 'Very active',
  goalLabel: 'GOAL',
  goalLose: 'Lose',
  goalMaintain: 'Maintain',
  goalGain: 'Gain',
  saveProfile: 'Save profile',
  yearsShort: 'y',
  consumed: 'Consumed',
  burned: 'Burned',
  deficit: 'deficit',
  surplus: 'surplus',
  dailyLimit: 'Daily limit',
  overLimit: 'Over limit',
  withinLimit: 'Within limit',
  protein: 'Protein',
  fats: 'Fats',
  carbs: 'Carbs',
  proteinShort: 'p',
  macrosOptional: 'Macros (g, optional)',
  bmi: 'BMI',
  bmiUnderweight: 'Underweight',
  bmiNormal: 'Normal',
  bmiOverweight: 'Overweight',
  bmiObese: 'Obese',
  reminders: 'Reminders',
  waterReminder: 'Water reminder',
  sleepReminder: 'Sleep reminder',
  remindersSub: 'Daily habit reminders',
  summary: 'Summary',
  sections: 'Sections',
  workoutsLabel: 'Workouts',
  workoutsSub: 'View and add',
  nutrition: 'Nutrition',
  activity: 'Activity',
  sleepRecovery: 'Sleep & recovery',
  bodyMetrics: 'Body metrics',
  prevention: 'Prevention',
  dueToday: 'today',
  restingPulse: 'Resting pulse',
  insights: 'Insights',
  thisWeek: 'this week',
  back: 'Back',
  bodyMeasurements: 'Body measurements',
  bodyMeasurementsSub: 'Weight & circumferences',
  addBodyEntry: 'Body entry',
  bodyEntryTitle: 'New entry',
  mWaist: 'Waist',
  mHips: 'Hips',
  mChest: 'Chest',
  mThigh: 'Thigh',
  mBiceps: 'Biceps',
  mNeck: 'Neck',
  mCalf: 'Calf',
  mBodyfat: 'Body fat %',
  whtr: 'Waist/height',
  whr: 'Waist/hips',
  leanMass: 'Lean mass',
  bodyfatEst: 'Body fat % (est.)',
  whtrHealthy: 'Healthy',
  whtrIncreased: 'Increased',
  whtrHigh: 'High',
  weightReminder: 'Weight reminder',
  weightReminderBody: 'Time to weigh in 🏋️',
  measurementsReminder: 'Measurements reminder',
  measurementsReminderBody: 'Time to take body measurements 📏',
  noMeasurements: 'No measurements yet',
  perMonth: '/mo',
  meds: 'Meds & supplements',
  medsSub: 'Intake reminders',
  checkups: 'Checkups',
  checkupsSub: 'Tests & visits',
  vaccines: 'Vaccines',
  vaccinesSub: 'Vaccination calendar',
  habits: 'Habits',
  habitsSub: 'Daily checklists',
  addMed: 'Add medication',
  medName: 'NAME',
  medDose: 'DOSE',
  medTimes: 'INTAKE TIMES',
  taken: 'Taken',
  takeNow: 'Take',
  medActive: 'Active',
  finished: 'Finished',
  adherence: 'Adherence',
  addCheckup: 'Add checkup',
  addVaccine: 'Add vaccine',
  title: 'TITLE',
  result: 'RESULT',
  nextDate: 'NEXT DATE',
  kindAnalysis: 'Analysis',
  kindVisit: 'Visit',
  kindProcedure: 'Procedure',
  doseNo: 'DOSE No',
  upcoming: 'Upcoming',
  past: 'Past',
  addHabit: 'Add habit',
  streak: 'Streak',
  daysStreak: 'd',
  exportReport: 'Export report for doctor',
  reportSub: 'Share your health summary',

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

  tabContainers: 'Storage',
  containers: 'Containers',
  newContainer: 'New Container',
  containerName: 'Name',
  containerNamePlaceholder: 'e.g. Box in the attic',
  containerLocation: 'Location',
  containerLocationPlaceholder: 'e.g. Hallway, top shelf',
  noContainers: 'No containers yet',
  searchItems: 'Search items...',
  addItem: 'Add Item',
  itemName: 'Item name',
  itemNamePlaceholder: 'e.g. Winter gloves',
  noItems: 'Container is empty',
  foundIn: 'Found in',
  editContainer: 'Edit Container',
  deleteContainer: 'Delete Container',
  containerItems: 'Items',
  itemTags: 'Tags (comma separated)',
  itemNote: 'Note (optional)',
};

export const allTranslations: Record<Lang, Translations> = { uk, en };
