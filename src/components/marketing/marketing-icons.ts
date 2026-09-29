import type { ComponentType } from 'react';

import {
  IconBell,
  IconFamily,
  IconFolder,
  IconHistory,
  IconLock,
  IconMessage,
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
 * Seven of these ten drawings were made for this page — `family`, `folder`,
 * `history`, `lock`, `message`, `school` and `shield` — because the earlier
 * version of the page was written as a capability list and there was no icon for
 * a family, a record or a school building. The other three (`bell`, `student`,
 * `users`) are the application's own navigation icons, and they are reused rather
 * than redrawn: a page about a school should carry the same icons the school
 * carries, and a parallel set would be one more thing to keep consistent.
 *
 * The set is short, and every key is in use. An icon map is where unused keys
 * accumulate, because a union type makes them free to add and nothing ever
 * asks you to remove one.
 */
export const MARKETING_ICONS: Record<MarketingIcon, ComponentType<IconProps>> = {
  bell: IconBell,
  family: IconFamily,
  folder: IconFolder,
  history: IconHistory,
  lock: IconLock,
  message: IconMessage,
  school: IconSchool,
  shield: IconShield,
  staff: IconUsers,
  students: IconStudent,
};
