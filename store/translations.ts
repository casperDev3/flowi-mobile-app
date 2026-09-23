export type Lang = 'uk' | 'en';

export interface Translations {
  // Tabs
  tabTasks: string;
  tabFinance: string;
  tabHealth: string;
  tabOptions: string;
  tabToday: string;
  todayOverdue: string;
  todayActive: string;
  todayTracked: string;
  todayFocus: string;
  syncPushAll: string;
  syncPushAllMsg: string;
  syncPullAll: string;
  syncPullAllMsg: string;
  syncNeedsOnlineAuth: string;
  enableOnlineAfterLoginMsg: string;
  todayGreetMorning: string;
  todayGreetDay: string;
  todayGreetEvening: string;
  todayGreetNight: string;

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
  // ── Ідеї та баги (app/feedback.tsx, feedback-inbox.md §10) ──
  fbTitle: string;
  fbTypeIdea: string;
  fbTypeBug: string;
  fbTabIdeas: string;
  fbTabBugs: string;
  fbNewIdea: string;
  fbNewBug: string;
  fbEditIdea: string;
  fbEditBug: string;
  fbFieldTitle: string;
  fbTitlePhIdea: string;
  fbTitlePhBug: string;
  fbFieldModule: string;
  fbFieldPlatforms: string;
  fbFieldPlatformsHint: string;
  fbAffectsMobile: string;
  fbAffectsTablet: string;
  fbAffectsWeb: string;
  fbModuleNone: string;
  fbModuleOther: string;
  fbModuleSync: string;
  fbModuleAuth: string;
  fbFieldPriority: string;
  fbFieldSeverity: string;
  fbPrioHigh: string;
  fbPrioMedium: string;
  fbPrioLow: string;
  fbSevCritical: string;
  fbSevMajor: string;
  fbSevMinor: string;
  fbFieldDescription: string;
  fbOptional: string;
  fbDescPhIdea: string;
  fbDescPhBug: string;
  fbFieldSteps: string;
  fbStepsPh: string;
  fbFieldExpected: string;
  fbExpectedPh: string;
  fbFieldActual: string;
  fbActualPh: string;
  fbFieldAttachments: string;
  fbAttachHint: string;
  fbAttachLocked: string;
  fbAddAttachment: string;
  fbRemoveAttachment: string;
  fbAttachTooMany: string;
  fbAttachBadType: string;
  fbAttachTooBig: string;
  fbAttachTotal: string;
  fbAttachCacheEvicted: string;
  fbAttachLocal: string;
  fbAttachUploaded: string;
  fbAttachFailed: string;
  fbAttachElsewhere: string;
  fbUnitMb: string;
  fbUnitKb: string;
  fbContext: string;
  fbContextHint: string;
  fbCtxPlatform: string;
  fbCtxDevice: string;
  fbCtxVersion: string;
  fbCtxOs: string;
  fbCtxScreen: string;
  fbCtxWorkspace: string;
  fbPlatformMobile: string;
  fbPlatformWeb: string;
  fbDevicePhone: string;
  fbDeviceTablet: string;
  fbDeviceDesktop: string;
  fbSave: string;
  fbSaveDraft: string;
  fbSaveAndSend: string;
  fbSend: string;
  fbRetry: string;
  fbEditAfterSent: string;
  fbRequiredMissing: string;
  fbSaveFailed: string;
  fbSendError: string;
  fbStateDraft: string;
  fbStateQueued: string;
  fbQueuedHint: string;
  fbStateSent: string;
  fbStateSentNew: string;
  fbStateInProgress: string;
  fbStateDone: string;
  fbStateRejected: string;
  fbStateFailed: string;
  fbStateUndelivered: string;
  fbStateLocalOnly: string;
  fbStateLegacy: string;
  fbStateDuplicate: string;
  fbOwnerComment: string;
  fbTaskLinked: string;
  fbForwardingOff: string;
  fbFilterAll: string;
  fbFilterOpen: string;
  fbFilterDone: string;
  fbFilterSent: string;
  fbSortNewest: string;
  fbSortOldest: string;
  fbStatOpen: string;
  fbStatDone: string;
  fbStatSent: string;
  fbEmptyIdeas: string;
  fbEmptyBugs: string;
  fbEmptyHint: string;
  fbLoadFailed: string;
  fbSelectHint: string;
  fbDoneIdea: string;
  fbDoneBug: string;
  fbMarkImplemented: string;
  fbMarkFixed: string;
  fbReopen: string;
  fbDeleteTitle: string;
  fbDeleteBody: string;
  fbCopied: string;
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
  noTasksTodayHint: string;
  showAllTasks: string;
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
  sortStatus: string;
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
  priorityNone: string;         // "Без пріоритету"
  priorityA11y: string;         // "Пріоритет {level}"
  priorityFilterReset: string;  // "Скинути"
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
  timerWorkflowMissingTitle: string;
  timerWorkflowMissingMessage: string;
  startTimer: string;
  stopTimer: string;
  nothingFound: string;
  noTasks: string;
  overdueSection: string;
  voiceNote: string;
  applyFilters: string;
  addTask: string;
  addNote: string;
  tryAnotherQuery: string;
  pressToAdd: string;
  searchPlaceholder: string;
  /** Пошук усередині списку вибору (статус, проєкт). */
  pickerSearch: string;
  pickerNothingFound: string;
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
  /** Назва не влізла в id запису — перевіряє форма, бо сховище мовчки відкидає. */
  categoryNameTooLong: string;
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
  // Finance — рахунки та перекази
  account: string;
  accounts: string;
  accountCash: string;
  accountCard: string;
  accountSavings: string;
  accountDefaultName: string;      // назва рахунку, створеного міграцією
  newAccount: string;
  openingBalance: string;
  tasksScopeWeek: string;
  tasksNoDeadlineA11y: string;
  noTasksWeekTitle: string;
  noDatedTasksHint: string;
  statusLinkAskPersonalTitle: string;
  statusLinkAskPersonalBody: string;
  statusLinkAskProjectTitle: string;
  statusLinkAskProjectBody: string;
  statusLinkKeepAsIs: string;
  monthNet: string;
  totalOnAccounts: string;
  balanceBreakdown: string;
  breakdownOpening: string;
  breakdownIncome: string;
  breakdownExpense: string;
  breakdownTransfersIn: string;
  breakdownTransfersOut: string;
  breakdownFuture: string;
  breakdownBalance: string;
  openingBalanceHint: string;
  balanceWillBe: string;
  reconcileBalance: string;
  reconcileActualLabel: string;
  reconcileDelta: string;
  unassignedTxWarning: string;
  markTransferPairTitle: string;
  markTransferPairHint: string;
  markTransferPairDelete: string;
  markTransferPairKeep: string;
  selectAccount: string;
  noAccounts: string;
  noAccountsHint: string;
  accountArchived: string;
  archiveAccount: string;
  unarchiveAccount: string;
  accountCurrencyLocked: string;
  transfer: string;
  transferFrom: string;
  transferTo: string;
  transferReceived: string;        // сума, що дійшла на рахунок призначення
  transferRate: string;
  transfersNotCounted: string;
  markAsTransfer: string;
  markTransferSameCurrency: string;
  // Shared
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
  // Копіювання завдання як Markdown (utils/taskMarkdown.ts) і підзавдання
  copyTask: string;
  copySubtask: string;
  taskCopied: string;
  subtaskCopied: string;
  copyMdProject: string;
  copyMdSprint: string;
  copyMdStatus: string;
  copyMdDeadline: string;
  copyMdSubtasks: string;
  subtaskDuplicate: string;
  subtaskCopySuffix: string;
  // Ліміт 15 у групі списку й екран «Всі (N)»
  groupShowAll: string;          // "Всі ({count})"
  groupShowAllA11y: string;      // "Показати всі завдання групи «{name}»: {count}"
  groupEmpty: string;
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
  /** Дія в пікері проєктів: така назва вже є в архіві, тож повертаємо її. */
  unarchiveProject: string;
  projectName: string;

  // Meetings screen
  meetingsTitle: string;
  meetingPickHint: string;
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
  // Periods + summary page
  pDay: string;
  pWeek: string;
  pMonth: string;
  pQuarter: string;
  pYear: string;
  healthSummary: string;
  total: string;
  average: string;
  dynamics: string;
  noDataPeriod: string;
  chartBar: string;
  chartLine: string;
  chartDots: string;
  // Online / offline mode
  workMode: string;
  modeOnline: string;
  modeOffline: string;
  offlineDesc: string;
  onlineDesc: string;
  unavailableOffline: string;
  enableOnline: string;
  offlineBadge: string;
  onlineBadge: string;
  sendUnavailableOffline: string;
  // Today screen — new sections
  quickAddTask: string;
  quickAddExpense: string;
  quickAddWater: string;
  quickTimer: string;
  todayTasks: string;
  todayMeetings: string;
  todayHabits: string;
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
  notifGroupDaily: string;
  notifDisableConfirm: string;
  notifReenableHint: string;
  notifRecurring: string;

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
  bankCreateTx: string;
  bankCreateTxHint: string;

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
  containerPickHint: string;
  // Containers v2 (ctr* — flowi-web-app/docs/specs/containers.md)
  ctrViewGrid: string;
  ctrViewPlaces: string;
  ctrAllBoxes: string;
  ctrNoPlace: string;
  ctrPlaces: string;
  ctrPlaceNew: string;
  ctrPlaceEdit: string;
  ctrPlaceName: string;
  ctrPlaceNamePlaceholder: string;
  ctrPlaceKind: string;
  ctrPlaceKindRoom: string;
  ctrPlaceKindFurniture: string;
  ctrPlaceKindShelf: string;
  ctrPlaceKindOther: string;
  ctrPlaceParent: string;
  ctrPlaceTopLevel: string;
  ctrPlaceDelete: string;
  ctrPlaceDeleteMsg: string;
  ctrPlaceTooDeep: string;
  ctrPlaceCreateHere: string;
  ctrPlacesEmpty: string;
  ctrLegacyLocation: string;
  ctrItemQty: string;
  ctrItemStatus: string;
  ctrStatusInBox: string;
  ctrStatusLent: string;
  ctrStatusDiscarded: string;
  ctrLentTo: string;
  ctrLentToPlaceholder: string;
  ctrLentAt: string;
  ctrLentCount: string;
  ctrLend: string;
  ctrReturned: string;
  ctrDiscard: string;
  ctrRestore: string;
  ctrShowDiscarded: string;
  ctrHideDiscarded: string;
  ctrEditItem: string;
  ctrNewItem: string;
  ctrLentNeedsName: string;
  ctrQtyLess: string;
  ctrQtyMore: string;
  ctrUnits: string;
  ctrItemsOne: string;
  ctrItemsFew: string;
  ctrItemsMany: string;
  ctrEmptyBox: string;
  ctrAddItemHint: string;
  ctrNewItemPlaceholder: string;
  ctrTagsPlaceholder: string;
  ctrNotePlaceholder: string;
  ctrDeleteItem: string;
  ctrDeleteItemMsg: string;
  ctrColor: string;
  ctrEmptyHint: string;
  ctrFound: string;
  ctrNothingFound: string;
  ctrNoBoxesHere: string;
  ctrReadFailed: string;
  ctrRetry: string;
  ctrPhotos: string;
  ctrPhotoAdd: string;
  ctrPhotoCamera: string;
  ctrPhotoLibrary: string;
  ctrPhotoRemove: string;
  ctrPhotoCover: string;
  ctrPhotoCoverBadge: string;
  ctrPhotoLimit: string;
  ctrPhotoPending: string;
  ctrPhotoFailed: string;
  ctrPhotoPermission: string;
  ctrPhotoUnavailable: string;
  ctrPhotoQueued: string;
  ctrScan: string;
  ctrScanHint: string;
  ctrScanTorch: string;
  ctrScanManual: string;
  ctrScanManualPlaceholder: string;
  ctrScanManualGo: string;
  ctrScanInvalidCode: string;
  ctrScanOtherWorkspace: string;
  ctrScanNotFoundOffline: string;
  ctrScanNotFound: string;
  ctrScanChecking: string;
  ctrScanForeign: string;
  ctrScanSearchAs: string;
  ctrScanPermission: string;
  ctrScanGrant: string;
  ctrScanNoCamera: string;
  ctrPrint: string;
  ctrPrintPreset: string;
  ctrPrintSmall: string;
  ctrPrintSmallHint: string;
  ctrPrintMedium: string;
  ctrPrintMediumHint: string;
  ctrPrintLarge: string;
  ctrPrintLargeHint: string;
  ctrPrintSelect: string;
  ctrPrintSelectAll: string;
  ctrPrintSelectNone: string;
  ctrPrintGo: string;
  ctrPrintNoCode: string;
  ctrPrintNoWorkspace: string;
  ctrPrintFailed: string;
  ctrPrintUnavailable: string;
  ctrQr: string;
  ctrQrCreate: string;
  ctrQrNone: string;
  ctrQrHint: string;
  ctrQrPrintOne: string;
  ctrQuickSearchPlaceholder: string;
  ctrQuickSearchOpen: string;

  // Undo toast
  undo: string;
  taskMarkedDone: string;
  taskDeleted: string;
  noteDeleted: string;
  transactionDeleted: string;
  amount: string;
  transactionEdited: string;
  editTransaction: string;

  // Auth & Account
  sectionAccount: string;
  authLogin: string;
  authRegister: string;
  authLogout: string;
  logoutConfirm: string;
  authEmail: string;
  authPassword: string;
  authPasswordRepeat: string;
  authName: string;
  authInvalidEmail: string;
  authInvalidCreds: string;
  authEmailTaken: string;
  authWeakPassword: string;
  authPasswordsMismatch: string;
  authNoAccount: string;
  authHaveAccount: string;
  authOfflineError: string;
  authNetworkError: string;
  authServerError: string;
  /** 429 від throttle, коли сервер сказав, коли повторити. {n} — хвилини. */
  authTooManyAttemptsIn: string;
  authShowPassword: string;
  authHidePassword: string;
  budgetOtherCurrenciesHint: string;
  welcomeSubtitle: string;
  onlineNeedsAccount: string;
  onlineNeedsAccountMsg: string;
  sessionExpired: string;
  sessionExpiredMsg: string;

  // Workspace (§2 плану WORKSPACE_PROJECTS_PLAN.md)
  workspaceScreenTitle: string;
  workspaceSubtitle: string;
  workspaceAddressLabel: string;
  workspaceAddressPlaceholder: string;
  workspaceCheckButton: string;
  workspaceContinueButton: string;
  workspaceChecking: string;
  workspaceFirstAccountHint: string;
  workspaceErrorInvalidUrl: string;
  workspaceErrorInsecureUrl: string;
  workspaceErrorNetwork: string;
  workspaceErrorNetworkScheme: string;
  workspaceErrorServerUnavailable: string;
  workspaceErrorNotWorkspace: string;
  workspaceErrorUpdateApp: string;
  workspaceErrorUpdateServer: string;
  workspaceErrorUpdateAppTo: string;
  workspaceErrorChanged: string;
  workspaceChangeLink: string;
  workspaceSwitchConfirmTitle: string;
  workspaceSwitchConfirmMsg: string;
  workspaceSwitchOutboxWarning: string;
  workspaceSwitchButton: string;
  workspaceSwitchSyncFailedTitle: string;
  workspaceSwitchSyncFailedMsg: string;
  workspaceSwitchProceedAnyway: string;
  workspaceIncompatibleTitle: string;
  workspaceCurrentLabel: string;
  authRegistrationPending: string;
  authRegistrationRejected: string;

  // Реєстрація в режимі "за погодженням"
  registrationPendingTitle: string;
  registrationPendingMsg: string;
  registrationPendingChecking: string;
  registrationPendingRejectedTitle: string;
  registrationPendingRejectedMsg: string;
  registrationPendingBack: string;
  registrationPendingCancel: string;
  registrationPendingCancelConfirm: string;

  // Адміністрування workspace
  adminWorkspaceTitle: string;
  settingsAdminWorkspace: string;
  adminRequestsSection: string;
  adminUsersSection: string;
  adminSettingsSection: string;
  adminNoRequests: string;
  adminApprove: string;
  adminReject: string;
  adminRejectReasonPrompt: string;
  adminRegistrationModeLabel: string;
  adminRegistrationModeOpen: string;
  adminRegistrationModeApproval: string;
  adminMakeAdmin: string;
  adminRevokeAdmin: string;
  adminDeactivateUser: string;
  adminActivateUser: string;
  /**
   * Мінор із ревʼю: обидві дії руйнівні й НЕ мають зворотної кнопки «Скасувати»
   * дію заднім числом (адмін втрачає доступ до цього ж екрана; деактивований
   * втрачає сесію) — підтвердження перед викликом, а не одразу після тапу.
   */
  adminConfirmRevokeAdminMsg: string;
  adminConfirmDeactivateMsg: string;
  adminYouLabel: string;
  adminInvitedByLabel: string;
  adminLastAdminError: string;
  adminCannotDeactivateSelfError: string;
  adminAlreadyDecidedError: string;
  adminEmailTakenError: string;
  adminAdminBadge: string;
  adminOffBadge: string;
  adminLoadError: string;
  adminRetry: string;
  adminActionFailedTitle: string;

  // Об'єднання локальних даних з акаунтом при вході
  mergeDataTitle: string;
  mergeDataMsg: string;
  mergeDataMerge: string;
  mergeDataUseAccount: string;

  // Sync — cloud
  later: string;
  cloudSync: string;
  syncNow: string;
  lastSyncAt: string;
  syncPending: string;
  syncError: string;
  syncConflictsCount: string;
  syncGuestHint: string;
  syncOfflineHint: string;
  syncLocalOnlyTitle: string;
  syncLocalOnlyHint: string;
  syncLocalOnlyAction: string;
  localDesktopSync: string;

  // Offline banner (read-only mode)
  offlineReadOnly: string;

  // Accessibility labels (icon-only buttons)
  a11yOptions: string;
  a11yViewMode: string;

  // Forgot / Reset password
  authForgotPassword: string;
  authForgotPasswordTitle: string;
  authSendCode: string;
  authCodeSentHint: string;
  authEnterCode: string;
  authNewPassword: string;
  authChangePasswordBtn: string;
  authCodeInvalid: string;
  authCodeExpired: string;
  authTooManyAttempts: string;

  // Account management
  accountManage: string;
  accountDisplayName: string;
  accountSaveName: string;
  accountNameSaved: string;
  accountOldPassword: string;
  accountChangePassword: string;
  accountPasswordChanged: string;
  accountDangerZone: string;
  accountDeleteAccount: string;
  accountDeleteConfirmTitle: string;
  accountDeleteConfirmMsg: string;
  accountDeletedMsg: string;
  accountDeleteConfirmPwd: string;
  accountDeleteOwnsProjectsError: string;
  accountDeleteLastAdminError: string;

  // Shared screen — invite deeplink
  shareInviteBtn: string;
  shareInviteText: string;
  // Sidebar (широкий екран) — групи й пункти повторюють веб (NAV_GROUPS)
  navGroupMain: string;
  navGroupTools: string;
  navGroupMore: string;
  navGroupWork: string;
  navGroupPersonal: string;
  navGroupDev: string;
  navTimeTracker: string;
  navBudget: string;
  navMeetings: string;
  navTime: string;
  navHealthSummary: string;

  // Порожня колонка деталі (master-detail)
  detailEmptyTitle: string;
  detailEmptyHint: string;
  noTasksMatchFilters: string;
  noTasksMatchFiltersHint: string;
  /** Готові підписи кварталів. Не шаблон: українська нумерує їх
   *  римськими, англійська арабськими, і підстановка «{n}» дала б
   *  в одній із мов беззмістовне «QIII». */
  quarters: string[];

  // Історія завдання
  historyEmpty: string;
  historyCreated: string;
  historyEdited: string;
  historyDone: string;
  historyRestored: string;
  historyTimerStart: string;
  historyTimerStop: string;
  historySubtaskAdd: string;
  historySubtaskDone: string;
  historySubtaskUndone: string;

  // Таймер завдання
  startedAtLabel: string;
  timerHint: string;
  statusLabel: string;
  reminderAtLabel: string;
  hoursShort: string;
  minutesShort: string;
  viewAllSubtasks: string;

  // Активні таймери (спільний реєстр active_timers)
  activeTimers: string;
  newTimer: string;
  noActiveTimers: string;
  noActiveTimersHint: string;
  fullscreenTimers: string;
  focusMode: string;
  exitFullscreen: string;
  startTimerAction: string;
  stopTimerAction: string;
  timerLabel: string;
  parallelTimers: string;
  /** Деталь зустрічі (components/meetings/MeetingDetail.tsx). */
  meetingNotTracked: string;
  meetingTrackedBefore: string;
  meetingTimerStart: string;
  meetingTimerStop: string;
  meetingTimerStartA11y: string;
  meetingTimerStopA11y: string;
  meetingRecordings: string;
  meetingRecordingItem: string;
  meetingRecord: string;
  meetingDaysAgo: string;
  meetingOpenLink: string;
  /** Згорнути розгорнутий список («Показати всі (N)» ↔ «Згорнути»). */
  collapseList: string;
  /** Підтвердження: тап по зустрічі, поки редагується завдання. */
  discardTaskEditTitle: string;
  discardTaskEditMsg: string;
  discardChanges: string;

  /** Витрати, що не потрапили в ліміт через іншу валюту. */
  budgetUncounted: string;

  /** Деталь проєкту. Див. utils/projectStats. */
  projectDeadline: string;
  /** Підказка формату текстового поля дати (Таймлайн проєкту — редагування дат). */
  dateInputFormatHint: string;
  /** Alert, коли текст у полі дати не парситься/поза календарними межами. */
  invalidDateInput: string;
  projectDescription: string;
  projectTasks: string;
  projectTracked: string;
  projectOverdueTasks: string;
  projectNearest: string;
  projectAddTask: string;
  projectNoTasks: string;
  projectNoTasksHint: string;
  projectGroupByLabel: string;
  projectGroupByNone: string;
  projectPickHint: string;
  projectDone: string;
  projectTimelineSpread: string;
  projectTimelineEmpty: string;

  /**
   * Спринти — іменовані пачки задач усередині проєкту (utils/sprintUtils.ts).
   * Дати (startDate/endDate) — необовʼязкові; їхні підписи — у блоці
   * статистики проєктів нижче.
   */
  sprints: string;
  sprintNew: string;
  sprintNamePlaceholder: string;
  sprintRename: string;
  sprintClose: string;
  sprintReopen: string;
  sprintClosedLabel: string;
  sprintBacklog: string;
  sprintNoSprints: string;
  sprintNoSprintsHint: string;
  sprintEmpty: string;
  sprintMoveTitle: string;
  sprintMoveHint: string;
  sprintMoveToBacklog: string;
  sprintPick: string;
  sprintNoProject: string;
  /** Поле «Спринт» у формі задачі (CONTRACT §D.3). */
  sprintField: string;
  sprintClosedSuffix: string;
  sprintForeignProject: string;
  /** Плейсхолдер рядка додавання задачі у конкретний спринт; {name} — назва спринта. */
  sprintAddTaskIn: string;
  sprintAddTaskA11y: string;
  /**
   * Статистика проєктів і спринтів (docs/specs/projects-analytics.md §8.1):
   * лічильники картки, портфель, дати спринтів, велосіті, burndown. Числа рахує
   * utils/projectStatsMetrics.ts; число завжди ПІСЛЯ двокрапки чи в {n} —
   * без форм множини.
   */
  projectInProgress: string;
  projectAssigned: string;
  projectUnassigned: string;
  projectBacklog: string;
  projectFunnelA11y: string;
  projectFlagA11y: string;
  sprintCurrent: string;
  sprintDaysLeft: string;
  sprintLastDay: string;
  sprintOverdue: string;
  sprintOverdueDays: string;
  sprintUndated: string;
  sprintProgressA11y: string;
  sprintStartDate: string;
  sprintEndDate: string;
  sprintDatesHint: string;
  sprintDatesPartial: string;
  sprintDatesInvalid: string;
  sprintDatesOrder: string;
  sprintDatesOverlap: string;
  sprintNotDated: string;
  velocityTitle: string;
  velocityNotEnough: string;
  velocityAverage: string;
  velocityDays: string;
  velocityTasks: string;
  velocityForecast: string;
  velocitySample: string;
  velocityUndated: string;
  velocityEmpty: string;
  burndownTitle: string;
  burndownIdeal: string;
  burndownActual: string;
  burndownScope: string;
  burndownNoDoneDate: string;
  burndownCarriedIn: string;
  burndownInsufficient: string;
  burndownShow: string;
  burndownHide: string;
  portfolioKpi: string;
  portfolioProjects: string;
  portfolioTasks: string;
  portfolioCollapse: string;
  portfolioExpand: string;
  doneByWeekTitle: string;
  portfolioWeeksTotal: string;
  portfolioAvgWeekly: string;
  portfolioEarlier: string;
  openFullTaskForm: string;
  /** Секція «Зустрічі» деталі проєкту. */
  projectMeetingsPast: string;      // "Минулі ({count})"
  projectMeetingsEmpty: string;
  projectMeetingsNoUpcoming: string;

  /**
   * Аналітика проєктів: чотири графіки й Гантт. Числа рахує
   * utils/projectCharts.ts — тут лише підписи.
   *
   * Підписи навмисно не мають форм множини: українська вимагає три
   * («1 задача», «2 задачі», «5 задач»), англійська дві, і копія цього правила
   * в кожному з чотирьох графіків розійшлася б швидше, ніж хтось її помітив.
   * Тому число завжди стоїть ПІСЛЯ двокрапки — так рядок правильний для
   * будь-якого значення обома мовами.
   */
  projectAnalytics: string;
  projectAnalyticsHint: string;
  chartColumns: string;
  chartDoneWeeks: string;
  chartDeadlinesAhead: string;
  chartTimeSpent: string;
  chartWeeksSpan: string;
  chartTimerSessions: string;
  chartNoTasksInScope: string;
  chartNoSessions: string;
  chartDoneEarlier: string;
  chartDoneUndated: string;
  chartOverdueDebt: string;
  chartBeyondHorizon: string;
  chartNoDeadline: string;
  ganttLegendReal: string;
  ganttLegendEstimated: string;
  ganttLegendColor: string;
  ganttToday: string;
  ganttNothingToDraw: string;
  ganttNoStartDate: string;
  ganttHidden: string;
  ganttStartFromCreated: string;
  ganttStartExact: string;
  ganttEndDeadline: string;
  ganttEndDone: string;
  ganttEndOpen: string;
  ganttDaysShort: string;

  /** Циферблати таймера. Див. utils/timerDials. */
  dialPicker: string;
  dialDigits: string;
  dialRings: string;
  dialChrono: string;
  dialFlip: string;
  dialDots: string;
  dialArc: string;
  dialHourglass: string;
  dialOrbit: string;
  dialSegment: string;
  dialTape: string;
  /** Синхронізований типовий циферблат (timer_dial_prefs.defaultDial). */
  dialMakeDefault: string;      // "Зробити типовим"
  dialIsDefault: string;        // "Типовий"
  dialMakeDefaultHint: string;  // a11y: довге натискання робить типовим
  /** Глобальна панель активних таймерів (components/time/ActiveTimersBar). */
  timersCountOne: string;       // "{n} таймер"
  timersCountFew: string;       // "{n} таймери"
  timersCountMany: string;      // "{n} таймерів"
  activeTimersExpandA11y: string;
  timerKindTask: string;
  timerKindMeeting: string;
  timerKindAdhoc: string;

  /** Прикріплення завдання до таймера на вкладці Час. */
  attachTask: string;
  detachTask: string;
  pickTaskTitle: string;
  freeTimerHint: string;

  /** Одиниці тривалості. Див. utils/durationFormat. */
  unitHour: string;
  unitHourLong: string;
  unitMinute: string;
  txEmptyTitle: string;
  txEmptyHint: string;
  unitKcal: string;
  unitKg: string;
  unitGram: string;

  /** Підписки (регулярні платежі). Див. utils/subscriptions.ts. */
  navSubscriptions: string;
  subNew: string;
  subEditTitle: string;
  subName: string;
  subNamePlaceholder: string;
  subAmountPerCycle: string;
  subPeriod: string;
  subEvery: string;
  subNextPayment: string;
  subEndDate: string;
  subIndefinite: string;
  subSetEndDate: string;
  subReminder: string;
  subReminderDayOf: string;
  subReminder1: string;
  subReminder3: string;
  subReminder7: string;
  subColor: string;
  subNoCategory: string;
  subNoAccount: string;
  subAccountHint: string;
  subUrl: string;
  subRenew: string;
  subRenewConfirm: string;
  subRenewHint: string;
  subRenewAmount: string;
  subRenewStale: string;
  subOverdue: string;
  subArchiveAction: string;
  subArchivedChip: string;
  subEnded: string;
  subArchiveCount: string;
  subDeleteTitle: string;
  subDeleteMsg: string;
  subHistory: string;
  subHistoryEmpty: string;
  subPerMonth: string;
  subPerYear: string;
  subTotals: string;
  subEmptyTitle: string;
  subEmptyHint: string;
  subSelectHint: string;
  subInDays: string;
  subOverdueDays: string;
  subUpcoming: string;
  subUpcomingWithin: string;
  subFormInvalid: string;
  subEndBeforeNext: string;
  subProjectEmpty: string;
  subNoProjectFilter: string;
  subSaveError: string;
  subNotifBeforeTitle: string;
  subNotifBeforeBody: string;
  subNotifDueTitle: string;
  subNotifDueBody: string;
  subNotifOverdueTitle: string;
  subNotifOverdueBody: string;
  subNotifEndTitle: string;
  subNotifEndBody: string;
  // Локальні нагадування (store/notifications.ts)
  notifChannelReminders: string;
  notifTaskTitle: string;
  notifSubtaskTitle: string;
  notifMeetingTitle: string;

  // Простір проєкту (WORKSPACE_PROJECTS_PLAN.md §3)
  projectNavOverview: string;
  projectNotFound: string;
  overviewHoursThisWeek: string;
  overviewUpcomingMeetings: string;
  overviewBudgetSpent: string;
  notesSortTitle: string;
  notesSearch: string;
  notesPersonal: string;
  notesSelectHint: string;
  notesNoResults: string;
  notesReadOnly: string;
  notesUnsavedTitle: string;
  notesUnsavedBody: string;
  notesEmptyError: string;
  notesSaveError: string;
  notesReadError: string;
  notesRetry: string;
  notesDeleteConfirm: string;
  noteBodyPlaceholder: string;
  timeManualTask: string;
  timeManualMinutes: string;
  timeNoEntries: string;
  projectModuleDisabled: string;
  projectBudgetOwnerOnly: string;
  projectBudgetLimit: string;
  projectBudgetTransactions: string;
  projectBudgetNoTransactions: string;
  projectSettingsInfo: string;
  projectNamePlaceholder: string;
  projectDescriptionPlaceholder: string;
  projectTemplateLabel: string;
  projectTemplateSimple: string;
  projectTemplateWork: string;
  projectSettingsModules: string;
  projectSettingsStatuses: string;
  projectStatusAdd: string;
  projectStatusSeed: string;
  projectStatusNew: string;
  statusTypeTodo: string;
  statusTypeInProgress: string;
  statusTypeDone: string;
  projectExitToPersonal: string;
  projectSwitcherTitle: string;
  projectSwitcherRecent: string;
  projectSwitcherAll: string;
  projectSwitcherEmpty: string;

  // Команда проєкту (WORKSPACE_PROJECTS_PLAN.md §4, контракт §4.2–4.3)
  projectMembersTitle: string;
  projectMembersYou: string;
  projectMembersCount: string;
  roleOwner: string;
  roleMember: string;
  roleViewer: string;
  projectMembersChangeRole: string;
  projectMembersRemove: string;
  projectMembersRemoveConfirm: string;
  projectMembersLeave: string;
  projectMembersLeaveConfirm: string;
  projectMembersLeaveUnsyncedWarning: string;
  projectMembersOwnerCannotLeave: string;
  projectMembersTransferOwnership: string;
  projectMembersTransferOwnershipHint: string;
  projectMembersTransferOwnershipConfirm: string;
  projectMembersTransferOwnershipNoMembers: string;
  projectMembersInviteMaxUses: string;
  projectMembersInviteMaxUsesUnlimited: string;
  projectMembersInvitedBy: string;
  projectMembersInviteSection: string;
  projectMembersCreateLink: string;
  projectMembersLinkRole: string;
  projectMembersLinkExpiry: string;
  projectMembersExpiry24h: string;
  projectMembersExpiry7d: string;
  projectMembersExpiry30d: string;
  projectMembersLinkCreated: string;
  projectMembersShareLink: string;
  projectMembersCopyLink: string;
  projectMembersLinkCopied: string;
  projectMembersActiveLinks: string;
  projectMembersRevokeLink: string;
  projectMembersRevokeConfirm: string;
  projectMembersInviteByEmail: string;
  projectMembersEmailPlaceholder: string;
  projectMembersSendInvite: string;
  projectMembersEmailInviteSent: string;
  projectMembersEmailUserNotFound: string;
  projectMembersEmailAlreadyMember: string;
  projectSettingsMembersRow: string;
  projectMembersError: string;
  projectMembersOfflineHint: string;

  // Коментарі та @згадки (§4.4)
  commentsTitle: string;
  commentsEmpty: string;
  commentsPlaceholder: string;
  commentsSend: string;
  commentsEdited: string;
  commentsEditAction: string;
  commentsDeleteAction: string;
  commentsDeleteConfirm: string;
  commentsSaveEdit: string;
  commentsCancelEdit: string;

  // Стрічка активності проєкту (§4.6)
  projectActivityTitle: string;
  projectActivityEmpty: string;
  projectActivityError: string;
  projectActivityShowAll: string;
  projectActivityLoadMore: string;
  projectActivityCreated: string;      // "{actor} створив(ла) «{title}»"
  projectActivityUpdated: string;      // "{actor} оновив(ла) «{title}»"
  projectActivityDeleted: string;      // "{actor} видалив(ла) «{title}»"
  projectActivityStatusChanged: string; // "{actor} змінив(ла) статус «{title}»: {from} → {to}"
  projectActivityAssigned: string;     // "{actor} призначив(ла) виконавця у «{title}»"
  projectActivityCommented: string;    // "{actor} прокоментував(ла) «{title}»"
  projectActivityMemberJoined: string; // "{actor} приєднався(лася) до проєкту"
  projectActivityMemberLeft: string;   // "{actor} покинув(ла) проєкт"
  projectActivityRoleChanged: string;  // "{actor} змінив(ла) роль"
  projectActivityUnknownActor: string;

  // Запрошення — deep link ftrackingapp://invite (контракт §4.3)
  inviteScreenTitle: string;
  inviteLoading: string;
  inviteCheckingWorkspace: string;
  inviteSwitchWorkspaceTitle: string;
  inviteSwitchWorkspaceMsg: string;
  inviteSwitchWorkspaceConfirm: string;
  inviteWorkspaceUnreachable: string;
  inviteInvalid: string;
  inviteExpired: string;
  inviteInvitedByLabel: string;
  inviteExpiresLabel: string;
  inviteJoinButton: string;
  inviteJoining: string;
  inviteAlreadyMember: string;
  inviteJoinedTitle: string;
  inviteJoinedOpenProject: string;
  inviteLoginButton: string;
  inviteRegisterButton: string;
  inviteGuestHint: string;
  inviteNetworkError: string;
  inviteConfirmWorkspaceTitle: string;
  inviteConfirmWorkspaceMsg: string;
  inviteConfirmWorkspaceButton: string;
  registerInvitedTitle: string;
  registerInvitedMsg: string;
  /**
   * Контракт §2.4: `400 invite_invalid` / `410 invite_expired` на
   * `POST /auth/register/` — сервер не зареєстрував акаунт узагалі (не лише
   * «запрошення не додалось»), клієнт пропонує продовжити реєстрацію БЕЗ
   * `invite_token`, повторивши запит без цього поля (мінор із ревʼю).
   */
  registerInviteBrokenTitle: string;
  registerInviteInvalidMsg: string;
  registerInviteExpiredMsg: string;
  registerContinueWithoutInvite: string;

  // Виконавець завдання (§4.5)
  taskAssignee: string;
  taskAssigneeUnassigned: string;
  taskAssigneeMe: string;

  // Роль-обмежений режим перегляду (viewer, контракт §4.1)
  viewerReadOnlyNotice: string;

  // ─── Бюджет (було utils/budgetStrings.ts) ────────────────────────────────────
  budgetSpentCaps: string;
  budgetBudgetCaps: string;
  budgetLeft: string;
  budgetOutsideLimits: string;
  budgetScopeAll: string;
  budgetScopePersonal: string;
  budgetScopeProject: string;
  budgetScopeLabel: string;
  budgetEmptyTitle: string;
  budgetEmptyBody: string;
  budgetAddManually: string;
  budgetTapHint: string;
  budgetTapRowHint: string;
  budgetMonthlyForecast: string;
  budgetActuallySpent: string;
  budgetPlannedFor: string;
  budgetNewCategory: string;
  budgetName: string;
  budgetNamePlaceholder: string;
  budgetIcon: string;
  budgetAddCategory: string;
  budgetDeleteTitle: string;
  budgetDeleteMsg: string;
  budgetDeleteAction: string;
  budgetErrorExists: string;
  /** `{max}` — MAX_BUDGET_ID_LENGTH; підставляє екран, щоб словник не залежав від utils. */
  budgetErrorTooLong: string;
  budgetUnsyncableRow: string;

  // ─── Нотатки (було utils/notesStrings.ts) ────────────────────────────────────
  notesPreview: string;
  notesEditText: string;
  notesPin: string;
  notesUnpin: string;
  notesPinned: string;
  notesTagsLabel: string;
  notesTagsPlaceholder: string;
  notesTagsAll: string;
  notesLinkTask: string;
  notesLinkMeeting: string;
  notesLinkNone: string;
  notesLinkLost: string;
  notesCreateTask: string;
  notesTaskCreated: string;
  notesTaskCreateError: string;
  notesChecklist: string;
  notesEmptyBody: string;
  notesMarkdownHint: string;

  // ─── Оплата підписки (було PAY_LABELS в UpcomingPaymentsCard) ────────────────
  payAction: string;
  payTitle: string;
  payAmount: string;
  payHint: string;
  payNoAccount: string;
  payConfirm: string;
  payStale: string;
  payTxFailed: string;

  // ─── Модулі інтерфейсу (було moduleText() в store/ui-preferences.ts) ─────────
  modulesTitle: string;
  modulesSubtitle: string;
  modulesSystemNote: string;
  modulesDisabledTitle: string;
  modulesDisabledBody: string;
  modulesOpenSettings: string;
  modulesSettingsRow: string;
  modulesDashboardEmptyTitle: string;
  modulesDashboardEmptyBody: string;

  // ─── «Дані не прочитались» (було TEXT в components/finance/LoadErrorNotice) ──
  loadErrorTitle: string;
  loadErrorBody: string;
  loadErrorRetry: string;
  healthReminderOff: string;
  healthReminderOffSub: string;
  healthNoticeSettings: string;
  hkSyncing: string;
  hkManual: string;
  hkDenied: string;
  hkGrant: string;
  hkFailed: string;

  // ─── Екран «Час» ─────────────────────────────────────────────────────────────
  timeAverageTask: string;
  timeProjectBreakdown: string;
  timeMoreProjects: string;
  timePeriodGroup: string;
  timeModeGroup: string;
  timeGroupingList: string;
  timeGroupingProject: string;
  timeSortDateDesc: string;
  timeSortDateAsc: string;
  timeSortDurationDesc: string;
  timeSortDurationAsc: string;
  timeByProjectSuffix: string;
  timeEmptyHint: string;
  timeAddEntry: string;
  timeEditEntry: string;
  timeNewEntry: string;
  timeEntryTaskLabel: string;
  timeEntryTaskPlaceholder: string;
  timeEntryDateLabel: string;
  timeEntryDatePlaceholder: string;
  timeEntryNotePlaceholder: string;
  timeEntryErrorTask: string;
  timeEntryErrorDuration: string;
  timeEntryErrorDate: string;
  timeDeleteEntryA11y: string;

  // ─── Черга «Перевір N записів» (було ANOMALY_LABEL в utils/timeAnomalies.ts) ─
  anomalyLong: string;
  anomalyMidnight: string;
  anomalyOutlier: string;
  anomalyShort: string;
  anomalyCheckTitle: string;
  anomalyRecordOne: string;
  anomalyRecordFew: string;
  anomalyRecordMany: string;
  anomalyTrimTo: string;
  anomalyMarkNormal: string;
  anomalyShowMore: string;

  // ─── Вкладки розділу «Здоровʼя» ──────────────────────────────────────────────
  healthTabOverview: string;
  healthTabActivity: string;
  healthTabBody: string;
  healthReadFailed: string;
  healthUpdatedAt: string;
  /** Третя метрика калорій — той самий підпис, що у вебі (не «дефіцит/профіцит»). */
  calRemaining: string;
  // ─── Центр сповіщень (app/notifications.tsx, app/settings-notifications.tsx) ─
  ncTabInbox: string;
  ncTabReminders: string;
  ncFilterAll: string;
  ncFilterUnread: string;
  ncMarkAllRead: string;
  ncMarkRead: string;
  ncArchive: string;
  ncOpenSettings: string;
  ncEmptyTitle: string;
  ncEmptySub: string;
  ncEmptyUnreadTitle: string;
  ncOffline: string;
  ncUnavailable: string;
  ncLoadFailed: string;
  ncRetry: string;
  ncLoadMore: string;
  ncUnreadCount: string;
  ncBadgeA11y: string;
  ncUnreadA11y: string;
  ncJustNow: string;
  ncMinutesAgo: string;
  ncHoursAgo: string;
  ncYesterday: string;
  ncCollapsedMore: string;
  ncHiddenByModules: string;
  ncLocalRemindersToggle: string;
  ncLocalRemindersHint: string;
  ncServerRemindersHint: string;
  ncSettingsTitle: string;
  ncSettingsIntro: string;
  ncMaster: string;
  ncMasterSub: string;
  ncPushMaster: string;
  ncPushMasterSub: string;
  ncEmailMaster: string;
  ncChannelInApp: string;
  ncChannelPush: string;
  ncChannelEmail: string;
  ncMatrixTitle: string;
  ncShowEvents: string;
  ncHideEvents: string;
  ncCustomized: string;
  ncResetEvent: string;
  ncChannelA11y: string;
  ncQuietHours: string;
  ncQuietHoursSub: string;
  ncQuietFrom: string;
  ncQuietTo: string;
  ncEarlier: string;
  ncLater: string;
  ncTimezone: string;
  ncMeetingLead: string;
  ncMinutesBefore: string;
  ncSaveFailed: string;
  ncSettingsOffline: string;
  ncNoEvents: string;
  ncCatTasksProjects: string;
  ncCatMeetingsFinance: string;
  ncCatTrainingHealth: string;
  ncCatSystem: string;
  ncEvTaskAssigned: string;
  ncEvTaskStatusChanged: string;
  ncEvTaskMentioned: string;
  ncEvTaskCommented: string;
  ncEvTaskDeadlineSoon: string;
  ncEvTaskOverdue: string;
  ncEvTaskReminder: string;
  ncEvSprintStarted: string;
  ncEvSprintClosed: string;
  ncEvProjectInvite: string;
  ncEvMeetingReminder: string;
  ncEvSubscriptionDue: string;
  ncEvBudgetExceeded: string;
  ncEvBalanceForecast: string;
  ncEvWorkoutAssigned: string;
  ncEvWorkoutToday: string;
  ncEvQuestClosed: string;
  ncEvStreakAtRisk: string;
  ncEvMeasurement: string;
  ncEvFeedback: string;
  ncEvRegistration: string;
  // ── Групи тренувань (training-module.md, мобільний клієнт) — префікс tg ──
  tgNavLabel: string;
  tgTitle: string;
  tgGroupsButton: string;
  tgPersonalProgramsTab: string;
  tgEmptyTitle: string;
  tgEmptyBody: string;
  tgCreateGroup: string;
  tgJoinGroup: string;
  tgRoleCoach: string;
  tgRoleMember: string;
  tgMembersCount: string;
  tgGroupName: string;
  tgGroupNamePlaceholder: string;
  tgGroupDescription: string;
  tgGroupDescriptionPlaceholder: string;
  tgColor: string;
  tgTimezone: string;
  tgWeekStart: string;
  tgWeekStartMon: string;
  tgWeekStartSun: string;
  tgCreate: string;
  tgOfflineNotice: string;
  tgOnlineOnly: string;
  tgErrorGeneric: string;
  tgGroupGone: string;
  tgInviteCodeLabel: string;
  tgInviteCodePlaceholder: string;
  tgInviteCheck: string;
  tgInviteJoin: string;
  tgInviteInvalid: string;
  tgInviteExpired: string;
  tgInviteTo: string;
  tgInviteAs: string;
  tgInviteFrom: string;
  tgAlreadyMember: string;
  tgInviteOtherWorkspace: string;
  tgJoined: string;
  tgOpenGroup: string;
  tgTodaySession: string;
  tgRestDay: string;
  tgNextSession: string;
  tgNoPlan: string;
  tgNoPlanCoach: string;
  tgStart: string;
  tgContinue: string;
  tgView: string;
  tgExercisesCount: string;
  tgStatusPlanned: string;
  tgStatusCompleted: string;
  tgStatusPartial: string;
  tgStatusSkipped: string;
  tgStatusMissed: string;
  tgThisWeek: string;
  tgStreak: string;
  tgStreakDays: string;
  tgXpTotal: string;
  tgMultiplier: string;
  tgLeaderboard: string;
  tgSeeAll: string;
  tgQuests: string;
  tgActiveQuests: string;
  tgNoQuests: string;
  tgPrograms: string;
  tgMembers: string;
  tgExercises: string;
  tgInvite: string;
  tgLeaveGroup: string;
  tgLeaveConfirm: string;
  tgDeleteGroup: string;
  tgDeleteGroupConfirm: string;
  tgLastCoach: string;
  tgSyncPending: string;
  tgRejected: string;
  tgNewProgram: string;
  tgNoPrograms: string;
  tgNoProgramsMember: string;
  tgImportProgram: string;
  tgImportExercises: string;
  tgImportedExercises: string;
  tgNothingToImport: string;
  tgWeeks: string;
  tgDaysPerWeek: string;
  tgProgramName: string;
  tgWeekCount: string;
  tgNotes: string;
  tgWeekTemplate: string;
  tgRestDayShort: string;
  tgDayTitle: string;
  tgDayTitlePlaceholder: string;
  tgEstimatedMin: string;
  tgAddExercise: string;
  tgSets: string;
  tgReps: string;
  tgWeightKg: string;
  tgRestSec: string;
  tgRpe: string;
  tgProgression: string;
  tgProgNone: string;
  tgProgLinearWeight: string;
  tgProgLinearReps: string;
  tgProgPercent: string;
  tgStepKg: string;
  tgStepReps: string;
  tgPercent: string;
  tgEveryWeeks: string;
  tgCapKg: string;
  tgCapReps: string;
  tgPreview: string;
  tgWeekN: string;
  tgRemoveDay: string;
  tgMoveUp: string;
  tgMoveDown: string;
  tgRemove: string;
  tgProgramInvalidName: string;
  tgProgramInvalidDays: string;
  tgAssign: string;
  tgAssignTitle: string;
  tgStartDate: string;
  tgSelectMembers: string;
  tgSelectAll: string;
  tgAssignDone: string;
  tgAssignAlready: string;
  tgAssignSessions: string;
  tgAssignments: string;
  tgRevoke: string;
  tgRevokeConfirm: string;
  tgReexpand: string;
  tgReexpandHint: string;
  tgSaveFirst: string;
  tgDeleteProgram: string;
  tgDeleteProgramConfirm: string;
  tgExerciseName: string;
  tgMuscleGroup: string;
  tgNewExercise: string;
  tgNoExercises: string;
  tgPickExercise: string;
  tgDateInvalid: string;
  tgSetN: string;
  tgRestTimer: string;
  tgSkipRest: string;
  tgAddRest: string;
  tgFinish: string;
  tgSkipSession: string;
  tgSkipConfirm: string;
  tgFinishTitle: string;
  tgDurationMin: string;
  tgCalories: string;
  tgMemberNote: string;
  tgFinishPartial: string;
  tgXpEstimate: string;
  tgSessionNotFound: string;
  tgSetDone: string;
  tgSetNotDone: string;
  tgVolume: string;
  tgElapsed: string;
  tgCoachNote: string;
  tgNewQuest: string;
  tgQuestTitle: string;
  tgQuestMeasurable: string;
  tgQuestCheckbox: string;
  tgMetric: string;
  tgTarget: string;
  tgDueDate: string;
  tgXpReward: string;
  tgPhotoRequired: string;
  tgHealthMetricHint: string;
  tgMarkDone: string;
  tgUndo: string;
  tgAddPhoto: string;
  tgPhotoAttached: string;
  tgPhotoLocalHint: string;
  tgPhotoUnavailable: string;
  tgRecompute: string;
  tgAllMembers: string;
  tgQuestAuto: string;
  tgArchive: string;
  tgMetricSessionCount: string;
  tgMetricWorkoutMinutes: string;
  tgMetricDistance: string;
  tgMetricVolume: string;
  tgMetricSteps: string;
  tgMetricSleep: string;
  tgMetricWeightDelta: string;
  tgUnitSessions: string;
  tgUnitMinutes: string;
  tgUnitKm: string;
  tgUnitKg: string;
  tgUnitSteps: string;
  tgUnitHours: string;
  tgQuestInvalid: string;
  tgDoneCount: string;
  tgPeriodWeek: string;
  tgPeriodAll: string;
  tgYou: string;
  tgYourPlace: string;
  tgSessionsShort: string;
  tgNoLeaderboard: string;
  tgPrevWeek: string;
  tgNextWeek: string;
  tgInviteLink: string;
  tgInviteByEmail: string;
  tgEmail: string;
  tgCreateLink: string;
  tgLinkCreated: string;
  tgShare: string;
  tgCopy: string;
  tgCopied: string;
  tgExpiresIn: string;
  tgHours24: string;
  tgDays7: string;
  tgDays30: string;
  tgActiveInvites: string;
  tgInviteUses: string;
  tgUserNotFound: string;
  tgMemberAdded: string;
  tgAlreadyInGroup: string;
  tgMakeCoach: string;
  tgMakeMember: string;
  tgRemoveMember: string;
  tgRemoveMemberConfirm: string;
  tgWeekXp: string;
  tgNoMembers: string;
  tgMemberHistory: string;
  tgNoLogs: string;
  tgQuestProgress: string;
  tgSaveNote: string;
  tgNotePlaceholder: string;
  tgPrivacyNote: string;
  tgSelectMember: string;
  tgMemberNoteLabel: string;
  tgMinutesShort: string;
  tgOpenSession: string;
  tgGroupBadge: string;
  // ── Фінанси: розділ із вкладками (finance-revamp.md) — префікс fin ──
  finTabOverview: string;
  finTabTransactions: string;
  finTabReports: string;
  finTabBudget: string;
  finTabSubscriptions: string;
  finTabAccounts: string;
  finTabsLabel: string;
  finFilterPeriod: string;
  finFilterCurrency: string;
  finFilterButton: string;
  finPeriodPrev: string;
  finPeriodNext: string;
  finPresetMonth: string;
  finPresetPrevMonth: string;
  finPresetQuarter: string;
  finPresetYear: string;
  finPresetCustom: string;
  finCustomFrom: string;
  finCustomTo: string;
  finApply: string;
  finFactTitle: string;
  finInflow: string;
  finOutflow: string;
  finOpening: string;
  finClosing: string;
  finBalanceAllScopes: string;
  finForecastTitle: string;
  finForecast30: string;
  finForecast90: string;
  finForecastOn: string;
  finAvgVariable: string;
  finForecastThin: string;
  finForecastAllScope: string;
  finForecastEvents: string;
  finSourceSubscription: string;
  finSourceIncome: string;
  finSourcePlanned: string;
  finEventVariable: string;
  finOverdue: string;
  finShortfallTitle: string;
  finShortfallBiggest: string;
  finViewForecast: string;
  finEditSubscriptions: string;
  finOnAccounts: string;
  finNoAccountsInCurrency: string;
  finUnassignedHint: string;
  finPlannedHint: string;
  finNoData: string;
  finPnlTitle: string;
  finIncome: string;
  finFixed: string;
  finVariable: string;
  finNet: string;
  finSavingsRate: string;
  finPp: string;
  finVsPrev: string;
  finVsAvg: string;
  finTransfersExcluded: string;
  finOtherCurrencies: string;
  finStructure: string;
  finCostAll: string;
  finCostFixed: string;
  finCostVariable: string;
  finNoCategory: string;
  finUnclassified: string;
  finAssign: string;
  finGroupHousing: string;
  finGroupFood: string;
  finGroupTransport: string;
  finGroupHealth: string;
  finGroupEntertainment: string;
  finGroupServices: string;
  finGroupEducation: string;
  finGroupClothing: string;
  finGroupPets: string;
  finGroupTaxes: string;
  finGroupDebt: string;
  finGroupSalary: string;
  finGroupBusiness: string;
  finGroupInvestments: string;
  finGroupGifts: string;
  finGroupOther: string;
  finCatGroup: string;
  finCatCost: string;
  finCatMetaHint: string;
  finArchivedAccounts: string;
  finOpenBanks: string;
  finRecurringPayments: string;
  finRecurringIncomes: string;
  finRiNew: string;
  finRiEdit: string;
  finRiEmpty: string;
  finRiName: string;
  finRiNamePlaceholder: string;
  finRiEvery: string;
  finRiNext: string;
  finRiNoAccount: string;
  finRiInvalid: string;
  finRiArchive: string;
  finRiRestore: string;
  finRiDelete: string;
  finRiDeleteConfirm: string;
  finRiSaveFailed: string;
  finRiReceived: string;
  finRiReceiveTitle: string;
  finRiReceiveHint: string;
  finRiDefaultCategory: string;
  finRiStale: string;
  finBudgetByMonth: string;
  finBudgetMonthsHint: string;
  finProjectAddTx: string;
  finProjectTxTitle: string;
  finProjectIncomeTitle: string;
  finProjectNoIncome: string;
  finProjectNet: string;
  finProjectNeedAccount: string;
  finProjectSaveFailed: string;
  finProjectUncounted: string;
  finProjectInvalid: string;
  // ─── hauto*: автоматичні дані здоровʼя (HealthKit / Health Connect) ───
  hautoPulseRest: string;
  hautoPulseRestNote: string;
  hautoPulseRestNoteManual: string;
  hautoPulseRestEmpty: string;
  hautoPulseAvg: string;
  hautoPulseAvgNote: string;
  hautoSleepQuality: string;
  hautoSleepQualityByDuration: string;
  hautoSleepQualityByPhases: string;
  hautoSleepNoPhases: string;
  hautoSleepPhases: string;
  hautoSleepDeep: string;
  hautoSleepRem: string;
  hautoSleepLight: string;
  hautoSleepAwake: string;
  hautoSpo2: string;
  hautoDistance: string;
  hautoBpm: string;
  hautoKm: string;
  hautoKg: string;
  hautoKcal: string;
  hautoMin: string;
  hautoActiveKcal: string;
  hautoActiveCalories: string;
  hautoFlights: string;
  hautoHrAvgShort: string;
  hautoHrMin: string;
  hautoHrMax: string;
  hautoHrRest: string;
  hautoLast24h: string;
  hautoWeek: string;
  hautoWorkouts30: string;
  hautoWeightMeasuredAt: string;
  hautoWeightCleanup: string;
  hautoReadFailedBody: string;
  hautoNotAvailable: string;
  hautoNotAvailableIos: string;
  hautoNotAvailableAndroid: string;
  hautoNotAvailableOther: string;
  hautoInstallHc: string;
  hautoConnectTitle: string;
  hautoConnectBody: string;
  hautoOpenSettings: string;
  hautoWip: string;
  hautoSyncing: string;
  hautoDenied: string;
  hautoFailed: string;
  // ── Хвости хвиль: події сповіщень тренувань/звернень, історія здоров'я, нагадування тренувань (tl*) ──
  tlEvTrainingInvite: string;
  tlEvTrainingProgramAssigned: string;
  tlEvTrainingSessionCompleted: string;
  tlEvTrainingQuestAssigned: string;
  tlEvTrainingQuestCompleted: string;
  tlEvTrainingComment: string;
  tlEvTrainingLeaderboardWeekly: string;
  tlEvFeedbackIncoming: string;
  tlHealthDeleteEntryTitle: string;
  tlHealthDeleteEntryMsg: string;
  tlTrainingStreakTitle: string;
  tlTrainingStreakBody: string;
}

const uk: Translations = {
  navGroupMain: 'Головне',
  navGroupTools: 'Інструменти',
  navGroupMore: 'Ще',
  navGroupWork: 'Робота',
  navGroupPersonal: 'Особисте',
  navGroupDev: 'Розробка',
  navTimeTracker: 'Трекер часу',
  navBudget: 'Бюджет',
  navMeetings: 'Наради',
  navTime: 'Час',
  navHealthSummary: "Зведення здоров'я",
  detailEmptyTitle: 'Оберіть завдання',
  detailEmptyHint: 'Деталі, підзавдання й таймер зʼявляться тут.',
  noTasksMatchFilters: 'Під фільтри нічого не підходить',
  noTasksMatchFiltersHint: 'Завдання є, але їх приховано вибраними фільтрами.',
  quarters: ['I квартал', 'II квартал', 'III квартал', 'IV квартал'],
  historyEmpty: 'Немає записів в історії',
  historyCreated: 'Завдання створено',
  historyEdited: 'Завдання відредаговано',
  historyDone: 'Завдання виконано',
  historyRestored: 'Завдання відновлено',
  historyTimerStart: 'Таймер запущено',
  historyTimerStop: 'Таймер зупинено',
  historySubtaskAdd: 'Підзавдання додано',
  historySubtaskDone: 'Підзавдання виконано',
  historySubtaskUndone: 'Підзавдання відновлено',
  startedAtLabel: 'Почато о',
  timerHint: 'Натисніть «Запустити», щоб почати відстежувати час',
  statusLabel: 'Статус',
  reminderAtLabel: 'Нагадування',
  hoursShort: 'ГГ',
  minutesShort: 'ХХ',
  viewAllSubtasks: 'Переглянути всі',
  unitHour: 'г',
  unitHourLong: 'год',
  unitMinute: 'хв',
  txEmptyTitle: 'Оберіть транзакцію',
  txEmptyHint: 'Деталі та історія змін зʼявляться тут.',
  unitKcal: 'кк',
  unitKg: 'кг',
  unitGram: 'г',
  tabTasks: 'Завдання',
  tabFinance: 'Фінанси',
  tabHealth: "Здоров'я",
  tabOptions: 'Опції',
  tabToday: 'Сьогодні',
  todayOverdue: 'прострочено',
  todayActive: 'активних',
  todayTracked: 'відстежено',
  todayFocus: 'У фокусі',
  syncPushAll: 'Відвантажити все на сервер',
  syncPushAllMsg: 'Дані цього пристрою перезапишуть серверні — навіть там, де на сервері новіша версія з іншого пристрою. Продовжити?',
  syncPullAll: 'Завантажити все з сервера',
  syncPullAllMsg: 'Серверні дані замінять локальні. Зміни, які ще не встигли відправитись, буде втрачено безповоротно. Продовжити?',
  syncNeedsOnlineAuth: 'Потрібен онлайн-режим і вхід в акаунт',
  enableOnlineAfterLoginMsg: 'Увімкнути онлайн-режим і синхронізувати дані з сервером?',
  todayGreetMorning: 'Доброго ранку',
  todayGreetDay: 'Доброго дня',
  todayGreetEvening: 'Доброго вечора',
  todayGreetNight: 'Доброї ночі',

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
  // ── Ідеї та баги (app/feedback.tsx) ──
  fbTitle: 'Ідеї та баги',
  fbTypeIdea: 'Ідея',
  fbTypeBug: 'Баг',
  fbTabIdeas: 'Ідеї',
  fbTabBugs: 'Баги',
  fbNewIdea: 'Нова ідея',
  fbNewBug: 'Новий баг',
  fbEditIdea: 'Редагувати ідею',
  fbEditBug: 'Редагувати баг',
  fbFieldTitle: 'Назва',
  fbTitlePhIdea: 'Ідея або функція…',
  fbTitlePhBug: 'Що не так?',
  fbFieldModule: 'Модуль',
  fbFieldPlatforms: 'Стосується платформ',
  fbFieldPlatformsHint: 'можна кілька, необовʼязково',
  fbAffectsMobile: 'Мобільний',
  fbAffectsTablet: 'Планшет',
  fbAffectsWeb: 'Веб',
  fbModuleNone: 'Не вказано',
  fbModuleOther: 'Інше',
  fbModuleSync: 'Синхронізація',
  fbModuleAuth: 'Вхід і акаунт',
  fbFieldPriority: 'Пріоритет',
  fbFieldSeverity: 'Критичність',
  fbPrioHigh: 'Важлива',
  fbPrioMedium: 'Звичайна',
  fbPrioLow: 'Колись',
  fbSevCritical: 'Критичний',
  fbSevMajor: 'Важливий',
  fbSevMinor: 'Незначний',
  fbFieldDescription: 'Опис',
  fbOptional: 'необовʼязково',
  fbDescPhIdea: 'Опис, мотивація, приклади…',
  fbDescPhBug: 'Будь-які додаткові деталі…',
  fbFieldSteps: 'Кроки відтворення',
  fbStepsPh: '1. Відкрити…\n2. Натиснути…',
  fbFieldExpected: 'Очікувалось',
  fbExpectedPh: 'Що мало статися',
  fbFieldActual: 'Сталось',
  fbActualPh: 'Що сталося насправді',
  fbFieldAttachments: 'Скріншоти й відео',
  fbAttachHint: 'До {max} файлів: зображення до 10 МБ, відео до 50 МБ, разом до 60 МБ.',
  fbAttachLocked: 'Звернення вже надіслане — вкладення змінити не можна.',
  fbAddAttachment: 'Додати файл',
  fbRemoveAttachment: 'Прибрати вкладення',
  fbAttachTooMany: 'Не більше {max} вкладень.',
  fbAttachBadType: 'Цей тип файлу не приймається: {name}',
  fbAttachTooBig: 'Файл завеликий: {name}',
  fbAttachTotal: 'Разом вкладення перевищують 60 МБ.',
  fbAttachCacheEvicted: 'Памʼять для ненадісланих вкладень переповнена — найстаріші файли видалено з пристрою.',
  fbAttachLocal: 'на пристрої',
  fbAttachUploaded: 'завантажено',
  fbAttachFailed: 'не прийнято',
  fbAttachElsewhere: 'на іншому пристрої',
  fbUnitMb: '{n} МБ',
  fbUnitKb: '{n} КБ',
  fbContext: 'Автоматичний контекст',
  fbContextHint: 'Додається під час надсилання. Лише технічні параметри — жодних ваших даних.',
  fbCtxPlatform: 'Платформа',
  fbCtxDevice: 'Пристрій',
  fbCtxVersion: 'Версія',
  fbCtxOs: 'Система',
  fbCtxScreen: 'Екран',
  fbCtxWorkspace: 'Воркспейс',
  fbPlatformMobile: 'Мобільний застосунок',
  fbPlatformWeb: 'Веб',
  fbDevicePhone: 'Телефон',
  fbDeviceTablet: 'Планшет',
  fbDeviceDesktop: 'Компʼютер',
  fbSave: 'Зберегти',
  fbSaveDraft: 'Зберегти чернетку',
  fbSaveAndSend: 'Зберегти й надіслати',
  fbSend: 'Надіслати розробнику',
  fbRetry: 'Спробувати ще',
  fbEditAfterSent: 'Зміни лишаються у вашому списку — надіслане звернення не оновлюється.',
  fbRequiredMissing: 'Щоб надіслати, заповніть: {fields}',
  fbSaveFailed: 'Не вдалося зберегти. Спробуйте ще раз.',
  fbSendError: 'Не вдалося надіслати: {reason}',
  fbStateDraft: 'Не надіслано',
  fbStateQueued: 'Очікує мережі',
  fbQueuedHint: 'Буде надіслано, коли зʼявиться мережа.',
  fbStateSent: 'Надіслано',
  fbStateSentNew: 'Надіслано · Нове',
  fbStateInProgress: 'В роботі',
  fbStateDone: 'Виконано',
  fbStateRejected: 'Відхилено',
  fbStateFailed: 'Сервер не прийняв',
  fbStateUndelivered: 'Не доставлено',
  fbStateLocalOnly: 'Надсилання не налаштоване',
  fbStateLegacy: 'Надіслано старим способом, статус недоступний',
  fbStateDuplicate: 'Позначено як дублікат іншого звернення.',
  fbOwnerComment: 'Коментар розробника',
  fbTaskLinked: 'Для звернення створено задачу розробки.',
  fbForwardingOff: 'Надсилання розробнику не налаштоване на цьому сервері — звернення зберігаються тут.',
  fbFilterAll: 'Усі',
  fbFilterOpen: 'Відкриті',
  fbFilterDone: 'Готові',
  fbFilterSent: 'Надіслані',
  fbSortNewest: 'Нові',
  fbSortOldest: 'Старі',
  fbStatOpen: 'Відкриті',
  fbStatDone: 'Готово',
  fbStatSent: 'Надіслано',
  fbEmptyIdeas: 'Поки немає ідей',
  fbEmptyBugs: 'Багів немає',
  fbEmptyHint: 'Натисніть +, щоб додати',
  fbLoadFailed: 'Не вдалося прочитати ідеї та баги з памʼяті пристрою.',
  fbSelectHint: 'Виберіть звернення, щоб побачити деталі',
  fbDoneIdea: 'Реалізовано',
  fbDoneBug: 'Виправлено',
  fbMarkImplemented: 'Позначити реалізованою',
  fbMarkFixed: 'Позначити виправленим',
  fbReopen: 'Відкрити знову',
  fbDeleteTitle: 'Видалити звернення?',
  fbDeleteBody: 'Цю дію не можна скасувати.',
  fbCopied: 'Скопійовано',
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
  noTasksTodayHint: 'Решта роботи нікуди не зникла — вона в режимах «Тиждень» і «Всі».',
  showAllTasks: 'Показати всі',
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
  sortStatus: 'Статус',
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
  priorityNone: 'Без пріоритету',
  priorityA11y: 'Пріоритет {level}',
  priorityFilterReset: 'Скинути',
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
  timerWorkflowMissingTitle: 'Налаштуйте статуси проєкту',
  timerWorkflowMissingMessage: 'Власник проєкту має додати статуси «У процесі» та «На перевірці». Поточний статус завдання збережено.',
  startTimer: 'Запустити',
  stopTimer: 'Зупинити',
  nothingFound: 'Нічого не знайдено',
  noTasks: 'Немає завдань',
  overdueSection: 'Прострочені',
  voiceNote: 'Голосова нотатка',
  applyFilters: 'Застосувати',
  addTask: 'Додати завдання',
  addNote: 'Створити нотатку',
  tryAnotherQuery: 'Спробуйте інший запит',
  pressToAdd: 'Натисніть + щоб додати',
  searchPlaceholder: 'Пошук завдань...',
  pickerSearch: 'Пошук…',
  pickerNothingFound: 'Нічого не знайдено',
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
  categoryNameTooLong: 'Назва задовга — спробуйте коротшу',
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
  account: 'Рахунок',
  accounts: 'Рахунки',
  accountCash: 'Готівка',
  accountCard: 'Картка',
  accountSavings: 'Заощадження',
  accountDefaultName: 'Основний',
  newAccount: 'Новий рахунок',
  openingBalance: 'Початковий залишок',
  tasksScopeWeek: 'Тиждень',
  tasksNoDeadlineA11y: 'Показати завдання без дедлайну',
  noTasksWeekTitle: 'На тиждень завдань немає',
  noDatedTasksHint: 'Завдання без дедлайну — під кнопкою «Без дедлайну».',
  statusLinkAskPersonalTitle: 'Статус в особистому',
  statusLinkAskPersonalBody: 'В особистому просторі немає статусу «{name}» (проєкт «{project}»). Куди переносити такі задачі в особистому?',
  statusLinkAskProjectTitle: 'Статус у проєкті',
  statusLinkAskProjectBody: 'У проєкті «{project}» немає статусу «{name}». Куди перенести задачу в проєкті?',
  statusLinkKeepAsIs: 'Залишити як є',
  monthNet: 'Сальдо місяця',
  totalOnAccounts: 'На рахунках',
  balanceBreakdown: 'Звідки ця сума',
  breakdownOpening: 'Початковий залишок',
  breakdownIncome: 'Доходи',
  breakdownExpense: 'Витрати',
  breakdownTransfersIn: 'Перекази на рахунок',
  breakdownTransfersOut: 'Перекази з рахунку',
  breakdownFuture: 'Майбутні операції (не враховано): {n}',
  breakdownBalance: 'Баланс',
  openingBalanceHint: 'Сума ДО першої записаної операції цього рахунку — не поточний залишок. Щоб баланс збігся з реальним, скористайтесь «Звірити з реальним залишком».',
  balanceWillBe: 'Баланс стане: {amount}',
  reconcileBalance: 'Звірити з реальним залишком',
  reconcileActualLabel: 'Реальний залишок зараз',
  reconcileDelta: 'Початковий залишок зміниться на {delta}. Збережіть рахунок, щоб застосувати.',
  unassignedTxWarning: 'Операцій без рахунку чи на архівних рахунках: {n} — у баланс не входять',
  markTransferPairTitle: 'Друга половина переказу?',
  markTransferPairHint: 'Знайдено операцію на ту саму суму на рахунку «{account}» ({date}). Якщо це друга половина старого переказу, її треба видалити — інакше гроші порахуються двічі.',
  markTransferPairDelete: 'Видалити другу половину',
  markTransferPairKeep: 'Залишити',
  selectAccount: 'Оберіть рахунок',
  noAccounts: 'Немає рахунків',
  noAccountsHint: 'Заведіть гаманець, картку чи заощадження — операції мусять звідкись іти',
  accountArchived: 'В архіві',
  archiveAccount: 'Архівувати',
  unarchiveAccount: 'Повернути з архіву',
  accountCurrencyLocked: 'Валюту рахунку не змінити після створення',
  transfer: 'Переказ',
  transferFrom: 'Звідки',
  transferTo: 'Куди',
  transferReceived: 'Отримано',
  transferRate: 'Курс',
  transfersNotCounted: 'Перекази не входять у доходи й витрати',
  markAsTransfer: 'Позначити як переказ',
  markTransferSameCurrency: 'Лише рахунки в тій самій валюті — курс минулого переказу невідомий',
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
  copyTask: 'Копіювати',
  copySubtask: 'Копіювати підзавдання',
  taskCopied: 'Завдання скопійовано',
  subtaskCopied: 'Підзавдання скопійовано',
  copyMdProject: 'Проєкт',
  copyMdSprint: 'Спринт',
  copyMdStatus: 'Статус',
  copyMdDeadline: 'Дедлайн',
  copyMdSubtasks: 'Підзавдання',
  subtaskDuplicate: 'Дублювати',
  subtaskCopySuffix: ' (копія)',
  groupShowAll: 'Всі ({count})',
  groupShowAllA11y: 'Показати всі завдання групи «{name}»: {count}',
  groupEmpty: 'У цій групі немає завдань',
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
  // review finding (minor): текст обіцяв лише «завдання без прив'язки», але
  // wipeLocalProject (§9.4) прибирає з пристрою ще й наради/нотатки/записи
  // часу/фінанси проекту — власник має бачити це ПЕРЕД підтвердженням.
  projectTasksRemain: "Завдання проекту залишаться без прив'язки, але наради, нотатки, записи часу та фінансові дані проекту буде видалено з пристрою назавжди.",
  noProjects: 'Немає проектів',
  noTasksInProject: 'Немає завдань',
  editProject: 'Редагувати проект',
  newProject: 'Новий проект',
  unarchiveProject: 'Повернути з архіву',
  projectName: 'Назва проекту',

  meetingsTitle: 'Зустрічі',
  meetingPickHint: 'Оберіть зустріч, щоб побачити деталі',
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
  pDay: 'День',
  pWeek: 'Тиж',
  pMonth: 'Міс',
  pQuarter: '3 міс',
  pYear: 'Рік',
  healthSummary: 'Зведена статистика',
  total: 'Усього',
  average: 'Середнє',
  dynamics: 'Динаміка',
  noDataPeriod: 'Немає даних за період',
  chartBar: 'Стовпці',
  chartLine: 'Лінія',
  chartDots: 'Крапки',
  workMode: 'Режим роботи',
  modeOnline: 'Онлайн',
  modeOffline: 'Офлайн',
  offlineDesc: 'Дані лише на пристрої. Онлайн-функції (синхронізація, команда, AI, інтеграції) вимкнено.',
  onlineDesc: 'Дані синхронізуються з workspace і доступні на всіх ваших пристроях.',
  unavailableOffline: 'Недоступно в офлайн-режимі',
  enableOnline: 'Увімкнути онлайн',
  offlineBadge: 'Офлайн',
  onlineBadge: 'Онлайн',
  sendUnavailableOffline: 'Надсилання недоступне в офлайн-режимі',
  quickAddTask: '+ Завдання',
  quickAddExpense: '+ Витрата',
  quickAddWater: '+ Вода',
  quickTimer: 'Таймер',
  todayTasks: 'Завдання на сьогодні',
  todayMeetings: 'Зустрічі сьогодні',
  todayHabits: 'Звички',
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
  notifGroupDaily: 'Щоденні',
  notifDisableConfirm: 'Усі заплановані нагадування буде скасовано',
  notifReenableHint: 'Нагадування потрібно налаштувати заново у відповідних розділах',
  notifRecurring: 'Регулярне',

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
  bankCreateTx: 'Створювати транзакцію',
  bankCreateTxHint: 'Депозит → витрата • зняття → дохід',

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
  containerPickHint: 'Оберіть коробку, щоб побачити її вміст',
  // Containers v2 (ctr*)
  ctrViewGrid: 'Сітка',
  ctrViewPlaces: 'За місцями',
  ctrAllBoxes: 'Усі коробки',
  ctrNoPlace: 'Без місця',
  ctrPlaces: 'Місця',
  ctrPlaceNew: 'Нове місце',
  ctrPlaceEdit: 'Редагувати місце',
  ctrPlaceName: 'Назва місця',
  ctrPlaceNamePlaceholder: 'Наприклад, Спальня',
  ctrPlaceKind: 'Тип',
  ctrPlaceKindRoom: 'Кімната',
  ctrPlaceKindFurniture: 'Меблі',
  ctrPlaceKindShelf: 'Полиця',
  ctrPlaceKindOther: 'Інше',
  ctrPlaceParent: 'Усередині',
  ctrPlaceTopLevel: 'Верхній рівень',
  ctrPlaceDelete: 'Видалити місце?',
  ctrPlaceDeleteMsg: 'Вкладені місця й коробки перейдуть на рівень вище. Самі коробки не видаляються.',
  ctrPlaceTooDeep: 'Не більше 4 рівнів і не всередину самого себе',
  ctrPlaceCreateHere: 'Нове місце тут',
  ctrPlacesEmpty: 'Місць ще немає. Кімната → шафа → полиця — і коробки по місцях.',
  ctrLegacyLocation: 'Зараз записано рядком: «{loc}»',
  ctrItemQty: 'Кількість',
  ctrItemStatus: 'Статус',
  ctrStatusInBox: 'У коробці',
  ctrStatusLent: 'Позичено',
  ctrStatusDiscarded: 'Викинуто',
  ctrLentTo: 'Кому позичено',
  ctrLentToPlaceholder: 'Наприклад, Петро',
  ctrLentAt: 'У {name}',
  ctrLentCount: '{n} позичено',
  ctrLend: 'Позичити',
  ctrReturned: 'Повернули',
  ctrDiscard: 'Викинути',
  ctrRestore: 'Повернути в коробку',
  ctrShowDiscarded: 'Показати викинуті ({n})',
  ctrHideDiscarded: 'Сховати викинуті',
  ctrEditItem: 'Редагувати річ',
  ctrNewItem: 'Нова річ',
  ctrLentNeedsName: 'Вкажіть, кому позичено',
  ctrQtyLess: 'Менше',
  ctrQtyMore: 'Більше',
  ctrUnits: '{n} шт.',
  ctrItemsOne: 'річ',
  ctrItemsFew: 'речі',
  ctrItemsMany: 'речей',
  ctrEmptyBox: 'Порожньо',
  ctrAddItemHint: 'Введи назву вище і натисни ↑',
  ctrNewItemPlaceholder: 'Нова річ...',
  ctrTagsPlaceholder: 'Теги через кому: зима, одяг',
  ctrNotePlaceholder: 'Нотатка: де лежить, стан, розмір...',
  ctrDeleteItem: 'Видалити річ?',
  ctrDeleteItemMsg: 'Якщо її просто немає — краще позначити «Викинуто».',
  ctrColor: 'Колір',
  ctrEmptyHint: 'Додай коробку, шафу або місце зберігання',
  ctrFound: 'Знайдено: {n}',
  ctrNothingFound: 'Нічого не знайдено',
  ctrNoBoxesHere: 'Тут коробок немає',
  ctrReadFailed: 'Не вдалося прочитати контейнери. Дані не змінено.',
  ctrRetry: 'Спробувати ще',
  ctrPhotos: 'Фото',
  ctrPhotoAdd: 'Додати фото',
  ctrPhotoCamera: 'Зняти',
  ctrPhotoLibrary: 'З галереї',
  ctrPhotoRemove: 'Прибрати фото',
  ctrPhotoCover: 'Зробити обкладинкою',
  ctrPhotoCoverBadge: 'Обкладинка',
  ctrPhotoLimit: 'Не більше 3 фото',
  ctrPhotoPending: 'Фото ще вивантажується',
  ctrPhotoFailed: 'Не вдалося додати фото',
  ctrPhotoPermission: 'Немає доступу до камери чи галереї. Дозвольте його в налаштуваннях.',
  ctrPhotoUnavailable: 'Ця збірка ще не вміє знімати фото — оновіть застосунок.',
  ctrPhotoQueued: 'Фото збережено на пристрої й вивантажиться, щойно буде мережа',
  ctrScan: 'Сканувати QR',
  ctrScanHint: 'Наведіть камеру на наліпку коробки',
  ctrScanTorch: 'Ліхтарик',
  ctrScanManual: 'Ввести код',
  ctrScanManualPlaceholder: 'Код з наліпки, 10 символів',
  ctrScanManualGo: 'Відкрити',
  ctrScanInvalidCode: 'Код має 10 символів — цифри й латинські літери',
  ctrScanOtherWorkspace: 'Ця наліпка з іншого робочого простору',
  ctrScanNotFoundOffline: 'Коробка не знайдена локально. Підключіться до мережі, щоб перевірити.',
  ctrScanNotFound: 'Коробки з цим кодом немає в цьому просторі.',
  ctrScanChecking: 'Перевіряємо на сервері…',
  ctrScanForeign: 'Це не наліпка Flowi',
  ctrScanSearchAs: 'Шукати як запит',
  ctrScanPermission: 'Щоб сканувати, дозвольте доступ до камери.',
  ctrScanGrant: 'Дозволити',
  ctrScanNoCamera: 'Камера недоступна в цій збірці — введіть код руками.',
  ctrPrint: 'Друк наліпок',
  ctrPrintPreset: 'Формат',
  ctrPrintSmall: 'Мала · 38×21 мм',
  ctrPrintSmallHint: '65 на аркуш; QR і код',
  ctrPrintMedium: 'Середня · 63×34 мм',
  ctrPrintMediumHint: '24 на аркуш; QR, назва, місце',
  ctrPrintLarge: 'Велика · 99×67 мм',
  ctrPrintLargeHint: '8 на аркуш; ще й кількість речей',
  ctrPrintSelect: 'Коробки · обрано {n}',
  ctrPrintSelectAll: 'Обрати всі',
  ctrPrintSelectNone: 'Зняти вибір',
  ctrPrintGo: 'Створити PDF',
  ctrPrintNoCode: 'без коду',
  ctrPrintNoWorkspace: 'Невідомий робочий простір — перезайдіть, щоб друкувати наліпки.',
  ctrPrintFailed: 'Не вдалося створити PDF',
  ctrPrintUnavailable: 'Друк недоступний у цій збірці — оновіть застосунок.',
  ctrQr: 'QR-наліпка',
  ctrQrCreate: 'Створити QR-код',
  ctrQrNone: 'У коробки ще немає наліпки. Код створюється один раз і більше не змінюється.',
  ctrQrHint: 'Скан відкриває вміст лише тим, хто увійшов у цей простір.',
  ctrQrPrintOne: 'Друкувати наліпку',
  ctrQuickSearchPlaceholder: 'Де лежить…? Пошук речей',
  ctrQuickSearchOpen: 'Відкрити в контейнерах',

  undo: 'Скасувати',
  taskMarkedDone: 'Завдання виконано',
  taskDeleted: 'Завдання видалено',
  noteDeleted: 'Нотатку видалено',
  transactionDeleted: 'Транзакцію видалено',
  amount: 'Сума',
  transactionEdited: 'Транзакцію відредаговано',
  editTransaction: 'Редагувати транзакцію',

  sectionAccount: 'Акаунт',
  authLogin: 'Увійти',
  authRegister: 'Зареєструватись',
  authLogout: 'Вийти',
  logoutConfirm: 'Вийти з акаунта? Синхронізовані дані буде видалено з пристрою (на сервері вони лишаться).',
  authEmail: 'Email',
  authPassword: 'Пароль',
  authPasswordRepeat: 'Повторіть пароль',
  authName: "Ім'я (необов'язково)",
  authInvalidEmail: 'Невірний формат email',
  authInvalidCreds: 'Невірний email або пароль',
  authEmailTaken: 'Цей email вже зайнятий',
  authWeakPassword: 'Пароль занадто слабкий (мін 8 символів)',
  authPasswordsMismatch: 'Паролі не збігаються',
  authNoAccount: 'Немає акаунта? Зареєструватись',
  authHaveAccount: 'Вже є акаунт? Увійти',
  authOfflineError: 'Увімкніть онлайн-режим для входу',
  authNetworkError: 'Перевірте підключення до мережі',
  authServerError: 'Помилка сервера. Спробуйте пізніше',
  authTooManyAttemptsIn: 'Забагато спроб. Спробуйте за {n} хв',
  authShowPassword: 'Показати пароль',
  authHidePassword: 'Сховати пароль',
  budgetOtherCurrenciesHint: 'Транзакції в інших валютах ({n}) не враховано',
  welcomeSubtitle: 'Завдання, фінанси, здоров\'я — приватно і офлайн-first',
  onlineNeedsAccount: 'Для онлайн-функцій потрібен акаунт',
  onlineNeedsAccountMsg: 'Увійдіть або зареєструйтесь, щоб увімкнути онлайн-режим.',
  sessionExpired: 'Сесію завершено. Увійдіть знову.',
  sessionExpiredMsg: 'Увійдіть знову, щоб продовжити синхронізацію. Локальні дані збережено.',

  workspaceScreenTitle: 'Адреса workspace',
  workspaceSubtitle: 'Введіть адресу сервера Flowi, з яким працюватиме застосунок.',
  workspaceAddressLabel: 'АДРЕСА СЕРВЕРА',
  workspaceAddressPlaceholder: 'api.flowi.casperdev.site',
  workspaceCheckButton: 'Перевірити',
  workspaceContinueButton: 'Продовжити',
  workspaceChecking: 'Перевіряємо…',
  workspaceFirstAccountHint: 'Ви створюєте перший акаунт — він стане адміном workspace.',
  workspaceErrorInvalidUrl: 'Некоректна адреса',
  workspaceErrorInsecureUrl: 'http:// дозволено лише для локальної мережі',
  workspaceErrorNetwork: 'Не вдалося з\'єднатися з workspace',
  workspaceErrorNetworkScheme: 'Не вдалося з\'єднатися з workspace. Вкажіть схему явно — https:// або http:// для локального сервера',
  workspaceErrorServerUnavailable: 'Сервер workspace тимчасово недоступний. Спробуйте ще раз',
  workspaceErrorNotWorkspace: 'Це не Flowi workspace або сервер застарів — оновіть сервер',
  workspaceErrorUpdateApp: 'Оновіть застосунок до останньої версії',
  workspaceErrorUpdateServer: 'Оновіть сервер workspace',
  workspaceErrorUpdateAppTo: 'Оновіть застосунок до версії {v}',
  workspaceErrorChanged: 'Ця адреса тепер веде на інший workspace. Перевірте адресу ще раз і продовжіть — це вийде з поточного акаунта.',
  workspaceChangeLink: 'Змінити workspace',
  workspaceSwitchConfirmTitle: 'Змінити workspace?',
  workspaceSwitchConfirmMsg: 'Це вихід із поточного акаунта. Локальні дані цього workspace буде видалено з пристрою (на сервері вони лишаться).',
  workspaceSwitchOutboxWarning: 'Є незбережені зміни — намагаємось синхронізувати перед виходом…',
  workspaceSwitchButton: 'Змінити workspace',
  workspaceSwitchSyncFailedTitle: 'Не вдалося синхронізувати',
  workspaceSwitchSyncFailedMsg: 'Частина незбережених змін не дійшла до сервера. Продовжити зміну workspace все одно? Ці зміни буде втрачено.',
  workspaceSwitchProceedAnyway: 'Продовжити (втратити зміни)',
  workspaceIncompatibleTitle: 'Workspace недоступний',
  workspaceCurrentLabel: 'Поточний workspace',
  authRegistrationPending: 'Заявку на реєстрацію ще розглядають',
  authRegistrationRejected: 'Заявку відхилено',

  registrationPendingTitle: 'Заявку надіслано',
  registrationPendingMsg: 'Адміністратор workspace розгляне заявку. Ви дізнаєтесь про рішення тут і через сповіщення.',
  registrationPendingChecking: 'Перевіряємо статус…',
  registrationPendingRejectedTitle: 'Заявку відхилено',
  registrationPendingRejectedMsg: 'Адміністратор workspace відхилив заявку.',
  registrationPendingBack: 'До входу',
  registrationPendingCancel: 'Скасувати заявку',
  registrationPendingCancelConfirm: 'Скасувати заявку на реєстрацію?',

  adminWorkspaceTitle: 'Адміністрування workspace',
  settingsAdminWorkspace: 'Адміністрування workspace',
  adminRequestsSection: 'Заявки на реєстрацію',
  adminUsersSection: 'Користувачі',
  adminSettingsSection: 'Налаштування workspace',
  adminNoRequests: 'Немає заявок',
  adminApprove: 'Погодити',
  adminReject: 'Відхилити',
  adminRejectReasonPrompt: 'Причина відмови (необовʼязково)',
  adminRegistrationModeLabel: 'Режим реєстрації',
  adminRegistrationModeOpen: 'Відкрита',
  adminRegistrationModeApproval: 'За погодженням',
  adminMakeAdmin: 'Зробити адміном',
  adminRevokeAdmin: 'Забрати права адміна',
  adminDeactivateUser: 'Деактивувати',
  adminActivateUser: 'Активувати',
  adminConfirmRevokeAdminMsg: 'Забрати права адміністратора у «{name}»? Ця дія оборотна лише іншим адміном.',
  adminConfirmDeactivateMsg: 'Деактивувати «{name}»? Користувач втратить доступ до workspace, доки ви не активуєте його знову.',
  adminYouLabel: '(ви)',
  adminInvitedByLabel: 'Запросив(ла)',
  adminLastAdminError: 'Це останній активний адмін workspace',
  adminCannotDeactivateSelfError: 'Не можна деактивувати самого себе',
  adminAlreadyDecidedError: 'Заявку вже розглянуто',
  adminEmailTakenError: 'Хтось із такою поштою вже зареєструвався інакше',
  adminAdminBadge: ' · адмін',
  adminOffBadge: ' · вимкнено',
  adminLoadError: 'Не вдалося завантажити дані адміністрування',
  adminRetry: 'Повторити',
  adminActionFailedTitle: 'Дія не виконана',

  mergeDataTitle: 'Знайдено дані в акаунті',
  mergeDataMsg: 'В акаунті вже є дані. Об\'єднати їх із локальними, чи використати дані акаунта (локальні буде стерто)?',
  mergeDataMerge: 'Об\'єднати',
  mergeDataUseAccount: 'Використати дані акаунта',

  later: 'Пізніше',
  cloudSync: 'Хмарна синхронізація',
  syncNow: 'Синхронізувати зараз',
  lastSyncAt: 'Синхронізовано',
  syncPending: 'очікує',
  syncError: 'Помилка синхронізації',
  syncConflictsCount: 'конфліктів',
  syncGuestHint: 'Увійдіть або зареєструйтесь для синхронізації',
  syncOfflineHint: 'Увімкніть онлайн-режим для синхронізації',
  syncLocalOnlyTitle: 'Є лише на цьому пристрої',
  syncLocalOnlyHint: 'Ці записи жодного разу не доїхали до сервера, тож на інших пристроях їх немає. Звичайна синхронізація їх не відправить — вона працює з чергою, а вони до неї не потрапили.',
  syncLocalOnlyAction: 'Відвантажити все на сервер',
  localDesktopSync: 'Локальна синхронізація з десктопом',
  offlineReadOnly: 'Офлайн: лише перегляд',
  a11yOptions: 'Опції',
  a11yViewMode: 'Режим перегляду',

  authForgotPassword: 'Забули пароль?',
  authForgotPasswordTitle: 'Відновлення пароля',
  authSendCode: 'Надіслати код',
  authCodeSentHint: 'Введіть 6-значний код із листа та новий пароль',
  authEnterCode: 'Код підтвердження',
  authNewPassword: 'Новий пароль',
  authChangePasswordBtn: 'Змінити пароль',
  authCodeInvalid: 'Невірний код підтвердження',
  authCodeExpired: 'Код протермінований. Запросіть новий',
  authTooManyAttempts: 'Забагато спроб. Спробуйте пізніше',

  accountManage: 'Керування акаунтом',
  accountDisplayName: "Ім'я",
  accountSaveName: "Зберегти ім'я",
  accountNameSaved: "Ім'я збережено",
  accountOldPassword: 'Старий пароль',
  accountChangePassword: 'Зміна пароля',
  accountPasswordChanged: 'Пароль успішно змінено',
  accountDangerZone: 'Небезпечна зона',
  accountDeleteAccount: 'Видалити акаунт',
  accountDeleteConfirmTitle: 'Видалити акаунт?',
  accountDeleteConfirmMsg: 'Ця дія незворотна. Синхронізовані дані буде видалено з сервера.',
  accountDeletedMsg: 'Акаунт видалено. Локальні дані залишились на пристрої.',
  accountDeleteConfirmPwd: 'Введіть пароль для підтвердження',
  accountDeleteOwnsProjectsError: 'Ви власник проєктів з іншими учасниками — спершу передайте власність над ними.',
  accountDeleteLastAdminError: 'Ви єдиний активний адмін workspace — спершу призначте іншого адміна.',

  shareInviteBtn: 'Поділитись запрошенням',
  shareInviteText: '{name} запрошує тебе у спільну групу!\nКод: {code}\n{link}',

  activeTimers: 'Активні таймери',
  newTimer: 'Новий таймер',
  noActiveTimers: 'Немає активних таймерів',
  noActiveTimersHint: 'Запустіть таймер із завдання або створіть вільний',
  fullscreenTimers: 'На весь екран',
  focusMode: 'Зосередження',
  exitFullscreen: 'Вийти',
  startTimerAction: 'Запустити таймер',
  stopTimerAction: 'Зупинити таймер',
  budgetUncounted: 'не враховано — немає курсу',
  projectDeadline: 'Термін проєкту',
  dateInputFormatHint: 'РРРР-ММ-ДД',
  invalidDateInput: 'Невірна дата. Формат: РРРР-ММ-ДД, напр. 2026-09-19.',
  projectDescription: 'Опис',
  projectTasks: 'Задачі',
  projectTracked: 'Відпрацьовано',
  projectOverdueTasks: 'прострочено',
  projectNearest: 'Найближча задача',
  projectAddTask: 'Додати задачу',
  projectNoTasks: 'Задач ще немає',
  projectNoTasksHint: 'Додайте першу — вона одразу потрапить у цей проєкт',
  projectGroupByLabel: 'Групувати:',
  projectGroupByNone: 'Без групування',
  projectPickHint: 'Оберіть проєкт, щоб побачити його задачі',
  projectDone: 'виконано',
  projectTimelineSpread: 'розкид дедлайнів',
  projectTimelineEmpty: 'дедлайнів немає',
  sprints: 'Спринти',
  sprintNew: 'Новий спринт',
  sprintNamePlaceholder: 'Назва спринта',
  sprintRename: 'Перейменувати спринт',
  sprintClose: 'Закрити спринт',
  sprintReopen: 'Відкрити знову',
  sprintClosedLabel: 'закритий',
  sprintBacklog: 'Беклог',
  sprintNoSprints: 'Спринтів ще немає',
  sprintNoSprintsHint: 'Спринт — іменована пачка задач проєкту. Дати в нього необовʼязкові й потрібні лише для статистики: у «Сьогодні» задачу тягне її власний дедлайн',
  sprintEmpty: 'Порожній',
  sprintMoveTitle: 'Куди перенести незавершені?',
  sprintMoveHint: 'Завершені лишаються в закритому спринті як є',
  sprintMoveToBacklog: 'У беклог проєкту',
  sprintPick: 'Спринт',
  sprintNoProject: 'Спочатку оберіть проєкт — задача без проєкту у спринт не потрапляє',
  sprintField: 'Спринт',
  sprintClosedSuffix: '(закритий)',
  sprintForeignProject: 'Інший проєкт',
  sprintAddTaskIn: 'Нова задача у «{name}»',
  sprintAddTaskA11y: 'Додати задачу',
  // ── Статистика проєктів і спринтів (projects-analytics §8.1) ──
  projectInProgress: 'в роботі',
  projectAssigned: 'призначено',
  projectUnassigned: 'без виконавця',
  projectBacklog: 'без спринту',
  projectFunnelA11y: '{n} із {total} задач: {label}',
  projectFlagA11y: '{n} із {open} відкритих задач: {label}',
  sprintCurrent: 'Поточний спринт',
  sprintDaysLeft: 'лишилось днів: {n}',
  sprintLastDay: 'останній день',
  sprintOverdue: 'термін спринта минув',
  sprintOverdueDays: 'термін минув, днів тому: {n}',
  sprintUndated: 'без дат',
  sprintProgressA11y: 'Прогрес спринта «{name}»: {done} із {total}',
  sprintStartDate: 'З (РРРР-ММ-ДД)',
  sprintEndDate: 'По, включно (РРРР-ММ-ДД)',
  sprintDatesHint: 'Дати необовʼязкові: обидві або жодної. Потрібні для велосіті й згоряння спринта',
  sprintDatesPartial: 'Вкажіть обидві дати або очистьте обидві',
  sprintDatesInvalid: 'Дата має бути у форматі РРРР-ММ-ДД',
  sprintDatesOrder: 'Кінець не може бути раніше за початок',
  sprintDatesOverlap: 'Перетинається зі спринтами: {names}',
  sprintNotDated: 'Дати не вказано — велосіті й згоряння для цього спринта недоступні',
  velocityTitle: 'Велосіті',
  velocityNotEnough: 'Замало даних для прогнозу',
  velocityAverage: 'середня: {n} (≈{w} за тиждень)',
  velocityDays: 'днів: {n}',
  velocityTasks: 'задач: {n}',
  velocityForecast: 'Прогноз: ≈{weeks} тиж. · відкритих задач: {open} · спринтів у вибірці: {n}',
  velocitySample: 'спринтів у вибірці: {n}',
  velocityUndated: 'Закритих спринтів без дат: {n} — у велосіті не враховані',
  velocityEmpty: 'Ще немає закритих спринтів із датами',
  burndownTitle: 'Згоряння спринта',
  burndownIdeal: 'ідеал',
  burndownActual: 'факт',
  burndownScope: 'обсяг (поточний): {n}',
  burndownNoDoneDate: 'без дати завершення: {n}',
  burndownCarriedIn: 'закрито до старту: {n}',
  burndownInsufficient: 'Недостатньо історії для згоряння: {n} із {total} задач без дати завершення',
  burndownShow: 'Показати згоряння спринта',
  burndownHide: 'Сховати згоряння спринта',
  portfolioKpi: 'Портфель',
  portfolioProjects: 'проєктів',
  portfolioTasks: 'задач',
  portfolioCollapse: 'Згорнути портфель',
  portfolioExpand: 'Розгорнути портфель',
  doneByWeekTitle: 'Виконано за тиждень',
  portfolioWeeksTotal: 'усього за {n} тиж.: {count}',
  portfolioAvgWeekly: 'в середньому за календарний тиждень: {n}',
  portfolioEarlier: 'раніше: {n}',
  openFullTaskForm: 'Відкрити повну форму',
  projectMeetingsPast: 'Минулі ({count})',
  projectMeetingsEmpty: 'Зустрічей у проєкті немає',
  projectMeetingsNoUpcoming: 'Найближчих зустрічей немає',
  projectAnalytics: 'Аналітика',
  projectAnalyticsHint: 'Графіки йдуть за вибраним проєктом; «Витрачений час» лишається по всьому списку — одна смуга ні з чим не порівнюється',
  chartColumns: 'Де стоять задачі',
  chartDoneWeeks: 'Виконано по тижнях',
  chartDeadlinesAhead: 'Дедлайни попереду',
  chartTimeSpent: 'Витрачений час',
  chartWeeksSpan: 'тижнів',
  chartTimerSessions: 'сесії таймера',
  chartNoTasksInScope: 'У цих проєктах немає задач',
  chartNoSessions: 'Жодної завершеної сесії таймера',
  chartDoneEarlier: 'Закрито раніше за це вікно',
  chartDoneUndated: 'Завершених без дати завершення в журналі — у графік не потрапили',
  chartOverdueDebt: 'Прострочено — це борг, а не план',
  chartBeyondHorizon: 'З дедлайном далі за горизонт',
  chartNoDeadline: 'Незавершених без дедлайну',
  ganttLegendReal: 'Справжня дата початку',
  ganttLegendEstimated: 'Початок узято з дати створення — тривалість завищена',
  ganttLegendColor: 'Колір смуги — колір проєкту',
  ganttToday: 'Сьогодні',
  ganttNothingToDraw: 'Немає задач, які можна покласти на шкалу',
  ganttNoStartDate: 'Немає жодної смуги — задач без дати початку й без дати створення',
  ganttHidden: 'Не вмістилось у шкалу',
  ganttStartFromCreated: 'початок із дати створення',
  ganttStartExact: 'точний початок',
  ganttEndDeadline: 'до дедлайну',
  ganttEndDone: 'фактично завершено',
  ganttEndOpen: 'досі йде',
  ganttDaysShort: 'дн.',
  dialPicker: 'Циферблат',
  dialDigits: 'Цифри',
  dialRings: 'Кільця',
  dialChrono: 'Хронограф',
  dialFlip: 'Табло',
  dialDots: 'Сітка секунд',
  dialArc: 'Дуга',
  dialHourglass: 'Пісочний годинник',
  dialOrbit: 'Орбіта',
  dialSegment: 'Семисегментний',
  dialTape: 'Лінійка',
  dialMakeDefault: 'Зробити типовим',
  dialIsDefault: 'Типовий',
  dialMakeDefaultHint: 'Довге натискання — зробити типовим',
  timersCountOne: '{n} таймер',
  timersCountFew: '{n} таймери',
  timersCountMany: '{n} таймерів',
  activeTimersExpandA11y: 'Показати всі активні таймери',
  timerKindTask: 'Завдання',
  timerKindMeeting: 'Зустріч',
  timerKindAdhoc: 'Вільний таймер',
  attachTask: 'Прикріпити завдання',
  detachTask: 'Відкріпити',
  pickTaskTitle: 'Яке завдання відлічуємо?',
  freeTimerHint: 'Без завдання час запишеться лише в історію трекера',
  timerLabel: 'Таймер',
  parallelTimers: 'Паралельно',
  meetingNotTracked: 'Час не трекався',
  meetingTrackedBefore: 'Разом до цього: {time}',
  meetingTimerStart: 'Старт',
  meetingTimerStop: 'Стоп',
  meetingTimerStartA11y: 'Почати таймер зустрічі',
  meetingTimerStopA11y: 'Зупинити таймер зустрічі',
  meetingRecordings: 'Записи ({n})',
  meetingRecordingItem: 'Запис {n}',
  meetingRecord: 'Записати',
  meetingDaysAgo: '{n} дн тому',
  meetingOpenLink: 'Відкрити посилання',
  collapseList: 'Згорнути',
  discardTaskEditTitle: 'Скасувати редагування?',
  discardTaskEditMsg: 'Незбережені зміни завдання буде втрачено.',
  discardChanges: 'Не зберігати',
  navSubscriptions: 'Підписки',
  subNew: 'Нова підписка',
  subEditTitle: 'Редагувати підписку',
  subName: 'Назва',
  subNamePlaceholder: 'Напр. Netflix',
  subAmountPerCycle: 'Сума за період',
  subPeriod: 'Період',
  subEvery: 'Кожні',
  subNextPayment: 'Наступна оплата',
  subEndDate: 'Дата завершення',
  subIndefinite: 'Безстроково',
  subSetEndDate: 'Вказати дату',
  subReminder: 'Нагадати',
  subReminderDayOf: 'У день оплати',
  subReminder1: 'За 1 день',
  subReminder3: 'За 3 дні',
  subReminder7: 'За 7 днів',
  subColor: 'Колір',
  subNoCategory: 'Без категорії',
  subNoAccount: 'Без рахунку',
  subAccountHint: 'Лише для довідки — баланс рахунку не змінюється',
  subUrl: 'Посилання',
  subRenew: 'Продовжено',
  subRenewConfirm: 'Підтвердити',
  subRenewHint: 'Наступна оплата переїде на {date}. Операцію у фінансах не буде створено.',
  subRenewAmount: 'Сума за цей період',
  subRenewStale: 'Цю підписку вже продовжено на іншому пристрої. Перевірте дату наступної оплати.',
  subOverdue: 'Прострочено',
  subArchiveAction: 'В архів',
  subArchivedChip: 'В архіві',
  subEnded: 'Завершилась {date}',
  subArchiveCount: 'Архів ({count})',
  subDeleteTitle: 'Видалити підписку?',
  subDeleteMsg: '«{name}» і її історію продовжень буде видалено на всіх пристроях.',
  subHistory: 'Історія продовжень',
  subHistoryEmpty: 'Ще не продовжували',
  subPerMonth: '/міс',
  subPerYear: '/рік',
  subTotals: 'Разом',
  subEmptyTitle: 'Підписок ще немає',
  subEmptyHint: 'Додайте регулярні платежі — нагадаємо перед оплатою',
  subSelectHint: 'Оберіть підписку, щоб побачити деталі',
  subInDays: 'через {n} дн.',
  subOverdueDays: 'прострочено {n} дн.',
  subUpcoming: 'Найближчі оплати',
  subUpcomingWithin: 'Найближчі {n} днів',
  subFormInvalid: 'Вкажіть назву, суму більше 0 і коректну дату оплати.',
  subEndBeforeNext: 'Дата завершення раніша за наступну оплату.',
  subProjectEmpty: 'Немає підписок',
  subNoProjectFilter: 'Без проєкту',
  subSaveError: 'Не вдалося зберегти підписку. Спробуйте ще раз.',
  subNotifBeforeTitle: '💳 Скоро оплата підписки',
  subNotifBeforeBody: '{name}: {amount} — {date}',
  subNotifDueTitle: '💳 Сьогодні оплата підписки',
  subNotifDueBody: '{name}: {amount}',
  subNotifOverdueTitle: '⚠️ Прострочена оплата підписки',
  subNotifOverdueBody: '{name}: {amount}. Позначте «Продовжено», коли оплатите.',
  subNotifEndTitle: '📅 Підписка скоро завершиться',
  subNotifEndBody: '{name} — {date}',

  // Локальні нагадування (store/notifications.ts)
  notifChannelReminders: 'Нагадування',
  notifTaskTitle: '📋 Завдання',
  notifSubtaskTitle: '✅ Підзавдання',
  notifMeetingTitle: '📅 Зустріч через 15 хв',

  // Простір проєкту (WORKSPACE_PROJECTS_PLAN.md §3)
  projectNavOverview: 'Огляд',
  projectNotFound: 'Проєкт не знайдено',
  overviewHoursThisWeek: 'Годин за тиждень',
  overviewUpcomingMeetings: 'Найближчі наради',
  overviewBudgetSpent: 'Витрачено',
  notesSortTitle: 'За назвою',
  notesSearch: 'Пошук у нотатках…',
  notesPersonal: 'Особисті',
  notesSelectHint: 'Виберіть нотатку або створіть нову',
  notesNoResults: 'Нічого не знайдено. Змініть запит або фільтр.',
  notesReadOnly: 'Лише перегляд',
  notesUnsavedTitle: 'Незбережена нотатка',
  notesUnsavedBody: 'Залишитися в редакторі чи відкинути зміни?',
  notesEmptyError: 'Додайте заголовок або текст нотатки.',
  notesSaveError: 'Не вдалося зберегти. Текст залишився в редакторі — спробуйте ще раз.',
  notesReadError: 'Не вдалося прочитати нотатки. Повторіть спробу.',
  notesRetry: 'Повторити',
  notesDeleteConfirm: 'Видалити цю нотатку з усіх синхронізованих пристроїв?',
  noteBodyPlaceholder: 'Текст нотатки...',
  timeManualTask: 'Над чим працювали',
  timeManualMinutes: 'Хв',
  timeNoEntries: 'Ще немає записів часу',
  projectModuleDisabled: 'Цей розділ вимкнено в налаштуваннях проєкту',
  projectBudgetOwnerOnly: 'Бюджет бачить лише власник проєкту',
  projectBudgetLimit: 'Бюджет на місяць',
  projectBudgetTransactions: 'Витрати проєкту',
  projectBudgetNoTransactions: 'Ще немає витрат',
  projectSettingsInfo: 'ПРОЄКТ',
  projectNamePlaceholder: 'Назва проєкту',
  projectDescriptionPlaceholder: 'Опис',
  projectTemplateLabel: 'Шаблон',
  projectTemplateSimple: 'Простий',
  projectTemplateWork: 'Робочий',
  projectSettingsModules: 'РОЗДІЛИ',
  projectSettingsStatuses: 'СТАТУСИ ЗАВДАНЬ',
  projectStatusAdd: 'Додати статус',
  projectStatusSeed: 'Скопіювати типові статуси',
  projectStatusNew: 'Новий статус',
  statusTypeTodo: 'До роботи',
  statusTypeInProgress: 'У процесі',
  statusTypeDone: 'Готово',
  projectExitToPersonal: 'Особисте',
  projectSwitcherTitle: 'Проєкти',
  projectSwitcherRecent: 'Нещодавні',
  projectSwitcherAll: 'Усі проєкти',
  projectSwitcherEmpty: 'Проєктів ще немає',

  projectMembersTitle: 'Учасники',
  projectMembersYou: 'Ви',
  projectMembersCount: 'учасників',
  roleOwner: 'Власник',
  roleMember: 'Учасник',
  roleViewer: 'Глядач',
  projectMembersChangeRole: 'Змінити роль',
  projectMembersRemove: 'Видалити з проєкту',
  projectMembersRemoveConfirm: 'Видалити цього учасника з проєкту?',
  projectMembersLeave: 'Вийти з проєкту',
  projectMembersLeaveConfirm: 'Вийти з цього проєкту? Доступ до нього буде втрачено.',
  projectMembersLeaveUnsyncedWarning: 'Тут є незбережені зміни, які ще не дійшли до сервера. Вийти зараз — і втратити їх назавжди?',
  projectMembersOwnerCannotLeave: 'Власник не може вийти — спершу передайте власність іншому учаснику.',
  projectMembersTransferOwnership: 'Передати власність',
  projectMembersTransferOwnershipHint: 'Оберіть, кому передати проєкт',
  projectMembersTransferOwnershipConfirm: 'Передати власність цим проєктом учаснику {name}?',
  projectMembersTransferOwnershipNoMembers: 'У проєкті немає інших учасників, кому можна передати власність.',
  projectMembersInviteMaxUses: 'Ліміт використань',
  projectMembersInviteMaxUsesUnlimited: 'Без обмежень',
  projectMembersInvitedBy: 'Запросив(ла)',
  projectMembersInviteSection: 'ЗАПРОСИТИ',
  projectMembersCreateLink: 'Створити посилання',
  projectMembersLinkRole: 'Роль запрошеного',
  projectMembersLinkExpiry: 'Термін дії',
  projectMembersExpiry24h: '24 години',
  projectMembersExpiry7d: '7 днів',
  projectMembersExpiry30d: '30 днів',
  projectMembersLinkCreated: 'Посилання створено',
  projectMembersShareLink: 'Поділитися',
  projectMembersCopyLink: 'Скопіювати посилання',
  projectMembersLinkCopied: 'Посилання скопійовано',
  projectMembersActiveLinks: 'Активні посилання',
  projectMembersRevokeLink: 'Відкликати',
  projectMembersRevokeConfirm: 'Відкликати це запрошення? Ним більше не можна буде скористатись.',
  projectMembersInviteByEmail: 'Запросити за email',
  projectMembersEmailPlaceholder: 'email@example.com',
  projectMembersSendInvite: 'Запросити',
  projectMembersEmailInviteSent: 'Учасника додано до проєкту',
  projectMembersEmailUserNotFound: 'Користувача з таким email не знайдено',
  projectMembersEmailAlreadyMember: 'Ця людина вже в проєкті',
  projectSettingsMembersRow: 'Учасники',
  projectMembersError: 'Не вдалося завантажити учасників',
  projectMembersOfflineHint: 'Команда доступна лише онлайн',

  commentsTitle: 'Коментарі',
  commentsEmpty: 'Поки що немає коментарів',
  commentsPlaceholder: 'Написати коментар… (@ — згадати учасника)',
  commentsSend: 'Надіслати',
  commentsEdited: '(редаговано)',
  commentsEditAction: 'Редагувати',
  commentsDeleteAction: 'Видалити',
  commentsDeleteConfirm: 'Видалити цей коментар?',
  commentsSaveEdit: 'Зберегти',
  commentsCancelEdit: 'Скасувати',

  projectActivityTitle: 'Активність',
  projectActivityEmpty: 'Поки що немає активності',
  projectActivityError: 'Не вдалося завантажити активність',
  projectActivityShowAll: 'Уся активність',
  projectActivityLoadMore: 'Показати ще',
  projectActivityCreated: '{actor} створив(ла) «{title}»',
  projectActivityUpdated: '{actor} оновив(ла) «{title}»',
  projectActivityDeleted: '{actor} видалив(ла) «{title}»',
  projectActivityStatusChanged: '{actor} змінив(ла) статус «{title}»: {from} → {to}',
  projectActivityAssigned: '{actor} призначив(ла) виконавця у «{title}»',
  projectActivityCommented: '{actor} прокоментував(ла) «{title}»',
  projectActivityMemberJoined: '{actor} приєднався(лася) до проєкту',
  projectActivityMemberLeft: '{actor} покинув(ла) проєкт',
  projectActivityRoleChanged: '{actor} змінив(ла) роль {target}',
  projectActivityUnknownActor: 'Хтось',

  inviteScreenTitle: 'Запрошення',
  inviteLoading: 'Перевіряємо запрошення…',
  inviteCheckingWorkspace: 'Перевіряємо workspace…',
  inviteSwitchWorkspaceTitle: 'Перейти в інший workspace?',
  inviteSwitchWorkspaceMsg: 'Це запрошення — з іншого workspace. Перехід вийде з поточного акаунта; дані лишаться на сервері.',
  inviteSwitchWorkspaceConfirm: 'Перейти',
  inviteWorkspaceUnreachable: 'Не вдалося з\'єднатися з workspace цього запрошення',
  inviteInvalid: 'Це запрошення недійсне',
  inviteExpired: 'Термін дії запрошення сплив або його відкликано',
  inviteInvitedByLabel: 'Запросив(ла)',
  inviteExpiresLabel: 'Діє до',
  inviteJoinButton: 'Приєднатися',
  inviteJoining: 'Приєднання…',
  inviteAlreadyMember: 'Ви вже учасник цього проєкту',
  inviteJoinedTitle: 'Готово!',
  inviteJoinedOpenProject: 'Відкрити проєкт',
  inviteLoginButton: 'Увійти',
  inviteRegisterButton: 'Зареєструватися',
  inviteGuestHint: 'Увійдіть або зареєструйтесь, щоб приєднатись до проєкту',
  inviteNetworkError: 'Немає з\'єднання — спробуйте пізніше',
  inviteConfirmWorkspaceTitle: 'Використати workspace цього запрошення?',
  inviteConfirmWorkspaceMsg: 'Посилання веде на інший workspace ({name}). Застосунок підставить його адресу.',
  inviteConfirmWorkspaceButton: 'Продовжити',
  registerInvitedTitle: 'Запрошення в проєкт',
  registerInvitedMsg: 'Після реєстрації ви приєднаєтесь до проєкту «{project}» ({role})',
  registerInviteBrokenTitle: 'Проблема із запрошенням',
  registerInviteInvalidMsg: 'Це запрошення недійсне. Зареєструватися без нього?',
  registerInviteExpiredMsg: 'Термін дії запрошення сплив або його відкликано. Зареєструватися без нього?',
  registerContinueWithoutInvite: 'Зареєструватися без запрошення',

  taskAssignee: 'Виконавець',
  taskAssigneeUnassigned: 'Без виконавця',
  taskAssigneeMe: 'Я',

  viewerReadOnlyNotice: 'Лише перегляд — роль «Глядач»',

  // Бюджет (було utils/budgetStrings.ts)
  budgetSpentCaps: 'ВИТРАЧЕНО',
  budgetBudgetCaps: 'БЮДЖЕТ',
  budgetLeft: 'Залишилось',
  budgetOutsideLimits: 'Поза лімітами',
  budgetScopeAll: 'Всі',
  budgetScopePersonal: 'Особисті',
  budgetScopeProject: 'Проєктні',
  budgetScopeLabel: 'Чиї гроші показувати',
  budgetEmptyTitle: 'Бюджет не налаштовано',
  budgetEmptyBody: 'Категорії зʼявляться автоматично\nпісля додавання витрат у Фінансах',
  budgetAddManually: 'Додати вручну',
  budgetTapHint: 'Натисніть на категорію щоб встановити прогноз витрат',
  budgetTapRowHint: 'Натисніть щоб встановити прогноз',
  budgetMonthlyForecast: 'Прогноз витрат на місяць',
  budgetActuallySpent: 'Фактично витрачено:',
  budgetPlannedFor: 'Заплановано на місяць ({currency})',
  budgetNewCategory: 'Нова категорія бюджету',
  budgetName: 'Назва',
  budgetNamePlaceholder: 'Назва категорії',
  budgetIcon: 'Іконка',
  budgetAddCategory: 'Додати категорію',
  budgetDeleteTitle: 'Видалити категорію?',
  budgetDeleteMsg: '«{name}» буде видалено з бюджету.',
  budgetDeleteAction: 'Видалити категорію',
  budgetErrorExists: 'Така категорія вже є',
  budgetErrorTooLong: 'Назва задовга: максимум {max} символи — вона ж є ключем запису',
  budgetUnsyncableRow: 'Не синхронізується: назва довша за межу сервера',

  // Нотатки (було utils/notesStrings.ts)
  notesPreview: 'Перегляд',
  notesEditText: 'Текст',
  notesPin: 'Закріпити',
  notesUnpin: 'Відкріпити',
  notesPinned: 'Закріплено',
  notesTagsLabel: 'Теги',
  notesTagsPlaceholder: 'Теги через кому',
  notesTagsAll: 'Усі теги',
  notesLinkTask: 'Задача',
  notesLinkMeeting: 'Зустріч',
  notesLinkNone: 'Без звʼязку',
  notesLinkLost: 'Звʼязок втрачено',
  notesCreateTask: 'Створити задачу з рядка',
  notesTaskCreated: 'Задачу створено',
  notesTaskCreateError: 'Не вдалося створити задачу. Спробуйте ще раз.',
  notesChecklist: 'Чек-лист',
  notesEmptyBody: 'Без тексту.',
  notesMarkdownHint: 'Markdown: # заголовок, - пункт, - [ ] чек-лист, #тег',

  // Оплата підписки (було PAY_LABELS)
  payAction: 'Оплачено',
  payTitle: 'Оплата підписки',
  payAmount: 'Сплачено',
  payHint: 'Створимо витрату «{category}» на {account} і перенесемо оплату на {date}.',
  payNoAccount: 'без рахунку',
  payConfirm: 'Створити витрату',
  payStale: 'Цей цикл уже оплачено на іншому пристрої. Перевірте дату наступної оплати.',
  payTxFailed: 'Оплату зараховано, але витрату у Фінансах не створено. Додайте її вручну.',

  // Модулі інтерфейсу (було moduleText())
  modulesTitle: 'Модулі',
  modulesSubtitle: 'Вимкнені модулі зникають із меню, дашборда і сповіщень. Дані лишаються на місці — увімкніть назад, і все повернеться.',
  modulesSystemNote: 'Налаштування і профіль вимкнути не можна.',
  modulesDisabledTitle: 'Ви вимкнули цю функцію',
  modulesDisabledBody: 'Дані нікуди не зникли. Увімкніть модуль у налаштуваннях — і розділ повернеться таким, яким був.',
  modulesOpenSettings: 'Відкрити налаштування',
  modulesSettingsRow: 'Модулі інтерфейсу',
  modulesDashboardEmptyTitle: 'Усі модулі вимкнено',
  modulesDashboardEmptyBody: 'Дані нікуди не зникли. Увімкніть потрібні модулі — і «Сьогодні» повернеться таким, яким було.',

  // «Дані не прочитались» (було LoadErrorNotice)
  loadErrorTitle: 'Дані не прочитались',
  loadErrorBody: 'Сховище повернуло помилку. Це НЕ порожній список — щоб не втратити записи, зміни поки не зберігаються.',
  loadErrorRetry: 'Повторити',
  healthReminderOff: 'Нагадування не увімкнено',
  healthReminderOffSub: 'Система не дала дозволу на сповіщення (або їх вимкнено в налаштуваннях застосунку). Запис збережено без нагадування.',
  healthNoticeSettings: 'Налаштування',
  hkSyncing: 'Синхронізується з HealthKit',
  hkManual: 'Додавайте активність вручну або через тренування',
  hkDenied: 'Немає доступу до HealthKit — показані числа введені вручну',
  hkGrant: 'Надати доступ',
  hkFailed: 'HealthKit не відповів: це не «нуль», а відсутність даних',

  // Екран «Час»
  timeAverageTask: 'Середня задача',
  timeProjectBreakdown: 'Розподіл за проєктами',
  timeMoreProjects: '+ ще {count}',
  timePeriodGroup: 'Період',
  timeModeGroup: 'Режим',
  timeGroupingList: 'Список',
  timeGroupingProject: 'Групи за проєктом',
  timeSortDateDesc: 'Спершу нові',
  timeSortDateAsc: 'Спершу старі',
  timeSortDurationDesc: 'Спершу довгі',
  timeSortDurationAsc: 'Спершу короткі',
  timeByProjectSuffix: ' · за проєктами',
  timeEmptyHint: 'Запустіть таймер із задачі або додайте запис кнопкою +',
  timeAddEntry: 'Додати запис',
  timeEditEntry: 'Редагувати запис',
  timeNewEntry: 'Новий запис',
  timeEntryTaskLabel: 'Завдання',
  timeEntryTaskPlaceholder: 'Назва завдання',
  timeEntryDateLabel: 'Дата',
  timeEntryDatePlaceholder: 'РРРР-ММ-ДД',
  timeEntryNotePlaceholder: 'Необовʼязково',
  timeEntryErrorTask: 'Вкажіть назву завдання',
  timeEntryErrorDuration: 'Вкажіть тривалість',
  timeEntryErrorDate: 'Дата у форматі РРРР-ММ-ДД',
  timeDeleteEntryA11y: 'Видалити запис: {task}',

  // Черга «Перевір N записів» (було ANOMALY_LABEL)
  anomalyLong: 'Довше за 8 год',
  anomalyMidnight: 'Перетинає північ',
  anomalyOutlier: 'Утричі більше за звичне',
  anomalyShort: 'Коротше за 1 хв',
  anomalyCheckTitle: 'Перевір {count} {noun}',
  anomalyRecordOne: 'запис',
  anomalyRecordFew: 'записи',
  anomalyRecordMany: 'записів',
  anomalyTrimTo: 'Обрізати до {duration}',
  anomalyMarkNormal: 'Нормально',
  anomalyShowMore: 'Показати ще {count}',

  // Вкладки розділу «Здоровʼя»
  healthTabOverview: 'Огляд',
  healthTabActivity: 'Активність і тренування',
  healthTabBody: 'Тіло і вітальні',
  healthReadFailed: 'Дані не вдалося прочитати',
  healthUpdatedAt: 'Оновлено {time}',
  calRemaining: 'Залишок',
  // Центр сповіщень
  ncTabInbox: 'Сповіщення',
  ncTabReminders: 'Нагадування',
  ncFilterAll: 'Усі',
  ncFilterUnread: 'Непрочитані',
  ncMarkAllRead: 'Прочитати всі',
  ncMarkRead: 'Позначити прочитаним',
  ncArchive: 'Прибрати зі списку',
  ncOpenSettings: 'Налаштування сповіщень',
  ncEmptyTitle: 'Поки що тихо',
  ncEmptySub: 'Тут з’являться призначення, згадки, нагадування про дедлайни, зустрічі й оплати.',
  ncEmptyUnreadTitle: 'Усе прочитано',
  ncOffline: 'Сповіщення з сервера доступні в онлайн-режимі з акаунтом.',
  ncUnavailable: 'Цей сервер ще не підтримує центр сповіщень.',
  ncLoadFailed: 'Не вдалося оновити сповіщення.',
  ncRetry: 'Повторити',
  ncLoadMore: 'Показати ще',
  ncUnreadCount: 'Непрочитаних: {count}',
  ncBadgeA11y: 'Непрочитаних сповіщень: {count}',
  ncUnreadA11y: 'непрочитане',
  ncJustNow: 'щойно',
  ncMinutesAgo: '{n} хв тому',
  ncHoursAgo: '{n} год тому',
  ncYesterday: 'вчора',
  ncCollapsedMore: '+{count} схожих',
  ncHiddenByModules: 'Сповіщення вимкнених розділів сховано.',
  ncLocalRemindersToggle: 'Нагадування на цьому пристрої',
  ncLocalRemindersHint: 'Ліки, звички та здоров’я нагадують без інтернету — ці нагадування плануються на самому телефоні.',
  ncServerRemindersHint: 'Нагадування про завдання, зустрічі й дні оплати тепер надсилає сервер — вони у вкладці «Сповіщення».',
  ncSettingsTitle: 'Налаштування сповіщень',
  ncSettingsIntro: 'Налаштування спільні для всіх ваших пристроїв і вебу.',
  ncMaster: 'Надсилати сповіщення',
  ncMasterSub: 'Вимкнене — нічого не надходить назовні, список у застосунку лишається.',
  ncPushMaster: 'Push на пристрої',
  ncPushMasterSub: 'Телефони, планшети й браузери, де ви увійшли.',
  ncEmailMaster: 'Email-дайджест',
  ncChannelInApp: 'У застосунку',
  ncChannelPush: 'Push',
  ncChannelEmail: 'Email',
  ncMatrixTitle: 'Що й куди надсилати',
  ncShowEvents: 'Окремі події',
  ncHideEvents: 'Згорнути',
  ncCustomized: 'змінено',
  ncResetEvent: 'Як у категорії',
  ncChannelA11y: '{event} — {channel}',
  ncQuietHours: 'Тихі години',
  ncQuietHoursSub: 'Push відкладаються до кінця тихих годин; у застосунку сповіщення з’являються одразу.',
  ncQuietFrom: 'З',
  ncQuietTo: 'До',
  ncEarlier: 'Раніше',
  ncLater: 'Пізніше',
  ncTimezone: 'Часовий пояс: {tz}',
  ncMeetingLead: 'Нагадування про зустріч',
  ncMinutesBefore: 'за {n} хв',
  ncSaveFailed: 'Не вдалося зберегти. Спробуйте ще раз.',
  ncSettingsOffline: 'Налаштування сповіщень доступні в онлайн-режимі з акаунтом.',
  ncNoEvents: 'Для цього розділу подій поки немає.',
  ncCatTasksProjects: 'Задачі та проєкти',
  ncCatMeetingsFinance: 'Зустрічі та фінанси',
  ncCatTrainingHealth: 'Тренування та здоров’я',
  ncCatSystem: 'Ідеї/баги та системні',
  ncEvTaskAssigned: 'Призначення завдання',
  ncEvTaskStatusChanged: 'Зміна статусу',
  ncEvTaskMentioned: 'Згадка в коментарі',
  ncEvTaskCommented: 'Новий коментар',
  ncEvTaskDeadlineSoon: 'Дедлайн наближається',
  ncEvTaskOverdue: 'Прострочені завдання',
  ncEvTaskReminder: 'Нагадування про завдання',
  ncEvSprintStarted: 'Спринт розпочато',
  ncEvSprintClosed: 'Спринт закрито',
  ncEvProjectInvite: 'Додано до проєкту',
  ncEvMeetingReminder: 'Нагадування про зустріч',
  ncEvSubscriptionDue: 'Оплата підписки',
  ncEvBudgetExceeded: 'Перевищення бюджету',
  ncEvBalanceForecast: 'Прогноз балансу',
  ncEvWorkoutAssigned: 'Призначена програма',
  ncEvWorkoutToday: 'Тренування сьогодні',
  ncEvQuestClosed: 'Квест закрито',
  ncEvStreakAtRisk: 'Серія під загрозою',
  ncEvMeasurement: 'Нагадування про заміри',
  ncEvFeedback: 'Статус звернення',
  ncEvRegistration: 'Нова заявка на реєстрацію',
  // ── Групи тренувань (training-module.md, мобільний клієнт) — префікс tg ──
  tgNavLabel: 'Тренування (групи)',
  tgTitle: 'Групи тренувань',
  tgGroupsButton: 'Групи тренувань',
  tgPersonalProgramsTab: 'Мої програми',
  tgEmptyTitle: 'Ще немає груп',
  tgEmptyBody: 'Створіть групу як тренер або приєднайтесь за запрошенням.',
  tgCreateGroup: 'Створити групу',
  tgJoinGroup: 'Приєднатись за запрошенням',
  tgRoleCoach: 'Тренер',
  tgRoleMember: 'Учасник',
  tgMembersCount: 'Учасників: {n}',
  tgGroupName: 'Назва групи',
  tgGroupNamePlaceholder: 'Напр. Ранкова група',
  tgGroupDescription: 'Опис',
  tgGroupDescriptionPlaceholder: 'Пн/Ср/Пт 07:00',
  tgColor: 'Колір',
  tgTimezone: 'Часовий пояс',
  tgWeekStart: 'Початок тижня',
  tgWeekStartMon: 'Понеділок',
  tgWeekStartSun: 'Неділя',
  tgCreate: 'Створити',
  tgOfflineNotice: 'Немає звʼязку з сервером — показано збережене на пристрої.',
  tgOnlineOnly: 'Групи тренувань працюють лише з акаунтом в онлайн-режимі.',
  tgErrorGeneric: 'Не вдалося виконати дію. Спробуйте ще раз.',
  tgGroupGone: 'Групу видалено або вас у ній більше немає.',
  tgInviteCodeLabel: 'Посилання або код запрошення',
  tgInviteCodePlaceholder: 'Вставте посилання-запрошення',
  tgInviteCheck: 'Перевірити',
  tgInviteJoin: 'Приєднатись',
  tgInviteInvalid: 'Запрошення недійсне.',
  tgInviteExpired: 'Термін дії запрошення сплив.',
  tgInviteTo: 'Вас запрошують до групи',
  tgInviteAs: 'Роль: {role}',
  tgInviteFrom: 'Запрошує: {name}',
  tgAlreadyMember: 'Ви вже в цій групі.',
  tgInviteOtherWorkspace: 'Це запрошення з іншого сервера ({ws}). Перейдіть на нього в налаштуваннях акаунта й відкрийте посилання ще раз.',
  tgJoined: 'Ви приєднались до групи.',
  tgOpenGroup: 'Відкрити групу',
  tgTodaySession: 'Тренування на сьогодні',
  tgRestDay: 'Сьогодні відпочинок',
  tgNextSession: 'Наступне: {date}',
  tgNoPlan: 'Програму ще не призначено',
  tgNoPlanCoach: 'Створіть програму й призначте її учасникам.',
  tgStart: 'Почати',
  tgContinue: 'Продовжити',
  tgView: 'Переглянути',
  tgExercisesCount: 'Вправ: {n}',
  tgStatusPlanned: 'Заплановано',
  tgStatusCompleted: 'Виконано',
  tgStatusPartial: 'Частково',
  tgStatusSkipped: 'Пропущено',
  tgStatusMissed: 'Не виконано',
  tgThisWeek: 'Цей тиждень',
  tgStreak: 'Стрік',
  tgStreakDays: '{n} дн.',
  tgXpTotal: 'XP загалом',
  tgMultiplier: 'Множник ×{x}',
  tgLeaderboard: 'Лідерборд',
  tgSeeAll: 'Усі',
  tgQuests: 'Квести',
  tgActiveQuests: 'Активні квести',
  tgNoQuests: 'Активних квестів немає',
  tgPrograms: 'Програми',
  tgMembers: 'Учасники',
  tgExercises: 'Вправи групи',
  tgInvite: 'Запросити',
  tgLeaveGroup: 'Вийти з групи',
  tgLeaveConfirm: 'Вийти з групи «{name}»? Виконані тренування лишаться у вашому журналі.',
  tgDeleteGroup: 'Видалити групу',
  tgDeleteGroupConfirm: 'Видалити групу «{name}» для всіх учасників?',
  tgLastCoach: 'У групі має лишитися хоча б один тренер.',
  tgSyncPending: 'Очікує синхронізації',
  tgRejected: 'Сервер не прийняв зміну ({reason}).',
  tgNewProgram: 'Нова програма',
  tgNoPrograms: 'Програм ще немає',
  tgNoProgramsMember: 'Тренер ще не створив програм.',
  tgImportProgram: 'Імпортувати мою програму',
  tgImportExercises: 'Імпортувати мої вправи',
  tgImportedExercises: 'Імпортовано вправ: {n}',
  tgNothingToImport: 'Немає нових особистих вправ для імпорту.',
  tgWeeks: '{n} тиж.',
  tgDaysPerWeek: '{n} дн./тиж.',
  tgProgramName: 'Назва програми',
  tgWeekCount: 'Тижнів',
  tgNotes: 'Нотатки',
  tgWeekTemplate: 'Тижневий шаблон',
  tgRestDayShort: 'Відпочинок',
  tgDayTitle: 'Назва дня',
  tgDayTitlePlaceholder: 'День A — верх',
  tgEstimatedMin: 'Тривалість, хв',
  tgAddExercise: 'Додати вправу',
  tgSets: 'Підходи',
  tgReps: 'Повтори',
  tgWeightKg: 'Вага, кг',
  tgRestSec: 'Відпочинок, с',
  tgRpe: 'RPE',
  tgProgression: 'Прогресія',
  tgProgNone: 'Без прогресії',
  tgProgLinearWeight: '+ вага',
  tgProgLinearReps: '+ повтори',
  tgProgPercent: '+ %',
  tgStepKg: 'Крок, кг',
  tgStepReps: 'Крок, повторів',
  tgPercent: 'Відсоток',
  tgEveryWeeks: 'Кожні N тижнів',
  tgCapKg: 'Стеля, кг',
  tgCapReps: 'Стеля повторів',
  tgPreview: 'Прев\'ю навантаження',
  tgWeekN: 'Тиждень {n}',
  tgRemoveDay: 'Зробити днем відпочинку',
  tgMoveUp: 'Вище',
  tgMoveDown: 'Нижче',
  tgRemove: 'Прибрати',
  tgProgramInvalidName: 'Вкажіть назву програми.',
  tgProgramInvalidDays: 'Додайте хоча б один день із вправами.',
  tgAssign: 'Призначити',
  tgAssignTitle: 'Призначити програму',
  tgStartDate: 'Дата старту (РРРР-ММ-ДД)',
  tgSelectMembers: 'Учасники',
  tgSelectAll: 'Усі',
  tgAssignDone: 'Призначено учасникам: {n}',
  tgAssignAlready: 'вже призначено',
  tgAssignSessions: 'Буде створено {n} сесій на учасника.',
  tgAssignments: 'Призначення',
  tgRevoke: 'Відкликати',
  tgRevokeConfirm: 'Відкликати призначення? Майбутні заплановані сесії зникнуть в учасника, виконані лишаться.',
  tgReexpand: 'Оновити в учасників',
  tgReexpandHint: 'Програму змінено після призначення.',
  tgSaveFirst: 'Спершу збережіть програму — сервер має її побачити.',
  tgDeleteProgram: 'Видалити програму',
  tgDeleteProgramConfirm: 'Видалити програму «{name}»? Уже розгорнуті сесії лишаться в учасників.',
  tgExerciseName: 'Назва вправи',
  tgMuscleGroup: 'Група мʼязів',
  tgNewExercise: 'Нова вправа',
  tgNoExercises: 'Бібліотека вправ групи порожня',
  tgPickExercise: 'Оберіть вправу',
  tgDateInvalid: 'Дата у форматі РРРР-ММ-ДД, не раніше ніж 14 днів тому.',
  tgSetN: 'Підхід {n}',
  tgRestTimer: 'Відпочинок',
  tgSkipRest: 'Пропустити',
  tgAddRest: '+30 с',
  tgFinish: 'Завершити',
  tgSkipSession: 'Пропустити тренування',
  tgSkipConfirm: 'Позначити тренування як пропущене?',
  tgFinishTitle: 'Завершити тренування',
  tgDurationMin: 'Тривалість, хв',
  tgCalories: 'Калорії (необовʼязково)',
  tgMemberNote: 'Нотатка для тренера',
  tgFinishPartial: 'Виконано {done} з {total} підходів — буде зараховано як «частково», без XP.',
  tgXpEstimate: '≈ +{n} XP',
  tgSessionNotFound: 'Сесію не знайдено. Можливо, призначення відкликано.',
  tgSetDone: 'Підхід {n} виконано',
  tgSetNotDone: 'Позначити підхід {n} виконаним',
  tgVolume: 'Обʼєм: {kg} кг',
  tgElapsed: 'Минуло',
  tgCoachNote: 'Нотатка тренера',
  tgNewQuest: 'Новий квест',
  tgQuestTitle: 'Назва',
  tgQuestMeasurable: 'Вимірювана ціль',
  tgQuestCheckbox: 'Чек-завдання',
  tgMetric: 'Метрика',
  tgTarget: 'Ціль',
  tgDueDate: 'Дедлайн (РРРР-ММ-ДД)',
  tgXpReward: 'Нагорода XP',
  tgPhotoRequired: 'Потрібне фото',
  tgHealthMetricHint: 'Рахується з даних здоровʼя учасника. Тренер бачить лише підсумок.',
  tgMarkDone: 'Відмітити виконаним',
  tgUndo: 'Скасувати відмітку',
  tgAddPhoto: 'Додати фото',
  tgPhotoAttached: 'Фото додано',
  tgPhotoLocalHint: 'Фото лишається лише на вашому пристрої.',
  tgPhotoUnavailable: 'Вибір фото недоступний у цій збірці.',
  tgRecompute: 'Перерахувати',
  tgAllMembers: 'Усім учасникам',
  tgQuestAuto: 'Прогрес рахується автоматично',
  tgArchive: 'В архів',
  tgMetricSessionCount: 'Кількість тренувань',
  tgMetricWorkoutMinutes: 'Хвилини тренувань',
  tgMetricDistance: 'Дистанція',
  tgMetricVolume: 'Обʼєм',
  tgMetricSteps: 'Кроки',
  tgMetricSleep: 'Сон',
  tgMetricWeightDelta: 'Зміна ваги',
  tgUnitSessions: 'трен.',
  tgUnitMinutes: 'хв',
  tgUnitKm: 'км',
  tgUnitKg: 'кг',
  tgUnitSteps: 'кроків',
  tgUnitHours: 'год',
  tgQuestInvalid: 'Заповніть назву, метрику й ціль; дедлайн не раніше старту.',
  tgDoneCount: 'Виконали: {n}',
  tgPeriodWeek: 'Тиждень',
  tgPeriodAll: 'За весь час',
  tgYou: 'Ви',
  tgYourPlace: 'Ваше місце: {rank} · {xp} XP',
  tgSessionsShort: '{n} трен.',
  tgNoLeaderboard: 'Поки ніхто не набрав XP',
  tgPrevWeek: 'Попередній тиждень',
  tgNextWeek: 'Наступний тиждень',
  tgInviteLink: 'Посилання',
  tgInviteByEmail: 'За email',
  tgEmail: 'Email',
  tgCreateLink: 'Створити посилання',
  tgLinkCreated: 'Посилання готове. Поділіться ним зараз — повторно його не показати.',
  tgShare: 'Поділитись',
  tgCopy: 'Копіювати',
  tgCopied: 'Скопійовано',
  tgExpiresIn: 'Діє',
  tgHours24: '24 год',
  tgDays7: '7 днів',
  tgDays30: '30 днів',
  tgActiveInvites: 'Активні запрошення',
  tgInviteUses: 'Використано: {uses}',
  tgUserNotFound: 'Користувача з таким email не знайдено.',
  tgMemberAdded: 'Учасника додано.',
  tgAlreadyInGroup: 'Цей користувач уже в групі.',
  tgMakeCoach: 'Зробити тренером',
  tgMakeMember: 'Зробити учасником',
  tgRemoveMember: 'Прибрати з групи',
  tgRemoveMemberConfirm: 'Прибрати {name} з групи?',
  tgWeekXp: 'XP тижня',
  tgNoMembers: 'Учасників ще немає',
  tgMemberHistory: 'Історія виконання',
  tgNoLogs: 'Ще немає виконаних тренувань',
  tgQuestProgress: 'Прогрес квестів',
  tgSaveNote: 'Зберегти нотатку',
  tgNotePlaceholder: 'Коментар до тренування',
  tgPrivacyNote: 'Дані здоровʼя учасника (вага, сон, харчування) приватні й тут не показуються.',
  tgSelectMember: 'Оберіть учасника зі списку',
  tgMemberNoteLabel: 'Нотатка учасника',
  tgMinutesShort: '{n} хв',
  tgOpenSession: 'Відкрити тренування',
  tgGroupBadge: 'Група',
  // ── Фінанси: розділ із вкладками (finance-revamp.md) — префікс fin ──
  finTabOverview: 'Огляд',
  finTabTransactions: 'Операції',
  finTabReports: 'Звіти',
  finTabBudget: 'Бюджет',
  finTabSubscriptions: 'Підписки',
  finTabAccounts: 'Рахунки',
  finTabsLabel: 'Розділи фінансів',
  finFilterPeriod: 'Період',
  finFilterCurrency: 'Валюта',
  finFilterButton: 'Валюта і ракурс',
  finPeriodPrev: 'Попередній період',
  finPeriodNext: 'Наступний період',
  finPresetMonth: 'Цей місяць',
  finPresetPrevMonth: 'Минулий місяць',
  finPresetQuarter: 'Цей квартал',
  finPresetYear: 'Цей рік',
  finPresetCustom: 'Свій період',
  finCustomFrom: 'Початок періоду, РРРР-ММ-ДД',
  finCustomTo: 'Кінець періоду, РРРР-ММ-ДД',
  finApply: 'Застосувати',
  finFactTitle: 'Cash Flow — факт',
  finInflow: 'Приплив',
  finOutflow: 'Відплив',
  finOpening: 'На початок',
  finClosing: 'На кінець',
  finBalanceAllScopes: 'Баланс рахується з усіх операцій: ракурс звужує лише приплив і відплив',
  finForecastTitle: 'Прогноз',
  finForecast30: '30 днів',
  finForecast90: '90 днів',
  finForecastOn: 'На {date}: {amount}',
  finAvgVariable: 'Середні змінні витрати: {amount} на день',
  finForecastThin: 'Мало даних: історії менше 30 днів, оцінка приблизна',
  finForecastAllScope: 'Прогноз рахується з усіх грошей, ракурс на нього не впливає',
  finForecastEvents: 'Події прогнозу',
  finSourceSubscription: 'підписка',
  finSourceIncome: 'регулярний дохід',
  finSourcePlanned: 'запланована операція',
  finEventVariable: 'змінні витрати (оцінка)',
  finOverdue: 'прострочено',
  finShortfallTitle: 'Баланс іде в мінус {date}: {amount}',
  finShortfallBiggest: 'Найбільші списання до того дня: {list}',
  finViewForecast: 'Переглянути прогноз',
  finEditSubscriptions: 'Змінити підписки',
  finOnAccounts: 'На рахунках · {currency}',
  finNoAccountsInCurrency: 'Немає рахунків у {currency}',
  finUnassignedHint: 'Операцій без рахунку: {n} — призначити',
  finPlannedHint: 'Заплановано операцій: {n}, {amount}',
  finNoData: 'Немає операцій за період',
  finPnlTitle: 'P&L',
  finIncome: 'Доходи',
  finFixed: 'Фіксовані витрати',
  finVariable: 'Змінні витрати',
  finNet: 'Чистий результат',
  finSavingsRate: 'Норма заощаджень',
  finPp: 'п.п.',
  finVsPrev: 'до попереднього ({period})',
  finVsAvg: 'до середнього за {n} попер. пер.',
  finTransfersExcluded: 'Перекази між своїми рахунками не враховано',
  finOtherCurrencies: 'Не враховано (інші валюти): {list}',
  finStructure: 'Структура витрат',
  finCostAll: 'Усі',
  finCostFixed: 'Фіксовані',
  finCostVariable: 'Змінні',
  finNoCategory: 'Без категорії',
  finUnclassified: 'Операцій без ознаки фікс/змінна: {n} — пораховані як змінні',
  finAssign: 'Розставити',
  finGroupHousing: 'Житло',
  finGroupFood: 'Їжа',
  finGroupTransport: 'Транспорт',
  finGroupHealth: 'Здоров\'я',
  finGroupEntertainment: 'Розваги',
  finGroupServices: 'Сервіси й зв\'язок',
  finGroupEducation: 'Навчання',
  finGroupClothing: 'Одяг',
  finGroupPets: 'Тварини',
  finGroupTaxes: 'Податки',
  finGroupDebt: 'Борги й кредити',
  finGroupSalary: 'Зарплата',
  finGroupBusiness: 'Бізнес і фріланс',
  finGroupInvestments: 'Інвестиції',
  finGroupGifts: 'Подарунки',
  finGroupOther: 'Інше',
  finCatGroup: 'Група',
  finCatCost: 'Ознака',
  finCatMetaHint: 'Група й ознака фікс/змінна потрібні звітам і прогнозу',
  finArchivedAccounts: 'Архівні рахунки',
  finOpenBanks: 'Скарбнички',
  finRecurringPayments: 'Регулярні платежі',
  finRecurringIncomes: 'Регулярні доходи',
  finRiNew: 'Новий регулярний дохід',
  finRiEdit: 'Регулярний дохід',
  finRiEmpty: 'Регулярних доходів ще немає',
  finRiName: 'Назва',
  finRiNamePlaceholder: 'Зарплата',
  finRiEvery: 'Кожні',
  finRiNext: 'Наступне надходження, РРРР-ММ-ДД',
  finRiNoAccount: 'без рахунку',
  finRiInvalid: 'Перевірте назву, суму й дату',
  finRiArchive: 'В архів',
  finRiRestore: 'Відновити',
  finRiDelete: 'Видалити дохід',
  finRiDeleteConfirm: 'Видалити регулярний дохід «{name}»? Отримані операції лишаться у Фінансах.',
  finRiSaveFailed: 'Не вдалося зберегти. Спробуйте ще раз.',
  finRiReceived: 'Отримано',
  finRiReceiveTitle: 'Надходження',
  finRiReceiveHint: 'Буде створено дохід «{category}» на {account}. Наступне надходження — {date}.',
  finRiDefaultCategory: 'Інше',
  finRiStale: 'Цей цикл уже отримано на іншому пристрої',
  finBudgetByMonth: 'Ліміти по місяцях',
  finBudgetMonthsHint: 'Місячні ліміти не складаються: кожен місяць — окремо',
  finProjectAddTx: 'Додати операцію',
  finProjectTxTitle: 'Операція проєкту',
  finProjectIncomeTitle: 'Доходи проєкту',
  finProjectNoIncome: 'Ще немає доходів',
  finProjectNet: 'Доходи − витрати',
  finProjectNeedAccount: 'Спершу створіть рахунок у «Фінансах»: операція без рахунку не входить у жоден баланс',
  finProjectSaveFailed: 'Не вдалося зберегти операцію',
  finProjectUncounted: 'Не враховано (інші валюти): {list}',
  finProjectInvalid: 'Вкажіть суму більше нуля',
  // ─── hauto*: автоматичні дані здоровʼя (HealthKit / Health Connect) ───
  hautoPulseRest: 'Пульс спокою',
  hautoPulseRestNote: 'Пульс спокою за добу — з {source} або ручного запису.',
  hautoPulseRestNoteManual: 'Пульс спокою за добу — з ручного запису.',
  hautoPulseRestEmpty: 'Пульсу спокою за сьогодні ще немає',
  hautoPulseAvg: 'Середній пульс',
  hautoPulseAvgNote: 'Середній за добу — це не пульс спокою.',
  hautoSleepQuality: 'Якість сну',
  hautoSleepQualityByDuration: 'за тривалістю',
  hautoSleepQualityByPhases: 'за фазами',
  hautoSleepNoPhases: 'Джерело не дало фаз сну — оцінка лише за тривалістю.',
  hautoSleepPhases: 'Фази сну',
  hautoSleepDeep: 'Глибокий',
  hautoSleepRem: 'REM',
  hautoSleepLight: 'Поверхневий',
  hautoSleepAwake: 'Пробудження',
  hautoSpo2: 'Сатурація (SpO₂)',
  hautoDistance: 'Дистанція',
  hautoBpm: 'уд/хв',
  hautoKm: 'км',
  hautoKg: 'кг',
  hautoKcal: 'кк',
  hautoMin: 'хв',
  hautoActiveKcal: 'Активні кк',
  hautoActiveCalories: 'Активні калорії',
  hautoFlights: 'Поверхи',
  hautoHrAvgShort: 'Середній',
  hautoHrMin: 'Мін',
  hautoHrMax: 'Макс',
  hautoHrRest: 'Спокій',
  hautoLast24h: 'За останні 24 год ({n} вимірів)',
  hautoWeek: '7 днів',
  hautoWorkouts30: 'Тренування (30 днів)',
  hautoWeightMeasuredAt: 'замір {date}',
  hautoWeightCleanup: 'Прибрано {n} повторів ваги — історія стала точнішою',
  hautoReadFailedBody: 'Запити до {source} не вдались. Показані числа — не ваші дані; перевірте доступ.',
  hautoNotAvailable: 'Недоступно',
  hautoNotAvailableIos: 'Apple Health доступний лише на iPhone',
  hautoNotAvailableAndroid: 'Health Connect не встановлено або він застарів. Встановіть його з Google Play, щоб Flowi міг читати дані.',
  hautoNotAvailableOther: 'Автоматичні дані здоровʼя доступні лише в застосунку на телефоні',
  hautoInstallHc: 'Встановити Health Connect',
  hautoConnectTitle: 'Підключити {source}',
  hautoConnectBody: 'Flowi лише читає дані: кроки, пульс, сон, вагу, SpO₂. Нічого не записує.',
  hautoOpenSettings: 'Відкрити налаштування',
  hautoWip: 'Цей функціонал наразі знаходиться в розробці',
  hautoSyncing: 'Синхронізується з {source}',
  hautoDenied: 'Немає доступу до {source} — показані числа введені вручну',
  hautoFailed: '{source} не відповів: це не «нуль», а відсутність даних',
  // ── Хвости хвиль (tl*) ──
  tlEvTrainingInvite: 'Запрошення до групи тренувань',
  tlEvTrainingProgramAssigned: 'Призначено програму тренувань',
  tlEvTrainingSessionCompleted: 'Учасник виконав тренування',
  tlEvTrainingQuestAssigned: 'Новий квест',
  tlEvTrainingQuestCompleted: 'Квест виконано',
  tlEvTrainingComment: 'Коментар тренера',
  tlEvTrainingLeaderboardWeekly: 'Підсумки тижня в лідерборді',
  tlEvFeedbackIncoming: 'Нове звернення у вхідних',
  tlHealthDeleteEntryTitle: 'Видалити запис?',
  tlHealthDeleteEntryMsg: 'Запис зникне з історії на всіх пристроях. Автоматичний запис із Health більше не повернеться синком.',
  tlTrainingStreakTitle: 'Тренування ще попереду',
  tlTrainingStreakBody: '{title} заплановано на сьогодні — ще встигаєте, щоб не перервати серію.',
};

const en: Translations = {
  navGroupMain: 'Main',
  navGroupTools: 'Tools',
  navGroupMore: 'More',
  navGroupWork: 'Work',
  navGroupPersonal: 'Personal',
  navGroupDev: 'Development',
  navTimeTracker: 'Time Tracker',
  navBudget: 'Budget',
  navMeetings: 'Meetings',
  navTime: 'Time',
  navHealthSummary: 'Health summary',
  detailEmptyTitle: 'Select a task',
  detailEmptyHint: 'Details, subtasks and timer will appear here.',
  noTasksMatchFilters: 'Nothing matches the filters',
  noTasksMatchFiltersHint: 'You have tasks, but the selected filters hide them.',
  quarters: ['Q1', 'Q2', 'Q3', 'Q4'],
  historyEmpty: 'No history records',
  historyCreated: 'Task created',
  historyEdited: 'Task edited',
  historyDone: 'Task completed',
  historyRestored: 'Task restored',
  historyTimerStart: 'Timer started',
  historyTimerStop: 'Timer stopped',
  historySubtaskAdd: 'Subtask added',
  historySubtaskDone: 'Subtask completed',
  historySubtaskUndone: 'Subtask restored',
  startedAtLabel: "Started at",
  timerHint: "Press 'Start' to begin tracking time",
  statusLabel: 'Status',
  reminderAtLabel: 'Reminder',
  hoursShort: 'HH',
  minutesShort: 'MM',
  viewAllSubtasks: 'View all',
  unitHour: 'h',
  unitHourLong: 'hr',
  unitMinute: 'min',
  txEmptyTitle: 'Select a transaction',
  txEmptyHint: 'Details and change history will appear here.',
  unitKcal: 'kcal',
  unitKg: 'kg',
  unitGram: 'g',
  tabTasks: 'Tasks',
  tabToday: 'Today',
  todayOverdue: 'overdue',
  todayActive: 'active',
  todayTracked: 'tracked',
  todayFocus: 'In focus',
  syncPushAll: 'Upload everything to server',
  syncPushAllMsg: 'This device\'s data will overwrite the server — including records the server has a newer version of from another device. Continue?',
  syncPullAll: 'Download everything from server',
  syncPullAllMsg: 'Server data will replace local data. Changes that have not been uploaded yet will be lost permanently. Continue?',
  syncNeedsOnlineAuth: 'Online mode and a signed-in account are required',
  enableOnlineAfterLoginMsg: 'Enable online mode and sync data with the server?',
  todayGreetMorning: 'Good morning',
  todayGreetDay: 'Good afternoon',
  todayGreetEvening: 'Good evening',
  todayGreetNight: 'Good night',
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
  // ── Ideas & bugs (app/feedback.tsx) ──
  fbTitle: 'Ideas & bugs',
  fbTypeIdea: 'Idea',
  fbTypeBug: 'Bug',
  fbTabIdeas: 'Ideas',
  fbTabBugs: 'Bugs',
  fbNewIdea: 'New idea',
  fbNewBug: 'New bug',
  fbEditIdea: 'Edit idea',
  fbEditBug: 'Edit bug',
  fbFieldTitle: 'Title',
  fbTitlePhIdea: 'Idea or feature…',
  fbTitlePhBug: 'What went wrong?',
  fbFieldModule: 'Module',
  fbFieldPlatforms: 'Affects platforms',
  fbFieldPlatformsHint: 'pick any, optional',
  fbAffectsMobile: 'Mobile',
  fbAffectsTablet: 'Tablet',
  fbAffectsWeb: 'Web',
  fbModuleNone: 'Not set',
  fbModuleOther: 'Other',
  fbModuleSync: 'Sync',
  fbModuleAuth: 'Sign-in & account',
  fbFieldPriority: 'Priority',
  fbFieldSeverity: 'Severity',
  fbPrioHigh: 'Important',
  fbPrioMedium: 'Normal',
  fbPrioLow: 'Someday',
  fbSevCritical: 'Critical',
  fbSevMajor: 'Major',
  fbSevMinor: 'Minor',
  fbFieldDescription: 'Description',
  fbOptional: 'optional',
  fbDescPhIdea: 'Description, motivation, examples…',
  fbDescPhBug: 'Any extra details…',
  fbFieldSteps: 'Steps to reproduce',
  fbStepsPh: '1. Open…\n2. Tap…',
  fbFieldExpected: 'Expected',
  fbExpectedPh: 'What should have happened',
  fbFieldActual: 'Actual',
  fbActualPh: 'What actually happened',
  fbFieldAttachments: 'Screenshots & videos',
  fbAttachHint: 'Up to {max} files: images up to 10 MB, videos up to 50 MB, 60 MB in total.',
  fbAttachLocked: 'Already sent — attachments can no longer be changed.',
  fbAddAttachment: 'Add file',
  fbRemoveAttachment: 'Remove attachment',
  fbAttachTooMany: 'No more than {max} attachments.',
  fbAttachBadType: 'This file type is not accepted: {name}',
  fbAttachTooBig: 'File is too large: {name}',
  fbAttachTotal: 'Attachments exceed 60 MB in total.',
  fbAttachCacheEvicted: 'Storage for unsent attachments is full — the oldest files were removed from the device.',
  fbAttachLocal: 'on this device',
  fbAttachUploaded: 'uploaded',
  fbAttachFailed: 'not accepted',
  fbAttachElsewhere: 'on another device',
  fbUnitMb: '{n} MB',
  fbUnitKb: '{n} KB',
  fbContext: 'Automatic context',
  fbContextHint: 'Added when you send. Technical details only — none of your data.',
  fbCtxPlatform: 'Platform',
  fbCtxDevice: 'Device',
  fbCtxVersion: 'Version',
  fbCtxOs: 'System',
  fbCtxScreen: 'Screen',
  fbCtxWorkspace: 'Workspace',
  fbPlatformMobile: 'Mobile app',
  fbPlatformWeb: 'Web',
  fbDevicePhone: 'Phone',
  fbDeviceTablet: 'Tablet',
  fbDeviceDesktop: 'Desktop',
  fbSave: 'Save',
  fbSaveDraft: 'Save draft',
  fbSaveAndSend: 'Save and send',
  fbSend: 'Send to developer',
  fbRetry: 'Try again',
  fbEditAfterSent: 'Changes stay in your list — the submitted report is not updated.',
  fbRequiredMissing: 'To send, fill in: {fields}',
  fbSaveFailed: 'Could not save. Please try again.',
  fbSendError: 'Could not send: {reason}',
  fbStateDraft: 'Not sent',
  fbStateQueued: 'Waiting for network',
  fbQueuedHint: 'Will be sent when the network is available.',
  fbStateSent: 'Sent',
  fbStateSentNew: 'Sent · New',
  fbStateInProgress: 'In progress',
  fbStateDone: 'Done',
  fbStateRejected: 'Rejected',
  fbStateFailed: 'Not accepted by server',
  fbStateUndelivered: 'Not delivered',
  fbStateLocalOnly: 'Sending not configured',
  fbStateLegacy: 'Sent the old way, status unavailable',
  fbStateDuplicate: 'Marked as a duplicate of another report.',
  fbOwnerComment: 'Developer comment',
  fbTaskLinked: 'A development task was created for this report.',
  fbForwardingOff: 'Sending to the developer is not configured on this server — reports are kept here.',
  fbFilterAll: 'All',
  fbFilterOpen: 'Open',
  fbFilterDone: 'Done',
  fbFilterSent: 'Sent',
  fbSortNewest: 'Newest',
  fbSortOldest: 'Oldest',
  fbStatOpen: 'Open',
  fbStatDone: 'Done',
  fbStatSent: 'Sent',
  fbEmptyIdeas: 'No ideas yet',
  fbEmptyBugs: 'No bugs',
  fbEmptyHint: 'Tap + to add one',
  fbLoadFailed: 'Could not read ideas and bugs from device storage.',
  fbSelectHint: 'Select a report to see details',
  fbDoneIdea: 'Implemented',
  fbDoneBug: 'Fixed',
  fbMarkImplemented: 'Mark implemented',
  fbMarkFixed: 'Mark fixed',
  fbReopen: 'Reopen',
  fbDeleteTitle: 'Delete this report?',
  fbDeleteBody: 'This cannot be undone.',
  fbCopied: 'Copied',
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
  noTasksTodayHint: 'The rest of your work is still there — under “Week” and “All”.',
  showAllTasks: 'Show all',
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
  sortStatus: 'Status',
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
  priorityNone: 'No priority',
  priorityA11y: 'Priority {level}',
  priorityFilterReset: 'Reset',
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
  timerWorkflowMissingTitle: 'Configure project statuses',
  timerWorkflowMissingMessage: 'The project owner needs to add In progress and In review statuses. The current task status was preserved.',
  startTimer: 'Start',
  stopTimer: 'Stop',
  nothingFound: 'Nothing found',
  noTasks: 'No tasks',
  overdueSection: 'Overdue',
  voiceNote: 'Voice note',
  applyFilters: 'Apply',
  addTask: 'Add task',
  addNote: 'Create note',
  tryAnotherQuery: 'Try another query',
  pressToAdd: 'Press + to add',
  searchPlaceholder: 'Search tasks...',
  pickerSearch: 'Search…',
  pickerNothingFound: 'Nothing found',
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
  categoryNameTooLong: 'Name is too long — try a shorter one',
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
  account: 'Account',
  accounts: 'Accounts',
  accountCash: 'Cash',
  accountCard: 'Card',
  accountSavings: 'Savings',
  accountDefaultName: 'Main',
  newAccount: 'New account',
  openingBalance: 'Opening balance',
  tasksScopeWeek: 'Week',
  tasksNoDeadlineA11y: 'Show tasks without a deadline',
  noTasksWeekTitle: 'No tasks this week',
  noDatedTasksHint: 'Tasks without a deadline are under “No deadline”.',
  statusLinkAskPersonalTitle: 'Status in personal space',
  statusLinkAskPersonalBody: 'Your personal space has no “{name}” status (project “{project}”). Where should such tasks go in your personal space?',
  statusLinkAskProjectTitle: 'Status in project',
  statusLinkAskProjectBody: 'Project “{project}” has no “{name}” status. Where should the task go in the project?',
  statusLinkKeepAsIs: 'Keep as is',
  monthNet: 'Month net',
  totalOnAccounts: 'On accounts',
  balanceBreakdown: 'Where this amount comes from',
  breakdownOpening: 'Opening balance',
  breakdownIncome: 'Income',
  breakdownExpense: 'Expenses',
  breakdownTransfersIn: 'Transfers in',
  breakdownTransfersOut: 'Transfers out',
  breakdownFuture: 'Future transactions (not counted): {n}',
  breakdownBalance: 'Balance',
  openingBalanceHint: 'The amount BEFORE this account’s first recorded transaction — not the current balance. To match your real balance, use “Reconcile with actual balance”.',
  balanceWillBe: 'Balance will be: {amount}',
  reconcileBalance: 'Reconcile with actual balance',
  reconcileActualLabel: 'Actual balance now',
  reconcileDelta: 'Opening balance changes by {delta}. Save the account to apply.',
  unassignedTxWarning: 'Transactions without an account or on archived accounts: {n} — not in the balance',
  markTransferPairTitle: 'Other half of the transfer?',
  markTransferPairHint: 'Found a transaction for the same amount on “{account}” ({date}). If it is the other half of an old transfer, delete it — otherwise the money is counted twice.',
  markTransferPairDelete: 'Delete the other half',
  markTransferPairKeep: 'Keep',
  selectAccount: 'Select an account',
  noAccounts: 'No accounts',
  noAccountsHint: 'Add a wallet, a card or savings — every operation needs a place to come from',
  accountArchived: 'Archived',
  archiveAccount: 'Archive',
  unarchiveAccount: 'Restore from archive',
  accountCurrencyLocked: 'An account currency cannot be changed after creation',
  transfer: 'Transfer',
  transferFrom: 'From',
  transferTo: 'To',
  transferReceived: 'Received',
  transferRate: 'Rate',
  transfersNotCounted: 'Transfers are not counted as income or expenses',
  markAsTransfer: 'Mark as transfer',
  markTransferSameCurrency: 'Same-currency accounts only — the rate of a past transfer is unknown',
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
  copyTask: 'Copy',
  copySubtask: 'Copy subtask',
  taskCopied: 'Task copied',
  subtaskCopied: 'Subtask copied',
  copyMdProject: 'Project',
  copyMdSprint: 'Sprint',
  copyMdStatus: 'Status',
  copyMdDeadline: 'Deadline',
  copyMdSubtasks: 'Subtasks',
  subtaskDuplicate: 'Duplicate',
  subtaskCopySuffix: ' (copy)',
  groupShowAll: 'All ({count})',
  groupShowAllA11y: 'Show all tasks in “{name}”: {count}',
  groupEmpty: 'No tasks in this group',
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
  projectTasksRemain: "Project tasks will remain unlinked, but the project's meetings, notes, time entries and financial records will be permanently removed from this device.",
  noProjects: 'No projects',
  noTasksInProject: 'No tasks',
  editProject: 'Edit project',
  newProject: 'New project',
  unarchiveProject: 'Restore from archive',
  projectName: 'Project name',

  meetingsTitle: 'Meetings',
  meetingPickHint: 'Pick a meeting to see its details',
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
  pDay: 'Day',
  pWeek: 'Week',
  pMonth: 'Month',
  pQuarter: '3 mo',
  pYear: 'Year',
  healthSummary: 'Summary',
  total: 'Total',
  average: 'Average',
  dynamics: 'Dynamics',
  noDataPeriod: 'No data for period',
  chartBar: 'Bars',
  chartLine: 'Line',
  chartDots: 'Dots',
  workMode: 'Mode',
  modeOnline: 'Online',
  modeOffline: 'Offline',
  offlineDesc: 'Data stays on device only. Online features (sync, team, AI, integrations) are off.',
  onlineDesc: 'Data syncs with your workspace and is available on all your devices.',
  unavailableOffline: 'Unavailable in offline mode',
  enableOnline: 'Go online',
  offlineBadge: 'Offline',
  onlineBadge: 'Online',
  sendUnavailableOffline: 'Sending is unavailable offline',
  quickAddTask: '+ Task',
  quickAddExpense: '+ Expense',
  quickAddWater: '+ Water',
  quickTimer: 'Timer',
  todayTasks: "Today's tasks",
  todayMeetings: "Today's meetings",
  todayHabits: 'Habits',
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
  notifGroupDaily: 'Daily',
  notifDisableConfirm: 'All scheduled reminders will be cancelled',
  notifReenableHint: 'Reminders must be configured again in each section',
  notifRecurring: 'Recurring',

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
  bankCreateTx: 'Create transaction',
  bankCreateTxHint: 'Deposit → expense • withdrawal → income',

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
  containerPickHint: 'Pick a box to see what is inside',
  // Containers v2 (ctr*)
  ctrViewGrid: 'Grid',
  ctrViewPlaces: 'By place',
  ctrAllBoxes: 'All boxes',
  ctrNoPlace: 'No place',
  ctrPlaces: 'Places',
  ctrPlaceNew: 'New place',
  ctrPlaceEdit: 'Edit place',
  ctrPlaceName: 'Place name',
  ctrPlaceNamePlaceholder: 'e.g. Bedroom',
  ctrPlaceKind: 'Type',
  ctrPlaceKindRoom: 'Room',
  ctrPlaceKindFurniture: 'Furniture',
  ctrPlaceKindShelf: 'Shelf',
  ctrPlaceKindOther: 'Other',
  ctrPlaceParent: 'Inside',
  ctrPlaceTopLevel: 'Top level',
  ctrPlaceDelete: 'Delete place?',
  ctrPlaceDeleteMsg: 'Nested places and boxes move one level up. Boxes themselves are not deleted.',
  ctrPlaceTooDeep: 'At most 4 levels, and not inside itself',
  ctrPlaceCreateHere: 'New place here',
  ctrPlacesEmpty: 'No places yet. Room → wardrobe → shelf — and boxes in their places.',
  ctrLegacyLocation: 'Currently saved as text: “{loc}”',
  ctrItemQty: 'Quantity',
  ctrItemStatus: 'Status',
  ctrStatusInBox: 'In the box',
  ctrStatusLent: 'Lent',
  ctrStatusDiscarded: 'Discarded',
  ctrLentTo: 'Lent to',
  ctrLentToPlaceholder: 'e.g. Peter',
  ctrLentAt: 'With {name}',
  ctrLentCount: '{n} lent',
  ctrLend: 'Lend',
  ctrReturned: 'Returned',
  ctrDiscard: 'Discard',
  ctrRestore: 'Back in the box',
  ctrShowDiscarded: 'Show discarded ({n})',
  ctrHideDiscarded: 'Hide discarded',
  ctrEditItem: 'Edit item',
  ctrNewItem: 'New item',
  ctrLentNeedsName: 'Say who has it',
  ctrQtyLess: 'Less',
  ctrQtyMore: 'More',
  ctrUnits: '{n} pcs',
  ctrItemsOne: 'item',
  ctrItemsFew: 'items',
  ctrItemsMany: 'items',
  ctrEmptyBox: 'Empty',
  ctrAddItemHint: 'Type a name above and tap ↑',
  ctrNewItemPlaceholder: 'New item...',
  ctrTagsPlaceholder: 'Tags, comma-separated: winter, clothes',
  ctrNotePlaceholder: 'Note: where exactly, condition, size...',
  ctrDeleteItem: 'Delete item?',
  ctrDeleteItemMsg: 'If it is simply gone, mark it “Discarded” instead.',
  ctrColor: 'Color',
  ctrEmptyHint: 'Add a box, a wardrobe or any storage spot',
  ctrFound: 'Found: {n}',
  ctrNothingFound: 'Nothing found',
  ctrNoBoxesHere: 'No boxes here',
  ctrReadFailed: 'Could not read containers. Nothing was changed.',
  ctrRetry: 'Try again',
  ctrPhotos: 'Photos',
  ctrPhotoAdd: 'Add photo',
  ctrPhotoCamera: 'Take photo',
  ctrPhotoLibrary: 'From library',
  ctrPhotoRemove: 'Remove photo',
  ctrPhotoCover: 'Make cover',
  ctrPhotoCoverBadge: 'Cover',
  ctrPhotoLimit: 'Up to 3 photos',
  ctrPhotoPending: 'Photo is still uploading',
  ctrPhotoFailed: 'Could not add the photo',
  ctrPhotoPermission: 'No access to the camera or library. Allow it in Settings.',
  ctrPhotoUnavailable: 'This build cannot take photos yet — update the app.',
  ctrPhotoQueued: 'Photo saved on this device; it uploads as soon as you are online',
  ctrScan: 'Scan QR',
  ctrScanHint: 'Point the camera at a box label',
  ctrScanTorch: 'Torch',
  ctrScanManual: 'Enter code',
  ctrScanManualPlaceholder: 'Label code, 10 characters',
  ctrScanManualGo: 'Open',
  ctrScanInvalidCode: 'The code has 10 characters — digits and Latin letters',
  ctrScanOtherWorkspace: 'This label belongs to another workspace',
  ctrScanNotFoundOffline: 'Box not found on this device. Connect to the network to check.',
  ctrScanNotFound: 'No box with this code in this workspace.',
  ctrScanChecking: 'Checking with the server…',
  ctrScanForeign: 'This is not a Flowi label',
  ctrScanSearchAs: 'Search for it',
  ctrScanPermission: 'Allow camera access to scan.',
  ctrScanGrant: 'Allow',
  ctrScanNoCamera: 'Camera is not available in this build — enter the code by hand.',
  ctrPrint: 'Print labels',
  ctrPrintPreset: 'Format',
  ctrPrintSmall: 'Small · 38×21 mm',
  ctrPrintSmallHint: '65 per sheet; QR and code',
  ctrPrintMedium: 'Medium · 63×34 mm',
  ctrPrintMediumHint: '24 per sheet; QR, name, place',
  ctrPrintLarge: 'Large · 99×67 mm',
  ctrPrintLargeHint: '8 per sheet; plus item count',
  ctrPrintSelect: 'Boxes · {n} selected',
  ctrPrintSelectAll: 'Select all',
  ctrPrintSelectNone: 'Clear',
  ctrPrintGo: 'Create PDF',
  ctrPrintNoCode: 'no code',
  ctrPrintNoWorkspace: 'Unknown workspace — sign in again to print labels.',
  ctrPrintFailed: 'Could not create the PDF',
  ctrPrintUnavailable: 'Printing is not available in this build — update the app.',
  ctrQr: 'QR label',
  ctrQrCreate: 'Create QR code',
  ctrQrNone: 'This box has no label yet. The code is created once and never changes.',
  ctrQrHint: 'A scan shows the contents only to members of this workspace.',
  ctrQrPrintOne: 'Print label',
  ctrQuickSearchPlaceholder: 'Where is…? Search items',
  ctrQuickSearchOpen: 'Open in Containers',

  undo: 'Undo',
  taskMarkedDone: 'Task completed',
  taskDeleted: 'Task deleted',
  noteDeleted: 'Note deleted',
  transactionDeleted: 'Transaction deleted',
  amount: 'Amount',
  transactionEdited: 'Transaction edited',
  editTransaction: 'Edit transaction',

  sectionAccount: 'Account',
  authLogin: 'Sign In',
  authRegister: 'Register',
  authLogout: 'Sign Out',
  logoutConfirm: 'Sign out? Synced data will be removed from this device (it stays on the server).',
  authEmail: 'Email',
  authPassword: 'Password',
  authPasswordRepeat: 'Repeat password',
  authName: 'Name (optional)',
  authInvalidEmail: 'Invalid email format',
  authInvalidCreds: 'Invalid email or password',
  authEmailTaken: 'This email is already taken',
  authWeakPassword: 'Password too weak (min 8 characters)',
  authPasswordsMismatch: 'Passwords do not match',
  authNoAccount: 'No account? Register',
  authHaveAccount: 'Already have an account? Sign in',
  authOfflineError: 'Enable online mode to sign in',
  authNetworkError: 'Check your network connection',
  authServerError: 'Server error. Please try again later',
  authTooManyAttemptsIn: 'Too many attempts. Try again in {n} min',
  authShowPassword: 'Show password',
  authHidePassword: 'Hide password',
  budgetOtherCurrenciesHint: 'Transactions in other currencies ({n}) not included',
  welcomeSubtitle: 'Tasks, finance, health — private and offline-first',
  onlineNeedsAccount: 'Online features require an account',
  onlineNeedsAccountMsg: 'Sign in or register to enable online mode.',
  sessionExpired: 'Session expired. Please sign in again.',
  sessionExpiredMsg: 'Sign in again to continue syncing. Your local data is preserved.',

  workspaceScreenTitle: 'Workspace address',
  workspaceSubtitle: 'Enter the address of the Flowi server this app will work with.',
  workspaceAddressLabel: 'SERVER ADDRESS',
  workspaceAddressPlaceholder: 'api.flowi.casperdev.site',
  workspaceCheckButton: 'Check',
  workspaceContinueButton: 'Continue',
  workspaceChecking: 'Checking…',
  workspaceFirstAccountHint: 'You are creating the first account — it will become the workspace admin.',
  workspaceErrorInvalidUrl: 'Invalid address',
  workspaceErrorInsecureUrl: 'http:// is only allowed for local networks',
  workspaceErrorNetwork: 'Could not connect to the workspace',
  workspaceErrorNetworkScheme: 'Could not connect to the workspace. Add the scheme explicitly — https://, or http:// for a local server',
  workspaceErrorServerUnavailable: 'The workspace server is temporarily unavailable. Please try again',
  workspaceErrorNotWorkspace: 'This is not a Flowi workspace, or the server is outdated — please update it',
  workspaceErrorUpdateApp: 'Update the app to the latest version',
  workspaceErrorUpdateServer: 'Update the workspace server',
  workspaceErrorUpdateAppTo: 'Update the app to version {v}',
  workspaceErrorChanged: 'This address now points to a different workspace. Check the address again and continue — this will sign you out of the current account.',
  workspaceChangeLink: 'Change workspace',
  workspaceSwitchConfirmTitle: 'Change workspace?',
  workspaceSwitchConfirmMsg: 'This signs you out of the current account. Local data for this workspace will be removed from the device (it stays on the server).',
  workspaceSwitchOutboxWarning: 'There are unsaved changes — trying to sync before signing out…',
  workspaceSwitchButton: 'Change workspace',
  workspaceSwitchSyncFailedTitle: 'Sync failed',
  workspaceSwitchSyncFailedMsg: 'Some unsaved changes did not reach the server. Continue changing workspace anyway? Those changes will be lost.',
  workspaceSwitchProceedAnyway: 'Continue (lose changes)',
  workspaceIncompatibleTitle: 'Workspace unavailable',
  workspaceCurrentLabel: 'Current workspace',
  authRegistrationPending: 'Your registration request is still pending',
  authRegistrationRejected: 'Your registration request was rejected',

  registrationPendingTitle: 'Request sent',
  registrationPendingMsg: 'The workspace admin will review your request. You will see the decision here and via a notification.',
  registrationPendingChecking: 'Checking status…',
  registrationPendingRejectedTitle: 'Request rejected',
  registrationPendingRejectedMsg: 'The workspace admin rejected your request.',
  registrationPendingBack: 'Back to sign in',
  registrationPendingCancel: 'Cancel request',
  registrationPendingCancelConfirm: 'Cancel the registration request?',

  adminWorkspaceTitle: 'Workspace administration',
  settingsAdminWorkspace: 'Workspace administration',
  adminRequestsSection: 'Registration requests',
  adminUsersSection: 'Users',
  adminSettingsSection: 'Workspace settings',
  adminNoRequests: 'No requests',
  adminApprove: 'Approve',
  adminReject: 'Reject',
  adminRejectReasonPrompt: 'Rejection reason (optional)',
  adminRegistrationModeLabel: 'Registration mode',
  adminRegistrationModeOpen: 'Open',
  adminRegistrationModeApproval: 'By approval',
  adminMakeAdmin: 'Make admin',
  adminRevokeAdmin: 'Revoke admin',
  adminDeactivateUser: 'Deactivate',
  adminActivateUser: 'Activate',
  adminConfirmRevokeAdminMsg: 'Revoke admin rights from “{name}”? Only another admin can undo this.',
  adminConfirmDeactivateMsg: 'Deactivate “{name}”? The user will lose access to the workspace until you activate them again.',
  adminYouLabel: '(you)',
  adminInvitedByLabel: 'Invited by',
  adminLastAdminError: 'This is the last active workspace admin',
  adminCannotDeactivateSelfError: 'You cannot deactivate yourself',
  adminAlreadyDecidedError: 'This request was already decided',
  adminEmailTakenError: 'Someone with that email already registered a different way',
  adminAdminBadge: ' · admin',
  adminOffBadge: ' · off',
  adminLoadError: 'Failed to load administration data',
  adminRetry: 'Retry',
  adminActionFailedTitle: 'Action failed',

  mergeDataTitle: 'Account data found',
  mergeDataMsg: 'This account already has data. Merge it with your local data, or use the account data (local data will be erased)?',
  mergeDataMerge: 'Merge',
  mergeDataUseAccount: 'Use account data',

  later: 'Later',
  cloudSync: 'Cloud Sync',
  syncNow: 'Sync now',
  lastSyncAt: 'Synced',
  syncPending: 'pending',
  syncError: 'Sync error',
  syncConflictsCount: 'conflicts',
  syncGuestHint: 'Sign in or register to sync',
  syncOfflineHint: 'Enable online mode to sync',
  syncLocalOnlyTitle: 'Only on this device',
  syncLocalOnlyHint: 'These records have never reached the server, so other devices do not have them. A normal sync will not send them: it works from the queue, and they never entered it.',
  syncLocalOnlyAction: 'Upload everything to server',
  localDesktopSync: 'Local desktop sync',
  offlineReadOnly: 'Offline: read only',
  a11yOptions: 'Options',
  a11yViewMode: 'View mode',

  authForgotPassword: 'Forgot password?',
  authForgotPasswordTitle: 'Password recovery',
  authSendCode: 'Send code',
  authCodeSentHint: 'Enter the 6-digit code from the email and your new password',
  authEnterCode: 'Verification code',
  authNewPassword: 'New password',
  authChangePasswordBtn: 'Change password',
  authCodeInvalid: 'Invalid verification code',
  authCodeExpired: 'Code expired. Request a new one',
  authTooManyAttempts: 'Too many attempts. Please try again later',

  accountManage: 'Manage account',
  accountDisplayName: 'Display name',
  accountSaveName: 'Save name',
  accountNameSaved: 'Name saved',
  accountOldPassword: 'Current password',
  accountChangePassword: 'Change password',
  accountPasswordChanged: 'Password changed successfully',
  accountDangerZone: 'Danger zone',
  accountDeleteAccount: 'Delete account',
  accountDeleteConfirmTitle: 'Delete account?',
  accountDeleteConfirmMsg: 'This action is irreversible. Synced server data will be deleted.',
  accountDeletedMsg: 'Account deleted. Local data remains on this device.',
  accountDeleteConfirmPwd: 'Enter your password to confirm',
  accountDeleteOwnsProjectsError: 'You own projects with other members — transfer ownership first.',
  accountDeleteLastAdminError: 'You are the only active workspace admin — make someone else an admin first.',

  shareInviteBtn: 'Share invitation',
  shareInviteText: '{name} invites you to a shared group!\nCode: {code}\n{link}',

  activeTimers: 'Active timers',
  newTimer: 'New timer',
  noActiveTimers: 'No active timers',
  noActiveTimersHint: 'Start a timer from a task or create a free one',
  fullscreenTimers: 'Fullscreen',
  focusMode: 'Focus',
  exitFullscreen: 'Exit',
  startTimerAction: 'Start timer',
  stopTimerAction: 'Stop timer',
  budgetUncounted: 'not counted — no exchange rate',
  projectDeadline: 'Project deadline',
  dateInputFormatHint: 'YYYY-MM-DD',
  invalidDateInput: 'Invalid date. Format: YYYY-MM-DD, e.g. 2026-09-19.',
  projectDescription: 'Description',
  projectTasks: 'Tasks',
  projectTracked: 'Tracked',
  projectOverdueTasks: 'overdue',
  projectNearest: 'Next task due',
  projectAddTask: 'Add a task',
  projectNoTasks: 'No tasks yet',
  projectNoTasksHint: 'Add the first one — it lands in this project',
  projectGroupByLabel: 'Group by:',
  projectGroupByNone: 'No grouping',
  projectPickHint: 'Pick a project to see its tasks',
  projectDone: 'done',
  projectTimelineSpread: 'deadline spread',
  projectTimelineEmpty: 'no deadlines',
  sprints: 'Sprints',
  sprintNew: 'New sprint',
  sprintNamePlaceholder: 'Sprint name',
  sprintRename: 'Rename sprint',
  sprintClose: 'Close sprint',
  sprintReopen: 'Reopen',
  sprintClosedLabel: 'closed',
  sprintBacklog: 'Backlog',
  sprintNoSprints: 'No sprints yet',
  sprintNoSprintsHint: 'A sprint is a named batch of the project tasks. Its dates are optional and only feed the analytics: Today still follows the task deadline alone',
  sprintEmpty: 'Empty',
  sprintMoveTitle: 'Where do the unfinished ones go?',
  sprintMoveHint: 'Finished tasks stay in the closed sprint as they are',
  sprintMoveToBacklog: 'To the project backlog',
  sprintPick: 'Sprint',
  sprintNoProject: 'Pick a project first — a task without one cannot join a sprint',
  sprintField: 'Sprint',
  sprintClosedSuffix: '(closed)',
  sprintForeignProject: 'Other project',
  sprintAddTaskIn: 'New task in “{name}”',
  sprintAddTaskA11y: 'Add task',
  // ── Project & sprint analytics (projects-analytics §8.1) ──
  projectInProgress: 'in progress',
  projectAssigned: 'assigned',
  projectUnassigned: 'unassigned',
  projectBacklog: 'no sprint',
  projectFunnelA11y: '{n} of {total} tasks: {label}',
  projectFlagA11y: '{n} of {open} open tasks: {label}',
  sprintCurrent: 'Current sprint',
  sprintDaysLeft: 'days left: {n}',
  sprintLastDay: 'last day',
  sprintOverdue: 'sprint end date passed',
  sprintOverdueDays: 'ended, days ago: {n}',
  sprintUndated: 'no dates',
  sprintProgressA11y: 'Sprint “{name}” progress: {done} of {total}',
  sprintStartDate: 'From (YYYY-MM-DD)',
  sprintEndDate: 'To, inclusive (YYYY-MM-DD)',
  sprintDatesHint: 'Dates are optional: both or none. They power velocity and the burndown',
  sprintDatesPartial: 'Enter both dates or clear both',
  sprintDatesInvalid: 'Dates must be YYYY-MM-DD',
  sprintDatesOrder: 'The end cannot be before the start',
  sprintDatesOverlap: 'Overlaps with sprints: {names}',
  sprintNotDated: 'No dates set — velocity and burndown are unavailable for this sprint',
  velocityTitle: 'Velocity',
  velocityNotEnough: 'Not enough data for a forecast',
  velocityAverage: 'average: {n} (≈{w} per week)',
  velocityDays: 'days: {n}',
  velocityTasks: 'tasks: {n}',
  velocityForecast: 'Forecast: ≈{weeks} wk · open tasks: {open} · sprints in sample: {n}',
  velocitySample: 'sprints in sample: {n}',
  velocityUndated: 'Closed sprints without dates: {n} — left out of velocity',
  velocityEmpty: 'No closed sprints with dates yet',
  burndownTitle: 'Sprint burndown',
  burndownIdeal: 'ideal',
  burndownActual: 'actual',
  burndownScope: 'scope (current): {n}',
  burndownNoDoneDate: 'no completion date: {n}',
  burndownCarriedIn: 'done before start: {n}',
  burndownInsufficient: 'Not enough history for a burndown: {n} of {total} tasks have no completion date',
  burndownShow: 'Show sprint burndown',
  burndownHide: 'Hide sprint burndown',
  portfolioKpi: 'Portfolio',
  portfolioProjects: 'projects',
  portfolioTasks: 'tasks',
  portfolioCollapse: 'Collapse portfolio',
  portfolioExpand: 'Expand portfolio',
  doneByWeekTitle: 'Done per week',
  portfolioWeeksTotal: 'total over {n} wk: {count}',
  portfolioAvgWeekly: 'average per calendar week: {n}',
  portfolioEarlier: 'earlier: {n}',
  openFullTaskForm: 'Open full form',
  projectMeetingsPast: 'Past ({count})',
  projectMeetingsEmpty: 'No meetings in this project',
  projectMeetingsNoUpcoming: 'No upcoming meetings',
  projectAnalytics: 'Analytics',
  projectAnalyticsHint: 'Charts follow the selected project; “Time spent” stays over the whole list — a single bar compares to nothing',
  chartColumns: 'Where tasks sit',
  chartDoneWeeks: 'Done by week',
  chartDeadlinesAhead: 'Deadlines ahead',
  chartTimeSpent: 'Time spent',
  chartWeeksSpan: 'weeks',
  chartTimerSessions: 'timer sessions',
  chartNoTasksInScope: 'These projects have no tasks',
  chartNoSessions: 'No finished timer sessions',
  chartDoneEarlier: 'Closed before this window',
  chartDoneUndated: 'Done without a completion date in the log — left out of the chart',
  chartOverdueDebt: 'Overdue — that is debt, not a plan',
  chartBeyondHorizon: 'Due beyond the horizon',
  chartNoDeadline: 'Unfinished with no deadline',
  ganttLegendReal: 'Real start date',
  ganttLegendEstimated: 'Start taken from the creation date — duration overstated',
  ganttLegendColor: 'Bar colour is the project colour',
  ganttToday: 'Today',
  ganttNothingToDraw: 'No tasks that can go on the scale',
  ganttNoStartDate: 'No bars at all — tasks with neither a start nor a creation date',
  ganttHidden: 'Did not fit on the scale',
  ganttStartFromCreated: 'start from the creation date',
  ganttStartExact: 'exact start',
  ganttEndDeadline: 'until the deadline',
  ganttEndDone: 'actually finished',
  ganttEndOpen: 'still running',
  ganttDaysShort: 'd',
  dialPicker: 'Dial',
  dialDigits: 'Digits',
  dialRings: 'Rings',
  dialChrono: 'Chronograph',
  dialFlip: 'Split-flap',
  dialDots: 'Second grid',
  dialArc: 'Arc',
  dialHourglass: 'Hourglass',
  dialOrbit: 'Orbit',
  dialSegment: 'Seven-segment',
  dialTape: 'Tape',
  dialMakeDefault: 'Make default',
  dialIsDefault: 'Default',
  dialMakeDefaultHint: 'Long press to make it the default',
  timersCountOne: '{n} timer',
  timersCountFew: '{n} timers',
  timersCountMany: '{n} timers',
  activeTimersExpandA11y: 'Show all active timers',
  timerKindTask: 'Task',
  timerKindMeeting: 'Meeting',
  timerKindAdhoc: 'Free timer',
  attachTask: 'Attach a task',
  detachTask: 'Detach',
  pickTaskTitle: 'Which task are you timing?',
  freeTimerHint: 'Without a task the time only lands in the tracker history',
  timerLabel: 'Timer',
  parallelTimers: 'In parallel',
  meetingNotTracked: 'No time tracked',
  meetingTrackedBefore: 'Total before: {time}',
  meetingTimerStart: 'Start',
  meetingTimerStop: 'Stop',
  meetingTimerStartA11y: 'Start meeting timer',
  meetingTimerStopA11y: 'Stop meeting timer',
  meetingRecordings: 'Recordings ({n})',
  meetingRecordingItem: 'Recording {n}',
  meetingRecord: 'Record',
  meetingDaysAgo: '{n} d ago',
  meetingOpenLink: 'Open link',
  collapseList: 'Collapse',
  discardTaskEditTitle: 'Discard edits?',
  discardTaskEditMsg: 'Unsaved task changes will be lost.',
  discardChanges: 'Discard',
  navSubscriptions: 'Subscriptions',
  subNew: 'New subscription',
  subEditTitle: 'Edit subscription',
  subName: 'Name',
  subNamePlaceholder: 'e.g. Netflix',
  subAmountPerCycle: 'Amount per period',
  subPeriod: 'Period',
  subEvery: 'Every',
  subNextPayment: 'Next payment',
  subEndDate: 'End date',
  subIndefinite: 'No end date',
  subSetEndDate: 'Set date',
  subReminder: 'Remind',
  subReminderDayOf: 'On payment day',
  subReminder1: '1 day before',
  subReminder3: '3 days before',
  subReminder7: '7 days before',
  subColor: 'Color',
  subNoCategory: 'No category',
  subNoAccount: 'No account',
  subAccountHint: 'Reference only — the account balance is not changed',
  subUrl: 'Link',
  subRenew: 'Renewed',
  subRenewConfirm: 'Confirm',
  subRenewHint: 'The next payment moves to {date}. No finance transaction is created.',
  subRenewAmount: 'Amount for this period',
  subRenewStale: 'This subscription was already renewed on another device. Check the next payment date.',
  subOverdue: 'Overdue',
  subArchiveAction: 'Archive',
  subArchivedChip: 'Archived',
  subEnded: 'Ended {date}',
  subArchiveCount: 'Archive ({count})',
  subDeleteTitle: 'Delete subscription?',
  subDeleteMsg: '“{name}” and its renewal history will be deleted on all devices.',
  subHistory: 'Renewal history',
  subHistoryEmpty: 'Not renewed yet',
  subPerMonth: '/mo',
  subPerYear: '/yr',
  subTotals: 'Total',
  subEmptyTitle: 'No subscriptions yet',
  subEmptyHint: 'Add recurring payments — we will remind you before they are due',
  subSelectHint: 'Select a subscription to see details',
  subInDays: 'in {n} d',
  subOverdueDays: '{n} d overdue',
  subUpcoming: 'Upcoming payments',
  subUpcomingWithin: 'Next {n} days',
  subFormInvalid: 'Enter a name, an amount above 0 and a valid payment date.',
  subEndBeforeNext: 'The end date is earlier than the next payment.',
  subProjectEmpty: 'No subscriptions',
  subNoProjectFilter: 'No project',
  subSaveError: 'Could not save the subscription. Please try again.',
  subNotifBeforeTitle: '💳 Subscription payment soon',
  subNotifBeforeBody: '{name}: {amount} — {date}',
  subNotifDueTitle: '💳 Subscription payment today',
  subNotifDueBody: '{name}: {amount}',
  subNotifOverdueTitle: '⚠️ Subscription payment overdue',
  subNotifOverdueBody: '{name}: {amount}. Mark it “Renewed” once paid.',
  subNotifEndTitle: '📅 Subscription ends soon',
  subNotifEndBody: '{name} — {date}',

  // Local reminders (store/notifications.ts)
  notifChannelReminders: 'Reminders',
  notifTaskTitle: '📋 Task',
  notifSubtaskTitle: '✅ Subtask',
  notifMeetingTitle: '📅 Meeting in 15 min',

  // Project space (WORKSPACE_PROJECTS_PLAN.md §3)
  projectNavOverview: 'Overview',
  projectNotFound: 'Project not found',
  overviewHoursThisWeek: 'Hours this week',
  overviewUpcomingMeetings: 'Upcoming meetings',
  overviewBudgetSpent: 'Spent',
  notesSortTitle: 'By title',
  notesSearch: 'Search notes…',
  notesPersonal: 'Personal',
  notesSelectHint: 'Select a note or create a new one',
  notesNoResults: 'No matches. Change the search or filter.',
  notesReadOnly: 'Read only',
  notesUnsavedTitle: 'Unsaved note',
  notesUnsavedBody: 'Stay in the editor or discard your changes?',
  notesEmptyError: 'Add a title or note text.',
  notesSaveError: 'Could not save. Your text remains in the editor. Please retry.',
  notesReadError: 'Could not read notes. Please retry.',
  notesRetry: 'Retry',
  notesDeleteConfirm: 'Delete this note from all synced devices?',
  noteBodyPlaceholder: 'Note text...',
  timeManualTask: 'What did you work on',
  timeManualMinutes: 'Min',
  timeNoEntries: 'No time entries yet',
  projectModuleDisabled: 'This section is turned off in project settings',
  projectBudgetOwnerOnly: 'Only the project owner sees the budget',
  projectBudgetLimit: 'Monthly budget',
  projectBudgetTransactions: 'Project expenses',
  projectBudgetNoTransactions: 'No expenses yet',
  projectSettingsInfo: 'PROJECT',
  projectNamePlaceholder: 'Project name',
  projectDescriptionPlaceholder: 'Description',
  projectTemplateLabel: 'Template',
  projectTemplateSimple: 'Simple',
  projectTemplateWork: 'Full',
  projectSettingsModules: 'SECTIONS',
  projectSettingsStatuses: 'TASK STATUSES',
  projectStatusAdd: 'Add status',
  projectStatusSeed: 'Copy default statuses',
  projectStatusNew: 'New status',
  statusTypeTodo: 'To do',
  statusTypeInProgress: 'In progress',
  statusTypeDone: 'Done',
  projectExitToPersonal: 'Personal',
  projectSwitcherTitle: 'Projects',
  projectSwitcherRecent: 'Recent',
  projectSwitcherAll: 'All projects',
  projectSwitcherEmpty: 'No projects yet',

  projectMembersTitle: 'Members',
  projectMembersYou: 'You',
  projectMembersCount: 'members',
  roleOwner: 'Owner',
  roleMember: 'Member',
  roleViewer: 'Viewer',
  projectMembersChangeRole: 'Change role',
  projectMembersRemove: 'Remove from project',
  projectMembersRemoveConfirm: 'Remove this member from the project?',
  projectMembersLeave: 'Leave project',
  projectMembersLeaveConfirm: 'Leave this project? You will lose access to it.',
  projectMembersLeaveUnsyncedWarning: 'There are unsynced changes here that never reached the server. Leave now and lose them for good?',
  projectMembersOwnerCannotLeave: 'The owner cannot leave — transfer ownership to another member first.',
  projectMembersTransferOwnership: 'Transfer ownership',
  projectMembersTransferOwnershipHint: 'Choose who to transfer the project to',
  projectMembersTransferOwnershipConfirm: 'Transfer ownership of this project to {name}?',
  projectMembersTransferOwnershipNoMembers: 'There are no other members to transfer ownership to.',
  projectMembersInviteMaxUses: 'Use limit',
  projectMembersInviteMaxUsesUnlimited: 'Unlimited',
  projectMembersInvitedBy: 'Invited by',
  projectMembersInviteSection: 'INVITE',
  projectMembersCreateLink: 'Create link',
  projectMembersLinkRole: 'Invitee role',
  projectMembersLinkExpiry: 'Expires in',
  projectMembersExpiry24h: '24 hours',
  projectMembersExpiry7d: '7 days',
  projectMembersExpiry30d: '30 days',
  projectMembersLinkCreated: 'Link created',
  projectMembersShareLink: 'Share',
  projectMembersCopyLink: 'Copy link',
  projectMembersLinkCopied: 'Link copied',
  projectMembersActiveLinks: 'Active links',
  projectMembersRevokeLink: 'Revoke',
  projectMembersRevokeConfirm: 'Revoke this invite? It can no longer be used.',
  projectMembersInviteByEmail: 'Invite by email',
  projectMembersEmailPlaceholder: 'email@example.com',
  projectMembersSendInvite: 'Invite',
  projectMembersEmailInviteSent: 'Member added to the project',
  projectMembersEmailUserNotFound: 'No account found with this email',
  projectMembersEmailAlreadyMember: 'This person is already in the project',
  projectSettingsMembersRow: 'Members',
  projectMembersError: 'Failed to load members',
  projectMembersOfflineHint: 'Team is available online only',

  commentsTitle: 'Comments',
  commentsEmpty: 'No comments yet',
  commentsPlaceholder: 'Write a comment… (@ to mention a member)',
  commentsSend: 'Send',
  commentsEdited: '(edited)',
  commentsEditAction: 'Edit',
  commentsDeleteAction: 'Delete',
  commentsDeleteConfirm: 'Delete this comment?',
  commentsSaveEdit: 'Save',
  commentsCancelEdit: 'Cancel',

  projectActivityTitle: 'Activity',
  projectActivityEmpty: 'No activity yet',
  projectActivityError: 'Failed to load activity',
  projectActivityShowAll: 'All activity',
  projectActivityLoadMore: 'Show more',
  projectActivityCreated: '{actor} created "{title}"',
  projectActivityUpdated: '{actor} updated "{title}"',
  projectActivityDeleted: '{actor} deleted "{title}"',
  projectActivityStatusChanged: '{actor} changed status of "{title}": {from} → {to}',
  projectActivityAssigned: '{actor} assigned "{title}"',
  projectActivityCommented: '{actor} commented on "{title}"',
  projectActivityMemberJoined: '{actor} joined the project',
  projectActivityMemberLeft: '{actor} left the project',
  projectActivityRoleChanged: '{actor} changed role {target}',
  projectActivityUnknownActor: 'Someone',

  inviteScreenTitle: 'Invitation',
  inviteLoading: 'Checking invitation…',
  inviteCheckingWorkspace: 'Checking workspace…',
  inviteSwitchWorkspaceTitle: 'Switch workspace?',
  inviteSwitchWorkspaceMsg: 'This invite is from a different workspace. Switching signs you out of the current account; your data stays on the server.',
  inviteSwitchWorkspaceConfirm: 'Switch',
  inviteWorkspaceUnreachable: 'Could not reach this invitation\'s workspace',
  inviteInvalid: 'This invitation is invalid',
  inviteExpired: 'This invitation has expired or was revoked',
  inviteInvitedByLabel: 'Invited by',
  inviteExpiresLabel: 'Expires',
  inviteJoinButton: 'Join',
  inviteJoining: 'Joining…',
  inviteAlreadyMember: 'You are already a member of this project',
  inviteJoinedTitle: 'You\'re in!',
  inviteJoinedOpenProject: 'Open project',
  inviteLoginButton: 'Log in',
  inviteRegisterButton: 'Sign up',
  inviteGuestHint: 'Log in or sign up to join the project',
  inviteNetworkError: 'No connection — try again later',
  inviteConfirmWorkspaceTitle: 'Use this invitation\'s workspace?',
  inviteConfirmWorkspaceMsg: 'This link points to a different workspace ({name}). The app will switch to its address.',
  inviteConfirmWorkspaceButton: 'Continue',
  registerInvitedTitle: 'Project invitation',
  registerInvitedMsg: 'After signing up you will join the project “{project}” ({role})',
  registerInviteBrokenTitle: 'Invitation problem',
  registerInviteInvalidMsg: 'This invitation is invalid. Sign up without it?',
  registerInviteExpiredMsg: 'This invitation has expired or was revoked. Sign up without it?',
  registerContinueWithoutInvite: 'Sign up without the invitation',

  taskAssignee: 'Assignee',
  taskAssigneeUnassigned: 'Unassigned',
  taskAssigneeMe: 'Me',

  viewerReadOnlyNotice: 'View only — Viewer role',

  // Budget (was utils/budgetStrings.ts)
  budgetSpentCaps: 'SPENT',
  budgetBudgetCaps: 'BUDGET',
  budgetLeft: 'Left',
  budgetOutsideLimits: 'Outside limits',
  budgetScopeAll: 'All',
  budgetScopePersonal: 'Personal',
  budgetScopeProject: 'Project',
  budgetScopeLabel: 'Whose money to show',
  budgetEmptyTitle: 'No budget set up',
  budgetEmptyBody: 'Categories appear automatically\nonce you add expenses in Finance',
  budgetAddManually: 'Add manually',
  budgetTapHint: 'Tap a category to set a monthly forecast',
  budgetTapRowHint: 'Tap to set a forecast',
  budgetMonthlyForecast: 'Monthly spending forecast',
  budgetActuallySpent: 'Actually spent:',
  budgetPlannedFor: 'Planned for the month ({currency})',
  budgetNewCategory: 'New budget category',
  budgetName: 'Name',
  budgetNamePlaceholder: 'Category name',
  budgetIcon: 'Icon',
  budgetAddCategory: 'Add category',
  budgetDeleteTitle: 'Delete category?',
  budgetDeleteMsg: '"{name}" will be removed from the budget.',
  budgetDeleteAction: 'Delete category',
  budgetErrorExists: 'This category already exists',
  budgetErrorTooLong: 'Name too long: at most {max} characters — it is also the record key',
  budgetUnsyncableRow: 'Not syncing: the name is longer than the server limit',

  // Notes (was utils/notesStrings.ts)
  notesPreview: 'Preview',
  notesEditText: 'Text',
  notesPin: 'Pin',
  notesUnpin: 'Unpin',
  notesPinned: 'Pinned',
  notesTagsLabel: 'Tags',
  notesTagsPlaceholder: 'Comma-separated tags',
  notesTagsAll: 'All tags',
  notesLinkTask: 'Task',
  notesLinkMeeting: 'Meeting',
  notesLinkNone: 'No link',
  notesLinkLost: 'Link lost',
  notesCreateTask: 'Create task from line',
  notesTaskCreated: 'Task created',
  notesTaskCreateError: 'Could not create the task. Please retry.',
  notesChecklist: 'Checklist',
  notesEmptyBody: 'No text.',
  notesMarkdownHint: 'Markdown: # heading, - item, - [ ] checklist, #tag',

  // Subscription payment (was PAY_LABELS)
  payAction: 'Paid',
  payTitle: 'Subscription payment',
  payAmount: 'Paid amount',
  payHint: 'We will add a «{category}» expense on {account} and move the payment to {date}.',
  payNoAccount: 'no account',
  payConfirm: 'Create expense',
  payStale: 'This cycle was already paid on another device. Check the next payment date.',
  payTxFailed: 'The payment was recorded, but the expense was not created. Add it manually.',

  // Interface modules (was moduleText())
  modulesTitle: 'Modules',
  modulesSubtitle: 'Disabled modules disappear from the menu, dashboard and notifications. The data stays — turn a module back on and everything returns.',
  modulesSystemNote: 'Settings and profile cannot be disabled.',
  modulesDisabledTitle: 'You turned this feature off',
  modulesDisabledBody: 'Nothing was deleted. Turn the module back on in settings and the section returns exactly as it was.',
  modulesOpenSettings: 'Open settings',
  modulesSettingsRow: 'Interface modules',
  modulesDashboardEmptyTitle: 'All modules are off',
  modulesDashboardEmptyBody: 'Nothing was deleted. Turn the modules you need back on and Today returns exactly as it was.',

  // Storage read failure (was LoadErrorNotice)
  loadErrorTitle: 'Could not read your data',
  loadErrorBody: 'Storage returned an error. This is NOT an empty list — changes are not being saved so nothing gets overwritten.',
  loadErrorRetry: 'Try again',
  healthReminderOff: 'Reminder is not set',
  healthReminderOffSub: 'The system did not grant notification permission (or notifications are off in app settings). The entry was saved without a reminder.',
  healthNoticeSettings: 'Settings',
  hkSyncing: 'Syncing with HealthKit',
  hkManual: 'Add activity manually or via workouts',
  hkDenied: 'No HealthKit access — the numbers below are your manual entries',
  hkGrant: 'Grant access',
  hkFailed: 'HealthKit did not answer: this is missing data, not a zero',

  // Time screen
  timeAverageTask: 'Average task',
  timeProjectBreakdown: 'Breakdown by project',
  timeMoreProjects: '+ {count} more',
  timePeriodGroup: 'Period',
  timeModeGroup: 'View',
  timeGroupingList: 'List',
  timeGroupingProject: 'Grouped by project',
  timeSortDateDesc: 'Newest first',
  timeSortDateAsc: 'Oldest first',
  timeSortDurationDesc: 'Longest first',
  timeSortDurationAsc: 'Shortest first',
  timeByProjectSuffix: ' · by project',
  timeEmptyHint: 'Start a timer from a task or add a record with +',
  timeAddEntry: 'Add record',
  timeEditEntry: 'Edit record',
  timeNewEntry: 'New record',
  timeEntryTaskLabel: 'Task',
  timeEntryTaskPlaceholder: 'Task name',
  timeEntryDateLabel: 'Date',
  timeEntryDatePlaceholder: 'YYYY-MM-DD',
  timeEntryNotePlaceholder: 'Optional',
  timeEntryErrorTask: 'Enter a task name',
  timeEntryErrorDuration: 'Enter a duration',
  timeEntryErrorDate: 'Use the YYYY-MM-DD date format',
  timeDeleteEntryA11y: 'Delete record: {task}',

  // Review queue (was ANOMALY_LABEL)
  anomalyLong: 'Longer than 8 h',
  anomalyMidnight: 'Crosses midnight',
  anomalyOutlier: 'Three times the usual',
  anomalyShort: 'Shorter than 1 min',
  anomalyCheckTitle: 'Check {count} {noun}',
  anomalyRecordOne: 'record',
  anomalyRecordFew: 'records',
  anomalyRecordMany: 'records',
  anomalyTrimTo: 'Trim to {duration}',
  anomalyMarkNormal: 'Normal',
  anomalyShowMore: 'Show {count} more',

  // Health tabs
  healthTabOverview: 'Overview',
  healthTabActivity: 'Activity & workouts',
  healthTabBody: 'Body & vitals',
  healthReadFailed: 'Could not read the data',
  healthUpdatedAt: 'Updated {time}',
  calRemaining: 'Left',
  // Notification center
  ncTabInbox: 'Notifications',
  ncTabReminders: 'Reminders',
  ncFilterAll: 'All',
  ncFilterUnread: 'Unread',
  ncMarkAllRead: 'Mark all as read',
  ncMarkRead: 'Mark as read',
  ncArchive: 'Remove from list',
  ncOpenSettings: 'Notification settings',
  ncEmptyTitle: 'All quiet for now',
  ncEmptySub: 'Assignments, mentions and reminders about deadlines, meetings and payments will appear here.',
  ncEmptyUnreadTitle: 'You are all caught up',
  ncOffline: 'Server notifications are available in online mode with an account.',
  ncUnavailable: 'This server does not support the notification center yet.',
  ncLoadFailed: 'Could not refresh notifications.',
  ncRetry: 'Retry',
  ncLoadMore: 'Show more',
  ncUnreadCount: 'Unread: {count}',
  ncBadgeA11y: 'Unread notifications: {count}',
  ncUnreadA11y: 'unread',
  ncJustNow: 'just now',
  ncMinutesAgo: '{n} min ago',
  ncHoursAgo: '{n} h ago',
  ncYesterday: 'yesterday',
  ncCollapsedMore: '+{count} similar',
  ncHiddenByModules: 'Notifications from disabled sections are hidden.',
  ncLocalRemindersToggle: 'Reminders on this device',
  ncLocalRemindersHint: 'Medication, habit and health reminders work offline — they are scheduled on the phone itself.',
  ncServerRemindersHint: 'Task, meeting and payment-day reminders now come from the server — see the Notifications tab.',
  ncSettingsTitle: 'Notification settings',
  ncSettingsIntro: 'These settings are shared across all your devices and the web.',
  ncMaster: 'Send notifications',
  ncMasterSub: 'When off, nothing is sent out; the in-app list stays.',
  ncPushMaster: 'Push to devices',
  ncPushMasterSub: 'Phones, tablets and browsers where you are signed in.',
  ncEmailMaster: 'Email digest',
  ncChannelInApp: 'In app',
  ncChannelPush: 'Push',
  ncChannelEmail: 'Email',
  ncMatrixTitle: 'What to send and where',
  ncShowEvents: 'Individual events',
  ncHideEvents: 'Collapse',
  ncCustomized: 'customized',
  ncResetEvent: 'Same as category',
  ncChannelA11y: '{event} — {channel}',
  ncQuietHours: 'Quiet hours',
  ncQuietHoursSub: 'Push is held until quiet hours end; in-app notifications still appear right away.',
  ncQuietFrom: 'From',
  ncQuietTo: 'To',
  ncEarlier: 'Earlier',
  ncLater: 'Later',
  ncTimezone: 'Time zone: {tz}',
  ncMeetingLead: 'Meeting reminder',
  ncMinutesBefore: '{n} min before',
  ncSaveFailed: 'Could not save. Please try again.',
  ncSettingsOffline: 'Notification settings are available in online mode with an account.',
  ncNoEvents: 'No events for this section yet.',
  ncCatTasksProjects: 'Tasks and projects',
  ncCatMeetingsFinance: 'Meetings and finance',
  ncCatTrainingHealth: 'Training and health',
  ncCatSystem: 'Feedback and system',
  ncEvTaskAssigned: 'Task assigned',
  ncEvTaskStatusChanged: 'Status changed',
  ncEvTaskMentioned: 'Mentioned in a comment',
  ncEvTaskCommented: 'New comment',
  ncEvTaskDeadlineSoon: 'Deadline approaching',
  ncEvTaskOverdue: 'Overdue tasks',
  ncEvTaskReminder: 'Task reminder',
  ncEvSprintStarted: 'Sprint started',
  ncEvSprintClosed: 'Sprint closed',
  ncEvProjectInvite: 'Added to a project',
  ncEvMeetingReminder: 'Meeting reminder',
  ncEvSubscriptionDue: 'Subscription payment',
  ncEvBudgetExceeded: 'Budget exceeded',
  ncEvBalanceForecast: 'Balance forecast',
  ncEvWorkoutAssigned: 'Program assigned',
  ncEvWorkoutToday: 'Workout today',
  ncEvQuestClosed: 'Quest closed',
  ncEvStreakAtRisk: 'Streak at risk',
  ncEvMeasurement: 'Measurement reminder',
  ncEvFeedback: 'Feedback status',
  ncEvRegistration: 'New registration request',
  // ── Групи тренувань (training-module.md, мобільний клієнт) — префікс tg ──
  tgNavLabel: 'Training groups',
  tgTitle: 'Training groups',
  tgGroupsButton: 'Training groups',
  tgPersonalProgramsTab: 'My programs',
  tgEmptyTitle: 'No groups yet',
  tgEmptyBody: 'Create a group as a coach or join one with an invite.',
  tgCreateGroup: 'Create group',
  tgJoinGroup: 'Join with invite',
  tgRoleCoach: 'Coach',
  tgRoleMember: 'Member',
  tgMembersCount: 'Members: {n}',
  tgGroupName: 'Group name',
  tgGroupNamePlaceholder: 'e.g. Morning group',
  tgGroupDescription: 'Description',
  tgGroupDescriptionPlaceholder: 'Mon/Wed/Fri 07:00',
  tgColor: 'Color',
  tgTimezone: 'Time zone',
  tgWeekStart: 'Week starts on',
  tgWeekStartMon: 'Monday',
  tgWeekStartSun: 'Sunday',
  tgCreate: 'Create',
  tgOfflineNotice: 'No connection to the server — showing what is saved on this device.',
  tgOnlineOnly: 'Training groups need an account in online mode.',
  tgErrorGeneric: 'Something went wrong. Please try again.',
  tgGroupGone: 'The group was deleted or you are no longer in it.',
  tgInviteCodeLabel: 'Invite link or code',
  tgInviteCodePlaceholder: 'Paste the invite link',
  tgInviteCheck: 'Check',
  tgInviteJoin: 'Join',
  tgInviteInvalid: 'This invite is not valid.',
  tgInviteExpired: 'This invite has expired.',
  tgInviteTo: 'You are invited to the group',
  tgInviteAs: 'Role: {role}',
  tgInviteFrom: 'Invited by: {name}',
  tgAlreadyMember: 'You are already in this group.',
  tgInviteOtherWorkspace: 'This invite is for another server ({ws}). Switch to it in account settings and open the link again.',
  tgJoined: 'You joined the group.',
  tgOpenGroup: 'Open group',
  tgTodaySession: 'Today\'s workout',
  tgRestDay: 'Rest day today',
  tgNextSession: 'Next: {date}',
  tgNoPlan: 'No program assigned yet',
  tgNoPlanCoach: 'Create a program and assign it to members.',
  tgStart: 'Start',
  tgContinue: 'Continue',
  tgView: 'View',
  tgExercisesCount: 'Exercises: {n}',
  tgStatusPlanned: 'Planned',
  tgStatusCompleted: 'Completed',
  tgStatusPartial: 'Partial',
  tgStatusSkipped: 'Skipped',
  tgStatusMissed: 'Missed',
  tgThisWeek: 'This week',
  tgStreak: 'Streak',
  tgStreakDays: '{n} d',
  tgXpTotal: 'Total XP',
  tgMultiplier: 'Multiplier ×{x}',
  tgLeaderboard: 'Leaderboard',
  tgSeeAll: 'See all',
  tgQuests: 'Quests',
  tgActiveQuests: 'Active quests',
  tgNoQuests: 'No active quests',
  tgPrograms: 'Programs',
  tgMembers: 'Members',
  tgExercises: 'Group exercises',
  tgInvite: 'Invite',
  tgLeaveGroup: 'Leave group',
  tgLeaveConfirm: 'Leave “{name}”? Completed workouts stay in your log.',
  tgDeleteGroup: 'Delete group',
  tgDeleteGroupConfirm: 'Delete “{name}” for all members?',
  tgLastCoach: 'The group must keep at least one coach.',
  tgSyncPending: 'Waiting to sync',
  tgRejected: 'The server did not accept a change ({reason}).',
  tgNewProgram: 'New program',
  tgNoPrograms: 'No programs yet',
  tgNoProgramsMember: 'The coach has not created programs yet.',
  tgImportProgram: 'Import my program',
  tgImportExercises: 'Import my exercises',
  tgImportedExercises: 'Exercises imported: {n}',
  tgNothingToImport: 'No new personal exercises to import.',
  tgWeeks: '{n} wk',
  tgDaysPerWeek: '{n} days/wk',
  tgProgramName: 'Program name',
  tgWeekCount: 'Weeks',
  tgNotes: 'Notes',
  tgWeekTemplate: 'Weekly template',
  tgRestDayShort: 'Rest',
  tgDayTitle: 'Day title',
  tgDayTitlePlaceholder: 'Day A — upper',
  tgEstimatedMin: 'Duration, min',
  tgAddExercise: 'Add exercise',
  tgSets: 'Sets',
  tgReps: 'Reps',
  tgWeightKg: 'Weight, kg',
  tgRestSec: 'Rest, s',
  tgRpe: 'RPE',
  tgProgression: 'Progression',
  tgProgNone: 'None',
  tgProgLinearWeight: '+ weight',
  tgProgLinearReps: '+ reps',
  tgProgPercent: '+ %',
  tgStepKg: 'Step, kg',
  tgStepReps: 'Step, reps',
  tgPercent: 'Percent',
  tgEveryWeeks: 'Every N weeks',
  tgCapKg: 'Cap, kg',
  tgCapReps: 'Cap, reps',
  tgPreview: 'Load preview',
  tgWeekN: 'Week {n}',
  tgRemoveDay: 'Make it a rest day',
  tgMoveUp: 'Move up',
  tgMoveDown: 'Move down',
  tgRemove: 'Remove',
  tgProgramInvalidName: 'Enter a program name.',
  tgProgramInvalidDays: 'Add at least one day with exercises.',
  tgAssign: 'Assign',
  tgAssignTitle: 'Assign program',
  tgStartDate: 'Start date (YYYY-MM-DD)',
  tgSelectMembers: 'Members',
  tgSelectAll: 'All',
  tgAssignDone: 'Assigned to members: {n}',
  tgAssignAlready: 'already assigned',
  tgAssignSessions: '{n} sessions will be created per member.',
  tgAssignments: 'Assignments',
  tgRevoke: 'Revoke',
  tgRevokeConfirm: 'Revoke this assignment? Future planned sessions disappear for the member; completed ones stay.',
  tgReexpand: 'Update for members',
  tgReexpandHint: 'The program changed after it was assigned.',
  tgSaveFirst: 'Save the program first so the server can see it.',
  tgDeleteProgram: 'Delete program',
  tgDeleteProgramConfirm: 'Delete “{name}”? Sessions already assigned stay with members.',
  tgExerciseName: 'Exercise name',
  tgMuscleGroup: 'Muscle group',
  tgNewExercise: 'New exercise',
  tgNoExercises: 'The group exercise library is empty',
  tgPickExercise: 'Pick an exercise',
  tgDateInvalid: 'Use YYYY-MM-DD, no earlier than 14 days ago.',
  tgSetN: 'Set {n}',
  tgRestTimer: 'Rest',
  tgSkipRest: 'Skip',
  tgAddRest: '+30 s',
  tgFinish: 'Finish',
  tgSkipSession: 'Skip workout',
  tgSkipConfirm: 'Mark this workout as skipped?',
  tgFinishTitle: 'Finish workout',
  tgDurationMin: 'Duration, min',
  tgCalories: 'Calories (optional)',
  tgMemberNote: 'Note for the coach',
  tgFinishPartial: '{done} of {total} sets done — it will count as partial, without XP.',
  tgXpEstimate: '≈ +{n} XP',
  tgSessionNotFound: 'Session not found. The assignment may have been revoked.',
  tgSetDone: 'Set {n} done',
  tgSetNotDone: 'Mark set {n} done',
  tgVolume: 'Volume: {kg} kg',
  tgElapsed: 'Elapsed',
  tgCoachNote: 'Coach note',
  tgNewQuest: 'New quest',
  tgQuestTitle: 'Title',
  tgQuestMeasurable: 'Measurable goal',
  tgQuestCheckbox: 'Checklist task',
  tgMetric: 'Metric',
  tgTarget: 'Target',
  tgDueDate: 'Due date (YYYY-MM-DD)',
  tgXpReward: 'XP reward',
  tgPhotoRequired: 'Photo required',
  tgHealthMetricHint: 'Calculated from the member\'s health data. The coach sees only the total.',
  tgMarkDone: 'Mark done',
  tgUndo: 'Undo',
  tgAddPhoto: 'Add photo',
  tgPhotoAttached: 'Photo attached',
  tgPhotoLocalHint: 'The photo stays on your device only.',
  tgPhotoUnavailable: 'Photo picking is not available in this build.',
  tgRecompute: 'Recalculate',
  tgAllMembers: 'All members',
  tgQuestAuto: 'Progress is tracked automatically',
  tgArchive: 'Archive',
  tgMetricSessionCount: 'Workouts count',
  tgMetricWorkoutMinutes: 'Workout minutes',
  tgMetricDistance: 'Distance',
  tgMetricVolume: 'Volume',
  tgMetricSteps: 'Steps',
  tgMetricSleep: 'Sleep',
  tgMetricWeightDelta: 'Weight change',
  tgUnitSessions: 'workouts',
  tgUnitMinutes: 'min',
  tgUnitKm: 'km',
  tgUnitKg: 'kg',
  tgUnitSteps: 'steps',
  tgUnitHours: 'h',
  tgQuestInvalid: 'Fill in title, metric and target; the due date must not be before the start.',
  tgDoneCount: 'Completed: {n}',
  tgPeriodWeek: 'Week',
  tgPeriodAll: 'All time',
  tgYou: 'You',
  tgYourPlace: 'Your place: {rank} · {xp} XP',
  tgSessionsShort: '{n} workouts',
  tgNoLeaderboard: 'Nobody has earned XP yet',
  tgPrevWeek: 'Previous week',
  tgNextWeek: 'Next week',
  tgInviteLink: 'Link',
  tgInviteByEmail: 'By email',
  tgEmail: 'Email',
  tgCreateLink: 'Create link',
  tgLinkCreated: 'The link is ready. Share it now — it cannot be shown again.',
  tgShare: 'Share',
  tgCopy: 'Copy',
  tgCopied: 'Copied',
  tgExpiresIn: 'Valid for',
  tgHours24: '24 h',
  tgDays7: '7 days',
  tgDays30: '30 days',
  tgActiveInvites: 'Active invites',
  tgInviteUses: 'Used: {uses}',
  tgUserNotFound: 'No user with this email.',
  tgMemberAdded: 'Member added.',
  tgAlreadyInGroup: 'This user is already in the group.',
  tgMakeCoach: 'Make coach',
  tgMakeMember: 'Make member',
  tgRemoveMember: 'Remove from group',
  tgRemoveMemberConfirm: 'Remove {name} from the group?',
  tgWeekXp: 'Week XP',
  tgNoMembers: 'No members yet',
  tgMemberHistory: 'Workout history',
  tgNoLogs: 'No completed workouts yet',
  tgQuestProgress: 'Quest progress',
  tgSaveNote: 'Save note',
  tgNotePlaceholder: 'Comment on this workout',
  tgPrivacyNote: 'The member\'s health data (weight, sleep, nutrition) is private and not shown here.',
  tgSelectMember: 'Select a member from the list',
  tgMemberNoteLabel: 'Member note',
  tgMinutesShort: '{n} min',
  tgOpenSession: 'Open workout',
  tgGroupBadge: 'Group',
  // ── Finance: tabbed section (finance-revamp.md) — prefix fin ──
  finTabOverview: 'Overview',
  finTabTransactions: 'Transactions',
  finTabReports: 'Reports',
  finTabBudget: 'Budget',
  finTabSubscriptions: 'Subscriptions',
  finTabAccounts: 'Accounts',
  finTabsLabel: 'Finance sections',
  finFilterPeriod: 'Period',
  finFilterCurrency: 'Currency',
  finFilterButton: 'Currency and scope',
  finPeriodPrev: 'Previous period',
  finPeriodNext: 'Next period',
  finPresetMonth: 'This month',
  finPresetPrevMonth: 'Last month',
  finPresetQuarter: 'This quarter',
  finPresetYear: 'This year',
  finPresetCustom: 'Custom period',
  finCustomFrom: 'Period start, YYYY-MM-DD',
  finCustomTo: 'Period end, YYYY-MM-DD',
  finApply: 'Apply',
  finFactTitle: 'Cash flow — actual',
  finInflow: 'Inflow',
  finOutflow: 'Outflow',
  finOpening: 'Opening',
  finClosing: 'Closing',
  finBalanceAllScopes: 'Balance includes all transactions: the scope narrows inflow and outflow only',
  finForecastTitle: 'Forecast',
  finForecast30: '30 days',
  finForecast90: '90 days',
  finForecastOn: 'On {date}: {amount}',
  finAvgVariable: 'Average variable spending: {amount} per day',
  finForecastThin: 'Not much data: less than 30 days of history, the estimate is rough',
  finForecastAllScope: 'The forecast uses all money; the scope does not affect it',
  finForecastEvents: 'Forecast events',
  finSourceSubscription: 'subscription',
  finSourceIncome: 'recurring income',
  finSourcePlanned: 'planned transaction',
  finEventVariable: 'variable spending (estimate)',
  finOverdue: 'overdue',
  finShortfallTitle: 'Balance goes negative on {date}: {amount}',
  finShortfallBiggest: 'Largest payments before that day: {list}',
  finViewForecast: 'View forecast',
  finEditSubscriptions: 'Edit subscriptions',
  finOnAccounts: 'On accounts · {currency}',
  finNoAccountsInCurrency: 'No accounts in {currency}',
  finUnassignedHint: 'Transactions without an account: {n} — assign',
  finPlannedHint: 'Planned transactions: {n}, {amount}',
  finNoData: 'No transactions in this period',
  finPnlTitle: 'P&L',
  finIncome: 'Income',
  finFixed: 'Fixed expenses',
  finVariable: 'Variable expenses',
  finNet: 'Net result',
  finSavingsRate: 'Savings rate',
  finPp: 'pp',
  finVsPrev: 'vs previous ({period})',
  finVsAvg: 'vs {n}-period average',
  finTransfersExcluded: 'Transfers between your accounts are not counted',
  finOtherCurrencies: 'Not counted (other currencies): {list}',
  finStructure: 'Spending structure',
  finCostAll: 'All',
  finCostFixed: 'Fixed',
  finCostVariable: 'Variable',
  finNoCategory: 'No category',
  finUnclassified: 'Transactions without a fixed/variable mark: {n} — counted as variable',
  finAssign: 'Assign',
  finGroupHousing: 'Housing',
  finGroupFood: 'Food',
  finGroupTransport: 'Transport',
  finGroupHealth: 'Health',
  finGroupEntertainment: 'Entertainment',
  finGroupServices: 'Services',
  finGroupEducation: 'Education',
  finGroupClothing: 'Clothing',
  finGroupPets: 'Pets',
  finGroupTaxes: 'Taxes',
  finGroupDebt: 'Debt',
  finGroupSalary: 'Salary',
  finGroupBusiness: 'Business',
  finGroupInvestments: 'Investments',
  finGroupGifts: 'Gifts',
  finGroupOther: 'Other',
  finCatGroup: 'Group',
  finCatCost: 'Kind',
  finCatMetaHint: 'Group and fixed/variable kind feed reports and the forecast',
  finArchivedAccounts: 'Archived accounts',
  finOpenBanks: 'Savings jars',
  finRecurringPayments: 'Recurring payments',
  finRecurringIncomes: 'Recurring income',
  finRiNew: 'New recurring income',
  finRiEdit: 'Recurring income',
  finRiEmpty: 'No recurring income yet',
  finRiName: 'Name',
  finRiNamePlaceholder: 'Salary',
  finRiEvery: 'Every',
  finRiNext: 'Next payment, YYYY-MM-DD',
  finRiNoAccount: 'no account',
  finRiInvalid: 'Check the name, amount and date',
  finRiArchive: 'Archive',
  finRiRestore: 'Restore',
  finRiDelete: 'Delete income',
  finRiDeleteConfirm: 'Delete recurring income "{name}"? Received transactions stay in Finance.',
  finRiSaveFailed: 'Could not save. Please try again.',
  finRiReceived: 'Received',
  finRiReceiveTitle: 'Income received',
  finRiReceiveHint: 'An income "{category}" will be added to {account}. Next payment — {date}.',
  finRiDefaultCategory: 'Other',
  finRiStale: 'This cycle was already received on another device',
  finBudgetByMonth: 'Limits by month',
  finBudgetMonthsHint: 'Monthly limits are not added up: each month is shown separately',
  finProjectAddTx: 'Add transaction',
  finProjectTxTitle: 'Project transaction',
  finProjectIncomeTitle: 'Project income',
  finProjectNoIncome: 'No income yet',
  finProjectNet: 'Income − expenses',
  finProjectNeedAccount: 'Create an account in Finance first: a transaction without an account is not part of any balance',
  finProjectSaveFailed: 'Could not save the transaction',
  finProjectUncounted: 'Not counted (other currencies): {list}',
  finProjectInvalid: 'Enter an amount greater than zero',
  // ─── hauto*: automatic health data (HealthKit / Health Connect) ───
  hautoPulseRest: 'Resting heart rate',
  hautoPulseRestNote: 'Resting heart rate for the day — from {source} or a manual entry.',
  hautoPulseRestNoteManual: 'Resting heart rate for the day — from a manual entry.',
  hautoPulseRestEmpty: 'No resting heart rate for today yet',
  hautoPulseAvg: 'Average heart rate',
  hautoPulseAvgNote: 'Daily average — not the resting heart rate.',
  hautoSleepQuality: 'Sleep quality',
  hautoSleepQualityByDuration: 'by duration',
  hautoSleepQualityByPhases: 'by stages',
  hautoSleepNoPhases: 'The source gave no sleep stages — the score reflects duration only.',
  hautoSleepPhases: 'Sleep stages',
  hautoSleepDeep: 'Deep',
  hautoSleepRem: 'REM',
  hautoSleepLight: 'Light',
  hautoSleepAwake: 'Awake',
  hautoSpo2: 'Blood oxygen (SpO₂)',
  hautoDistance: 'Distance',
  hautoBpm: 'bpm',
  hautoKm: 'km',
  hautoKg: 'kg',
  hautoKcal: 'kcal',
  hautoMin: 'min',
  hautoActiveKcal: 'Active kcal',
  hautoActiveCalories: 'Active calories',
  hautoFlights: 'Floors',
  hautoHrAvgShort: 'Avg',
  hautoHrMin: 'Min',
  hautoHrMax: 'Max',
  hautoHrRest: 'Resting',
  hautoLast24h: 'Last 24 h ({n} readings)',
  hautoWeek: '7 days',
  hautoWorkouts30: 'Workouts (30 days)',
  hautoWeightMeasuredAt: 'measured {date}',
  hautoWeightCleanup: 'Removed {n} repeated weight entries — your history is now accurate',
  hautoReadFailedBody: 'Requests to {source} failed. These numbers are not your data; check the access settings.',
  hautoNotAvailable: 'Not available',
  hautoNotAvailableIos: 'Apple Health is only available on iPhone',
  hautoNotAvailableAndroid: 'Health Connect is not installed or is out of date. Install it from Google Play so Flowi can read your data.',
  hautoNotAvailableOther: 'Automatic health data is only available in the phone app',
  hautoInstallHc: 'Install Health Connect',
  hautoConnectTitle: 'Connect {source}',
  hautoConnectBody: 'Flowi only reads data: steps, heart rate, sleep, weight, SpO₂. It never writes anything.',
  hautoOpenSettings: 'Open settings',
  hautoWip: 'This feature is still in development',
  hautoSyncing: 'Syncing with {source}',
  hautoDenied: 'No {source} access — the numbers below are your manual entries',
  hautoFailed: '{source} did not answer: this is missing data, not a zero',
  // ── Wave tails (tl*) ──
  tlEvTrainingInvite: 'Training group invitation',
  tlEvTrainingProgramAssigned: 'Training program assigned',
  tlEvTrainingSessionCompleted: 'Member completed a workout',
  tlEvTrainingQuestAssigned: 'New quest',
  tlEvTrainingQuestCompleted: 'Quest completed',
  tlEvTrainingComment: 'Coach comment',
  tlEvTrainingLeaderboardWeekly: 'Weekly leaderboard summary',
  tlEvFeedbackIncoming: 'New report in the inbox',
  tlHealthDeleteEntryTitle: 'Delete entry?',
  tlHealthDeleteEntryMsg: 'The entry will disappear from history on all devices. An automatic Health entry will not come back through sync.',
  tlTrainingStreakTitle: 'Workout still ahead',
  tlTrainingStreakBody: '{title} is planned for today — there is still time to keep your streak.',
};

export const allTranslations: Record<Lang, Translations> = { uk, en };
