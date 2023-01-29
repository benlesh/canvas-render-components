import { test, expect } from '@playwright/test';

test('basic properties', async ({ page }) => {
	await page.goto('/?path=/story/tests-rect--basic-properties');

	// Expect a title "to contain" a substring.
	await expect(page).toHaveTitle(/Tests \/ rect/);

	await expect(page).toHaveScreenshot();
});

// test('get started link', async ({ page }) => {
//   await page.goto('https://playwright.dev/');

//   // Click the get started link.
//   await page.getByRole('link', { name: 'Get started' }).click();

//   // Expects the URL to contain intro.
//   await expect(page).toHaveURL(/.*intro/);
// });
