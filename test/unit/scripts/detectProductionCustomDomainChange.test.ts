import { describe, expect, it } from 'vitest';
import {
  productionCustomDomainChanged,
  productionCustomDomainDeclaration,
} from '../../../scripts/detect-production-custom-domain-change.js';

const productionRoute = '{ pattern = "mcp.theologai.xyz", custom_domain = true }';
const previewRoute = '{ pattern = "preview-mcp.theologai.xyz", custom_domain = true }';

describe('production custom-domain prerequisite detector', () => {
  it('requires the gate when this release introduces the production route', () => {
    const before = `name = "theologai"\n[env.preview]\nroutes = [${previewRoute}]\n`;
    const after = `name = "theologai"\nroutes = [${productionRoute}]\n[env.preview]\nroutes = [${previewRoute}]\n`;
    expect(productionCustomDomainChanged(before, after)).toBe(true);
  });

  it('skips the gate for future deploys whose production declaration is unchanged', () => {
    const before = `name = "theologai"\nroutes = [${productionRoute}]\n[vars]\nTHEOLOGAI_VERSION = "1"\n[env.preview]\nroutes = [${previewRoute}]\n`;
    const after = `name = "theologai"\nroutes = [${productionRoute}]\n[vars]\nTHEOLOGAI_VERSION = "2"\n[env.preview]\nroutes = [${previewRoute}]\n`;
    expect(productionCustomDomainChanged(before, after)).toBe(false);
  });

  it('ignores preview-only declarations and detects production declaration removal', () => {
    const previewOnly = `name = "theologai"\n[env.preview]\nroutes = [${previewRoute}]\n`;
    expect(productionCustomDomainDeclaration(previewOnly)).toBe('');
    expect(productionCustomDomainChanged(
      `name = "theologai"\nroutes = [${productionRoute}]\n[env.preview]\n`,
      previewOnly,
    )).toBe(true);
  });

  it('detects a multiline declaration policy change but ignores whitespace-only formatting', () => {
    const before = `routes = [{\n  pattern = "mcp.theologai.xyz",\n  custom_domain = true\n}]\n[env.preview]\n`;
    const reformatted = `routes = [ { pattern = "mcp.theologai.xyz", custom_domain = true } ]\n[env.preview]\n`;
    const disabled = `routes = [ { pattern = "mcp.theologai.xyz", custom_domain = false } ]\n[env.preview]\n`;
    expect(productionCustomDomainChanged(before, reformatted)).toBe(false);
    expect(productionCustomDomainChanged(before, disabled)).toBe(true);
  });
});
