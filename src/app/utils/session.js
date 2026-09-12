import jwt from 'jsonwebtoken';

import authConfig from '../../config/auth';

// Shared by every login path (password, Google) so all of them return the
// exact same `{ user, token }` shape and the clients can't tell them apart.
export function signSessionToken(userId) {
  return jwt.sign({ id: userId }, authConfig.secret, {
    expiresIn: authConfig.expiresIn,
    algorithm: authConfig.algorithm,
  });
}

// `user` must have been loaded with the `avatar` association included.
export function buildSession(user) {
  const {
    id,
    subscriber,
    first_name,
    last_name,
    user_name,
    email,
    birth_date,
    gender,
    avatar,
    instagram,
    linkedin,
    bio,
  } = user;

  return {
    user: {
      id,
      subscriber,
      first_name,
      last_name,
      user_name,
      email,
      birth_date,
      gender,
      avatar,
      instagram,
      linkedin,
      bio,
      // Lets clients hide the "current password" step for Google-only accounts.
      has_password: !!user.password_hash,
    },
    token: signSessionToken(id),
  };
}
