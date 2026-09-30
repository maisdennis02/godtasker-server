import { Op } from 'sequelize';

// Offerings other people may see. Both clients create offerings with
// display_in_profile: true; rows from before the flag existed have NULL and
// count as visible, so only an explicit false hides one.
export const VISIBLE_IN_PROFILE = {
  display_in_profile: { [Op.or]: [true, null] },
};
