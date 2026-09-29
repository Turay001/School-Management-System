import type { ComponentType } from 'react';

import {
  IconFamily,
  IconHistory,
  IconLock,
  IconSchool,
  IconShield,
  IconStudent,
  IconUsers,
  type IconProps,
} from '@/components/icons';
import type { MarketingIcon } from '@/lib/brand';

/**
 * Icon keys to drawings.
 *
 * The public copy in `src/lib/brand.ts` names an icon as a string rather than
 * holding a component, so that `src/lib` never has to import from
 * `src/components`. This map is the single seam between the two, and it is
 * typed: adding a key to `MarketingIcon` without drawing it here is a build
 * error rather than a blank tile at runtime.
 *
 * Four of these seven drawings were made for this page — `family`, `history`,
 * `lock`, `school` and `shield` — because the earlier version of the page was
 * written as a capability list and there was no icon for a family, a record or
 * a school building. The other two (`student`, `users`) are the application's
 * own navigation icons, and they are reused rather than redrawn: a page about a
 * school should carry the same icons the school carries, and a parallel set
 * would be one more thing to keep consistent.
 *
 * The set is exactly what the page uses, and that is checked rather than
 * assumed. Ten keys were mapped here when the page had ten sections; two of
 * them — `bell` and `folder` — belonged to copy that has since been cut, and
 * `message` went with it. A union type makes unused keys free to add and
 * nothing ever asks you to remove one, so the map is trimmed to the seven the
 * page renders. `IconFolder` and `IconMessage` were then left with no caller at
 * all and were removed from `src/components/icons.tsx`; `IconBell` stayed,
 * because the application's own navigation uses it.
 */
export const MARKETING_ICONS: Record<MarketingIcon, ComponentType<IconProps>> = {
  family: IconFamily,
  history: IconHistory,
  lock: IconLock,
  school: IconSchool,
  shield: IconShield,
  staff: IconUsers,
  students: IconStudent,
};
