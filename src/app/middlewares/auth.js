import jwt from 'jsonwebtoken';

import authConfig from '../../config/auth';

export default (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token not provided' });
  }

  const [, token] = authHeader.split(' ');

  try {
    const decoded = jwt.verify(token, authConfig.secret, {
      algorithms: [authConfig.algorithm],
    });
    req.userId = decoded.id;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
