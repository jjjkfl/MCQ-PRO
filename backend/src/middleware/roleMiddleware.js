const jwt = require('jsonwebtoken');

exports.authorize = (roles = []) => {
  if (typeof roles === 'string') roles = [roles];
  if (!Array.isArray(roles)) roles = [roles];

  return [
    (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
      }

      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' });
        
        req.user = decoded;
        
        if (roles.length && !roles.includes(decoded.role)) {
          return res.status(403).json({ 
            message: `Forbidden: Requires ${roles.join(' or ')} role. Your role: ${decoded.role}` 
          });
        }
        
        next();
      });
    }
  ];
};
