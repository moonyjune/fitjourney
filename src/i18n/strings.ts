// Lightweight in-house i18n: a flat key -> string dictionary per language.
// Coverage: app chrome (tab bar, intro), auth, role-select, onboarding, and the mode/language
// switch controls. Screen bodies (Today/Nutrition/Workout/etc.) remain Vietnamese-only for now —
// see README for the follow-up plan to extend coverage.

export type Language = 'vi' | 'en';

export const STRINGS = {
  vi: {
    'app.name': 'Theo Dõi Giảm Cân',
    'app.tagline': 'Đồng hành cùng bạn trên hành trình khỏe mạnh hơn',

    'tab.today': 'Hôm nay',
    'tab.weight': 'Cân nặng',
    'tab.nutrition': 'Dinh dưỡng',
    'tab.workout': 'Tập luyện',
    'tab.history': 'Lịch sử',
    'tab.plan': 'Kế hoạch',
    'tab.clients': 'Học viên',
    'tab.account': 'Tài khoản',

    'common.save': 'Lưu',
    'common.cancel': 'Hủy',
    'common.confirm': 'Xác nhận',
    'common.delete': 'Xóa',
    'common.send': 'Gửi',
    'common.new': '+ Mới',
    'common.signOut': 'Đăng xuất',
    'common.loading': 'Đang tải...',

    'auth.title': 'Theo Dõi Giảm Cân',
    'auth.subtitleSignIn': 'Đăng nhập để đồng bộ dữ liệu của bạn.',
    'auth.subtitleSignUp': 'Tạo tài khoản mới để bắt đầu.',
    'auth.email': 'Email',
    'auth.password': 'Mật khẩu',
    'auth.signIn': 'Đăng nhập',
    'auth.signUp': 'Đăng ký',
    'auth.switchToSignUp': 'Chưa có tài khoản? Đăng ký',
    'auth.switchToSignIn': 'Đã có tài khoản? Đăng nhập',

    'role.title': 'Bạn là ai?',
    'role.subtitle': 'Chọn vai trò để mình thiết lập đúng trải nghiệm cho bạn.',
    'role.clientTitle': 'Tôi tự tập (Client)',
    'role.clientDescription': 'Theo dõi cân nặng, dinh dưỡng, tập luyện theo kế hoạch. Có thể liên kết với Coach sau.',
    'role.coachTitle': 'Tôi là Coach (Huấn luyện viên)',
    'role.coachDescription': 'Quản lý nhiều học viên, chỉnh thực đơn/lịch tập cho từng người bằng trợ lý AI.',

    'onboarding.title': 'Chào mừng!',
    'onboarding.subtitle': 'Nhập thông tin ban đầu để bắt đầu theo dõi hành trình giảm cân theo kế hoạch IF 16:8.',
    'onboarding.startWeight': 'Cân nặng hiện tại (kg)',
    'onboarding.goalWeight': 'Cân nặng mục tiêu (kg)',
    'onboarding.height': 'Chiều cao (cm) - không bắt buộc',
    'onboarding.coachCode': 'Mã Coach (nếu có) - không bắt buộc',
    'onboarding.start': 'Bắt đầu',

    'mode.title': 'Chế độ',
    'mode.language': 'Ngôn ngữ',
  },
  en: {
    'app.name': 'Weight Loss Tracker',
    'app.tagline': 'Your companion on the path to a healthier you',

    'tab.today': 'Today',
    'tab.weight': 'Weight',
    'tab.nutrition': 'Nutrition',
    'tab.workout': 'Workout',
    'tab.history': 'History',
    'tab.plan': 'Plan',
    'tab.clients': 'Clients',
    'tab.account': 'Account',

    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.delete': 'Delete',
    'common.send': 'Send',
    'common.new': '+ New',
    'common.signOut': 'Sign out',
    'common.loading': 'Loading...',

    'auth.title': 'Weight Loss Tracker',
    'auth.subtitleSignIn': 'Sign in to sync your data.',
    'auth.subtitleSignUp': 'Create a new account to get started.',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.signIn': 'Sign in',
    'auth.signUp': 'Sign up',
    'auth.switchToSignUp': "Don't have an account? Sign up",
    'auth.switchToSignIn': 'Already have an account? Sign in',

    'role.title': 'Who are you?',
    'role.subtitle': "Pick a mode so we can set up the right experience for you.",
    'role.clientTitle': 'I train myself (Client)',
    'role.clientDescription': 'Track your weight, nutrition, and workouts against the plan. You can link to a Coach later.',
    'role.coachTitle': 'I am a Coach',
    'role.coachDescription': 'Manage multiple clients and edit their menus/workout schedules with an AI assistant.',

    'onboarding.title': 'Welcome!',
    'onboarding.subtitle': 'Enter your starting info to begin tracking your weight-loss journey on the IF 16:8 plan.',
    'onboarding.startWeight': 'Current weight (kg)',
    'onboarding.goalWeight': 'Goal weight (kg)',
    'onboarding.height': 'Height (cm) - optional',
    'onboarding.coachCode': 'Coach code (if any) - optional',
    'onboarding.start': 'Get started',

    'mode.title': 'Mode',
    'mode.language': 'Language',
  },
} as const satisfies Record<Language, Record<string, string>>;

export type StringKey = keyof (typeof STRINGS)['vi'];
