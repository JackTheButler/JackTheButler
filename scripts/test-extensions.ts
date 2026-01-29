#!/usr/bin/env tsx
/**
 * Test script for extension registry and loader
 *
 * Run with: pnpm tsx scripts/test-extensions.ts
 */

import {
  getExtensionRegistry,
  getExtensionLoader,
  getAllManifests,
  resetExtensionRegistry,
} from '../src/extensions/index.js';

async function main() {
  console.log('=== Extension System Test ===\n');

  // Reset for clean state
  resetExtensionRegistry();

  const registry = getExtensionRegistry();
  const loader = getExtensionLoader();

  // 1. List all available manifests
  console.log('1. Available Extension Manifests:');
  const manifests = getAllManifests();
  for (const m of manifests) {
    console.log(`   - ${m.id} (${m.category}): ${m.name}`);
  }
  console.log();

  // 2. Discover and register extensions
  console.log('2. Discovering extensions...');
  loader.discoverExtensions();
  console.log(`   Registered ${registry.getAll().length} extensions`);
  console.log();

  // 3. Check what would load from environment
  console.log('3. Extensions detected from environment:');
  const envConfigs = loader.loadFromEnvironment();
  if (envConfigs.length === 0) {
    console.log('   (none - no matching environment variables set)');
  } else {
    for (const c of envConfigs) {
      console.log(`   - ${c.extensionId} (priority: ${c.priority ?? 'default'})`);
    }
  }
  console.log();

  // 4. Manually activate Mock PMS for testing
  console.log('4. Activating Mock PMS...');
  try {
    await registry.activate('pms-mock', {});
    console.log('   Status:', registry.get('pms-mock')?.status);

    // Run health check
    const health = await registry.healthCheck('pms-mock');
    console.log('   Health check:', health.success ? 'PASSED' : 'FAILED', '-', health.message);

    // Test the adapter
    const pmsAdapter = registry.getActivePMSAdapter();
    if (pmsAdapter) {
      const rooms = await pmsAdapter.getAllRooms();
      console.log(`   Rooms available: ${rooms.length}`);
    }
  } catch (error) {
    console.log('   Error:', error instanceof Error ? error.message : error);
  }
  console.log();

  // 5. Show status summary
  console.log('5. Extension Status Summary:');
  const summary = registry.getStatusSummary();
  for (const s of summary) {
    const statusIcon = s.status === 'active' ? '✓' : s.status === 'registered' ? '○' : '✗';
    console.log(`   ${statusIcon} ${s.id}: ${s.status}`);
  }
  console.log();

  // 6. Test with an AI provider (if API key available)
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('6. Testing Anthropic provider...');
    try {
      await registry.activate('anthropic', {
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-sonnet-4-20250514',
      });

      const health = await registry.healthCheck('anthropic');
      console.log('   Health check:', health.success ? 'PASSED' : 'FAILED');

      if (health.success) {
        const provider = registry.getActiveAIProvider();
        console.log('   Active AI provider:', provider?.name);
      }
    } catch (error) {
      console.log('   Error:', error instanceof Error ? error.message : error);
    }
  } else {
    console.log('6. Skipping Anthropic test (ANTHROPIC_API_KEY not set)');
  }
  console.log();

  console.log('=== Test Complete ===');
}

main().catch(console.error);
