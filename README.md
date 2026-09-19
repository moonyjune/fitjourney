# Theo Dõi Giảm Cân

Ứng dụng cá nhân theo dõi tiến trình giảm cân theo kế hoạch IF 16:8 (xem `Input/KeHoachGiamCan.docx`
và `Input/BuyingList.docx`). Viết bằng **React Native + Expo Router**, chạy được trên **iOS, Android
và Web** từ cùng một codebase. Backend dùng **Supabase** (auth + database + storage ảnh).

## Tính năng

- **Hôm nay**: trạng thái nhịn ăn/ăn theo IF 16:8, tổng quan cân nặng, mốc tiến trình gần nhất,
  calo/protein/nước, buổi tập.
- **Cân nặng**: ghi nhận cân nặng, biểu đồ tiến trình, lịch sử.
- **Dinh dưỡng**: thực đơn theo ngày tập/ngày nghỉ, tick món đã ăn kèm ảnh minh chứng + ghi chú,
  thêm món ngoài kế hoạch, theo dõi nước.
- **Tập luyện**: bài tập cardio gợi ý (bơi, đi bộ dốc), ghi buổi tập tùy chỉnh kèm ảnh minh chứng.
- **Lịch sử**: mốc tiến trình 1/3/6 tháng, tổng kết theo tuần, nhật ký từng ngày.
- **Kế hoạch**: bật/tắt nhắc nhở, chỉnh mục tiêu cá nhân, tham khảo thực đơn tuần, bảng tùy biến
  món ăn, danh sách đi chợ, đăng xuất.
- **Nhắc nhở**: thông báo local (giờ ăn, giờ tập, uống nước) qua `expo-notifications`.
- **Đăng nhập**: email/mật khẩu qua Supabase Auth. Dữ liệu lưu local (AsyncStorage, hoạt động offline)
  và đồng bộ nền lên Supabase khi có mạng.

> Giai đoạn 2 (chưa làm): vai trò Coach/Client, đồng bộ 2 chiều đầy đủ, dashboard, gamification,
> vòng review của Coach — xem `Input/UpdateFeature_01.md`.

## Yêu cầu

- Node.js 22+ (đã cài qua Homebrew: `brew install node`)
- Xcode (để chạy iOS Simulator / build iOS) — chỉ cần trên macOS
- Android Studio (để chạy Android Emulator / build Android)
- Một project [Supabase](https://supabase.com) miễn phí

## Thiết lập Supabase

1. Tạo project tại [supabase.com](https://supabase.com) (New Project).
2. Vào **SQL Editor** > New query, dán toàn bộ nội dung file `supabase/schema.sql` > Run.
   File này tạo bảng `profiles`, `weight_entries`, `nutrition_logs`, `workout_entries`,
   `proof_photos`, bucket Storage `proofs`, và các RLS policy để mỗi user chỉ thấy dữ liệu của mình.
3. Vào **Project Settings > API**, copy `Project URL` và key `anon` `public`.
4. Copy `.env.example` thành `.env` và điền 2 giá trị trên:
   ```
   EXPO_PUBLIC_SUPABASE_URL=...
   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
   ```
5. Mặc định Supabase yêu cầu xác nhận email khi đăng ký. Với app cá nhân/thử nghiệm, có thể tắt ở
   **Authentication > Providers > Email > Confirm email** để đăng ký xong là đăng nhập được ngay.

`.env` không được commit lên git (đã thêm vào `.gitignore`).

## Chạy thử

```bash
npm install
npm run web       # Chạy trên trình duyệt
npm run ios       # Chạy trên iOS Simulator
npm run android   # Chạy trên Android Emulator
```

Hoặc `npm start` rồi quét mã QR bằng app **Expo Go** trên điện thoại thật.

Lần đầu mở app: đăng ký tài khoản (email/mật khẩu) → nhập cân nặng hiện tại/mục tiêu → vào app.

## Build & Publish lên App Store / Play Store / Web

Dự án dùng [EAS Build](https://docs.expo.dev/build/introduction/) để build và publish:

```bash
npm install -g eas-cli
eas login
eas build:configure

# Build cho từng nền tảng
eas build --platform ios
eas build --platform android

# Nộp lên App Store / Play Store
eas submit --platform ios
eas submit --platform android

# Deploy bản web (ví dụ lên EAS Hosting)
npx expo export --platform web
eas deploy
```

Trước khi build cho iOS/Android thật, cần:

1. Có tài khoản Apple Developer (để publish iOS) và tài khoản Google Play Console (để publish Android).
2. Cập nhật `bundleIdentifier` (iOS) và `package` (Android) trong `app.json` cho đúng domain của bạn.
3. Chuẩn bị icon/splash chính thức trong thư mục `assets/`.
4. Cấu hình biến môi trường `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` trong
   EAS (Project Settings > Environment variables) để bản build production kết nối đúng backend.

## Cấu trúc thư mục

```
app/                  Màn hình (Expo Router - file-based routing)
  (tabs)/             6 tab chính (Hôm nay, Cân nặng, Dinh dưỡng, Tập luyện, Lịch sử, Kế hoạch)
  auth.tsx             Đăng nhập / đăng ký
  onboarding.tsx        Nhập cân nặng ban đầu (chỉ hiện sau khi đăng nhập)
src/
  constants/plan.ts    Dữ liệu kế hoạch (thực đơn, bài tập, danh sách đi chợ, mốc tiến trình)
  lib/supabase.ts       Supabase client
  sync/cloudSync.ts     Đẩy dữ liệu local lên Supabase + kéo profile về khi đăng nhập máy mới
  notifications/        Lên lịch nhắc nhở local (expo-notifications)
  store/                Zustand store (cân nặng, dinh dưỡng, tập luyện, ảnh minh chứng, cài đặt,
                         auth) + persist AsyncStorage
  components/           Component dùng chung (Card, ProgressBar, ProofCapture)
  utils/                Hàm tiện ích (ngày tháng, trạng thái IF, mốc tiến trình, tuần)
  types/                Định nghĩa TypeScript
supabase/schema.sql     SQL để chạy trong Supabase SQL Editor (bảng + RLS + storage bucket)
```
