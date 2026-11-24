export const hostedCorpusProfile = 'norton-aquinas-focused.v1';
export const hostedCorpusCheckIds = Object.freeze([
  'norton-lookup', 'norton-body', 'norton-search', 'norton-search-body',
  'aquinas-node', 'aquinas-node-body', 'aquinas-search', 'aquinas-search-body',
  'search:wesley-standard-sermons', 'primary-search-body:wesley-standard-sermons',
  'global-classic-search:hooker-laws-of-ecclesiastical-polity-book-1',
  'global-search-body:hooker-laws-of-ecclesiastical-polity-book-1',
]);
export const hostedCorpusCheckCount = 2 * hostedCorpusCheckIds.length;

export function hasHostedCorpusChecks(report) {
  return report?.profile === hostedCorpusProfile && report.passed === true &&
    Array.isArray(report.checks) && report.checks.length === hostedCorpusCheckCount &&
    ['2025-11-25', '2026-07-28'].every(era => {
      const ids = report.checks.filter(check => check.era === era && check.passed === true).map(check => check.id);
      return ids.length === hostedCorpusCheckIds.length && hostedCorpusCheckIds.every(id => ids.includes(id));
    });
}
