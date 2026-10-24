import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
const mockSignIn = jest.fn<(a: { email: string; password: string }) => Promise<{ error: Error | null }>>();
const mockReset = jest.fn<(email: string, opts?: unknown) => Promise<{ error: Error | null }>>();
const mockSignUp = jest.fn<(a: { email: string; password: string }) => Promise<{ error: Error | null }>>();
const mockLoadSaved = jest.fn<() => Promise<{ email: string; password: string } | null>>();
const mockSaveSaved = jest.fn<(e: string, p: string) => Promise<void>>();

// The forgot-password link is switched off in src/config/flags.ts for now; these tests cover it for when it is back on.
jest.mock('../../config/flags', () => ({ SHOW_FORGOT_PASSWORD: true }));
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockRouter.push(...a),
    replace: (...a: unknown[]) => mockRouter.replace(...a),
    back: () => mockRouter.back(),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useFocusEffect: () => undefined,
}));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (a: { email: string; password: string }) => mockSignIn(a),
      signUp: (a: { email: string; password: string }) => mockSignUp(a),
      resetPasswordForEmail: (e: string, o?: unknown) => mockReset(e, o),
    },
  },
}));
jest.mock('../../utils/rememberedCredentials', () => ({
  loadRememberedCredentials: () => mockLoadSaved(),
  saveRememberedCredentials: (e: string, p: string) => mockSaveSaved(e, p),
}));
jest.mock('../../sync/cloudSync', () => ({
  pushNutritionLog: jest.fn(),
  pushWorkoutEntry: jest.fn(),
  pushWeightEntry: jest.fn(),
  pushProfile: jest.fn(),
  pushPlan: jest.fn(),
  pullPlan: jest.fn(),
  pullProfile: jest.fn(),
  ensureCoachCode: jest.fn(),
  linkToCoach: jest.fn(),
}));

import AuthScreen from '../../../app/auth';
import OnboardingScreen from '../../../app/onboarding';
import RoleSelectScreen from '../../../app/role-select';
import { useSettingsStore } from '../../store/useSettingsStore';

function allText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(renderer.toJSON());
  return parts.join(' ');
}
const press = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => typeof x.props.onPress === 'function' && x.props.accessibilityLabel === label)[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  return n;
};
const input = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => typeof x.props.onChangeText === 'function' && x.props.accessibilityLabel === label)[0];
  if (!n) throw new Error(`no input "${label}"`);
  return n;
};

describe('Entry screens (auth, role, onboarding)', () => {
  let renderer: ReactTestRenderer | undefined;
  const render = async (el: React.ReactElement) => {
    let r!: ReactTestRenderer;
    await act(async () => {
      r = create(el);
    });
    renderer = r;
    return r;
  };
  let alert: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    Object.values(mockRouter).forEach((m) => m.mockClear());
    mockSignIn.mockReset().mockResolvedValue({ error: null });
    mockSignUp.mockReset().mockResolvedValue({ error: null });
    mockReset.mockReset().mockResolvedValue({ error: null });
    mockLoadSaved.mockReset().mockResolvedValue(null);
    mockSaveSaved.mockReset().mockResolvedValue(undefined);
    useSettingsStore.setState({ language: 'vi' });
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    alert.mockRestore();
  });

  describe('Auth', () => {
    it('signs in with the typed credentials and remembers them', async () => {
      const r = await render(<AuthScreen />);
      await act(async () => {
        input(r, 'Email').props.onChangeText('a@b.co');
        input(r, 'Mật khẩu').props.onChangeText('secret12');
      });
      await act(async () => {
        // 'Đăng nhập' is both the segment tab and the submit button: pick the button.
        r.root.findAll((x) => typeof x.props.onPress === 'function' && x.props.accessibilityLabel === 'Đăng nhập' && x.props.accessibilityRole === 'button')[0].props.onPress();
      });
      expect(mockSignIn).toHaveBeenCalledWith({ email: 'a@b.co', password: 'secret12' });
      expect(mockSaveSaved).toHaveBeenCalledWith('a@b.co', 'secret12');
      expect(alert).not.toHaveBeenCalled();
    });

    it('pre-fills the remembered credentials', async () => {
      mockLoadSaved.mockResolvedValue({ email: 'saved@x.io', password: 'pw123456' });
      const r = await render(<AuthScreen />);
      expect(input(r, 'Email').props.value).toBe('saved@x.io');
      expect(input(r, 'Mật khẩu').props.value).toBe('pw123456');
    });

    it('refuses to submit without email and password', async () => {
      const r = await render(<AuthScreen />);
      const submit = r.root.findAll((x) => typeof x.props.onPress === 'function' && x.props.accessibilityLabel === 'Đăng nhập' && x.props.accessibilityRole === 'button' && x.props.accessibilityState?.busy !== undefined)[0];
      await act(async () => {
        submit.props.onPress();
      });
      expect(mockSignIn).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalledWith('Thiếu thông tin', 'Vui lòng nhập email và mật khẩu.');
    });

    it('switches to sign-up and tells the user to check their email', async () => {
      const r = await render(<AuthScreen />);
      await act(async () => {
        r.root.findAll((x) => x.props.accessibilityRole === 'tab' && x.props.accessibilityLabel === 'Đăng ký')[0].props.onPress();
      });
      expect(allText(r)).toContain('Tạo tài khoản mới để bắt đầu.');
      await act(async () => {
        input(r, 'Email').props.onChangeText('new@user.io');
        input(r, 'Mật khẩu').props.onChangeText('longpassword');
      });
      const submit = r.root.findAll((x) => typeof x.props.onPress === 'function' && x.props.accessibilityLabel === 'Đăng ký' && x.props.accessibilityRole === 'button')[0];
      await act(async () => {
        submit.props.onPress();
      });
      expect(mockSignUp).toHaveBeenCalledWith({ email: 'new@user.io', password: 'longpassword' });
      expect(alert).toHaveBeenCalledWith('Kiểm tra email', expect.any(String));
    });

    it('shows the server error instead of failing silently, and does not remember bad credentials', async () => {
      mockSignIn.mockResolvedValue({ error: new Error('Invalid login credentials') });
      const r = await render(<AuthScreen />);
      await act(async () => {
        input(r, 'Email').props.onChangeText('a@b.co');
        input(r, 'Mật khẩu').props.onChangeText('wrong');
      });
      const submit = r.root.findAll((x) => typeof x.props.onPress === 'function' && x.props.accessibilityLabel === 'Đăng nhập' && x.props.accessibilityRole === 'button')[0];
      await act(async () => {
        submit.props.onPress();
      });
      expect(alert).toHaveBeenCalledWith('Lỗi', 'Invalid login credentials');
      expect(mockSaveSaved).not.toHaveBeenCalled();
    });
  });

  describe('Forgot password', () => {
    it('asks for an email first and does not call the server', async () => {
      const r = await render(<AuthScreen />);
      await act(async () => {
        press(r, 'Quên mật khẩu?').props.onPress();
      });
      expect(mockReset).not.toHaveBeenCalled();
      expect(allText(r)).toContain('Nhập email của bạn ở trên trước');
    });

    it('rejects a malformed email', async () => {
      const r = await render(<AuthScreen />);
      await act(async () => {
        input(r, 'Email').props.onChangeText('not-an-email');
      });
      await act(async () => {
        press(r, 'Quên mật khẩu?').props.onPress();
      });
      expect(mockReset).not.toHaveBeenCalled();
      expect(allText(r)).toContain('Email chưa đúng định dạng');
    });

    it('sends the reset email and confirms without claiming the account exists', async () => {
      const r = await render(<AuthScreen />);
      await act(async () => {
        input(r, 'Email').props.onChangeText(' me@example.com ');
      });
      await act(async () => {
        press(r, 'Quên mật khẩu?').props.onPress();
      });
      expect(mockReset).toHaveBeenCalledWith('me@example.com', undefined);
      const text = allText(r);
      expect(text).toContain('Nếu email này có tài khoản');
      expect(text).toContain('me@example.com');
      expect(alert).not.toHaveBeenCalled();
    });

    it('shows the server error inline and clears the note when the email changes', async () => {
      mockReset.mockResolvedValue({ error: new Error('Quá nhiều yêu cầu') });
      const r = await render(<AuthScreen />);
      await act(async () => {
        input(r, 'Email').props.onChangeText('me@example.com');
      });
      await act(async () => {
        press(r, 'Quên mật khẩu?').props.onPress();
      });
      expect(allText(r)).toContain('Quá nhiều yêu cầu');
      await act(async () => {
        input(r, 'Email').props.onChangeText('other@example.com');
      });
      expect(allText(r)).not.toContain('Quá nhiều yêu cầu');
    });

    it('is only offered when signing in', async () => {
      const r = await render(<AuthScreen />);
      await act(async () => {
        press(r, 'Đăng ký').props.onPress();
      });
      expect(r.root.findAll((x) => x.props.accessibilityLabel === 'Quên mật khẩu?')).toHaveLength(0);
    });
  });

  describe('Role select', () => {
    it('sends a fatty to onboarding and a coach to the clients list', async () => {
      const chooseClient = jest.fn();
      const chooseCoach = jest.fn(async () => undefined);
      useSettingsStore.setState({ chooseClientRole: chooseClient as never, chooseCoachRole: chooseCoach as never });
      const r = await render(<RoleSelectScreen />);
      await act(async () => {
        press(r, 'Tôi là Fatty (tự tập)').props.onPress();
      });
      expect(chooseClient).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith('/onboarding');
      await act(async () => {
        press(r, 'Tôi là Coach (Huấn luyện viên)').props.onPress();
      });
      expect(chooseCoach).toHaveBeenCalled();
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/clients');
    });
  });

  describe('Onboarding', () => {
    const fill = async (r: ReactTestRenderer, label: string, value: string) =>
      act(async () => {
        input(r, label).props.onChangeText(value);
      });
    const button = (r: ReactTestRenderer, label: string) =>
      r.root.findAll((x) => typeof x.props.onPress === 'function' && x.props.accessibilityLabel === label && x.props.accessibilityRole === 'button')[0];
    const tap = async (r: ReactTestRenderer, label: string) =>
      act(async () => {
        button(r, label).props.onPress();
      });
    const next = (r: ReactTestRenderer) => tap(r, 'Tiếp tục');
    const stepNow = (r: ReactTestRenderer) =>
      r.root.findAll((x) => x.props.accessibilityRole === 'progressbar')[0].props.accessibilityValue.now;

    it('walks through the four steps and back', async () => {
      const r = await render(<OnboardingScreen />);
      expect(stepNow(r)).toBe(1);
      expect(allText(r)).toContain('BƯỚC 1/4');
      await next(r);
      expect(stepNow(r)).toBe(2);
      expect(allText(r)).toContain('Cơ thể của bạn');
      await next(r);
      expect(stepNow(r)).toBe(3);
      await next(r);
      expect(stepNow(r)).toBe(4);
      expect(button(r, 'Tiếp tục')).toBeUndefined();
      expect(button(r, 'Bắt đầu')).toBeDefined();
      await tap(r, 'Quay lại');
      expect(stepNow(r)).toBe(3);
      await tap(r, 'Quay lại');
      await tap(r, 'Quay lại');
      expect(stepNow(r)).toBe(1);
      expect(button(r, 'Quay lại')).toBeUndefined();
    });

    it('blocks Next with an inline error when the goal is not below the current weight', async () => {
      const complete = jest.fn();
      useSettingsStore.setState({ completeOnboarding: complete as never });
      const r = await render(<OnboardingScreen />);
      await fill(r, 'Cân nặng hiện tại (kg)', '90');
      await fill(r, 'Cân nặng mục tiêu (kg)', '95');
      await next(r);
      expect(stepNow(r)).toBe(1);
      expect(allText(r)).toContain('Cân nặng mục tiêu phải nhỏ hơn cân nặng hiện tại.');
      expect(complete).not.toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await fill(r, 'Cân nặng mục tiêu (kg)', '85');
      await next(r);
      expect(stepNow(r)).toBe(2);
    });

    it('blocks Next when the current weight is missing or not positive', async () => {
      const r = await render(<OnboardingScreen />);
      await fill(r, 'Cân nặng hiện tại (kg)', '');
      await next(r);
      expect(stepNow(r)).toBe(1);
      expect(allText(r)).toContain('Vui lòng nhập cân nặng hiện tại hợp lệ.');
      await fill(r, 'Cân nặng hiện tại (kg)', '0');
      await next(r);
      expect(stepNow(r)).toBe(1);
    });

    it('accepts decimal commas and saves exactly what the single-screen version saved', async () => {
      const complete = jest.fn();
      useSettingsStore.setState({ completeOnboarding: complete as never });
      const r = await render(<OnboardingScreen />);
      await fill(r, 'Cân nặng hiện tại (kg)', '106,2');
      await fill(r, 'Cân nặng mục tiêu (kg)', '95');
      await next(r);
      await fill(r, 'Chiều cao (cm) - không bắt buộc', '170');
      await fill(r, 'Tuổi - không bắt buộc', '34');
      await tap(r, 'Nam');
      await act(async () => {
        r.root.findAll((x) => typeof x.props.onPress === 'function' && String(x.props.accessibilityLabel).startsWith('Vận động nhẹ'))[0]?.props.onPress();
      });
      await next(r);
      await next(r);
      const text = allText(r);
      expect(text).toContain('106,2 kg');
      expect(text).toContain('170 cm');
      expect(text).toContain('Nam');
      await tap(r, 'Bắt đầu');
      expect(complete).toHaveBeenCalledWith(106.2, 95, 170, { age: 34, gender: 'male', activityLevel: 'light' });
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    });

    it('keeps the body details optional and saves nulls when skipped', async () => {
      const complete = jest.fn();
      useSettingsStore.setState({ completeOnboarding: complete as never });
      const r = await render(<OnboardingScreen />);
      await next(r);
      await next(r);
      await next(r);
      expect(allText(r)).toContain('Chưa nhập');
      await tap(r, 'Bắt đầu');
      expect(complete).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), null, { age: null, gender: null, activityLevel: null });
    });

    it('links a coach code when one is typed, and still continues if linking fails', async () => {
      const submit = jest.fn(async () => ({ ok: false as const, message: 'Mã không đúng' }));
      useSettingsStore.setState({ completeOnboarding: jest.fn() as never, submitCoachCode: submit as never });
      const r = await render(<OnboardingScreen />);
      await next(r);
      await next(r);
      await fill(r, 'Mã Coach (nếu có) - không bắt buộc', 'ab12cd');
      await next(r);
      expect(allText(r)).toContain('AB12CD');
      await tap(r, 'Bắt đầu');
      expect(submit).toHaveBeenCalledWith('ab12cd');
      expect(alert).toHaveBeenCalledWith('Không liên kết được với Coach', expect.stringContaining('Mã không đúng'));
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    });
  });
});
