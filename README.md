# Theo Dõi Giảm Cân

Ứng dụng cá nhân theo dõi tiến trình giảm cân theo kế hoạch IF 16:8 (xem `Input/KeHoachGiamCan.docx`
và `Input/BuyingList.docx`). Viết bằng **React Native + Expo Router**, chạy được trên **iOS, Android
và Web** từ cùng một codebase.

## Tính năng (MVP)

- **Hôm nay**: trạng thái nhịn ăn/ăn theo IF 16:8, tổng quan cân nặng, calo/protein/nước, buổi tập.
- **Cân nặng**: ghi nhận cân nặng, biểu đồ tiến trình, lịch sử.
- **Dinh dưỡng**: thực đơn theo ngày tập/ngày nghỉ, tick món đã ăn, thêm món ngoài kế hoạch, theo dõi nước.
- **Tập luyện**: bài tập cardio gợi ý (bơi, đi bộ dốc), ghi buổi tập tùy chỉnh.
- **Kế hoạch**: chỉnh mục tiêu cá nhân, tham khảo thực đơn tuần, bảng tùy biến món ăn, danh sách đi chợ.

Dữ liệu được lưu **local trên máy** (AsyncStorage) — không cần backend hay đăng nhập.

## Yêu cầu

- Node.js 22+ (đã cài qua Homebrew: `brew install node`)
- Xcode (để chạy iOS Simulator / build iOS) — chỉ cần trên macOS
- Android Studio (để chạy Android Emulator / build Android)

## Chạy thử

```bash
npm install
npm run web       # Chạy trên trình duyệt
npm run ios       # Chạy trên iOS Simulator
npm run android   # Chạy trên Android Emulator
```

Hoặc `npm start` rồi quét mã QR bằng app **Expo Go** trên điện thoại thật.

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

## Cấu trúc thư mục

```
app/                  Màn hình (Expo Router - file-based routing)
  (tabs)/             5 tab chính
  onboarding.tsx       Màn hình nhập cân nặng ban đầu
src/
  constants/plan.ts    Dữ liệu kế hoạch (thực đơn, bài tập, danh sách đi chợ)
  store/               Zustand store (cân nặng, dinh dưỡng, tập luyện, cài đặt) + persist AsyncStorage
  components/          Component dùng chung (Card, ProgressBar)
  utils/               Hàm tiện ích (ngày tháng, trạng thái IF)
  types/               Định nghĩa TypeScript
```
