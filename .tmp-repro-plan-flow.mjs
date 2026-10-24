import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 1400 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') console.log('console.error:', msg.text()); });
function tab(name) { return page.getByRole('tab', { name: new RegExp(name) }); }
async function dismiss() { await page.evaluate(() => document.getElementById('error-toast')?.remove()); }

const email = `repro-plan-flow-${Date.now()}@example.com`;
await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1500);
await page.getByText(/Chưa có tài khoản/i).click();
await page.waitForTimeout(300);
await page.getByPlaceholder('Email').fill(email);
await page.getByPlaceholder('Mật khẩu').fill('Test123456!');
await page.getByText(/Đăng ký$/).click();
await page.waitForTimeout(2500);
await page.getByText('Tôi là Fatty (tự tập)', { exact: true }).click();
await page.waitForTimeout(800);

// Onboard with ONLY weight/goal (no demographics at signup) - matches a plausible real user path.
await page.getByPlaceholder('110').fill('110');
await page.getByPlaceholder('95').fill('95');
await page.getByText('Bắt đầu', { exact: true }).click({ force: true });
await page.waitForTimeout(2500);
await dismiss();

// Now go to Plan and fill demographics there, exactly like a returning user would.
await tab('Kế hoạch').click({ force: true });
await page.waitForTimeout(1000);
await dismiss();

await page.getByPlaceholder('170').first().fill('170');
await page.getByPlaceholder('30', { exact: true }).fill('34');
await page.getByText('Nam', { exact: true }).click({ force: true });
await dismiss();
await page.getByText(/Vận động nhẹ/).first().click({ force: true });
await dismiss();

console.log('--- BEFORE clicking Lưu thông tin cá nhân ---');
console.log('TDEE 2306 visible (bug repro):', (await page.getByText('2306 kcal').count()) > 0);
console.log('BMR line visible:', (await page.getByText(/BMR: \d+ kcal/).count()) > 0);
console.log('Incomplete hint visible:', (await page.getByText(/Điền đủ tuổi/).count()) > 0);
await page.screenshot({ path: '/tmp/repro-plan-before-save.png' });

await page.getByText('Lưu thông tin cá nhân', { exact: true }).click({ force: true });
await page.waitForTimeout(800);
await dismiss();

console.log('--- AFTER clicking Lưu thông tin cá nhân ---');
console.log('TDEE 2306 visible (bug repro):', (await page.getByText('2306 kcal').count()) > 0);
console.log('TDEE 2747 visible (expected correct):', (await page.getByText('2747 kcal').count()) > 0);
console.log('BMR line visible:', (await page.getByText(/BMR: \d+ kcal/).count()) > 0);
console.log('Incomplete hint visible:', (await page.getByText(/Điền đủ tuổi/).count()) > 0);
await page.screenshot({ path: '/tmp/repro-plan-after-save.png' });

console.log('page errors:', errors.length === 0 ? '(none)' : errors);
await browser.close();
