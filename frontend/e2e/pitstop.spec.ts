import { test, expect } from '@playwright/test';
import { E2E_VENDOR_PIN } from './testEnv';

/**
 * Pit Stop end-to-end suite, run on a phone and a tablet/desktop viewport.
 *
 * 1. Fan flow: menu, item options, cart, checkout with a group note, the
 *    pickup board with PIN, the public tracker (which must not expose the
 *    PIN or QR payload) and past orders.
 * 2. Pickup map: location simulation and pod list.
 * 3. Staff terminal: PIN check, locker grid, race control and the offline
 *    outbox.
 * 4. Offline app shell.
 */

test.describe('Fan ordering flow', () => {
  test('orders with kitchen options, collects a PIN, shares a tracker that hides secrets, and sees past orders', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      // Map tiles come from an external host that may be unreachable.
      if (!text.includes('favicon.ico') && !text.includes('MapLibre') && !text.includes('WebGL')) {
        consoleErrors.push(text);
      }
    });

    // 1. The menu is the home screen.
    await page.goto('/');
    await expect(page).toHaveTitle(/Pit Stop/i);
    await expect(page.getByRole('heading', { name: 'Food', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Apex burger' })).toBeVisible();
    await expect(page.locator('img[src*="images"], img[src*="%2Fimages%2F"]').first()).toBeVisible();

    // 2. An item with options opens its sheet; a plain item adds at once.
    await page.getByRole('button', { name: 'Choose options for Apex burger' }).click();
    const sheet = page.getByRole('dialog', { name: 'Apex burger' });
    await expect(sheet.getByText(/Contains gluten/i)).toBeVisible();
    await sheet.getByText('No pickles').click();
    await sheet.getByRole('button', { name: /Add to order/ }).click();
    await expect(sheet).toBeHidden();
    await page.getByRole('button', { name: 'Add Volt energy drink' }).click();

    // 3. Open the order from the header and go to checkout.
    await page.getByRole('button', { name: /Your order, 2 items/ }).click();
    const cart = page.getByRole('dialog', { name: 'Your order' });
    await expect(cart.getByText('No pickles')).toBeVisible();
    await cart.getByRole('link', { name: /Go to checkout/ }).click();
    await expect(page).toHaveURL(/\/checkout/);

    // 4. Checkout: group note and simulated payment.
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    await expect(page.getByText('Payment is simulated.')).toBeVisible();
    await page.getByRole('switch', { name: 'Group order' }).click();
    await page.getByLabel(/Seats/).fill('Clark stand, row H, seats 14 to 16');
    await page.getByRole('button', { name: /Place order/ }).click();

    // 5. The Orders screen shows the pit board with the pickup PIN.
    await expect(page).toHaveURL(/\/collect/);
    await expect(page.getByText('Pickup PIN')).toBeVisible();
    const refText = await page.getByText(/Ref GP-2026-[A-Z0-9]{6}/).first().textContent();
    const orderId = refText?.match(/GP-2026-[A-Z0-9]{6}/)?.[0];
    expect(orderId).toBeTruthy();

    // 6. The public tracker shows progress but never the PIN or QR payload.
    await page.goto(`/track/${orderId}`);
    await expect(page.getByRole('heading', { name: 'Order tracker' })).toBeVisible();
    await expect(page.getByText(/Order received|Being prepared|Ready|Collected/).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Clark stand, row H, seats 14 to 16')).toBeVisible();
    const publicHtml = await page.content();
    expect(publicHtml).not.toContain('AGPC1.');
    expect(publicHtml).not.toContain('signatureBase64');
    expect(publicHtml).not.toContain('Pickup PIN');

    // 7. Past orders come from the server.
    await page.goto('/collect');
    await page.getByRole('tab', { name: 'Past orders' }).click();
    await expect(page.getByText(new RegExp(`ref ${orderId}`))).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test('pickup map ranks pods and can simulate a trackside location', async ({ page }) => {
    await page.goto('/map');
    await expect(page.getByRole('heading', { name: 'Pickup map' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Turn 9/ }).first()).toBeVisible();

    await page.getByRole('button', { name: /Simulate being at the track/ }).click();
    await expect(page.getByText('Simulated location')).toBeVisible();
    await page.getByRole('button', { name: /Fangio stand/ }).click();
    await expect(page.getByText('Walk times from where you are now.')).toBeVisible();
  });
});

test.describe('Staff terminal', () => {
  test('vendor staff unlocks terminal, views 8-bay lockers, toggles race control, and tests airplane mode sync', async ({ page }) => {
    // 1. Navigates to /vendor
    await page.goto('/vendor');

    // 2. Unlocks with the staff PIN the test server was started with
    const pinInput = page.getByLabel('Staff PIN');
    await expect(pinInput).toBeVisible();

    // A wrong PIN is rejected by the server before the terminal opens.
    await pinInput.fill(`${E2E_VENDOR_PIN}-wrong`);
    await page.getByRole('button', { name: /Unlock terminal/i }).click();
    await expect(page.getByText(/That PIN is not right/)).toBeVisible();

    await pinInput.fill(E2E_VENDOR_PIN);
    await page.getByRole('button', { name: /Unlock terminal/i }).click();

    // 3. The order board, lockers and race control render.
    await expect(page.getByRole('region', { name: 'Order board' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lockers at pod M2' })).toBeVisible();
    await expect(page.locator('text=#01').first()).toBeVisible();
    await expect(page.locator('text=#08').first()).toBeVisible();

    // 4. Race control: set Safety Car, then back to Green Flag.
    await page.getByRole('button', { name: /Safety Car/ }).click();
    await expect(page.getByRole('button', { name: /Safety Car/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /Green Flag/ }).click();
    await expect(page.getByRole('button', { name: /Green Flag/ })).toHaveAttribute('aria-pressed', 'true');

    // 5. A fresh order placed by a fan appears, and its PIN finds it.
    const created = await page.request.post('/api/orders', {
      data: { items: [{ itemId: 'still-water', quantity: 1 }], stationId: 'M2', ticketCode: 'GP-9014-P' },
    });
    expect(created.status()).toBe(201);
    const { order } = await created.json();
    await page.getByLabel('Pickup PIN or pass code').fill(order.pinCode);
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(page.getByText('Order found')).toBeVisible();
    await expect(page.getByText(`Ref ${order.orderId}`)).toBeVisible();

    // 6. Airplane Mode: the update is saved on the terminal, then sent on reconnect.
    const airplaneSwitch = page.getByRole('switch', { name: /Airplane Mode/i });
    await airplaneSwitch.click();
    await expect(airplaneSwitch).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('complementary').getByRole('button', { name: 'Start preparing' }).click();
    await expect(page.getByText(/Pending Cloud Sync \([1-9]\d*\)/)).toBeVisible();

    await airplaneSwitch.click();
    await expect(page.getByText('Pending Cloud Sync (0)')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Pit Stop: Offline app shell', () => {
  test('fan app and vendor terminal still open with no connection after one online visit', async ({ page, context }) => {
    // 1. First visit online: the service worker installs and caches the shell
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(async () => {
      const cache = await caches.open('pitstop-cache-v3');
      return Boolean(await cache.match('/vendor'));
    });
    // Second load is served through the worker, which caches the JS and CSS
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.goto('/vendor');
    await page.waitForLoadState('networkidle');

    // 2. Connection drops
    await context.setOffline(true);

    await page.goto('/');
    await expect(page).toHaveTitle(/Pit Stop/i);
    await expect(page.getByRole('heading', { name: 'Apex burger' })).toBeVisible();

    await page.goto('/vendor');
    await expect(page.getByPlaceholder(/PIN/i).first()).toBeVisible();

    await context.setOffline(false);
  });
});
