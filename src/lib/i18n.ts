export type AppLang = 'en' | 'fr' | 'ar'

const LANG_KEY = 'koinclick_lang'

export function getSavedLang(): AppLang {
  try {
    const val = localStorage.getItem(LANG_KEY)
    if (val === 'ar' || val === 'fr') return val
    return 'en'
  } catch {
    return 'en'
  }
}

export function applyLangToDocument(lang: AppLang) {
  try {
    localStorage.setItem(LANG_KEY, lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  } catch {
    // ignore
  }
}

export const TRANSLATIONS = {
  en: {
    overview: 'Overview',
    overviewFull: 'Pulse & Overview',
    transactions: 'Transactions',
    subs: 'Subs',
    subsFull: 'Subscriptions',
    tontine: 'Tontine',
    aiBudget: 'AI Budget',
    admin: 'Admin',
    adminFull: 'Admin Control',
    resetZero: 'Reset',
    signOut: 'Sign Out',
    safeToSpendToday: 'Safe-to-Spend Today',
    daysLeft: 'days left',
    perDay: '/ day',
    addExpense: 'Add Expense',
    snapReceipt: 'Snap Receipt',
    addIncome: 'Add Income',
    voiceLog: 'Voice Log',
    oneClickPads: '1-Click Quick Pads',
    recentTransactions: 'Recent Transactions',
    viewAll: 'View All',
    categoryAnalytics: 'Category Analytics',
    importCsv: 'Import CSV',
    pdfReport: 'PDF Report',
    exportCsv: 'Export CSV',
    searchPlaceholder: 'Search transactions, categories, or notes...',
    all: 'All',
    expenses: 'Expenses',
    income: 'Income',
    loadingWorkspace: 'Loading your KoinCLICK workspace...',
    footerTagline: 'Simple Multi-Currency & AI Budget Manager',
    spendingCharts: '14-Day Spending Velocity',
    categoryMix: 'Category Share',
    tontineCircles: 'Tontine / Daret',
    debtsLoans: 'Debts & Loans',
    remindersEnabled: 'Reminders active',
    installApp: 'Install',
  },
  fr: {
    overview: 'Accueil',
    overviewFull: 'Aperçu & Budget',
    transactions: 'Transactions',
    subs: 'Abos',
    subsFull: 'Abonnements',
    tontine: 'Tontine',
    aiBudget: 'Budget IA',
    admin: 'Admin',
    adminFull: 'Contrôle Admin',
    resetZero: 'RAZ',
    signOut: 'Déconnexion',
    safeToSpendToday: 'Budget du jour',
    daysLeft: 'jours restants',
    perDay: '/ jour',
    addExpense: 'Dépense',
    snapReceipt: 'Photo Reçu',
    addIncome: 'Revenu',
    voiceLog: 'Dictée vocale',
    oneClickPads: 'Boutons 1-Clic',
    recentTransactions: 'Transactions récentes',
    viewAll: 'Tout voir',
    categoryAnalytics: 'Par catégorie',
    importCsv: 'Importer CSV',
    pdfReport: 'Rapport PDF',
    exportCsv: 'Exporter CSV',
    searchPlaceholder: 'Rechercher transactions, catégories ou notes...',
    all: 'Tout',
    expenses: 'Dépenses',
    income: 'Revenus',
    loadingWorkspace: 'Chargement de votre espace KoinCLICK...',
    footerTagline: 'Gestionnaire de budget multi-devises & IA',
    spendingCharts: 'Dépenses sur 14 jours',
    categoryMix: 'Répartition par catégorie',
    tontineCircles: 'Tontine / Daret',
    debtsLoans: 'Prêts & Dettes',
    remindersEnabled: 'Rappels actifs',
    installApp: 'Installer',
  },
  ar: {
    overview: 'الرئيسية',
    overviewFull: 'نظرة عامة',
    transactions: 'المعاملات',
    subs: 'الاشتراكات',
    subsFull: 'الاشتراكات',
    tontine: 'الدارت',
    aiBudget: 'ميزانية AI',
    admin: 'الإدارة',
    adminFull: 'لوحة الإدارة',
    resetZero: 'تصفير',
    signOut: 'خروج',
    safeToSpendToday: 'المسموح إنفاقه اليوم',
    daysLeft: 'أيام متبقية',
    perDay: '/ يوم',
    addExpense: 'إضافة مصروف',
    snapReceipt: 'تصوير فاتورة',
    addIncome: 'إضافة دخل',
    voiceLog: 'تسجيل صوتي',
    oneClickPads: 'أزرار الدفع السريع',
    recentTransactions: 'أحدث المعاملات',
    viewAll: 'عرض الكل',
    categoryAnalytics: 'تحليل الفئات',
    importCsv: 'استيراد CSV',
    pdfReport: 'تقرير PDF',
    exportCsv: 'تصدير CSV',
    searchPlaceholder: 'ابحث في المعاملات أو الفئات أو الملاحظات...',
    all: 'الكل',
    expenses: 'المصاريف',
    income: 'الدخل',
    loadingWorkspace: 'جاري تحميل مساحة KoinCLICK...',
    footerTagline: 'إدارة الميزانية والعملات بالذكاء الاصطناعي',
    spendingCharts: 'معدل الإنفاق (14 يوماً)',
    categoryMix: 'توزيع الفئات',
    tontineCircles: 'الدارت / الجمعية',
    debtsLoans: 'الديون والقروض',
    remindersEnabled: 'التذكيرات مفعلة',
    installApp: 'تثبيت',
  },
} as const

export type TranslationKey = keyof typeof TRANSLATIONS.en
