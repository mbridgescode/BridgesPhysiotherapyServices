import { expect, test } from '@playwright/test';

const authRoutes = [
  { path: '/login', title: 'Sign in', screenshot: 'auth-login' },
  { path: '/forgot-password', title: 'Forgot password', screenshot: 'auth-forgot-password' },
  { path: '/reset-password', title: 'Reset password', screenshot: 'auth-reset-password' },
];

for (const route of authRoutes) {
  test(`${route.title} has stable responsive layout`, async ({ page }, testInfo) => {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { name: route.title })).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow-x', 'hidden');
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const contentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(contentWidth).toBeLessThanOrEqual(viewportWidth);
    await page.screenshot({ path: testInfo.outputPath(`${route.screenshot}.png`), fullPage: true });
  });
}

test('login password visibility control is keyboard and screen-reader friendly', async ({ page }) => {
  await page.goto('/login');
  const password = page.getByRole('textbox', { name: 'Password', exact: true });
  const toggle = page.getByRole('button', { name: 'Show password' });
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await toggle.click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Hide password' })).toBeVisible();
});
