import { contrastRatio } from '../utils/contrast';
import { colors } from '../theme/tokens';
import { STATUS_TONE } from '../components/StatusBadge';

describe('design token contrast (WCAG AA, 4.5:1 for text)', () => {
  const pairs: [string, string, string][] = [
    ['textPrimary on background', colors.textPrimary, colors.background],
    ['textPrimary on surface', colors.textPrimary, colors.surface],
    ['textSecondary on background', colors.textSecondary, colors.background],
    ['textSecondary on surface', colors.textSecondary, colors.surface],
    ['textInverse on brand900', colors.textInverse, colors.brand900],
    ['textInverse on brand700 (primary button)', colors.textInverse, colors.brand700],
    ['brand800 on brand100 (secondary button)', colors.brand800, colors.brand100],
    ['brand100 on brand900 (inactive tab)', colors.brand100, colors.brand900],
    ['textInverse on danger (destructive button)', colors.textInverse, colors.danger],
    ['danger on surface (error text)', colors.danger, colors.surface],
    ['danger on background (error text)', colors.danger, colors.background],
    ['info on infoBg (notice)', colors.info, colors.infoBg],
  ];
  it.each(pairs)('%s', (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(Object.entries(STATUS_TONE))('status badge %s', (_s, tone) => {
    expect(contrastRatio(tone.fg, tone.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
