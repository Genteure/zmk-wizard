import { expect, test } from "@playwright/test";

test.describe('SEO metadata', () => {
  test('index page has canonical URL and meta tags', async ({ page }) => {
    await page.goto('/');
    
    // Check canonical URL
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /https:\/\/placeholder\.example\.com\//);
    
    // Check meta description
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute('content', /ZMK shield configurations/);
    
    // Check Open Graph tags
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', 'Shield Wizard for ZMK');
    
    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute('content', 'website');
    
    const ogUrl = page.locator('meta[property="og:url"]');
    await expect(ogUrl).toHaveAttribute('content', /https:\/\/placeholder\.example\.com\//);
    
    // Check Twitter Card tags
    const twitterCard = page.locator('meta[name="twitter:card"]');
    await expect(twitterCard).toHaveAttribute('content', 'summary');
    
    const twitterTitle = page.locator('meta[name="twitter:title"]');
    await expect(twitterTitle).toHaveAttribute('content', 'Shield Wizard for ZMK');
    
    // Check favicon
    const favicon = page.locator('link[rel="icon"]');
    await expect(favicon).toHaveAttribute('href', '/favicon.svg');
  });
  
  test('404 page has canonical URL and robots noindex', async ({ page }) => {
    await page.goto('/404');
    
    // Check canonical URL
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /https:\/\/placeholder\.example\.com\/404/);
    
    // Check robots meta tag
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', 'noindex, nofollow');
    
    // Check meta description
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute('content', /Page not found/);
    
    // Check title
    await expect(page).toHaveTitle('404 - Page Not Found | Shield Wizard for ZMK');
  });
  
  test('next-steps page has canonical URL and Open Graph tags', async ({ page }) => {
    await page.goto('/next-steps');
    
    // Check canonical URL
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /https:\/\/placeholder\.example\.com\/next-steps/);
    
    // Check meta description
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute('content', /Instructions and tips/);
    
    // Check Open Graph tags
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute('content', 'What to do next | Shield Wizard for ZMK');
    
    const ogDescription = page.locator('meta[property="og:description"]');
    await expect(ogDescription).toHaveAttribute('content', /Instructions and tips/);
    
    // Check title
    await expect(page).toHaveTitle('What to do next | Shield Wizard for ZMK');
  });
});
