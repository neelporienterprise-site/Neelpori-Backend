const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  console.log(`📨 ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const statusEmoji = status >= 400 ? '❌' : status >= 300 ? '⚠️' : '✅';
    
    console.log(`📤 ${statusEmoji} ${status} ${req.method} ${req.originalUrl} - ${duration}ms`);
  });
  
  next();
};

module.exports = requestLogger;
