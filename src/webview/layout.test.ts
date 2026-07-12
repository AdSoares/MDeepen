import { describe, it, expect } from 'vitest';
import { stepColumnWidth, clampPanelWidth } from './layout';

describe('stepColumnWidth', () => {
  it('steps by 100', () => expect(stepColumnWidth(700, 1)).toBe(800));
  it('clamps at 480', () => expect(stepColumnWidth(480, -1)).toBe(480));
  it('goes to full past 1400', () => expect(stepColumnWidth(1400, 1)).toBe(0));
  it('returns from full to 1400', () => expect(stepColumnWidth(0, -1)).toBe(1400));
  it('full stays full stepping up', () => expect(stepColumnWidth(0, 1)).toBe(0));
  it('snaps non-aligned values to the step grid', () => expect(stepColumnWidth(730, 1)).toBe(800));

  it('does not skip a step from a non-aligned value going up', () => {
    // 660 -> nearest step below in the up direction is 700, not 800
    expect(stepColumnWidth(660, 1)).toBe(700);
  });
  it('does not skip a step from a non-aligned value going down', () => {
    // 660 -> nearest step in the down direction is 600
    expect(stepColumnWidth(660, -1)).toBe(600);
  });
});

describe('clampPanelWidth', () => {
  it('clamps outline to [180,400]', () => {
    expect(clampPanelWidth('outline', 100)).toBe(180);
    expect(clampPanelWidth('outline', 999)).toBe(400);
    expect(clampPanelWidth('outline', 300)).toBe(300);
  });
  it('clamps ai to [260,480]', () => {
    expect(clampPanelWidth('ai', 100)).toBe(260);
    expect(clampPanelWidth('ai', 999)).toBe(480);
  });
});
