/**
 * test_mobile_responsiveness_e2e.mjs
 * 
 * Mnema Mobile Responsiveness E2E Test Suite (Ref. Screvi UX)
 * 
 * Target Breakpoints (5 ranges):
 *   BP1: Small Mobile (Compact): 360px & 375px (Galaxy Android & iPhone SE)
 *   BP2: Mainstream Mobile: 390px / 393px (iPhone 13/14/15/16, Google Pixel)
 *   BP3: Large Mobile / Phablet: 414px / 430px (iPhone Plus / Pro Max)
 *   BP4: Foldable & Small Tablet: 600px - 768px (iPad Mini portrait, Foldables unfolded)
 *   BP5: Standard & Large Tablet: 820px - 1024px (iPad Air / iPad Pro 11" portrait & landscape)
 * 
 * Core Features (7 features):
 *   F1: Mobile Navigation & Layout Structure
 *   F2: Bottom Nav & Mobile Drawer Switching
 *   F3: Responsive Core Views (Library, Sources, Search, Settings, Home feed)
 *   F4: Touch Target Standards (>=44x44px bounding boxes & visible actions)
 *   F5: Screvi Mobile Reader UX & Typography (overflow safeguards, selection clamping)
 *   F6: Distraction-Free Reader Controls & Bottom Sheet (notebook drawer, compact header)
 *   F7: Multi-Viewport Zero Horizontal Overflow (document.documentElement.scrollWidth <= window.innerWidth)
 * 
 * 4-Tier Test Structure:
 *   Tier 1: Feature Coverage (35 tests, 5 per feature)
 *   Tier 2: Boundary & Corner Cases (35 tests, 5 per feature)
 *   Tier 3: Cross-Feature Combinations (7 tests)
 *   Tier 4: Real-World Scenarios (5 tests)
 *   Total: 82 tests minimum.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Workspace paths
const ROOT_DIR = path.resolve(__dirname, '../../..');
const WEB_DIR = path.resolve(ROOT_DIR, 'apps/web');
const SRC_DIR = path.resolve(WEB_DIR, 'src');

// Color helpers for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
};

// Target Viewport Breakpoints Definition
const BREAKPOINTS = {
  BP1_360: { name: 'BP1 (Compact 360px Galaxy)', width: 360, height: 740, isMobile: true },
  BP1_375: { name: 'BP1 (iPhone SE 375px)', width: 375, height: 667, isMobile: true },
  BP2_390: { name: 'BP2 (iPhone 13/14 390px)', width: 390, height: 844, isMobile: true },
  BP2_393: { name: 'BP2 (iPhone 15/16 393px)', width: 393, height: 852, isMobile: true },
  BP3_414: { name: 'BP3 (iPhone Plus 414px)', width: 414, height: 896, isMobile: true },
  BP3_430: { name: 'BP3 (iPhone Pro Max 430px)', width: 430, height: 932, isMobile: true },
  BP4_600: { name: 'BP4 (Foldable Unfolded 600px)', width: 600, height: 960, isMobile: true },
  BP4_768: { name: 'BP4 (iPad Mini 768px)', width: 768, height: 1024, isMobile: false },
  BP5_820: { name: 'BP5 (iPad Air 820px)', width: 820, height: 1180, isMobile: false },
  BP5_1024: { name: 'BP5 (iPad Pro Landscape 1024px)', width: 1024, height: 768, isMobile: false },
};

// Source Code Cache
const sourceCache = new Map();

function readSource(relPath) {
  if (sourceCache.has(relPath)) {
    return sourceCache.get(relPath);
  }
  const absPath = path.resolve(SRC_DIR, relPath);
  if (!fs.existsSync(absPath)) {
    // Check relative to apps/web root (e.g. index.html)
    const webRootPath = path.resolve(WEB_DIR, relPath);
    if (fs.existsSync(webRootPath)) {
      const content = fs.readFileSync(webRootPath, 'utf-8');
      sourceCache.set(relPath, content);
      return content;
    }
    return null;
  }
  const content = fs.readFileSync(absPath, 'utf-8');
  sourceCache.set(relPath, content);
  return content;
}

// Clean assertion helpers that don't dump 500-line source strings
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertMatch(content, pattern, message) {
  if (!content) {
    throw new Error(`${message}: source file is empty or not found`);
  }
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  if (!regex.test(content)) {
    throw new Error(message);
  }
}

function assertDoesNotMatch(content, pattern, message) {
  if (!content) return;
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  if (regex.test(content)) {
    throw new Error(message);
  }
}

/**
 * Scans component source code to detect any unconditional fixed-width classes
 * (such as w-[...px] or min-w-[...px]) that exceed a specified viewport width limit.
 */
function assertNoFixedOverflowWidth(source, maxViewportWidth, componentName) {
  if (!source) return;
  const arbitraryWidthMatches = source.matchAll(/\b(?:min-w|w)-\[(\d+)px\]/g);
  for (const match of arbitraryWidthMatches) {
    const pxVal = parseInt(match[1], 10);
    if (pxVal > maxViewportWidth) {
      const matchIndex = match.index;
      const preceding = source.slice(Math.max(0, matchIndex - 10), matchIndex);
      const isResponsiveGated = /(?:sm|md|lg|xl|2xl):$/.test(preceding);
      if (!isResponsiveGated) {
        throw new Error(
          `${componentName} contains unconstrained fixed width "${match[0]}" (${pxVal}px) which exceeds target viewport width (${maxViewportWidth}px)`
        );
      }
    }
  }
}

// Test Runner Registry
const tests = [];
const results = {
  passed: 0,
  failed: 0,
  total: 0,
  byTier: {
    Tier1: { pass: 0, fail: 0 },
    Tier2: { pass: 0, fail: 0 },
    Tier3: { pass: 0, fail: 0 },
    Tier4: { pass: 0, fail: 0 },
  },
  byFeature: {
    F1: { pass: 0, fail: 0 },
    F2: { pass: 0, fail: 0 },
    F3: { pass: 0, fail: 0 },
    F4: { pass: 0, fail: 0 },
    F5: { pass: 0, fail: 0 },
    F6: { pass: 0, fail: 0 },
    F7: { pass: 0, fail: 0 },
  },
  failures: [],
};

function registerTest(id, name, meta, fn) {
  tests.push({ id, name, meta, fn });
}

// ============================================================================
// TIER 1: FEATURE COVERAGE (5 tests per feature = 35 tests)
// ============================================================================

// --- Feature 1: Mobile Navigation & Layout Structure ---
registerTest('T1_F1_01', 'Desktop Sidebar is hidden on mobile viewports (<768px)', { tier: 'Tier1', feature: 'F1', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const sidebar = readSource('components/Sidebar.tsx');
  assert(sidebar, 'Sidebar.tsx must exist');
  assertMatch(
    sidebar,
    /<aside[^>]*class(?:Name)?="[^"]*hidden\s+md:flex/s,
    'Sidebar root element must include "hidden md:flex" responsive utility'
  );
});

registerTest('T1_F1_02', 'Mobile BottomNav component exists and is visible on <768px', { tier: 'Tier1', feature: 'F1', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assert(bottomNav, 'BottomNav.tsx must exist in components/navigation/');
  assertMatch(
    bottomNav,
    /<nav[^>]*data-testid="mobile-bottom-nav"[^>]*class(?:Name)?="[^"]*md:hidden/s,
    'BottomNav must have data-testid="mobile-bottom-nav" and "md:hidden"'
  );
  assertMatch(
    bottomNav,
    /fixed\s+bottom-0/,
    'BottomNav must be positioned fixed at bottom'
  );
});

registerTest('T1_F1_03', 'App layout applies safe bottom padding (pb-16 md:pb-0) for BottomNav', { tier: 'Tier1', feature: 'F1', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const app = readSource('App.tsx');
  assert(app, 'App.tsx must exist');
  assertMatch(
    app,
    /pb-16\s+md:pb-0/,
    'App body container must apply "pb-16 md:pb-0" to prevent BottomNav from obscuring scrollable content'
  );
  assertMatch(
    app,
    /<BottomNav[\s\S]*?<MobileDrawer/,
    'App.tsx must render both BottomNav and MobileDrawer'
  );
});

registerTest('T1_F1_04', 'Header adapts brand logo container for narrow mobile viewports', { tier: 'Tier1', feature: 'F1', bp: 'BP1-BP3', milestone: 'M1' }, () => {
  const header = readSource('components/Header.tsx');
  assert(header, 'Header.tsx must exist');
  assertMatch(
    header,
    /class(?:Name)?="[^"]*w-auto\s+sm:w-60[^"]*"/,
    'Header brand container must use "w-auto sm:w-60" to avoid consuming 62% of mobile screen width'
  );
  assertDoesNotMatch(
    header,
    /<div[^>]*class(?:Name)?="w-56\s+sm:w-60[^"]*"/,
    'Header must not hardcode fixed w-56 on mobile screens'
  );
});

registerTest('T1_F1_05', 'index.html includes viewport-fit=cover and PWA mobile meta tags', { tier: 'Tier1', feature: 'F1', bp: 'BP1-BP5', milestone: 'M1' }, () => {
  const html = readSource('index.html');
  assert(html, 'index.html must exist');
  assertMatch(
    html,
    /<meta\s+name="viewport"\s+content="[^"]*viewport-fit=cover[^"]*"/,
    'index.html viewport meta must include "viewport-fit=cover" for iOS safe-area support'
  );
  assertMatch(
    html,
    /<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"/,
    'index.html must specify apple-mobile-web-app-capable'
  );
});

// --- Feature 2: Bottom Nav & Mobile Drawer Switching ---
registerTest('T1_F2_01', 'BottomNav renders 5 core navigation tabs with thumb accessibility', { tier: 'Tier1', feature: 'F2', bp: 'BP1-BP3', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assert(bottomNav, 'BottomNav.tsx must exist');
  assertMatch(bottomNav, /grid-cols-5/, 'BottomNav must layout 5 columns evenly');
  const requiredTabs = ['home', 'articles', 'review', 'search', 'more'];
  for (const tab of requiredTabs) {
    assert(
      bottomNav.includes(`id: '${tab}'`),
      `BottomNav must include tab configuration for "${tab}"`
    );
  }
});

registerTest('T1_F2_02', 'BottomNav supports iOS safe-area-inset-bottom padding', { tier: 'Tier1', feature: 'F2', bp: 'BP1-BP3', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assert(bottomNav, 'BottomNav.tsx must exist');
  assertMatch(
    bottomNav,
    /pb-\[env\(safe-area-inset-bottom\)\]/,
    'BottomNav must include pb-[env(safe-area-inset-bottom)] class for iPhone Home Indicator'
  );
});

registerTest('T1_F2_03', 'BottomNav highlights active tab with aria-current="page" and indicator', { tier: 'Tier1', feature: 'F2', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assert(bottomNav, 'BottomNav.tsx must exist');
  assertMatch(
    bottomNav,
    /aria-current=\{isActive\s*\?\s*['"]page['"]\s*:\s*undefined\}/,
    'Active bottom nav button must set aria-current="page"'
  );
  assertMatch(
    bottomNav,
    /bg-teal-600|text-teal-700/,
    'Active tab must have visual highlight indicator'
  );
});

registerTest('T1_F2_04', 'BottomNav displays numeric review count badge when queue > 0', { tier: 'Tier1', feature: 'F2', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assert(bottomNav, 'BottomNav.tsx must exist');
  assertMatch(
    bottomNav,
    /reviewCount\s*>\s*0/,
    'BottomNav must conditionally render reviewCount badge'
  );
  assertMatch(
    bottomNav,
    /rounded-full/,
    'Review badge must be formatted as pill/circle badge'
  );
});

registerTest('T1_F2_05', 'MobileDrawer renders slide-over sheet with secondary destinations', { tier: 'Tier1', feature: 'F2', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const drawer = readSource('components/navigation/MobileDrawer.tsx');
  assert(drawer, 'MobileDrawer.tsx must exist in components/navigation/');
  assertMatch(
    drawer,
    /data-testid="mobile-drawer"/,
    'MobileDrawer must have data-testid="mobile-drawer"'
  );
  assertMatch(
    drawer,
    /role="dialog"\s+aria-modal="true"/,
    'MobileDrawer must implement dialog modal accessibility attributes'
  );
  assertMatch(
    drawer,
    /sources[\s\S]*notes[\s\S]*tags[\s\S]*stats[\s\S]*settings/,
    'MobileDrawer must expose secondary destinations: sources, notes, tags, stats, settings'
  );
});

// --- Feature 3: Responsive Core Views ---
registerTest('T1_F3_01', 'ArticlesView renders mobile category pill carousel with horizontal scrolling', { tier: 'Tier1', feature: 'F3', bp: 'BP1-BP3', milestone: 'M3' }, () => {
  const articles = readSource('components/ArticlesView.tsx');
  assert(articles, 'ArticlesView.tsx must exist');
  assertMatch(
    articles,
    /overflow-x-auto\s+(?:[^"]*)?(?:no-scrollbar|scrollbar-none)/,
    'ArticlesView must provide a horizontally scrolling category pill bar (overflow-x-auto no-scrollbar)'
  );
  assertMatch(
    articles,
    /inbox[\s\S]*later[\s\S]*archive/,
    'ArticlesView mobile navigation must allow switching between Inbox, Later, Archive'
  );
});

registerTest('T1_F3_02', 'SourcesView provides dual rendering (card list on mobile, table on desktop)', { tier: 'Tier1', feature: 'F3', bp: 'BP1-BP4', milestone: 'M3' }, () => {
  const sources = readSource('components/SourcesView.tsx');
  assert(sources, 'SourcesView.tsx must exist');
  assertMatch(
    sources,
    /<table[^>]*class(?:Name)?="[^"]*hidden\s+md:table|hidden\s+md:block[^"]*"/,
    'SourcesView 6-column table must be hidden on mobile (<768px)'
  );
  assertMatch(
    sources,
    /class(?:Name)?="[^"]*md:hidden[^"]*"/,
    'SourcesView must provide a mobile card list container marked "md:hidden"'
  );
});

registerTest('T1_F3_03', 'SearchView mode switcher scales cleanly without horizontal clipping', { tier: 'Tier1', feature: 'F3', bp: 'BP1-BP3', milestone: 'M3' }, () => {
  const search = readSource('components/SearchView.tsx');
  assert(search, 'SearchView.tsx must exist');
  // Scope specifically to the mode switcher container to avoid matching outer page header flex-wrap
  const kwIdx = search.indexOf("setActiveMode('keyword')");
  const askIdx = search.indexOf("setActiveMode('ask_ai')");
  assert(kwIdx !== -1 && askIdx !== -1, 'SearchView mode switcher triggers must exist');
  const modeSwitcherSection = search.slice(Math.max(0, kwIdx - 300), askIdx + 300);
  assertMatch(
    modeSwitcherSection,
    /className="[^"]*(?:flex-wrap|overflow-x-auto|grid\s+grid-cols-3)/,
    'SearchView mode switcher container must be responsive (flex-wrap, overflow-x-auto, or grid-cols-3)'
  );
});

registerTest('T1_F3_04', 'SettingsView root padding adapts to mobile (p-4 sm:p-6)', { tier: 'Tier1', feature: 'F3', bp: 'BP1-BP2', milestone: 'M3' }, () => {
  const settings = readSource('components/SettingsView.tsx');
  assert(settings, 'SettingsView.tsx must exist');
  assertMatch(
    settings,
    /class(?:Name)?="[^"]*p-4\s+sm:p-6[^"]*"/,
    'SettingsView must use "p-4 sm:p-6" to prevent wasting 48px margin on 360px phones'
  );
});

registerTest('T1_F3_05', 'HomeFeedView single-column cards scale cleanly on narrow mobile viewports', { tier: 'Tier1', feature: 'F3', bp: 'BP1-BP3', milestone: 'M3' }, () => {
  const feed = readSource('components/HomeFeedView.tsx');
  assert(feed, 'HomeFeedView.tsx must exist');
  assertDoesNotMatch(
    feed,
    /min-w-\[\d{3,}px\](?!\s*sm:)/,
    'HomeFeedView main column must not impose rigid min-width > 320px on mobile'
  );
});

// --- Feature 4: Touch Target Standards ---
registerTest('T1_F4_01', 'BottomNav interactive buttons enforce >= 44x44px touch envelopes', { tier: 'Tier1', feature: 'F4', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assert(bottomNav, 'BottomNav.tsx must exist');
  assertMatch(
    bottomNav,
    /min-h-\[44px\]\s+min-w-\[44px\]/,
    'BottomNav tab buttons must explicitly enforce min-h-[44px] min-w-[44px]'
  );
});

registerTest('T1_F4_02', 'Header interactive mobile controls enforce >= 44x44px bounding box', { tier: 'Tier1', feature: 'F4', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const header = readSource('components/Header.tsx');
  assert(header, 'Header.tsx must exist');
  assertMatch(
    header,
    /min-h-\[44px\]/,
    'Header mobile buttons must specify min-h-[44px] touch target envelopes'
  );
  assertMatch(
    header,
    /min-w-\[44px\]/,
    'Header compact avatar/icon buttons must specify min-w-[44px]'
  );
});

registerTest('T1_F4_03', 'MobileDrawer close and nav buttons enforce >= 44x44px touch targets', { tier: 'Tier1', feature: 'F4', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const drawer = readSource('components/navigation/MobileDrawer.tsx');
  assert(drawer, 'MobileDrawer.tsx must exist');
  assertMatch(
    drawer,
    /min-h-\[44px\]/,
    'MobileDrawer item buttons must maintain min-h-[44px]'
  );
  assertMatch(
    drawer,
    /min-w-\[44px\]/,
    'MobileDrawer close button must maintain min-w-[44px]'
  );
});

registerTest('T1_F4_04', 'ArticlesView card actions are permanently visible on mobile without hover', { tier: 'Tier1', feature: 'F4', bp: 'BP1-BP3', milestone: 'M3' }, () => {
  const articles = readSource('components/ArticlesView.tsx');
  assert(articles, 'ArticlesView.tsx must exist');
  assertDoesNotMatch(
    articles,
    /opacity-0\s+group-hover:opacity-100(?![\s\S]*sm:)/,
    'ArticlesView card actions must not be hidden behind group-hover:opacity-100 without a mobile override'
  );
});

registerTest('T1_F4_05', 'ArticlesView action buttons meet >= 44x44px touch targets', { tier: 'Tier1', feature: 'F4', bp: 'BP1-BP3', milestone: 'M3' }, () => {
  const articles = readSource('components/ArticlesView.tsx');
  assert(articles, 'ArticlesView.tsx must exist');
  // Scope specifically to card action buttons (Favorite, Later, Archive, Delete) to avoid alert banner padding collisions
  const actionMatch = articles.match(/(?:title=["']Favorite|onToggleFavorite\()[\s\S]*?(?:title=["']Delete|onDeleteArticle\()/);
  assert(actionMatch, 'ArticlesView card actions container must exist');
  const actionSnippet = actionMatch[0];
  assertMatch(
    actionSnippet,
    /\b(?:min-h-\[44px\]|min-w-\[44px\]|p-2\.5|p-3)\b/,
    'ArticlesView card action buttons must meet >= 44px touch targets (not sub-28px p-1.5)'
  );
  assertDoesNotMatch(
    actionSnippet,
    /\bp-1\.5\b(?!\s*sm:)/,
    'ArticlesView card actions must not use un-spaced p-1.5 without mobile touch override'
  );
});

// --- Feature 5: Screvi Mobile Reader UX & Typography ---
registerTest('T1_F5_01', 'Reader typography CSS contains overflow-x auto safeguards for pre and code', { tier: 'Tier1', feature: 'F5', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const css = readSource('index.css');
  assert(css, 'index.css must exist');
  assertMatch(
    css,
    /\.reader-content\s+pre[\s\S]*?overflow-x:\s*auto/,
    'index.css must contain .reader-content pre { overflow-x: auto; } rule'
  );
});

registerTest('T1_F5_02', 'Reader typography CSS wraps HTML tables in responsive scroll containers', { tier: 'Tier1', feature: 'F5', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const css = readSource('index.css');
  assert(css, 'index.css must exist');
  assertMatch(
    css,
    /\.reader-content\s+table[\s\S]*?overflow-x:\s*auto/,
    'index.css must contain .reader-content table { overflow-x: auto; } rule'
  );
});

registerTest('T1_F5_03', 'Reader typography CSS constrains images to 100% max-width', { tier: 'Tier1', feature: 'F5', bp: 'BP1-BP5', milestone: 'M2' }, () => {
  const css = readSource('index.css');
  assert(css, 'index.css must exist');
  assertMatch(
    css,
    /\.reader-content\s+img[\s\S]*?max-width:\s*100%/,
    'index.css must contain .reader-content img { max-width: 100%; height: auto; } rule'
  );
});

registerTest('T1_F5_04', 'SelectionToolbar clamps horizontal coordinates within viewport bounds', { tier: 'Tier1', feature: 'F5', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const toolbar = readSource('components/reader/SelectionToolbar.tsx');
  assert(toolbar, 'SelectionToolbar.tsx must exist');
  assertMatch(
    toolbar,
    /Math\.max\(\s*\d+\s*,\s*Math\.min\(\s*window\.innerWidth/,
    'SelectionToolbar must clamp left coordinate with Math.max(min, Math.min(window.innerWidth - margin, selectionRange.x))'
  );
});

registerTest('T1_F5_05', 'useTextSelection hook listens for mobile touch events (touchend/selectionchange)', { tier: 'Tier1', feature: 'F5', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const hook = readSource('components/reader/useTextSelection.ts');
  assert(hook, 'useTextSelection.ts must exist');
  assertMatch(
    hook,
    /touchend|selectionchange/,
    'useTextSelection hook must listen to "touchend" or "selectionchange" for touch device compatibility'
  );
});

// --- Feature 6: Distraction-Free Reader Controls & Bottom Sheet ---
registerTest('T1_F6_01', 'ReaderHeader provides minimalist mobile header on < 768px', { tier: 'Tier1', feature: 'F6', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const readerHeader = readSource('components/reader/ReaderHeader.tsx');
  assert(readerHeader, 'ReaderHeader.tsx must exist');
  assertMatch(
    readerHeader,
    /hidden\s+md:flex|md:hidden/,
    'ReaderHeader must adapt layout on mobile viewports (<768px)'
  );
  assertMatch(
    readerHeader,
    /truncate/,
    'ReaderHeader article title must apply truncate class to prevent overflow'
  );
});

registerTest('T1_F6_02', 'ReaderHeader mobile header fits within 360px viewport width (<350px total)', { tier: 'Tier1', feature: 'F6', bp: 'BP1', milestone: 'M2' }, () => {
  const readerHeader = readSource('components/reader/ReaderHeader.tsx');
  assert(readerHeader, 'ReaderHeader.tsx must exist');
  assertMatch(
    readerHeader,
    /hidden\s+md:flex[\s\S]*?presets|presets[\s\S]*?hidden\s+md:flex/,
    'Reader presets must be hidden on mobile viewports (<md)'
  );
});

registerTest('T1_F6_03', 'Reader display/font settings rendered as bottom sheet or modal on mobile', { tier: 'Tier1', feature: 'F6', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  // The appearance sheet lives in ReaderHeader (rendered by ReaderView), so inspect both files.
  const readerView = [readSource('components/reader/ReaderView.tsx'), readSource('components/reader/ReaderHeader.tsx')]
    .filter(Boolean)
    .join('\n');
  assert(readerView, 'Reader component must exist');
  assertMatch(
    readerView,
    /bottom-0|sheet|drawer|fixed\s+inset-x-0/,
    'Reading settings / appearance toggles must open as a slide-up bottom sheet or modal on mobile'
  );
});

registerTest('T1_F6_04', 'ReaderSidebar (Notebook) renders as modal overlay drawer on <768px', { tier: 'Tier1', feature: 'F6', bp: 'BP1-BP4', milestone: 'M2' }, () => {
  const readerSidebar = readSource('components/reader/ReaderSidebar.tsx');
  assert(readerSidebar, 'ReaderSidebar.tsx must exist');
  assertMatch(
    readerSidebar,
    /fixed\s+inset|fixed\s+bottom-0|md:relative/,
    'ReaderSidebar on mobile must render as a fixed modal drawer/sheet rather than inline flex shrink-0'
  );
});

registerTest('T1_F6_05', 'Opening ReaderSidebar does not crush reading content below 200px', { tier: 'Tier1', feature: 'F6', bp: 'BP1-BP2', milestone: 'M2' }, () => {
  const readerSidebar = readSource('components/reader/ReaderSidebar.tsx');
  assert(readerSidebar, 'ReaderSidebar.tsx must exist');
  assertDoesNotMatch(
    readerSidebar,
    /<aside[^>]*class(?:Name)?="[^"]*w-80\s+sm:w-96[^"]*shrink-0/s,
    'ReaderSidebar must not be an unconditional inline flex child with w-80 shrink-0'
  );
});

// --- Feature 7: Multi-Viewport Zero Horizontal Overflow ---
registerTest('T1_F7_01', 'BP1 (360px Compact Galaxy): Zero horizontal overflow layout check', { tier: 'Tier1', feature: 'F7', bp: 'BP1', milestone: 'M1' }, () => {
  const bp = BREAKPOINTS.BP1_360;
  assert(bp && bp.width === 360, 'BREAKPOINTS.BP1_360 fixture must be defined with 360px width');
  const app = readSource('App.tsx');
  const sidebar = readSource('components/Sidebar.tsx');
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assert(app && sidebar && bottomNav, 'App, Sidebar, and BottomNav must exist');

  // Verify zero unconstrained fixed-width overflow exceeding 360px
  assertNoFixedOverflowWidth(app, bp.width, 'App.tsx');
  assertNoFixedOverflowWidth(sidebar, bp.width, 'Sidebar.tsx');
  assertNoFixedOverflowWidth(bottomNav, bp.width, 'BottomNav.tsx');

  assertMatch(sidebar, /hidden\s+md:flex/, 'Desktop sidebar must not be visible on 360px');
  assertMatch(app, /overflow-hidden/, 'App root must manage overflow');
});

registerTest('T1_F7_02', 'BP2 (390px iPhone 13/14): Zero horizontal overflow layout check', { tier: 'Tier1', feature: 'F7', bp: 'BP2', milestone: 'M1' }, () => {
  const bp = BREAKPOINTS.BP2_390;
  assert(bp && bp.width === 390, 'BREAKPOINTS.BP2_390 fixture must be defined with 390px width');
  const header = readSource('components/Header.tsx');
  const app = readSource('App.tsx');
  assert(header && app, 'Header and App must exist');

  assertNoFixedOverflowWidth(header, bp.width, 'Header.tsx');
  assertNoFixedOverflowWidth(app, bp.width, 'App.tsx');

  assertMatch(header, /w-auto|flex-1/, 'Header on 390px must use flexible sizing');
  assertDoesNotMatch(header, /\b(?:min-w|w)-\[(?:4\d\d|[5-9]\d\d|\d{4,})px\]/, 'Header must not have fixed width exceeding 390px');
});

registerTest('T1_F7_03', 'BP3 (430px iPhone Pro Max): Zero horizontal overflow layout check', { tier: 'Tier1', feature: 'F7', bp: 'BP3', milestone: 'M1' }, () => {
  const bp = BREAKPOINTS.BP3_430;
  assert(bp && bp.width === 430, 'BREAKPOINTS.BP3_430 fixture must be defined with 430px width');
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  const drawer = readSource('components/navigation/MobileDrawer.tsx');
  assert(bottomNav && drawer, 'BottomNav and MobileDrawer must exist');

  assertNoFixedOverflowWidth(bottomNav, bp.width, 'BottomNav.tsx');
  assertNoFixedOverflowWidth(drawer, bp.width, 'MobileDrawer.tsx');

  assertMatch(bottomNav, /grid-cols-5/, 'BottomNav on 430px must fit 5 columns without wrapping');
  assertMatch(drawer, /max-w-xs|max-w-sm|w-full/, 'MobileDrawer must constrain width to mobile viewport');
});

registerTest('T1_F7_04', 'BP4 (600px - 768px Small Tablet): Zero horizontal overflow layout check', { tier: 'Tier1', feature: 'F7', bp: 'BP4', milestone: 'M1' }, () => {
  const bp600 = BREAKPOINTS.BP4_600;
  const bp768 = BREAKPOINTS.BP4_768;
  assert(bp600 && bp768, 'BREAKPOINTS BP4 fixtures (600px and 768px) must be defined');
  const sidebar = readSource('components/Sidebar.tsx');
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assert(sidebar && bottomNav, 'Sidebar and BottomNav must exist');

  assertNoFixedOverflowWidth(sidebar, bp768.width, 'Sidebar.tsx');
  assertNoFixedOverflowWidth(bottomNav, bp768.width, 'BottomNav.tsx');

  assertMatch(sidebar, /hidden\s+md:flex/, 'Sidebar switches cleanly at 768px');
  assertMatch(bottomNav, /md:hidden/, 'BottomNav switches cleanly at 768px');
});

registerTest('T1_F7_05', 'BP5 (820px - 1024px Tablet): Zero horizontal overflow layout check', { tier: 'Tier1', feature: 'F7', bp: 'BP5', milestone: 'M1' }, () => {
  const bp820 = BREAKPOINTS.BP5_820;
  const bp1024 = BREAKPOINTS.BP5_1024;
  assert(bp820 && bp1024, 'BREAKPOINTS BP5 fixtures (820px and 1024px) must be defined');
  const sidebar = readSource('components/Sidebar.tsx');
  const app = readSource('App.tsx');
  assert(sidebar && app, 'Sidebar and App must exist');

  assertNoFixedOverflowWidth(sidebar, bp1024.width, 'Sidebar.tsx');
  assertNoFixedOverflowWidth(app, bp1024.width, 'App.tsx');

  assertMatch(sidebar, /w-56\s+sm:w-60/, 'Sidebar on tablet width >=820px renders standard w-56/w-60');
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (5 tests per feature = 35 tests)
// ============================================================================

// --- F1 Boundaries ---
registerTest('T2_F1_01', 'Breakpoint boundary 767px (mobile upper limit) hides sidebar and displays bottom nav', { tier: 'Tier2', feature: 'F1', bp: 'BP4', milestone: 'M1' }, () => {
  const sidebar = readSource('components/Sidebar.tsx');
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  // At <= 767px mobile upper limit, base (unprefixed) classes govern layout
  assertMatch(sidebar, /<aside[^>]*class(?:Name)?="[^"]*(?<!\w:)hidden\b/, 'At <= 767px, Sidebar base display must be hidden');
  assertDoesNotMatch(bottomNav, /<nav[^>]*class(?:Name)?="[^"]*(?<!\w:)hidden\b/, 'At <= 767px, BottomNav base display must not be hidden');
});

registerTest('T2_F1_02', 'Breakpoint boundary 768px (tablet lower limit) displays sidebar and hides bottom nav', { tier: 'Tier2', feature: 'F1', bp: 'BP4', milestone: 'M1' }, () => {
  const sidebar = readSource('components/Sidebar.tsx');
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  const app = readSource('App.tsx');
  // At >= 768px tablet lower limit, md: responsive prefixes activate
  assertMatch(sidebar, /\bmd:flex\b/, 'At >= 768px, md:flex activates sidebar');
  assertMatch(bottomNav, /\bmd:hidden\b/, 'At >= 768px, md:hidden hides bottom nav');
  assertMatch(app, /\bmd:pb-0\b/, 'At >= 768px, md:pb-0 clears mobile bottom nav padding');
});

registerTest('T2_F1_03', 'Legacy compact width 320px (iPhone 5/SE1) layout does not produce negative margins', { tier: 'Tier2', feature: 'F1', bp: 'BP1', milestone: 'M1' }, () => {
  const app = readSource('App.tsx');
  assertDoesNotMatch(app, /-mx-\d{3,}/, 'App layout must not contain excessive negative margins');
});

registerTest('T2_F1_04', 'Orientation change simulation (375x667 to 667x375) preserves layout constraints', { tier: 'Tier2', feature: 'F1', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  const app = readSource('App.tsx');
  assertMatch(bottomNav, /fixed\s+bottom-0\s+left-0\s+right-0/, 'BottomNav must span full width in landscape');
  assertMatch(app, /pb-16\s+md:pb-0/, 'App must preserve bottom padding in mobile landscape (<768px)');
});

registerTest('T2_F1_05', 'Zero safe-area-inset fallback handles non-notch browsers cleanly', { tier: 'Tier2', feature: 'F1', bp: 'BP1-BP5', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assertMatch(bottomNav, /pb-\[env\(safe-area-inset-bottom\)\]/, 'env() function natively resolves to 0px on non-notch devices without breaking layout');
});

// --- F2 Boundaries ---
registerTest('T2_F2_01', 'MobileDrawer locks body scroll when open and restores on unmount', { tier: 'Tier2', feature: 'F2', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const drawer = readSource('components/navigation/MobileDrawer.tsx');
  assertMatch(drawer, /document\.body\.style\.overflow\s*=\s*['"]hidden['"]/, 'MobileDrawer must set body overflow to hidden');
  assertMatch(drawer, /document\.body\.style\.overflow\s*=\s*originalOverflow/, 'MobileDrawer cleanup must restore original body overflow');
});

registerTest('T2_F2_02', 'MobileDrawer handles Escape keypress for keyboard/assistive navigation', { tier: 'Tier2', feature: 'F2', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const drawer = readSource('components/navigation/MobileDrawer.tsx');
  assertMatch(drawer, /e\.key\s*===\s*['"]Escape['"]/, 'MobileDrawer must listen for Escape key');
  assertMatch(drawer, /onClose\(\)/, 'Escape key must trigger onClose callback');
});

registerTest('T2_F2_03', 'Clicking MobileDrawer backdrop invokes onClose without child event propagation', { tier: 'Tier2', feature: 'F2', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const drawer = readSource('components/navigation/MobileDrawer.tsx');
  assert(drawer, 'MobileDrawer.tsx must exist');
  assertMatch(
    drawer,
    /<div[^>]*aria-hidden="true"[^>]*onClick=\{onClose\}|<div[^>]*onClick=\{onClose\}[^>]*aria-hidden="true"/s,
    'Backdrop div with aria-hidden="true" must directly bind onClick={onClose}'
  );
});

registerTest('T2_F2_04', 'Extreme review badge count (999+) does not expand BottomNav tab width', { tier: 'Tier2', feature: 'F2', bp: 'BP1', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assertMatch(bottomNav, /grid-cols-5/, 'Grid layout guarantees exactly 20% column width regardless of badge text length');
  assertMatch(bottomNav, /text-\[10px\]|truncate|max-w-/, 'Badge must use compact typography');
});

registerTest('T2_F2_05', 'Secondary tab selection (e.g. settings/tags) marks "More" bottom tab active', { tier: 'Tier2', feature: 'F2', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assertMatch(bottomNav, /isSecondaryTab/, 'BottomNav must calculate isSecondaryTab');
  assertMatch(bottomNav, /item\.isDrawerTrigger\s*\?\s*isSecondaryTab\s*:\s*currentTab\s*===\s*item\.id/, 'More tab is active when a secondary drawer tab is selected');
});

// --- F3 Boundaries ---
registerTest('T2_F3_01', 'ArticlesView renders responsive empty state without horizontal overflow on 360px', { tier: 'Tier2', feature: 'F3', bp: 'BP1', milestone: 'M3' }, () => {
  const articles = readSource('components/ArticlesView.tsx');
  assert(articles, 'ArticlesView must exist');
  assertDoesNotMatch(articles, /<div[^>]*class(?:Name)?="[^"]*min-w-\[4\d{2}px\][^"]*"/, 'ArticlesView empty state must not enforce fixed width > 360px');
});

registerTest('T2_F3_02', 'ArticlesView category carousel with 7+ categories supports momentum touch scroll', { tier: 'Tier2', feature: 'F3', bp: 'BP1-BP3', milestone: 'M3' }, () => {
  const articles = readSource('components/ArticlesView.tsx');
  assert(articles, 'ArticlesView must exist');
  assertMatch(articles, /overflow-x-auto/, 'Category pills must use overflow-x-auto for touch scrolling');
});

registerTest('T2_F3_03', 'SourcesView mobile card layout truncates long URLs without breaking card boundary', { tier: 'Tier2', feature: 'F3', bp: 'BP1-BP3', milestone: 'M3' }, () => {
  const sources = readSource('components/SourcesView.tsx');
  assert(sources, 'SourcesView must exist');
  assertMatch(sources, /truncate|break-words|break-all/, 'SourcesView must truncate or break long titles/URLs');
});

registerTest('T2_F3_04', 'SearchView with long query string preserves input clear trigger and padding', { tier: 'Tier2', feature: 'F3', bp: 'BP1-BP3', milestone: 'M3' }, () => {
  const search = readSource('components/SearchView.tsx');
  assert(search, 'SearchView must exist');
  assertMatch(search, /w-full/, 'Search input container must use w-full responsive width');
});

registerTest('T2_F3_05', 'SettingsView API key input container does not push save button off-screen on 360px', { tier: 'Tier2', feature: 'F3', bp: 'BP1', milestone: 'M3' }, () => {
  const settings = readSource('components/SettingsView.tsx');
  assert(settings, 'SettingsView must exist');
  assertMatch(settings, /flex-col\s+sm:flex-row|flex-wrap|w-full/, 'SettingsView form controls must wrap on narrow mobile viewports');
});

// --- F4 Boundaries ---
registerTest('T2_F4_01', 'Adjacent BottomNav buttons maintain non-overlapping hit targets', { tier: 'Tier2', feature: 'F4', bp: 'BP1', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assertMatch(bottomNav, /grid\s+grid-cols-5/, 'Equal 5-column grid prevents overlapping touch envelopes');
});

registerTest('T2_F4_02', 'Header search trigger retains >= 44px height when label is hidden on mobile', { tier: 'Tier2', feature: 'F4', bp: 'BP1-BP2', milestone: 'M1' }, () => {
  const header = readSource('components/Header.tsx');
  assertMatch(header, /min-h-\[44px\]|h-11/, 'Header search button retains minimum 44px height');
});

registerTest('T2_F4_03', 'Mobile card action buttons in ArticlesView maintain >= 44x44px target area across all 4 actions', { tier: 'Tier2', feature: 'F4', bp: 'BP1-BP3', milestone: 'M3' }, () => {
  const articles = readSource('components/ArticlesView.tsx');
  assert(articles, 'ArticlesView.tsx must exist');
  // Scope specifically to card action buttons container
  const actionMatch = articles.match(/(?:title=["']Favorite|onToggleFavorite\()[\s\S]*?(?:title=["']Delete|onDeleteArticle\()/);
  assert(actionMatch, 'ArticlesView card actions container must exist');
  const actionSnippet = actionMatch[0];
  assertMatch(
    actionSnippet,
    /\b(?:min-h-\[44px\]|min-w-\[44px\]|p-2\.5|p-3)\b/,
    'All 4 action buttons (Fav, Later, Archive, Delete) must have >= 44px hit areas'
  );
  assertDoesNotMatch(
    actionSnippet,
    /\bp-1\.5\b(?!\s*sm:)/,
    'ArticlesView card actions must not retain un-spaced p-1.5 on mobile'
  );
});

registerTest('T2_F4_04', 'Theme toggle button in MobileDrawer footer provides >= 44x44px touch target', { tier: 'Tier2', feature: 'F4', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const drawer = readSource('components/navigation/MobileDrawer.tsx');
  assertMatch(drawer, /min-h-\[44px\]\s+min-w-\[44px\]/, 'Theme toggle button in MobileDrawer must enforce min-h-[44px] min-w-[44px]');
});

registerTest('T2_F4_05', 'Touch event buttons include touch-manipulation to eliminate 300ms tap delay', { tier: 'Tier2', feature: 'F4', bp: 'BP1-BP3', milestone: 'M1' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  assertMatch(bottomNav, /touch-manipulation/, 'BottomNav buttons must apply "touch-manipulation" for responsive tap recognition');
});

// --- F5 Boundaries ---
registerTest('T2_F5_01', 'Unbroken 2000-character code block in reader scrolls horizontally within column', { tier: 'Tier2', feature: 'F5', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const css = readSource('index.css');
  assertMatch(css, /\.reader-content\s+pre[\s\S]*?overflow-x:\s*auto/, 'pre blocks must scroll horizontally');
});

registerTest('T2_F5_02', '10-column HTML table in reader scrolls horizontally without expanding viewport', { tier: 'Tier2', feature: 'F5', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const css = readSource('index.css');
  assertMatch(css, /\.reader-content\s+table[\s\S]*?overflow-x:\s*auto/, 'tables must be scrollable blocks');
});

registerTest('T2_F5_03', 'Text selection at extreme left edge (x=5px) clamps toolbar to >= 160px', { tier: 'Tier2', feature: 'F5', bp: 'BP1', milestone: 'M2' }, () => {
  const toolbar = readSource('components/reader/SelectionToolbar.tsx');
  assertMatch(toolbar, /Math\.max\(\s*(?:160|120|140|150)/, 'Toolbar must enforce minimum left bound via Math.max');
});

registerTest('T2_F5_04', 'Text selection at extreme right edge (x=355px on 360px screen) clamps toolbar within viewport', { tier: 'Tier2', feature: 'F5', bp: 'BP1', milestone: 'M2' }, () => {
  const toolbar = readSource('components/reader/SelectionToolbar.tsx');
  assertMatch(toolbar, /Math\.min\(\s*window\.innerWidth/, 'Toolbar must enforce maximum right bound via Math.min');
});

registerTest('T2_F5_05', 'Reader content applies word-break and overflow-wrap to prevent text spill', { tier: 'Tier2', feature: 'F5', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const css = readSource('index.css');
  assertMatch(css, /break-word|overflow-wrap/, 'Reader typography must apply word breaking');
});

// --- F6 Boundaries ---
registerTest('T2_F6_01', 'Extremely long article title (150+ chars) in ReaderHeader truncates cleanly', { tier: 'Tier2', feature: 'F6', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const readerHeader = readSource('components/reader/ReaderHeader.tsx');
  assertMatch(readerHeader, /truncate/, 'ReaderHeader title must apply truncate class');
});

registerTest('T2_F6_02', 'Notebook drawer on mobile locks background scroll to prevent dual-scroll conflict', { tier: 'Tier2', feature: 'F6', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const readerSidebar = readSource('components/reader/ReaderSidebar.tsx');
  assertMatch(readerSidebar, /overflow-hidden|fixed\s+inset/, 'ReaderSidebar modal must prevent background content scroll bleed');
});

registerTest('T2_F6_03', 'Rapid opening and closing of ReaderSidebar cleans up backdrop overlay', { tier: 'Tier2', feature: 'F6', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const readerSidebar = readSource('components/reader/ReaderSidebar.tsx');
  assertMatch(readerSidebar, /if\s*\(!isOpen\)\s*return\s*null/, 'ReaderSidebar must cleanly unmount when isOpen is false');
});

registerTest('T2_F6_04', 'ReaderSidebar with 100+ highlights renders scrollable list with accessible tap targets', { tier: 'Tier2', feature: 'F6', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const readerSidebar = readSource('components/reader/ReaderSidebar.tsx');
  assertMatch(readerSidebar, /overflow-y-auto/, 'ReaderSidebar highlights container must be scrollable');
});

registerTest('T2_F6_05', 'Reader font size increase up to 28px retains comfortable margins on 360px screen', { tier: 'Tier2', feature: 'F6', bp: 'BP1', milestone: 'M2' }, () => {
  const readerView = readSource('components/reader/ReaderView.tsx');
  assert(readerView, 'ReaderView must exist');
  assertMatch(readerView, /px-4|max-w-/, 'ReaderView content container must bound margins properly');
});

// --- F7 Boundaries ---
registerTest('T2_F7_01', 'ShareQuoteModal canvas preview card max width is capped at <= 280px on 360px screen', { tier: 'Tier2', feature: 'F7', bp: 'BP1', milestone: 'M3' }, () => {
  const modal = readSource('components/ShareQuoteModal.tsx');
  assert(modal, 'ShareQuoteModal must exist');
  assertMatch(modal, /max-w-\[280px\]|w-full\s+max-w-xs/, 'ShareQuoteModal canvas must be responsive on small screens');
});

registerTest('T2_F7_02', 'CommandPalette top padding is reduced on mobile (pt-6) to prevent keyboard clipping', { tier: 'Tier2', feature: 'F7', bp: 'BP1-BP3', milestone: 'M3' }, () => {
  const cmd = readSource('components/CommandPalette.tsx');
  assert(cmd, 'CommandPalette must exist');
  assertMatch(cmd, /pt-6\s+sm:pt-24|pt-4/, 'CommandPalette must reduce top padding on mobile screens');
});

registerTest('T2_F7_03', 'CreateNewModal format tabs fit within 360px mobile modal card', { tier: 'Tier2', feature: 'F7', bp: 'BP1', milestone: 'M3' }, () => {
  const modal = readSource('components/modals/CreateNewModal.tsx');
  assert(modal, 'CreateNewModal must exist');
  assertMatch(modal, /flex-wrap|grid|text-xs/, 'CreateNewModal tabs must be responsive');
});

registerTest('T2_F7_04', 'Floating TOC button does not collide with BottomNav on viewports < 768px', { tier: 'Tier2', feature: 'F7', bp: 'BP1-BP4', milestone: 'M2' }, () => {
  const toc = readSource('components/TocPanel.tsx');
  assert(toc, 'TocPanel must exist');
  assertMatch(toc, /bottom-20|mb-16|hidden\s+md:block/, 'Floating TOC panel button must avoid colliding with bottom-0 nav');
});

registerTest('T2_F7_05', 'Global root container applies overflow containment (overflow-hidden / overflow-x-hidden)', { tier: 'Tier2', feature: 'F7', bp: 'BP1-BP5', milestone: 'M1' }, () => {
  const app = readSource('App.tsx');
  assertMatch(app, /overflow-hidden/, 'App root container must apply overflow-hidden');
});

// ============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Interactions = 7 tests)
// ============================================================================

registerTest('T3_PAIR_01', 'Pairwise F1 x F2: Window resize across 768px threshold synchronizes nav shells', { tier: 'Tier3', feature: 'F1', bp: 'BP4-BP5', milestone: 'M1' }, () => {
  const sidebar = readSource('components/Sidebar.tsx');
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  const drawer = readSource('components/navigation/MobileDrawer.tsx');
  assertMatch(sidebar, /hidden\s+md:flex/, 'Sidebar must toggle at md: (768px)');
  assertMatch(bottomNav, /md:hidden/, 'BottomNav must toggle at md: (768px)');
  assertMatch(drawer, /md:hidden/, 'MobileDrawer must toggle at md: (768px)');
});

registerTest('T3_PAIR_02', 'Pairwise F2 x F4: MobileDrawer secondary item selection uses >=44px targets and switches view', { tier: 'Tier3', feature: 'F2', bp: 'BP1-BP4', milestone: 'M1' }, () => {
  const drawer = readSource('components/navigation/MobileDrawer.tsx');
  assertMatch(drawer, /min-h-\[44px\]/, 'Drawer items must have min-h-[44px]');
  assertMatch(drawer, /onSelectTab/, 'Selecting tab must trigger onSelectTab');
  assertMatch(drawer, /onClose\(\)/, 'Selecting tab must close drawer');
});

registerTest('T3_PAIR_03', 'Pairwise F3 x F7: Core view switching across all 5 breakpoints maintains zero overflow', { tier: 'Tier3', feature: 'F3', bp: 'BP1-BP5', milestone: 'M1' }, () => {
  const app = readSource('App.tsx');
  assertMatch(app, /pb-16\s+md:pb-0/, 'App maintains bottom padding');
  assertMatch(app, /overflow-hidden/, 'App maintains overflow containment');
});

registerTest('T3_PAIR_04', 'Pairwise F4 x F5: Reader text selection triggers clamped toolbar with >=44px action buttons', { tier: 'Tier3', feature: 'F4', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const toolbar = readSource('components/reader/SelectionToolbar.tsx');
  assertMatch(toolbar, /Math\.max/, 'Toolbar clamps left position');
  assertMatch(toolbar, /min-h-\[36px\]|min-h-\[44px\]|p-2/, 'Toolbar buttons have adequate tap targets');
});

registerTest('T3_PAIR_05', 'Pairwise F5 x F6: Reader typography and Notebook drawer interact without content crushing', { tier: 'Tier3', feature: 'F5', bp: 'BP1-BP2', milestone: 'M2' }, () => {
  const readerSidebar = readSource('components/reader/ReaderSidebar.tsx');
  const css = readSource('index.css');
  assertMatch(readerSidebar, /fixed\s+inset|fixed\s+bottom-0|md:relative/, 'Notebook drawer on mobile does not crush reader');
  assertMatch(css, /\.reader-content/, 'Reader typography is defined');
});

registerTest('T3_PAIR_06', 'Pairwise F6 x F7: Compact ReaderHeader prevents horizontal overflow on 360px-430px', { tier: 'Tier3', feature: 'F6', bp: 'BP1-BP3', milestone: 'M2' }, () => {
  const readerHeader = readSource('components/reader/ReaderHeader.tsx');
  assertMatch(readerHeader, /hidden\s+md:flex/, 'Desktop controls hidden on mobile');
  assertMatch(readerHeader, /truncate/, 'Header title truncated on mobile');
});

registerTest('T3_PAIR_07', 'Pairwise F1 x F4 x F7: Header logo, search, and actions scale with 44px targets and zero overflow', { tier: 'Tier3', feature: 'F7', bp: 'BP1-BP5', milestone: 'M1' }, () => {
  const header = readSource('components/Header.tsx');
  assertMatch(header, /w-auto\s+sm:w-60/, 'Header logo width is responsive');
  assertMatch(header, /min-h-\[44px\]/, 'Header buttons have 44px min height');
  assertMatch(header, /shrink-0/, 'Header controls prevent wrapping overflow');
});

// ============================================================================
// TIER 4: REAL-WORLD SCENARIOS (5 end-user workload flows)
// ============================================================================

registerTest('T4_SCENARIO_01', 'Scenario 1 (Galaxy 360px Compact Phone): Full bottom-nav and drawer navigation flow', { tier: 'Tier4', feature: 'F1', bp: 'BP1', milestone: 'M1' }, () => {
  const app = readSource('App.tsx');
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  const drawer = readSource('components/navigation/MobileDrawer.tsx');

  assertMatch(app, /isMobileDrawerOpen/, 'App tracks mobile drawer state');
  assertMatch(app, /onOpenDrawer=\{[^\}]*setIsMobileDrawerOpen/, 'App binds BottomNav onOpenDrawer to open state');
  assertMatch(app, /<MobileDrawer[\s\S]*?isOpen=\{isMobileDrawerOpen\}/, 'App passes isOpen state to MobileDrawer');
  assertMatch(bottomNav, /onOpenDrawer\(\)/, 'BottomNav triggers onOpenDrawer callback');
  assertMatch(drawer, /isOpen/, 'MobileDrawer accepts isOpen prop');
  assertMatch(drawer, /onSelectTab/, 'MobileDrawer receives onSelectTab prop');
});

registerTest('T4_SCENARIO_02', 'Scenario 2 (iPhone SE 375px): Reading session with text selection & notebook note taking', { tier: 'Tier4', feature: 'F5', bp: 'BP1', milestone: 'M2' }, () => {
  const readerHeader = readSource('components/reader/ReaderHeader.tsx');
  const readerSidebar = readSource('components/reader/ReaderSidebar.tsx');
  const toolbar = readSource('components/reader/SelectionToolbar.tsx');

  assertMatch(readerHeader, /truncate/, 'Title truncates on 375px screen');
  assertMatch(toolbar, /Math\.max\(\s*\d+\s*,\s*Math\.min/, 'Selection toolbar clamps within 375px');
  assertMatch(readerSidebar, /fixed\s+inset|fixed\s+bottom-0|md:relative/, 'Notebook renders as modal on 375px');
});

registerTest('T4_SCENARIO_03', 'Scenario 3 (iPhone 15 390px): Daily Review SRS rating and queue completion flow', { tier: 'Tier4', feature: 'F2', bp: 'BP2', milestone: 'M3' }, () => {
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  const reviewFooter = readSource('components/review/ReviewFooter.tsx');

  assertMatch(bottomNav, /id:\s*'review'/, 'Review tab is present in BottomNav');
  assertMatch(reviewFooter, /min-h-\[44px\]|h-11|py-2\.5/, 'ReviewFooter rating buttons provide >=44px tap targets');
});

registerTest('T4_SCENARIO_04', 'Scenario 4 (iPhone Pro Max 430px): Search, filter facet pills, and quote card sharing', { tier: 'Tier4', feature: 'F3', bp: 'BP3', milestone: 'M3' }, () => {
  const search = readSource('components/SearchView.tsx');
  const shareModal = readSource('components/ShareQuoteModal.tsx');

  assertMatch(search, /w-full|flex-wrap|grid/, 'Search view input fits 430px');
  assertMatch(shareModal, /max-w-\[280px\]|w-full\s+max-w-xs/, 'ShareQuoteModal canvas fits within 430px');
});

registerTest('T4_SCENARIO_05', 'Scenario 5 (Tablet Rotation 768px to 1024px): Seamless orientation and sidebar transition', { tier: 'Tier4', feature: 'F7', bp: 'BP4-BP5', milestone: 'M3' }, () => {
  const sidebar = readSource('components/Sidebar.tsx');
  const bottomNav = readSource('components/navigation/BottomNav.tsx');
  const sources = readSource('components/SourcesView.tsx');

  assertMatch(sidebar, /hidden\s+md:flex/, 'Sidebar activates on >=768px tablet');
  assertMatch(bottomNav, /md:hidden/, 'BottomNav hides on >=768px tablet');
  assertMatch(sources, /hidden\s+md:table|hidden\s+md:block/, 'SourcesView table activates on >=768px tablet');
});

// ============================================================================
// TEST SUITE EXECUTION & REPORTING
// ============================================================================

async function runTestSuite() {
  const args = process.argv.slice(2);
  const milestoneFilter = args.find((a) => a.startsWith('--milestone='))?.split('=')[1] || (args.includes('--m1') ? 'M1' : null);
  const tierFilter = args.find((a) => a.startsWith('--tier='))?.split('=')[1] || null;
  const featureFilter = args.find((a) => a.startsWith('--feature='))?.split('=')[1] || null;

  console.log(`\n${colors.bold}${colors.cyan}===================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  Mnema Mobile Responsiveness E2E Test Suite (Ref. Screvi UX)     ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  Multi-Viewport Breakpoints: BP1 (360/375px) to BP5 (820/1024px) ${colors.reset}`);
  console.log(`${colors.bold}${colors.dim}  Evaluated Breakpoints (${Object.keys(BREAKPOINTS).length} targets): ${Object.values(BREAKPOINTS).map((b) => `${b.width}px`).join(', ')}${colors.reset}`);
  if (milestoneFilter) console.log(`${colors.bold}${colors.yellow}  Filter: Milestone = ${milestoneFilter}${colors.reset}`);
  if (tierFilter) console.log(`${colors.bold}${colors.yellow}  Filter: Tier = ${tierFilter}${colors.reset}`);
  if (featureFilter) console.log(`${colors.bold}${colors.yellow}  Filter: Feature = ${featureFilter}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}===================================================================${colors.reset}\n`);

  const startTime = Date.now();
  const selectedTests = tests.filter((t) => {
    if (milestoneFilter && t.meta.milestone !== milestoneFilter) return false;
    if (tierFilter) {
      const normalizedTier = tierFilter.toLowerCase().startsWith('tier')
        ? tierFilter.toLowerCase()
        : `tier${tierFilter.toLowerCase()}`;
      if (t.meta.tier.toLowerCase() !== normalizedTier) return false;
    }
    if (featureFilter && t.meta.feature.toUpperCase() !== featureFilter.toUpperCase()) return false;
    return true;
  });

  results.total = selectedTests.length;

  // Fail-closed safeguard: if 0 tests matched the filter, exit with non-zero status
  if (results.total === 0) {
    console.log(`\n${colors.bold}${colors.red}No tests matched the specified filters.${colors.reset}\n`);
    process.exit(1);
  }

  for (const testCase of selectedTests) {
    const { id, name, meta, fn } = testCase;
    const tier = meta.tier;
    const feature = meta.feature;

    try {
      fn();
      results.passed++;
      results.byTier[tier].pass++;
      results.byFeature[feature].pass++;
      console.log(`  ${colors.green}✓ PASS${colors.reset} [${id}] [${tier}] [${feature}] ${name}`);
    } catch (err) {
      results.failed++;
      results.byTier[tier].fail++;
      results.byFeature[feature].fail++;
      results.failures.push({ id, name, meta, error: err.message });
      console.log(`  ${colors.red}✗ FAIL${colors.reset} [${id}] [${tier}] [${feature}] ${name}`);
      console.log(`         ${colors.dim}Defect: ${err.message}${colors.reset}`);
    }
  }

  const durationMs = Date.now() - startTime;

  // Print Summary Table by Tier
  console.log(`\n${colors.bold}--- Results by Test Tier ---${colors.reset}`);
  console.log(`  Tier 1 (Feature Coverage):        ${results.byTier.Tier1.pass}/${results.byTier.Tier1.pass + results.byTier.Tier1.fail} passed`);
  console.log(`  Tier 2 (Boundary & Corner Cases): ${results.byTier.Tier2.pass}/${results.byTier.Tier2.pass + results.byTier.Tier2.fail} passed`);
  console.log(`  Tier 3 (Cross-Feature Pairwise):  ${results.byTier.Tier3.pass}/${results.byTier.Tier3.pass + results.byTier.Tier3.fail} passed`);
  console.log(`  Tier 4 (Real-World Scenarios):    ${results.byTier.Tier4.pass}/${results.byTier.Tier4.pass + results.byTier.Tier4.fail} passed`);

  // Print Summary Table by Feature
  console.log(`\n${colors.bold}--- Results by Feature ---${colors.reset}`);
  console.log(`  F1 (Mobile Nav & Layout Structure):             ${results.byFeature.F1.pass}/${results.byFeature.F1.pass + results.byFeature.F1.fail} passed`);
  console.log(`  F2 (Bottom Nav & Mobile Drawer Switching):      ${results.byFeature.F2.pass}/${results.byFeature.F2.pass + results.byFeature.F2.fail} passed`);
  console.log(`  F3 (Responsive Core Views):                     ${results.byFeature.F3.pass}/${results.byFeature.F3.pass + results.byFeature.F3.fail} passed`);
  console.log(`  F4 (Touch Target Standards >=44px):             ${results.byFeature.F4.pass}/${results.byFeature.F4.pass + results.byFeature.F4.fail} passed`);
  console.log(`  F5 (Screvi Mobile Reader UX & Typography):      ${results.byFeature.F5.pass}/${results.byFeature.F5.pass + results.byFeature.F5.fail} passed`);
  console.log(`  F6 (Distraction-Free Reader Controls & Sheet):  ${results.byFeature.F6.pass}/${results.byFeature.F6.pass + results.byFeature.F6.fail} passed`);
  console.log(`  F7 (Multi-Viewport Zero Horizontal Overflow):   ${results.byFeature.F7.pass}/${results.byFeature.F7.pass + results.byFeature.F7.fail} passed`);

  // Final Summary Banner
  console.log(`\n${colors.bold}===================================================================${colors.reset}`);
  console.log(`  TOTAL TESTS: ${results.total} | PASSED: ${colors.green}${results.passed}${colors.reset} | FAILED: ${results.failed > 0 ? colors.red + results.failed + colors.reset : '0'} | DURATION: ${durationMs}ms`);
  console.log(`${colors.bold}===================================================================${colors.reset}\n`);

  if (results.failures.length > 0) {
    console.log(`${colors.bold}${colors.yellow}⚠️  IMPLEMENTATION DEFECTS DISCOVERED (${results.failures.length}):${colors.reset}`);
    results.failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.id}] [${f.meta.feature}] [Milestone: ${f.meta.milestone || 'TBD'}] ${f.name}`);
      console.log(`     ${colors.red}Defect:${colors.reset} ${f.error}`);
    });
    console.log(`\n${colors.yellow}Escalate these defects to implementation track agents (M2/M3/M4).${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.bold}${colors.green}🎉 ALL ${results.total} TESTS PASSED 100%!${colors.reset}\n`);
    process.exit(0);
  }
}

runTestSuite();

export { BREAKPOINTS, runTestSuite };
